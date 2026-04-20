/**
 * PUT  /api/media/:filename  — update alt text in Supabase media_library (auth)
 * DELETE /api/media/:filename — remove object from Storage + soft-delete media_library row (auth)
 */
import { getSupabaseService, requireAdmin, supabasePostsEnabled } from "../_lib/admin_auth.mjs";
import { mediaBucketName, publicObjectUrl, storageRemove } from "../_lib/supabase_storage.mjs";

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;

  if (!supabasePostsEnabled()) {
    return res.status(503).json({
      error: "Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for media (Supabase Storage).",
    });
  }

  const raw = req.query?.filename;
  const filename = Array.isArray(raw) ? raw[0] : raw;
  if (!filename) return res.status(400).json({ error: "Missing filename" });

  const pubUrl = publicObjectUrl(filename);
  const pathStr = `${mediaBucketName()}/${filename}`;

  if (req.method === "PUT") {
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
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
      return res.status(200).json({ ok: true, filename, alt_text: alt });
    } catch (e) {
      return res.status(500).json({ error: e.message || String(e) });
    }
  }

  if (req.method === "DELETE") {
    try {
      await storageRemove(filename);
    } catch (e) {
      return res.status(500).json({ error: e.message || String(e) });
    }
    try {
      const sb = getSupabaseService();
      const { error } = await sb
        .from("media_library")
        .update({ deleted_at: new Date().toISOString() })
        .eq("filename", filename);
      if (error) throw error;
      return res.status(200).json({ ok: true, filename });
    } catch (e) {
      return res.status(500).json({ error: e.message || String(e) });
    }
  }

  res.setHeader("Allow", "PUT, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
