/**
 * GET  /api/media — list CMS images (Supabase Storage + media_library metadata)
 * POST /api/media — { filename, content_base64 } — upload to Storage + media_library
 */
import crypto from "node:crypto";
import { requireAdmin, getSupabaseService, supabasePostsEnabled } from "../_lib/admin_auth.mjs";
import {
  mediaBucketName,
  publicObjectUrl,
  storageList,
  storageUpload,
} from "../_lib/supabase_storage.mjs";

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

const ALLOWED = /\.(jpe?g|png|gif|webp)$/i;
const MAX = 8 * 1024 * 1024;

function contentTypeForExt(ext) {
  const e = ext.toLowerCase();
  const m = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
  };
  return m[e] || "application/octet-stream";
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

export default async function handler(req, res) {
  if (req.method === "GET") {
    if (!(await requireAdmin(req, res))) return;
    if (!supabasePostsEnabled()) {
      return res.status(503).json({
        error: "Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for media (Supabase Storage).",
      });
    }

    try {
      const rows = await getFromSupabase();
      const byName = new Map(rows.map((r) => [r.filename, r]));
      let objects;
      try {
        objects = await storageList();
      } catch (e) {
        return res.status(500).json({ error: e.message || String(e) });
      }

      const seen = new Set();
      const out = [];

      for (const o of objects) {
        const name = o.name;
        if (!name || name.endsWith("/") || !ALLOWED.test(name)) continue;
        seen.add(name);
        const r = byName.get(name);
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
        if (seen.has(r.filename)) continue;
        out.push({
          filename: r.filename,
          path: r.path || `${mediaBucketName()}/${r.filename}`,
          url: r.url && String(r.url).startsWith("http") ? r.url : publicObjectUrl(r.filename),
          alt_text: r.alt_text || "",
          size_bytes: r.size_bytes ?? null,
          created_at: r.created_at ?? null,
        });
      }

      out.sort((a, b) => {
        const ta = a.created_at ? Date.parse(a.created_at) : 0;
        const tb = b.created_at ? Date.parse(b.created_at) : 0;
        return tb - ta || String(b.filename).localeCompare(a.filename);
      });

      return res.status(200).json(out);
    } catch (e) {
      return res.status(500).json({ error: e.message || String(e) });
    }
  }

  if (req.method === "POST") {
    if (!(await requireAdmin(req, res))) return;
    if (!supabasePostsEnabled()) {
      return res.status(503).json({
        error: "Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for media (Supabase Storage).",
      });
    }

    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }

    const nameIn = String(body.filename || "upload.bin");
    const b64 = body.content_base64;
    if (!b64 || typeof b64 !== "string") return res.status(400).json({ error: "content_base64 required" });

    let buf;
    try {
      buf = Buffer.from(b64, "base64");
    } catch {
      return res.status(400).json({ error: "Invalid base64" });
    }
    if (buf.length > MAX) return res.status(400).json({ error: "File too large (max 8MB)" });

    const ext = nameIn.includes(".") ? nameIn.slice(nameIn.lastIndexOf(".")).toLowerCase() : "";
    if (![".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(ext)) {
      return res.status(400).json({ error: "Only jpg, png, gif, webp" });
    }

    const stem = nameIn
      .replace(/\.[^/.]+$/, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .slice(0, 60) || "image";
    const final = `${stem}-${crypto.randomBytes(5).toString("hex")}${ext}`;
    const ct = contentTypeForExt(ext);

    try {
      await storageUpload(final, buf, ct);
    } catch (e) {
      return res.status(500).json({ error: e.message || String(e) });
    }

    const openaiKey = (process.env.OPENAI_API_KEY || "").trim();
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
      // Non-fatal: file is in Storage
    }

    return res.status(201).json({
      filename: final,
      path: `${mediaBucketName()}/${final}`,
      url: pubUrl,
      alt_text: altText,
    });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}

async function generateAltText(filename, key) {
  if (!key) return "";
  try {
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
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
