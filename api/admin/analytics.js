/**
 * GET  /api/admin/analytics?action=top_pages — fetch top pages from GA4 Data API (auth)
 * POST /api/admin/analytics                   — { action: 'submit_sitemap' } — ping Google to re-crawl sitemap (auth)
 *
 * Required env vars for full functionality:
 *   GA4_PROPERTY_ID              — e.g. "properties/123456789"
 *   GA4_SERVICE_ACCOUNT_JSON     — full JSON of a GCP service account with GA4 viewer role
 *   GSC_SITE_URL                 — e.g. "https://www.goukraina.org/" (Search Console verified)
 *
 * If credentials are missing, endpoints return a helpful configuration message rather than 500.
 */
import { requireAdmin } from "../_lib/admin_auth.mjs";
import { getMergedAnalyticsConfig, SITE_ORIGIN } from "../_lib/analytics_config.mjs";


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

async function getServiceAccount() {
  const m = await getMergedAnalyticsConfig();
  const raw = (m.ga4_service_account_json || "").trim();
  if (!raw) return null;
  try { return JSON.parse(raw); }
  catch { return null; }
}

// Sign a JWT with the service account's RSA key using Node crypto (no extra deps).
async function getGoogleAccessToken(scopes) {
  const sa = await getServiceAccount();
  if (!sa || !sa.private_key || !sa.client_email) return null;

  const { createSign } = await import("node:crypto");
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: Array.isArray(scopes) ? scopes.join(" ") : scopes,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const b64url = (obj) => Buffer.from(JSON.stringify(obj))
    .toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const unsigned = `${b64url(header)}.${b64url(claim)}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const sig = signer.sign(sa.private_key).toString("base64")
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const assertion = `${unsigned}.${sig}`;

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const json = await r.json();
  if (!r.ok) throw new Error(json.error_description || "Token exchange failed");
  return json.access_token;
}

async function getTopPages() {
  const cfg = await getMergedAnalyticsConfig();
  const propertyId = (cfg.ga4_property_id || "").trim();
  if (!propertyId) {
    return {
      configured: false,
      message: "Add your GA4 property ID and service account below (stored in Supabase).",
    };
  }

  const token = await getGoogleAccessToken([
    "https://www.googleapis.com/auth/analytics.readonly",
  ]);
  if (!token) {
    return {
      configured: false,
      message: "Service account JSON is missing or invalid. Paste a valid Google Cloud service account key.",
    };
  }

  const property = propertyId.startsWith("properties/") ? propertyId : `properties/${propertyId}`;

  const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/${property}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
      dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
      metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }, { name: "averageSessionDuration" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 20,
    }),
  });

  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || "GA4 query failed");

  const rows = (data.rows || []).map((row) => ({
    path: row.dimensionValues?.[0]?.value || "",
    title: row.dimensionValues?.[1]?.value || "",
    views: parseInt(row.metricValues?.[0]?.value || "0", 10),
    users: parseInt(row.metricValues?.[1]?.value || "0", 10),
    avg_duration_seconds: Math.round(parseFloat(row.metricValues?.[2]?.value || "0")),
  }));

  return { configured: true, rows, total_views: rows.reduce((s, r) => s + r.views, 0) };
}

async function submitSitemap() {
  const cfg = await getMergedAnalyticsConfig();
  const siteUrl = (cfg.gsc_site_url || `${SITE_ORIGIN}/`).trim();
  const sitemapUrl = `${SITE_ORIGIN}/sitemap.xml`;

  // Ping-based notification (works without OAuth; public Google endpoint).
  const pingUrl = `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`;
  const results = [];

  try {
    const pr = await fetch(pingUrl, { method: "GET" });
    results.push({ method: "ping", ok: pr.ok, status: pr.status });
  } catch (e) {
    results.push({ method: "ping", ok: false, error: e.message });
  }

  // Authenticated Search Console submission (requires OAuth + verified property).
  try {
    const token = await getGoogleAccessToken([
      "https://www.googleapis.com/auth/webmasters",
    ]);
    if (token) {
      const encodedSite = encodeURIComponent(siteUrl);
      const encodedSitemap = encodeURIComponent(sitemapUrl);
      const gr = await fetch(
        `https://www.googleapis.com/webmasters/v3/sites/${encodedSite}/sitemaps/${encodedSitemap}`,
        { method: "PUT", headers: { Authorization: `Bearer ${token}` } }
      );
      results.push({ method: "search_console", ok: gr.ok, status: gr.status });
    } else {
      results.push({
        method: "search_console",
        ok: false,
        skipped: "Service account not configured (Supabase site_settings.analytics or env)",
      });
    }
  } catch (e) {
    results.push({ method: "search_console", ok: false, error: e.message });
  }

  return { ok: results.some((r) => r.ok), sitemap: sitemapUrl, results };
}

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;

  if (req.method === "GET") {
    const action = (req.query?.action || "").trim();
    if (action === "top_pages") {
      try {
        const result = await getTopPages();
        return res.status(200).json(result);
      } catch (e) {
        return res.status(500).json({ error: e.message || String(e) });
      }
    }
    return res.status(400).json({ error: "Unknown GET action" });
  }

  if (req.method === "POST") {
    let body;
    try { body = await readJsonBody(req); }
    catch { return res.status(400).json({ error: "Invalid JSON" }); }

    const action = String(body.action || "").trim();

    if (action === "submit_sitemap") {
      try {
        const result = await submitSitemap();
        return res.status(200).json(result);
      } catch (e) {
        return res.status(500).json({ error: e.message || String(e) });
      }
    }

    return res.status(400).json({ error: "Unknown POST action" });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
