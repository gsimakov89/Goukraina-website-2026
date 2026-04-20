import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, parseApiErrorText, readError } from "@/lib/api";

type TopPageRow = {
  path: string;
  title: string;
  views: number;
  users: number;
  avg_duration_seconds: number;
};

type TopPagesPayload =
  | { configured: false; message: string }
  | { configured: true; rows: TopPageRow[]; total_views: number };

type AnalyticsConfig = {
  ga4_property_id: string;
  gsc_site_url: string;
  service_account_configured: boolean;
};

type PingResult = {
  ok: boolean;
  sitemap: string;
  results: Array<{
    method: string;
    ok?: boolean;
    status?: number;
    error?: string;
    skipped?: string;
  }>;
};

function isTopPagesPayload(x: unknown): x is TopPagesPayload {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (o.configured === false) return typeof o.message === "string";
  if (o.configured === true) return Array.isArray(o.rows) && typeof o.total_views === "number";
  return false;
}

export function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<TopPagesPayload | null>(null);

  const [cfgLoading, setCfgLoading] = useState(true);
  const [cfgErr, setCfgErr] = useState<string | null>(null);
  const [cfgMsg, setCfgMsg] = useState<string | null>(null);
  const [ga4PropertyId, setGa4PropertyId] = useState("");
  const [gscSiteUrl, setGscSiteUrl] = useState("");
  const [serviceAccountConfigured, setServiceAccountConfigured] = useState(false);
  const [serviceAccountJson, setServiceAccountJson] = useState("");
  const [savingCfg, setSavingCfg] = useState(false);

  const [pingLoading, setPingLoading] = useState(false);
  const [pingErr, setPingErr] = useState<string | null>(null);
  const [pingResult, setPingResult] = useState<PingResult | null>(null);

  const loadConfig = useCallback(async () => {
    setCfgErr(null);
    setCfgLoading(true);
    const res = await api("/api/admin/analytics-config");
    setCfgLoading(false);
    if (!res.ok) {
      setCfgErr(await readError(res));
      return;
    }
    const j = (await res.json()) as AnalyticsConfig;
    setGa4PropertyId(j.ga4_property_id || "");
    setGscSiteUrl(j.gsc_site_url || "");
    setServiceAccountConfigured(Boolean(j.service_account_configured));
    setServiceAccountJson("");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const res = await api("/api/admin/analytics?action=top_pages");
    const text = await res.text();
    if (!res.ok) {
      setErr(parseApiErrorText(text, res.statusText));
      setData(null);
      setLoading(false);
      return;
    }
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      setErr("Invalid JSON from analytics API.");
      setData(null);
      setLoading(false);
      return;
    }
    if (parsed && typeof parsed === "object" && "error" in parsed && (parsed as { error?: string }).error) {
      setErr((parsed as { error: string }).error);
      setData(null);
      setLoading(false);
      return;
    }
    if (!isTopPagesPayload(parsed)) {
      setErr("Unexpected analytics response shape.");
      setData(null);
      setLoading(false);
      return;
    }
    setData(parsed);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveConfig(e: FormEvent) {
    e.preventDefault();
    setSavingCfg(true);
    setCfgErr(null);
    setCfgMsg(null);
    const body: Record<string, string> = {
      ga4_property_id: ga4PropertyId.trim(),
      gsc_site_url: gscSiteUrl.trim(),
    };
    const sa = serviceAccountJson.trim();
    if (sa) {
      body.ga4_service_account_json = sa;
    } else {
      body.ga4_service_account_json = "";
    }
    const res = await api("/api/admin/analytics-config", {
      method: "PUT",
      body: JSON.stringify(body),
    });
    setSavingCfg(false);
    if (!res.ok) {
      setCfgErr(await readError(res));
      return;
    }
    setCfgMsg("Saved. Credentials are stored in Supabase (not in the browser).");
    setServiceAccountJson("");
    await loadConfig();
    await load();
  }

  async function pingSitemap() {
    setPingLoading(true);
    setPingErr(null);
    setPingResult(null);
    const res = await api("/api/admin/analytics", {
      method: "POST",
      body: JSON.stringify({ action: "submit_sitemap" }),
    });
    const j = (await res.json().catch(() => null)) as unknown;
    setPingLoading(false);
    if (!res.ok) {
      setPingErr((j && typeof j === "object" && "error" in j && typeof (j as { error: unknown }).error === "string"
        ? (j as { error: string }).error
        : null) || "Ping failed");
      return;
    }
    if (
      j &&
      typeof j === "object" &&
      "sitemap" in j &&
      "results" in j &&
      Array.isArray((j as PingResult).results)
    ) {
      setPingResult(j as PingResult);
    } else {
      setPingErr("Unexpected ping response.");
    }
  }

  return (
    <div>
      <h2 className="font-serif text-2xl font-semibold tracking-tight">Analytics</h2>
      <p className="mt-2 max-w-2xl text-sm text-[oklch(42%_0.03_260)]">
        Connect Google Analytics 4 and Search Console here. Values are saved to your Supabase{" "}
        <code className="rounded bg-[oklch(96%_0.02_250)] px-1">site_settings</code> table (server-side only).
      </p>

      <section className="mt-8 rounded-2xl border border-[oklch(88%_0.02_250)] bg-white p-6 shadow-sm">
        <h3 className="font-serif text-lg font-semibold text-[oklch(22%_0.035_260)]">Google connection</h3>
        <p className="mt-1 text-sm text-[oklch(45%_0.03_260)]">
          Use a service account with <strong className="font-medium">Viewer</strong> on your GA4 property and access to
          Search Console if you want authenticated sitemap submission.
        </p>

        {cfgLoading ? (
          <p className="mt-4 text-sm text-[oklch(45%_0.03_260)]">Loading settings…</p>
        ) : (
          <form onSubmit={saveConfig} className="mt-6 space-y-5">
            {cfgErr && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{cfgErr}</p>
            )}
            {cfgMsg && (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                {cfgMsg}
              </p>
            )}

            <label className="block text-sm">
              <span className="font-medium text-[oklch(28%_0.03_260)]">GA4 property ID</span>
              <p className="mt-0.5 text-xs text-[oklch(45%_0.03_260)]">
                From GA4 → Admin → Property settings. Use <code className="rounded bg-[oklch(96%_0.02_250)] px-1">properties/123…</code> or the numeric id only.
              </p>
              <input
                value={ga4PropertyId}
                onChange={(e) => setGa4PropertyId(e.target.value)}
                placeholder="properties/123456789"
                autoComplete="off"
                className="mt-2 w-full max-w-xl rounded-xl border border-[oklch(88%_0.02_250)] px-3 py-2.5 font-mono text-sm"
              />
            </label>

            <label className="block text-sm">
              <span className="font-medium text-[oklch(28%_0.03_260)]">Search Console site URL</span>
              <p className="mt-0.5 text-xs text-[oklch(45%_0.03_260)]">
                The exact property URL verified in Google Search Console (usually your site homepage with trailing slash).
              </p>
              <input
                value={gscSiteUrl}
                onChange={(e) => setGscSiteUrl(e.target.value)}
                placeholder="https://www.goukraina.org/"
                autoComplete="off"
                className="mt-2 w-full max-w-xl rounded-xl border border-[oklch(88%_0.02_250)] px-3 py-2.5 font-mono text-sm"
              />
            </label>

            <div>
              <span className="block text-sm font-medium text-[oklch(28%_0.03_260)]">Google service account JSON</span>
              <p className="mt-0.5 text-xs text-[oklch(45%_0.03_260)]">
                Paste the full key JSON from Google Cloud IAM.{" "}
                {serviceAccountConfigured ? (
                  <span className="text-emerald-800">A key is saved.</span>
                ) : (
                  <span>No key saved yet.</span>
                )}{" "}
                Leave the box empty to keep the existing key; paste a new JSON to replace it. Clear and save to remove the
                stored key (falls back to server env if set).
              </p>
              <textarea
                value={serviceAccountJson}
                onChange={(e) => setServiceAccountJson(e.target.value)}
                rows={6}
                placeholder="Paste JSON here only when adding or replacing…"
                autoComplete="off"
                spellCheck={false}
                className="mt-2 w-full max-w-2xl rounded-xl border border-[oklch(88%_0.02_250)] bg-[oklch(99%_0.01_250)] px-3 py-2.5 font-mono text-xs text-[oklch(22%_0.03_260)]"
              />
            </div>

            <button
              type="submit"
              disabled={savingCfg}
              className="rounded-xl bg-[oklch(48%_0.12_252)] px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {savingCfg ? "Saving…" : "Save Google settings"}
            </button>
          </form>
        )}
      </section>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-xl border border-[oklch(88%_0.02_250)] bg-white px-4 py-2 text-sm font-medium text-[oklch(28%_0.03_260)] shadow-sm hover:bg-[oklch(98%_0.01_250)] disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh top pages"}
        </button>
      </div>

      {err && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{err}</p>
      )}

      {loading && !data && !err && <p className="mt-6 text-sm text-[oklch(45%_0.03_260)]">Loading analytics…</p>}

      {data?.configured === false && (
        <section className="mt-6 rounded-xl border border-[oklch(88%_0.02_250)] bg-[oklch(99%_0.01_250)] p-4">
          <p className="text-sm text-[oklch(38%_0.03_260)]">{data.message}</p>
        </section>
      )}

      {data?.configured === true && (
        <section className="mt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-[oklch(28%_0.03_260)]">Top pages (28 days)</h3>
            <p className="text-xs text-[oklch(45%_0.03_260)]">
              Total views (listed rows): <strong>{data.total_views.toLocaleString()}</strong>
            </p>
          </div>
          {data.rows.length === 0 ? (
            <p className="mt-3 text-sm text-[oklch(45%_0.03_260)]">No rows returned from GA4 for this period.</p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl border border-[oklch(88%_0.02_250)]">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[oklch(88%_0.02_250)] bg-[oklch(98%_0.01_250)]">
                    <th className="px-3 py-2 font-medium text-[oklch(35%_0.03_260)]">Path</th>
                    <th className="px-3 py-2 font-medium text-[oklch(35%_0.03_260)]">Title</th>
                    <th className="px-3 py-2 font-medium text-[oklch(35%_0.03_260)]">Views</th>
                    <th className="px-3 py-2 font-medium text-[oklch(35%_0.03_260)]">Users</th>
                    <th className="px-3 py-2 font-medium text-[oklch(35%_0.03_260)]">Avg session (s)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.path + row.title} className="border-b border-[oklch(94%_0.02_250)] last:border-0">
                      <td className="max-w-[220px] truncate px-3 py-2 font-mono text-xs text-[oklch(32%_0.03_260)]">
                        {row.path || "—"}
                      </td>
                      <td className="max-w-[280px] truncate px-3 py-2 text-[oklch(38%_0.03_260)]">
                        {row.title || "—"}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{row.views.toLocaleString()}</td>
                      <td className="px-3 py-2 tabular-nums">{row.users.toLocaleString()}</td>
                      <td className="px-3 py-2 tabular-nums">{row.avg_duration_seconds.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section className="mt-10">
        <h3 className="text-sm font-semibold text-[oklch(28%_0.03_260)]">Sitemap</h3>
        <p className="mt-1 max-w-2xl text-sm text-[oklch(42%_0.03_260)]">
          Pings Google’s sitemap endpoint and, when your service account is valid, registers the sitemap in Search Console
          for the site URL above.
        </p>
        <button
          type="button"
          onClick={() => void pingSitemap()}
          disabled={pingLoading}
          className="mt-4 rounded-xl bg-[oklch(48%_0.12_252)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pingLoading ? "Pinging…" : "Ping sitemap to Google"}
        </button>
        {pingErr && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{pingErr}</p>
        )}
        {pingResult && (
          <div className="mt-4 space-y-3 rounded-xl border border-[oklch(88%_0.02_250)] bg-[oklch(99%_0.01_250)] p-4 text-sm">
            <p>
              <span className="text-[oklch(45%_0.03_260)]">Sitemap URL:</span>{" "}
              <a
                href={pingResult.sitemap}
                className="break-all font-mono text-[oklch(40%_0.12_252)] underline"
                target="_blank"
                rel="noreferrer"
              >
                {pingResult.sitemap}
              </a>
            </p>
            <p className="text-[oklch(38%_0.03_260)]">
              Overall:{" "}
              <strong className={pingResult.ok ? "text-green-800" : "text-amber-900"}>
                {pingResult.ok ? "at least one step succeeded" : "no step reported success"}
              </strong>
            </p>
            <ul className="space-y-2 border-t border-[oklch(92%_0.02_250)] pt-3">
              {pingResult.results.map((r) => (
                <li key={r.method} className="flex flex-wrap items-start gap-2">
                  <span className="font-medium capitalize">{r.method.replace("_", " ")}</span>
                  {"ok" in r && r.ok !== undefined && (
                    <span className={r.ok ? "text-green-800" : "text-amber-900"}>{r.ok ? "OK" : "Failed"}</span>
                  )}
                  {r.status != null && <span className="text-[oklch(45%_0.03_260)]">HTTP {r.status}</span>}
                  {r.skipped && <span className="text-[oklch(45%_0.03_260)]">({r.skipped})</span>}
                  {r.error && <span className="text-red-800">{r.error}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
