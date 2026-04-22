/**
 * Givebutter Contacts API helpers (newsletter popup) — Deno copy of api/_lib/newsletter_givebutter.mjs
 */
const GIVEBUTTER_API = "https://api.givebutter.com/v1";

export function normalizeEmail(email: string): string {
  return String(email || "").trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  const s = normalizeEmail(email);
  if (!s || s.length > 254) return false;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return false;
  const parts = s.split("@");
  const local = parts[0];
  const domain = parts[1];
  if (!local || !domain || local.length > 64 || domain.length > 253) return false;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  if (domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) return false;
  if (!/^[a-z0-9.\-]+$/i.test(domain)) return false;
  const tld = domain.split(".").pop();
  if (!tld || tld.length < 2) return false;
  return true;
}

export function splitDisplayName(displayName: string, fallbackLocalPart: string): { first_name: string; last_name: string } {
  const n = String(displayName || "").trim();
  const base = n || String(fallbackLocalPart || "friend").trim() || "friend";
  const i = base.indexOf(" ");
  if (i === -1) {
    return { first_name: base.slice(0, 100), last_name: "." };
  }
  const first = base.slice(0, i).trim().slice(0, 100) || "friend";
  const last = base.slice(i + 1).trim().slice(0, 100) || ".";
  return { first_name: first, last_name: last };
}

export async function createGivebutterContact(
  apiKey: string,
  opts: { email: string; name: string; source: string; extraTags?: string[] },
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> | null; text: string }> {
  const { first_name, last_name } = splitDisplayName(opts.name, opts.email.split("@")[0]);
  const tagSet = new Set(
    ["website-newsletter", "go-ukraina", ...(opts.extraTags || [])]
      .map((t) => String(t || "").trim().slice(0, 64))
      .filter(Boolean),
  );
  const tags = [...tagSet];
  const body = {
    type: "individual",
    primary_email: opts.email,
    first_name,
    last_name,
    email_subscription: true,
    tags,
    note: `Website signup · source: ${opts.source} · ${new Date().toISOString()}`,
  };

  const r = await fetch(`${GIVEBUTTER_API}/contacts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await r.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  return { ok: r.ok, status: r.status, json, text };
}

export function givebutterLooksLikeDuplicate(res: {
  status: number;
  json: Record<string, unknown> | null;
  text: string;
}): boolean {
  if (res.status === 409) return true;
  const msg =
    `${String(res.json?.message || "")} ${JSON.stringify(res.json?.errors || {})} ${res.text || ""}`.toLowerCase();
  if (res.status === 422 && (msg.includes("already") || msg.includes("duplicate") || msg.includes("exist"))) {
    return true;
  }
  return false;
}
