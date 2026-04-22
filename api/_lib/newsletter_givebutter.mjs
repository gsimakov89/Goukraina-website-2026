/**
 * Givebutter Contacts API helpers (newsletter popup).
 * @see https://docs.givebutter.com/api-reference/contacts/create-a-contact
 */

const GIVEBUTTER_API = "https://api.givebutter.com/v1";

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

/** Practical RFC 5322–style check; blocks obvious garbage and oversize strings. */
export function isValidEmail(email) {
  const s = normalizeEmail(email);
  if (!s || s.length > 254) return false;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return false;
  const [local, domain] = s.split("@");
  if (!local || !domain || local.length > 64 || domain.length > 253) return false;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  if (domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) return false;
  if (!/^[a-z0-9.\-]+$/i.test(domain)) return false;
  const tld = domain.split(".").pop();
  if (!tld || tld.length < 2) return false;
  return true;
}

export function splitDisplayName(displayName, fallbackLocalPart) {
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

/**
 * @param {string} apiKey
 * @param {{ email: string, name: string, source: string, extraTags?: string[] }} opts
 */
export async function createGivebutterContact(apiKey, { email, name, source, extraTags = [] }) {
  const { first_name, last_name } = splitDisplayName(name, email.split("@")[0]);
  const tagSet = new Set(
    ["website-newsletter", "go-ukraina", ...extraTags]
      .map((t) => String(t || "").trim().slice(0, 64))
      .filter(Boolean)
  );
  const tags = [...tagSet];
  const body = {
    type: "individual",
    primary_email: email,
    first_name,
    last_name,
    email_subscription: true,
    tags,
    note: `Website signup · source: ${source} · ${new Date().toISOString()}`,
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
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { ok: r.ok, status: r.status, json, text };
}

/** Treat as duplicate / already exists (do not surface as hard failure to the user). */
export function givebutterLooksLikeDuplicate({ status, json, text }) {
  if (status === 409) return true;
  const msg = `${json?.message || ""} ${JSON.stringify(json?.errors || {})} ${text || ""}`.toLowerCase();
  if (status === 422 && (msg.includes("already") || msg.includes("duplicate") || msg.includes("exist"))) {
    return true;
  }
  return false;
}
