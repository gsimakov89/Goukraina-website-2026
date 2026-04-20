/**
 * Mirrors api/_lib/admin_auth.mjs — Supabase JWT + admin_users / allowlist / metadata.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  createRemoteJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JWTPayload,
} from "https://esm.sh/jose@5.9.6";
import { json } from "./http.ts";

const SUPABASE_PROJECT_URL_DEFAULT = "https://lrbrvkhddhuebmyazgcf.supabase.co";

function supabaseProjectUrl(): string {
  return (Deno.env.get("SUPABASE_URL") || "").trim() || SUPABASE_PROJECT_URL_DEFAULT;
}

function emailAllowlisted(payload: JWTPayload): boolean {
  const raw = (Deno.env.get("ADMIN_EMAIL_ALLOWLIST") || "").trim();
  if (!raw) return false;
  const allowed = new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
  let email = (typeof payload.email === "string" ? payload.email : "").trim().toLowerCase();
  const um = payload.user_metadata as Record<string, unknown> | undefined;
  if (!email && um && typeof um.email === "string") {
    email = um.email.trim().toLowerCase();
  }
  return Boolean(email && allowed.has(email));
}

async function adminUsersTableHas(uid: string, userJwt: string): Promise<boolean> {
  const base = supabaseProjectUrl().replace(/\/$/, "");
  const anon = (Deno.env.get("SUPABASE_ANON_KEY") || "").trim();
  const path = `/rest/v1/admin_users?user_id=eq.${encodeURIComponent(uid)}&select=user_id`;
  const headers = (apikey: string, bearer: string) => ({
    apikey,
    Authorization: `Bearer ${bearer}`,
  });
  if (anon && userJwt) {
    try {
      const r = await fetch(`${base}${path}`, { headers: headers(anon, userJwt) });
      if (r.ok) {
        const rows = await r.json();
        if (Array.isArray(rows) && rows.length > 0) return true;
      }
    } catch {
      /* fall through */
    }
  }
  const key = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  if (!base || !key || !uid) return false;
  try {
    const supabase = createClient(base, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase
      .from("admin_users")
      .select("user_id")
      .eq("user_id", uid)
      .maybeSingle();
    if (!error && data) return true;
  } catch {
    /* fall through */
  }
  return false;
}

async function verifySupabaseUserJwt(token: string): Promise<JWTPayload> {
  let header: ReturnType<typeof decodeProtectedHeader>;
  try {
    header = decodeProtectedHeader(token);
  } catch {
    throw new Error("bad header");
  }
  const alg = header.alg || "HS256";
  if (alg.startsWith("HS")) {
    const jwtSecret = (Deno.env.get("SUPABASE_JWT_SECRET") || Deno.env.get("JWT_SECRET") || "").trim();
    if (!jwtSecret) {
      throw new Error("missing SUPABASE_JWT_SECRET");
    }
    const secret = new TextEncoder().encode(jwtSecret);
    try {
      return (await jwtVerify(token, secret, { algorithms: [alg], audience: "authenticated" })).payload;
    } catch {
      return (await jwtVerify(token, secret, { algorithms: [alg] })).payload;
    }
  }
  const base = supabaseProjectUrl().replace(/\/$/, "");
  const JWKS = createRemoteJWKSet(new URL(`${base}/auth/v1/.well-known/jwks.json`));
  const issuer = `${base}/auth/v1`;
  try {
    return (await jwtVerify(token, JWKS, { algorithms: [alg], issuer, audience: "authenticated" })).payload;
  } catch {
    try {
      return (await jwtVerify(token, JWKS, { algorithms: [alg], issuer })).payload;
    } catch {
      return (await jwtVerify(token, JWKS, { algorithms: [alg] })).payload;
    }
  }
}

export async function requireAdmin(req: Request): Promise<Response | null> {
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) {
    return json({ error: "Missing Authorization: Bearer token." }, 401);
  }
  const token = auth.slice(7).trim();
  const jwtSecret = (Deno.env.get("SUPABASE_JWT_SECRET") || Deno.env.get("JWT_SECRET") || "").trim();

  let headerAlg: string;
  try {
    headerAlg = decodeProtectedHeader(token).alg || "HS256";
  } catch {
    return json({ error: "Invalid Supabase session or not an admin." }, 403);
  }
  if (headerAlg.startsWith("HS") && !jwtSecret) {
    return json(
      {
        error: "SUPABASE_JWT_SECRET is required for admin API access (HS256 tokens).",
      },
      503,
    );
  }

  try {
    const payload = await verifySupabaseUserJwt(token);
    const uid = payload.sub;
    const am = payload.app_metadata as Record<string, unknown> | undefined;
    const um = payload.user_metadata as Record<string, unknown> | undefined;
    if (am?.admin === true || um?.admin === true) {
      return null;
    }
    if (emailAllowlisted(payload)) return null;
    if (uid && (await adminUsersTableHas(uid, token))) return null;
  } catch {
    /* fall through */
  }
  return json({ error: "Invalid Supabase session or not an admin." }, 403);
}

export function getSupabaseService(): SupabaseClient {
  const url = supabaseProjectUrl();
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function supabasePostsEnabled(): boolean {
  return Boolean(supabaseProjectUrl() && (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim());
}
