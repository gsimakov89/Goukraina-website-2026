import { getSupabaseService, requireAdmin, supabasePostsEnabled } from "./admin_auth.ts";
import { getOpenAIKey } from "./openai_key.ts";
import { json, readJsonBody } from "./http.ts";
import { mediaBucketName, publicObjectUrl, storageList, storageRemove, storageUpload } from "./storage.ts";

const ALLOWED = /\.(jpe?g|png|gif|webp)$/i;
const MAX = 8 * 1024 * 1024;

function contentTypeForExt(ext: string): string {
  const e = ext.toLowerCase();
  const m: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
  };
  return m[e] || "application/octet-stream";
}

function randomHex(n: number): string {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function decodeBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function getFromSupabase() {
  const sb = getSupabaseService();
  const { data, error } = await sb
    .from("media_library")
    .select("filename, path, url, alt_text, size_bytes, created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function generateAltText(filename: string, key: string): Promise<string> {
  if (!key) return "";
  try {
    const model = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 80,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'Reply JSON only: {"alt":"..."} — WCAG 2.x alt under 120 chars for Go Ukraina images. Describe what the image likely depicts based on the filename.',
          },
          { role: "user", content: `filename: ${filename}` },
        ],
      }),
    });
    if (!r.ok) return "";
    const json = await r.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) return "";
    const data = JSON.parse(content);
    return String(data.alt || "").trim().slice(0, 120);
  } catch {
    return "";
  }
}

export async function handleMediaIndex(req: Request): Promise<Response> {
  if (req.method === "GET") {
    const gate = await requireAdmin(req);
    if (gate) return gate;
    if (!supabasePostsEnabled()) {
      return json(
        {
          error: "Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for media (Supabase Storage).",
        },
        503,
      );
    }
    try {
      const rows = await getFromSupabase();
      const byName = new Map(rows.map((r: { filename: string }) => [r.filename, r]));
      let objects;
      try {
        objects = await storageList();
      } catch (e) {
        return json({ error: (e as Error).message || String(e) }, 500);
      }

      const seen = new Set<string>();
      const out: Record<string, unknown>[] = [];

      for (const o of objects) {
        const name = o.name;
        if (!name || name.endsWith("/") || !ALLOWED.test(name)) continue;
        seen.add(name);
        const r = byName.get(name) as Record<string, unknown> | undefined;
        const url = r?.url && String(r.url).startsWith("http") ? r.url : publicObjectUrl(name);
        out.push({
          filename: name,
          path: `${mediaBucketName()}/${name}`,
          url,
          alt_text: r?.alt_text || "",
          size_bytes: o.metadata?.size ?? r?.size_bytes ?? null,
          created_at: r?.created_at ?? o.created_at ?? null,
        });
      }

      for (const r of rows) {
        const row = r as { filename: string; path?: string; url?: string; alt_text?: string; size_bytes?: number; created_at?: string };
        if (seen.has(row.filename)) continue;
        out.push({
          filename: row.filename,
          path: row.path || `${mediaBucketName()}/${row.filename}`,
          url: row.url && String(row.url).startsWith("http") ? row.url : publicObjectUrl(row.filename),
          alt_text: row.alt_text || "",
          size_bytes: row.size_bytes ?? null,
          created_at: row.created_at ?? null,
        });
      }

      out.sort((a, b) => {
        const ta = a.created_at ? Date.parse(String(a.created_at)) : 0;
        const tb = b.created_at ? Date.parse(String(b.created_at)) : 0;
        return tb - ta || String(b.filename).localeCompare(String(a.filename));
      });

      return json(out);
    } catch (e) {
      return json({ error: (e as Error).message || String(e) }, 500);
    }
  }

  if (req.method === "POST") {
    const gate = await requireAdmin(req);
    if (gate) return gate;
    if (!supabasePostsEnabled()) {
      return json(
        {
          error: "Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for media (Supabase Storage).",
        },
        503,
      );
    }

    let body: Record<string, unknown>;
    try {
      body = (await readJsonBody(req)) as Record<string, unknown>;
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    const nameIn = String(body.filename || "upload.bin");
    const b64 = body.content_base64;
    if (!b64 || typeof b64 !== "string") return json({ error: "content_base64 required" }, 400);

    let buf: Uint8Array;
    try {
      buf = decodeBase64(b64);
    } catch {
      return json({ error: "Invalid base64" }, 400);
    }
    if (buf.length > MAX) return json({ error: "File too large (max 8MB)" }, 400);

    const ext = nameIn.includes(".") ? nameIn.slice(nameIn.lastIndexOf(".")).toLowerCase() : "";
    if (![".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext)) {
      return json({ error: "Only jpg, png, gif, webp" }, 400);
    }

    const stem = nameIn
      .replace(/\.[^/.]+$/, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .slice(0, 60) || "image";
    const final = `${stem}-${randomHex(5)}${ext}`;
    const ct = contentTypeForExt(ext);

    try {
      await storageUpload(final, buf, ct);
    } catch (e) {
      return json({ error: (e as Error).message || String(e) }, 500);
    }

    const openaiKey = await getOpenAIKey();
    const altText = await generateAltText(final, openaiKey);
    const pubUrl = publicObjectUrl(final);

    try {
      const sb = getSupabaseService();
      await sb.from("media_library").upsert(
        {
          filename: final,
          path: `${mediaBucketName()}/${final}`,
          url: pubUrl,
          alt_text: altText,
          size_bytes: buf.length,
        },
        { onConflict: "filename" },
      );
    } catch {
      // Non-fatal
    }

    return json(
      {
        filename: final,
        path: `${mediaBucketName()}/${final}`,
        url: pubUrl,
        alt_text: altText,
      },
      201,
    );
  }

  return json({ error: "Method not allowed" }, 405);
}

export async function handleMediaFilename(req: Request, filename: string): Promise<Response> {
  const gate = await requireAdmin(req);
  if (gate) return gate;

  if (!supabasePostsEnabled()) {
    return json(
      {
        error: "Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for media (Supabase Storage).",
      },
      503,
    );
  }

  const pubUrl = publicObjectUrl(filename);
  const pathStr = `${mediaBucketName()}/${filename}`;

  if (req.method === "PUT") {
    let body: Record<string, unknown>;
    try {
      body = (await readJsonBody(req)) as Record<string, unknown>;
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    const alt = String(body.alt_text || body.alt || "").trim().slice(0, 500);

    try {
      const sb = getSupabaseService();
      const { error } = await sb.from("media_library").upsert(
        {
          filename,
          path: pathStr,
          url: pubUrl,
          alt_text: alt,
        },
        { onConflict: "filename" },
      );
      if (error) throw error;
      return json({ ok: true, filename, alt_text: alt });
    } catch (e) {
      return json({ error: (e as Error).message || String(e) }, 500);
    }
  }

  if (req.method === "DELETE") {
    try {
      await storageRemove(filename);
    } catch (e) {
      return json({ error: (e as Error).message || String(e) }, 500);
    }
    try {
      const sb = getSupabaseService();
      const { error } = await sb
        .from("media_library")
        .update({ deleted_at: new Date().toISOString() })
        .eq("filename", filename);
      if (error) throw error;
      return json({ ok: true, filename });
    } catch (e) {
      return json({ error: (e as Error).message || String(e) }, 500);
    }
  }

  return json({ error: "Method not allowed" }, 405);
}
