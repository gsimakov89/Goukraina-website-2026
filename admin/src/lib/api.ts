import { getClient } from "./supabaseClient";

/** Access token for API calls — refresh if expired or about to expire (avoids 401 after tab idle). */
async function bearer(): Promise<string> {
  const sb = getClient();
  if (!sb) return "";
  const { data: s1 } = await sb.auth.getSession();
  let session = s1.session;
  if (!session) return "";
  const exp = session.expires_at;
  const now = Math.floor(Date.now() / 1000);
  if (exp != null && exp - now < 120) {
    const { data: s2 } = await sb.auth.refreshSession();
    session = s2.session ?? session;
  }
  return session.access_token ?? "";
}

/** When set (e.g. Vercel production), admin API calls go to Supabase Edge Functions instead of same-origin /api. */
function edgeFunctionsBase(): string {
  return (import.meta.env.VITE_SUPABASE_FUNCTIONS_URL as string | undefined)?.trim() || "";
}

/** Build URL for public or authenticated API routes. Uses Edge when `VITE_SUPABASE_FUNCTIONS_URL` is set. */
export function apiUrl(path: string): string {
  const base = edgeFunctionsBase();
  if (!base) return path.startsWith("/") ? path : `/${path}`;
  const rel = path.startsWith("/") ? path : `/${path}`;
  const [pathname, query] = rel.split("?");
  const u = new URL(base.replace(/\/$/, ""));
  u.searchParams.set("path", pathname);
  if (query) {
    const qp = new URLSearchParams(query);
    for (const [k, v] of qp) u.searchParams.append(k, v);
  }
  return u.toString();
}

export async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await bearer();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const m = (init.method || "GET").toUpperCase();
  if (init.body != null && !headers.has("Content-Type") && ["POST", "PUT", "PATCH"].includes(m)) {
    headers.set("Content-Type", "application/json");
  }
  const url = edgeFunctionsBase() ? apiUrl(path) : path.startsWith("/") ? path : `/${path}`;
  return fetch(url, { ...init, headers });
}

/** Parse error JSON/text from a body already read as text (e.g. after `await res.text()`). */
export function parseApiErrorText(text: string, fallback: string): string {
  const t = text.trim();
  if (!t) return fallback;
  try {
    const j = JSON.parse(t) as { error?: string; detail?: unknown };
    if (typeof j.detail === "string") return j.detail;
    if (Array.isArray(j.detail)) {
      return j.detail.map((x: { msg?: string }) => x.msg || JSON.stringify(x)).join("; ");
    }
    return j.error || t || fallback;
  } catch {
    return t.slice(0, 500) || fallback;
  }
}

export async function readError(res: Response): Promise<string> {
  const t = await res.text();
  return parseApiErrorText(t, res.statusText);
}
