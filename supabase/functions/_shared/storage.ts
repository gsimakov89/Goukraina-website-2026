/** Supabase Storage REST — mirrors api/_lib/supabase_storage.mjs */

function supabaseUrl(): string {
  return (Deno.env.get("SUPABASE_URL") || "").trim() || "https://lrbrvkhddhuebmyazgcf.supabase.co";
}

function serviceRoleKey(): string {
  const k = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  if (!k) throw new Error("SUPABASE_SERVICE_ROLE_KEY required for Storage");
  return k;
}

export function mediaBucketName(): string {
  return (Deno.env.get("SUPABASE_MEDIA_BUCKET") || "cms-uploads").trim() || "cms-uploads";
}

export function publicObjectUrl(objectKey: string): string {
  const base = supabaseUrl().replace(/\/$/, "");
  const b = mediaBucketName();
  const pathPart = String(objectKey)
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  return `${base}/storage/v1/object/public/${encodeURIComponent(b)}/${pathPart}`;
}

function authHeaders(): Record<string, string> {
  const key = serviceRoleKey();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
}

async function parseError(r: Response): Promise<string> {
  const t = await r.text();
  try {
    const j = JSON.parse(t) as { message?: string; error?: string };
    return j.message || j.error || t || r.statusText;
  } catch {
    return t || r.statusText || `HTTP ${r.status}`;
  }
}

export async function storageUpload(objectKey: string, buffer: Uint8Array, contentType: string): Promise<void> {
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

export async function storageRemove(objectKey: string): Promise<void> {
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

export async function storageList(): Promise<
  Array<{ name: string; metadata?: { size?: number }; created_at?: string }>
> {
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
