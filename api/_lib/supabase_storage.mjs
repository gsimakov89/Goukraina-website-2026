/**
 * Supabase Storage (public bucket) — CMS media.
 *
 * Env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SUPABASE_MEDIA_BUCKET — default: cms-uploads (create as public in Supabase Dashboard)
 */

function supabaseUrl() {
  return (process.env.SUPABASE_URL || "").trim() || "https://lrbrvkhddhuebmyazgcf.supabase.co";
}

function serviceRoleKey() {
  const k = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!k) {
    const err = new Error("SUPABASE_SERVICE_ROLE_KEY required for Storage");
    err.code = "SUPABASE_CONFIG";
    throw err;
  }
  return k;
}

export function mediaBucketName() {
  return (process.env.SUPABASE_MEDIA_BUCKET || "cms-uploads").trim() || "cms-uploads";
}

/** Public URL for an object key at the bucket root (e.g. `photo-abc123.jpg`). */
export function publicObjectUrl(objectKey) {
  const base = supabaseUrl().replace(/\/$/, "");
  const b = mediaBucketName();
  const pathPart = String(objectKey)
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  return `${base}/storage/v1/object/public/${encodeURIComponent(b)}/${pathPart}`;
}

function authHeaders() {
  const key = serviceRoleKey();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
}

async function parseError(r) {
  const t = await r.text();
  try {
    const j = JSON.parse(t);
    return j.message || j.error || t || r.statusText;
  } catch {
    return t || r.statusText || `HTTP ${r.status}`;
  }
}

export async function storageUpload(objectKey, buffer, contentType) {
  const base = supabaseUrl().replace(/\/$/, "");
  const bucket = mediaBucketName();
  const pathPart = String(objectKey)
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  const url = `${base}/storage/v1/object/${encodeURIComponent(bucket)}/${pathPart}`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": contentType || "application/octet-stream",
      "x-upsert": "true",
    },
    body: buffer,
  });
  if (!r.ok) throw new Error(await parseError(r));
}

export async function storageRemove(objectKey) {
  const base = supabaseUrl().replace(/\/$/, "");
  const bucket = mediaBucketName();
  const pathPart = String(objectKey)
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  const url = `${base}/storage/v1/object/${encodeURIComponent(bucket)}/${pathPart}`;
  const r = await fetch(url, {
    method: "DELETE",
    headers: { ...authHeaders() },
  });
  if (!r.ok && r.status !== 404) throw new Error(await parseError(r));
}

/**
 * List objects in bucket (flat keys at root).
 * @returns {Promise<Array<{ name: string, metadata?: { size?: number }, created_at?: string }>>}
 */
export async function storageList() {
  const base = supabaseUrl().replace(/\/$/, "");
  const bucket = mediaBucketName();
  const url = `${base}/storage/v1/object/list/${encodeURIComponent(bucket)}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ prefix: "", limit: 1000, offset: 0 }),
  });
  if (!r.ok) throw new Error(await parseError(r));
  const data = await r.json();
  return Array.isArray(data) ? data : [];
}
