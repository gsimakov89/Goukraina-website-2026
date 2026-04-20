/**
 * Supabase user JWT only — admin via app_metadata.admin, user_metadata.admin,
 * ADMIN_EMAIL_ALLOWLIST, or admin_users row (anon+user JWT first, then service role).
 */
import { createClient } from "@supabase/supabase-js";
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from "jose";

/** Default project API URL — override with SUPABASE_URL in Vercel / .env */
const SUPABASE_PROJECT_URL_DEFAULT = "https://lrbrvkhddhuebmyazgcf.supabase.co";

function supabaseProjectUrl() {
  return (process.env.SUPABASE_URL || "").trim() || SUPABASE_PROJECT_URL_DEFAULT;
}

function emailAllowlisted(payload) {
  const raw = (process.env.ADMIN_EMAIL_ALLOWLIST || "").trim();
  if (!raw) return false;
  const allowed = new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
  let email = (typeof payload.email === "string" ? payload.email : "").trim().toLowerCase();
  if (!email && payload.user_metadata && typeof payload.user_metadata.email === "string") {
    email = payload.user_metadata.email.trim().toLowerCase();
  }
  return Boolean(email && allowed.has(email));
}

async function adminUsersTableHas(uid, userJwt) {
  const base = supabaseProjectUrl().replace(/\/$/, "");
  const anon = (process.env.SUPABASE_ANON_KEY || "").trim();
  const path = `/rest/v1/admin_users?user_id=eq.${encodeURIComponent(uid)}&select=user_id`;
  const headers = (apikey, bearer) => ({
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
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
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

async function verifySupabaseUserJwt(token) {
  let header;
  try {
    header = decodeProtectedHeader(token);
  } catch {
    throw new Error("bad header");
  }
  const alg = header.alg || "HS256";
  if (alg.startsWith("HS")) {
    const jwtSecret = (process.env.SUPABASE_JWT_SECRET || process.env.JWT_SECRET || "").trim();
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

export async function requireAdmin(req, res) {
  const auth = req.headers.authorization || "";
  if (!auth.toLowerCase().startsWith("bearer ")) {
    res.status(401).json({ error: "Missing Authorization: Bearer token." });
    return false;
  }
  const token = auth.slice(7).trim();
  const jwtSecret = (process.env.SUPABASE_JWT_SECRET || process.env.JWT_SECRET || "").trim();

  let headerAlg;
  try {
    headerAlg = decodeProtectedHeader(token).alg || "HS256";
  } catch {
    res.status(403).json({ error: "Invalid Supabase session or not an admin." });
    return false;
  }
  if (headerAlg.startsWith("HS") && !jwtSecret) {
    res.status(503).json({
      error: "SUPABASE_JWT_SECRET is required for admin API access (HS256 tokens).",
    });
    return false;
  }

  try {
    const payload = await verifySupabaseUserJwt(token);
    const uid = payload.sub;
    if (payload.app_metadata?.admin === true || payload.user_metadata?.admin === true) {
      return true;
    }
    if (emailAllowlisted(payload)) return true;
    if (uid && (await adminUsersTableHas(uid, token))) return true;
  } catch {
    /* fall through */
  }
  res.status(403).json({ error: "Invalid Supabase session or not an admin." });
  return false;
}

export function getSupabaseService() {
  const url = supabaseProjectUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    const err = new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    err.code = "SUPABASE_CONFIG";
    throw err;
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function supabasePostsEnabled() {
  return Boolean(supabaseProjectUrl() && (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim());
}
