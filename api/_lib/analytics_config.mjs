/**
 * GA4 / Search Console settings: site_settings.analytics overrides env per field.
 */
import { getSupabaseService } from "./admin_auth.mjs";

const KEY = "analytics";
export const SITE_ORIGIN = "https://www.goukraina.org";

export async function getMergedAnalyticsConfig() {
  const env = {
    ga4_property_id: (process.env.GA4_PROPERTY_ID || "").trim(),
    gsc_site_url: (process.env.GSC_SITE_URL || "").trim() || `${SITE_ORIGIN}/`,
    ga4_service_account_json: (process.env.GA4_SERVICE_ACCOUNT_JSON || "").trim(),
  };
  try {
    const sb = getSupabaseService();
    const { data, error } = await sb.from("site_settings").select("value").eq("key", KEY).maybeSingle();
    if (error || !data?.value || typeof data.value !== "object") return env;
    const db = data.value;
    const out = { ...env };
    if (typeof db.ga4_property_id === "string" && db.ga4_property_id.trim()) {
      out.ga4_property_id = db.ga4_property_id.trim();
    }
    if (typeof db.gsc_site_url === "string" && db.gsc_site_url.trim()) {
      out.gsc_site_url = db.gsc_site_url.trim();
    } else if (db.gsc_site_url === "") {
      out.gsc_site_url = `${SITE_ORIGIN}/`;
    }
    if (typeof db.ga4_service_account_json === "string" && db.ga4_service_account_json.trim()) {
      out.ga4_service_account_json = db.ga4_service_account_json.trim();
    }
    return out;
  } catch {
    return env;
  }
}
