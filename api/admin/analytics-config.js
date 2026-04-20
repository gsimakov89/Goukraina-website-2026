/**
 * GET  /api/admin/analytics-config — safe GA4 / GSC fields (no private key in response)
 * PUT  /api/admin/analytics-config — save to site_settings.analytics (admin auth)
 */
import { getSupabaseService, requireAdmin } from "../_lib/admin_auth.mjs";
import { getMergedAnalyticsConfig, SITE_ORIGIN } from "../_lib/analytics_config.mjs";

const KEY = "analytics";

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; });
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

function parseServiceAccount(raw) {
  if (!raw || typeof raw !== "string" || !raw.trim()) return null;
  try {
    const o = JSON.parse(raw);
    return typeof o === "object" && o !== null ? o : null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!(await requireAdmin(req, res))) return;

  if (req.method === "GET") {
    try {
      const m = await getMergedAnalyticsConfig();
      const raw = m.ga4_service_account_json || "";
      const hasSa = Boolean(raw.trim()) && parseServiceAccount(raw) !== null;
      return res.status(200).json({
        ga4_property_id: m.ga4_property_id || "",
        gsc_site_url: m.gsc_site_url || `${SITE_ORIGIN}/`,
        service_account_configured: hasSa,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message || String(e) });
    }
  }

  if (req.method === "PUT") {
    let body;
    try { body = await readJsonBody(req); }
    catch { return res.status(400).json({ error: "Invalid JSON" }); }

    try {
      const sb = getSupabaseService();
      const { data: row } = await sb.from("site_settings").select("value").eq("key", KEY).maybeSingle();
      const current = row?.value && typeof row.value === "object" ? { ...row.value } : {};

      if ("ga4_property_id" in body) {
        current.ga4_property_id = String(body.ga4_property_id || "").trim();
      }
      if ("gsc_site_url" in body) {
        const u = String(body.gsc_site_url || "").trim();
        current.gsc_site_url = u || `${SITE_ORIGIN}/`;
      }
      if ("ga4_service_account_json" in body) {
        const raw = String(body.ga4_service_account_json || "").trim();
        if (raw) {
          try {
            JSON.parse(raw);
          } catch {
            return res.status(400).json({ error: "Google service account JSON must be valid JSON." });
          }
          current.ga4_service_account_json = raw;
        } else {
          delete current.ga4_service_account_json;
        }
      }

      const { error } = await sb.from("site_settings").upsert(
        {
          key: KEY,
          value: current,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
      if (error) throw error;
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message || String(e) });
    }
  }

  res.setHeader("Allow", "GET, PUT");
  return res.status(405).json({ error: "Method not allowed" });
}
