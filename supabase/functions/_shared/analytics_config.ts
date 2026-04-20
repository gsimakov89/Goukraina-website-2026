/** GA4 / GSC settings: site_settings.analytics overrides env per field. */
import { getSupabaseService } from "./admin_auth.ts";

const KEY = "analytics";
export const SITE_ORIGIN = "https://www.goukraina.org";

export type MergedAnalyticsConfig = {
  ga4_property_id: string;
  gsc_site_url: string;
  ga4_service_account_json: string;
};

export async function getMergedAnalyticsConfig(): Promise<MergedAnalyticsConfig> {
  const env: MergedAnalyticsConfig = {
    ga4_property_id: (Deno.env.get("GA4_PROPERTY_ID") || "").trim(),
    gsc_site_url: (Deno.env.get("GSC_SITE_URL") || "").trim() || `${SITE_ORIGIN}/`,
    ga4_service_account_json: (Deno.env.get("GA4_SERVICE_ACCOUNT_JSON") || "").trim(),
  };
  try {
    const sb = getSupabaseService();
    const { data, error } = await sb.from("site_settings").select("value").eq("key", KEY).maybeSingle();
    if (error || !data?.value || typeof data.value !== "object") return env;
    const db = data.value as Record<string, unknown>;
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
