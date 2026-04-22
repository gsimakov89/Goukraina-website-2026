import { useEffect, useId, useState, type FormEvent } from "react";
import { api, readError } from "@/lib/api";

type TrackingValue = {
  gtm_id: string;
  fb_pixel: string;
  custom_head: string;
};

type NewsletterPopupValue = {
  enabled: boolean;
  delay_seconds: string;
  heading: string;
  body_text: string;
  button_text: string;
  success_text: string;
  /** Comma-separated extra Givebutter contact tags (optional). */
  contact_tags: string;
};

function normalizeTracking(raw: unknown): TrackingValue {
  if (!raw || typeof raw !== "object") {
    return { gtm_id: "", fb_pixel: "", custom_head: "" };
  }
  const o = raw as Record<string, unknown>;
  return {
    gtm_id: String(o.gtm_id ?? "").trim(),
    fb_pixel: String(o.fb_pixel ?? "").trim(),
    custom_head: String(o.custom_head ?? "").trim(),
  };
}

const NL_DEFAULTS = {
  heading: "Stay close to Ukraine",
  body:
    "Get field reports and updates from Go Ukraina delivered to your inbox. No spam — just real stories from the ground.",
  button: "Send me updates",
  success: "You're on the list. We'll be in touch.",
} as const;

function resolvedNewsletterCopy(nl: NewsletterPopupValue) {
  return {
    heading: nl.heading.trim() || NL_DEFAULTS.heading,
    body: nl.body_text.trim() || NL_DEFAULTS.body,
    button: nl.button_text.trim() || NL_DEFAULTS.button,
    success: nl.success_text.trim() || NL_DEFAULTS.success,
  };
}

function normalizeNewsletter(raw: unknown): NewsletterPopupValue {
  if (!raw || typeof raw !== "object") {
    return {
      enabled: false,
      delay_seconds: "5",
      heading: "",
      body_text: "",
      button_text: "",
      success_text: "",
      contact_tags: "",
    };
  }
  const o = raw as Record<string, unknown>;
  return {
    enabled: Boolean(o.enabled),
    delay_seconds: String(o.delay_seconds ?? "5").trim() || "5",
    heading: String(o.heading ?? "").trim(),
    body_text: String(o.body_text ?? "").trim(),
    button_text: String(o.button_text ?? "").trim(),
    success_text: String(o.success_text ?? "").trim(),
    contact_tags: String(o.contact_tags ?? "").trim(),
  };
}

type NewsletterEditorTab = "popup" | "thankyou";

function NewsletterPopupPreview({
  nl,
  activeTab,
}: {
  nl: NewsletterPopupValue;
  activeTab: NewsletterEditorTab;
}) {
  const copy = resolvedNewsletterCopy(nl);
  const showForm = activeTab === "popup";

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-[oklch(88%_0.02_250)] bg-[oklch(96%_0.02_250)] shadow-inner"
      aria-hidden
    >
      <div className="pointer-events-none flex min-h-[320px] items-center justify-center p-6 sm:min-h-[380px] sm:p-8">
        <div
          className="w-full max-w-[440px] rounded-2xl border border-[rgba(212,168,75,0.28)] bg-gradient-to-br from-[#0d1425] to-[#121b2e] p-8 shadow-[0_24px_64px_rgba(0,0,0,0.45)]"
          style={{ fontFamily: "system-ui, sans-serif" }}
        >
          <div className="mb-5 flex gap-2">
            <div className="h-1 w-8 rounded-sm bg-[#1565c0]" />
            <div className="h-1 w-8 rounded-sm bg-[#d4a84b]" />
          </div>
          <h3 className="m-0 text-[1.35rem] font-bold leading-tight text-[#e8ecf4]">{copy.heading}</h3>
          <p className="mb-5 mt-2 text-[0.92rem] leading-relaxed text-[#9aa4ba]">{copy.body}</p>

          {showForm ? (
            <div>
              <div className="flex flex-col gap-2.5">
                <div
                  className="rounded-lg border border-[rgba(212,168,75,0.25)] bg-[#080d18] px-3.5 py-2.5 text-[0.92rem] text-[#6b7585]"
                  style={{ fontFamily: "system-ui, sans-serif" }}
                >
                  Your email address
                </div>
                <button
                  type="button"
                  tabIndex={-1}
                  className="rounded-lg border-0 bg-gradient-to-br from-[#d4a84b] to-[#c49535] px-4 py-3 text-[0.95rem] font-bold text-[#141820]"
                  style={{ fontFamily: "system-ui, sans-serif" }}
                >
                  {copy.button}
                </button>
              </div>
              <p className="mt-3 text-center text-[0.75rem] text-[#6b7585]" style={{ fontFamily: "system-ui, sans-serif" }}>
                No spam. Unsubscribe anytime.
              </p>
            </div>
          ) : (
            <div className="py-4 text-center">
              <p className="m-0 text-base font-semibold text-[#22c55e]" style={{ fontFamily: "system-ui, sans-serif" }}>
                ✓ Thank you!
              </p>
              <p
                className="mt-2 text-[0.82rem] leading-relaxed text-[#9aa4ba]"
                style={{ fontFamily: "system-ui, sans-serif" }}
              >
                {copy.success}
              </p>
            </div>
          )}
        </div>
      </div>
      <p className="border-t border-[oklch(90%_0.02_250)] bg-white/80 px-3 py-2 text-center text-[0.65rem] text-[oklch(45%_0.03_260)]">
        {showForm ? "Preview: signup form" : "Preview: after someone subscribes"}
      </p>
    </div>
  );
}

export function SiteSettingsPage() {
  const [gtmId, setGtmId] = useState("");
  const [fbPixel, setFbPixel] = useState("");
  const [customHead, setCustomHead] = useState("");
  const [nl, setNl] = useState<NewsletterPopupValue>(normalizeNewsletter(null));
  const [advancedRaw, setAdvancedRaw] = useState("{}");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [rebuildNote, setRebuildNote] = useState<string | null>(null);
  const [nlTab, setNlTab] = useState<NewsletterEditorTab>("popup");
  const nlTabsId = useId();

  function applySettingsPayload(data: Record<string, unknown>) {
    const t = normalizeTracking(data.tracking);
    setGtmId(t.gtm_id);
    setFbPixel(t.fb_pixel);
    setCustomHead(t.custom_head);
    setNl(normalizeNewsletter(data.newsletter_popup));
    setAdvancedRaw(JSON.stringify(data, null, 2));
  }

  function patchNl(patch: Partial<NewsletterPopupValue>) {
    setNl((prev) => ({ ...prev, ...patch }));
  }

  useEffect(() => {
    (async () => {
      const res = await api("/api/admin/settings");
      if (!res.ok) {
        setErr(await readError(res));
        setLoading(false);
        return;
      }
      const data = (await res.json()) as Record<string, unknown>;
      applySettingsPayload(data);
      setLoading(false);
    })();
  }, []);

  async function saveTracking(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    setMsg(null);
    setRebuildNote(null);

    const value: TrackingValue = {
      gtm_id: gtmId.trim(),
      fb_pixel: fbPixel.trim(),
      custom_head: customHead.trim(),
    };

    const putRes = await api("/api/admin/settings", {
      method: "PUT",
      body: JSON.stringify([{ key: "tracking", value }]),
    });
    if (!putRes.ok) {
      setErr(await readError(putRes));
      setSaving(false);
      return;
    }

    const rb = await api("/api/rebuild-site", { method: "POST" });
    const rebuildJson = (await rb.json().catch(() => ({}))) as {
      ok?: boolean;
      skipped?: boolean;
      message?: string;
      error?: string;
    };

    if (!rb.ok) {
      setMsg("Tracking saved. Rebuild could not be queued.");
      setRebuildNote(await readError(rb));
      setSaving(false);
      return;
    }

    setMsg("Tracking saved.");
    if (rebuildJson.message) {
      setRebuildNote(rebuildJson.message);
    }
    const again = await api("/api/admin/settings");
    if (again.ok) {
      applySettingsPayload((await again.json()) as Record<string, unknown>);
    }
    setSaving(false);
  }

  async function saveNewsletter(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    setMsg(null);
    setRebuildNote(null);

    const delayNum = Math.max(0, parseInt(nl.delay_seconds || "5", 10) || 0);
    const value = {
      enabled: nl.enabled,
      delay_seconds: delayNum,
      heading: nl.heading.trim() || NL_DEFAULTS.heading,
      body_text: nl.body_text.trim() || NL_DEFAULTS.body,
      button_text: nl.button_text.trim() || NL_DEFAULTS.button,
      success_text: nl.success_text.trim() || NL_DEFAULTS.success,
      contact_tags: nl.contact_tags.trim(),
    };

    const putRes = await api("/api/admin/settings", {
      method: "PUT",
      body: JSON.stringify([{ key: "newsletter_popup", value }]),
    });
    if (!putRes.ok) {
      setErr(await readError(putRes));
      setSaving(false);
      return;
    }

    const rb = await api("/api/rebuild-site", { method: "POST" });
    const rebuildJson = (await rb.json().catch(() => ({}))) as {
      ok?: boolean;
      skipped?: boolean;
      message?: string;
    };

    if (!rb.ok) {
      setMsg("Newsletter settings saved. Rebuild could not be queued.");
      setRebuildNote(await readError(rb));
      setSaving(false);
      return;
    }

    setMsg("Newsletter settings saved.");
    if (rebuildJson.message) {
      setRebuildNote(rebuildJson.message);
    }
    const again = await api("/api/admin/settings");
    if (again.ok) {
      applySettingsPayload((await again.json()) as Record<string, unknown>);
    }
    setSaving(false);
  }

  async function saveAdvancedJson(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    setMsg(null);
    setRebuildNote(null);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(advancedRaw) as Record<string, unknown>;
    } catch {
      setErr("Advanced JSON is invalid.");
      setSaving(false);
      return;
    }
    const items = Object.entries(parsed).map(([key, value]) => ({ key, value }));
    const res = await api("/api/admin/settings", {
      method: "PUT",
      body: JSON.stringify(items),
    });
    setSaving(false);
    if (!res.ok) {
      setErr(await readError(res));
      return;
    }
    setMsg("All settings saved.");
    const rb = await api("/api/rebuild-site", { method: "POST" });
    const rebuildJson = (await rb.json().catch(() => ({}))) as { message?: string };
    if (rb.ok && rebuildJson.message) setRebuildNote(rebuildJson.message);
    const again = await api("/api/admin/settings");
    if (again.ok) {
      applySettingsPayload((await again.json()) as Record<string, unknown>);
    }
  }

  if (loading) {
    return (
      <div>
        <h2 className="font-serif text-2xl font-semibold tracking-tight">Site & tracking</h2>
        <p className="mt-6 text-sm text-[oklch(45%_0.03_260)]">Loading…</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="font-serif text-2xl font-semibold tracking-tight">Site & tracking</h2>
      <p className="mt-2 max-w-2xl text-sm text-[oklch(42%_0.03_260)]">
        Change tags and scripts here—no code files. Values live in Supabase <code className="rounded bg-[oklch(96%_0.02_250)] px-1">site_settings</code>.
        After you save, we queue a site rebuild so the public HTML picks up tracking and the email popup (usually a few
        minutes on production).
      </p>

      {err && (
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{err}</p>
      )}
      {msg && (
        <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {msg}
        </p>
      )}
      {rebuildNote && (
        <p className="mt-3 rounded-lg border border-[oklch(88%_0.02_250)] bg-[oklch(98%_0.01_250)] px-3 py-2 text-sm text-[oklch(32%_0.03_260)]">
          {rebuildNote}
        </p>
      )}

      <form onSubmit={saveTracking} className="mt-8 max-w-xl space-y-5">
        <div>
          <label className="block text-sm font-medium text-[oklch(28%_0.03_260)]">Google Tag Manager</label>
          <p className="mt-1 text-xs text-[oklch(45%_0.03_260)]">Container ID only, e.g. GTM-XXXXXXX</p>
          <input
            type="text"
            value={gtmId}
            onChange={(e) => setGtmId(e.target.value)}
            placeholder="GTM-XXXXXXX"
            autoComplete="off"
            className="mt-2 w-full rounded-xl border border-[oklch(88%_0.02_250)] bg-white px-3 py-2.5 font-mono text-sm text-[oklch(22%_0.03_260)] placeholder:text-[oklch(65%_0.02_260)]"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[oklch(28%_0.03_260)]">Meta (Facebook) Pixel</label>
          <p className="mt-1 text-xs text-[oklch(45%_0.03_260)]">Numeric pixel ID from Meta Events Manager</p>
          <input
            type="text"
            inputMode="numeric"
            value={fbPixel}
            onChange={(e) => setFbPixel(e.target.value)}
            placeholder="e.g. 123456789012345"
            autoComplete="off"
            className="mt-2 w-full rounded-xl border border-[oklch(88%_0.02_250)] bg-white px-3 py-2.5 font-mono text-sm text-[oklch(22%_0.03_260)] placeholder:text-[oklch(65%_0.02_260)]"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[oklch(28%_0.03_260)]">Additional head HTML (optional)</label>
          <p className="mt-1 text-xs text-[oklch(45%_0.03_260)]">
            Raw snippets inserted after GTM / Pixel (e.g. other verification tags). Use trusted markup only.
          </p>
          <textarea
            value={customHead}
            onChange={(e) => setCustomHead(e.target.value)}
            rows={5}
            placeholder="<!-- optional scripts -->"
            className="mt-2 w-full rounded-xl border border-[oklch(88%_0.02_250)] bg-white px-3 py-2.5 font-mono text-xs text-[oklch(22%_0.03_260)]"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-[oklch(48%_0.12_252)] px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save tracking & rebuild site"}
        </button>
      </form>

      <h3 className="mt-14 font-serif text-xl font-semibold tracking-tight">Email signup popup</h3>
      <p className="mt-2 max-w-2xl text-sm text-[oklch(42%_0.03_260)]">
        Edit the message visitors see, then check the preview. Submissions are validated, deduplicated, and synced to
        Givebutter contacts. Add the Givebutter API key under{" "}
        <strong className="font-medium text-[oklch(32%_0.03_260)]">Integrations</strong> in the sidebar (or set{" "}
        <code className="rounded bg-[oklch(96%_0.02_250)] px-1">GIVEBUTTER_API_KEY</code> on the host if your team prefers
        that).
      </p>

      <form onSubmit={saveNewsletter} className="mt-8">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-10">
          <div className="min-w-0 flex-1 space-y-6">
            <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[oklch(88%_0.02_250)] bg-[oklch(99%_0.01_250)] px-4 py-3">
              <label className="flex cursor-pointer items-center gap-3 text-sm font-medium text-[oklch(28%_0.03_260)]">
                <input
                  type="checkbox"
                  checked={nl.enabled}
                  onChange={(e) => patchNl({ enabled: e.target.checked })}
                  className="h-4 w-4 rounded border-[oklch(88%_0.02_250)]"
                />
                Show on public site
              </label>
              <div className="flex items-center gap-2 text-sm text-[oklch(38%_0.03_260)]">
                <span className="text-[oklch(45%_0.03_260)]">Show after</span>
                <input
                  type="number"
                  min={0}
                  value={nl.delay_seconds}
                  onChange={(e) => patchNl({ delay_seconds: e.target.value })}
                  className="w-16 rounded-lg border border-[oklch(88%_0.02_250)] bg-white px-2 py-1.5 text-center text-sm tabular-nums"
                  aria-label="Seconds before popup appears"
                />
                <span className="text-[oklch(45%_0.03_260)]">seconds</span>
              </div>
            </div>

            <div>
              <div
                className="flex gap-1 rounded-xl border border-[oklch(88%_0.02_250)] bg-[oklch(97%_0.015_250)] p-1"
                role="tablist"
                aria-label="Popup editor sections"
              >
                <button
                  type="button"
                  role="tab"
                  id={`${nlTabsId}-popup`}
                  aria-selected={nlTab === "popup"}
                  aria-controls={`${nlTabsId}-panel-popup`}
                  tabIndex={nlTab === "popup" ? 0 : -1}
                  onClick={() => setNlTab("popup")}
                  className={[
                    "flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
                    nlTab === "popup"
                      ? "bg-white text-[oklch(22%_0.03_260)] shadow-sm"
                      : "text-[oklch(42%_0.03_260)] hover:text-[oklch(28%_0.03_260)]",
                  ].join(" ")}
                >
                  Popup
                </button>
                <button
                  type="button"
                  role="tab"
                  id={`${nlTabsId}-thankyou`}
                  aria-selected={nlTab === "thankyou"}
                  aria-controls={`${nlTabsId}-panel-thankyou`}
                  tabIndex={nlTab === "thankyou" ? 0 : -1}
                  onClick={() => setNlTab("thankyou")}
                  className={[
                    "flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
                    nlTab === "thankyou"
                      ? "bg-white text-[oklch(22%_0.03_260)] shadow-sm"
                      : "text-[oklch(42%_0.03_260)] hover:text-[oklch(28%_0.03_260)]",
                  ].join(" ")}
                >
                  Thank you
                </button>
              </div>

              {nlTab === "popup" && (
                <div
                  id={`${nlTabsId}-panel-popup`}
                  role="tabpanel"
                  aria-labelledby={`${nlTabsId}-popup`}
                  className="mt-6 space-y-5"
                >
                  <p className="text-sm text-[oklch(45%_0.03_260)]">
                    This is what people see first—headline, short explanation, and the button label.
                  </p>
                  <div>
                    <label className="block text-sm font-medium text-[oklch(28%_0.03_260)]">Headline</label>
                    <input
                      type="text"
                      value={nl.heading}
                      onChange={(e) => patchNl({ heading: e.target.value })}
                      placeholder={NL_DEFAULTS.heading}
                      className="mt-1.5 w-full rounded-xl border border-[oklch(88%_0.02_250)] bg-white px-3 py-2.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[oklch(28%_0.03_260)]">Supporting text</label>
                    <p className="mt-0.5 text-xs text-[oklch(45%_0.03_260)]">A sentence or two under the headline.</p>
                    <textarea
                      value={nl.body_text}
                      onChange={(e) => patchNl({ body_text: e.target.value })}
                      rows={4}
                      placeholder={NL_DEFAULTS.body}
                      className="mt-2 w-full rounded-xl border border-[oklch(88%_0.02_250)] bg-white px-3 py-2.5 text-sm leading-relaxed"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[oklch(28%_0.03_260)]">Button label</label>
                    <input
                      type="text"
                      value={nl.button_text}
                      onChange={(e) => patchNl({ button_text: e.target.value })}
                      placeholder={NL_DEFAULTS.button}
                      className="mt-1.5 w-full rounded-xl border border-[oklch(88%_0.02_250)] bg-white px-3 py-2.5 text-sm"
                    />
                  </div>

                  <details className="rounded-xl border border-[oklch(88%_0.02_250)] bg-white px-4 py-3">
                    <summary className="cursor-pointer text-sm font-medium text-[oklch(32%_0.03_260)]">
                      Givebutter tags (optional)
                    </summary>
                    <p className="mt-2 text-xs text-[oklch(45%_0.03_260)]">
                      Extra contact tags in addition to <span className="font-mono">website-newsletter</span> and{" "}
                      <span className="font-mono">go-ukraina</span>. Comma-separated, max 64 characters per tag.
                    </p>
                    <input
                      type="text"
                      value={nl.contact_tags}
                      onChange={(e) => patchNl({ contact_tags: e.target.value })}
                      placeholder="e.g. popup-2026, homepage"
                      autoComplete="off"
                      className="mt-3 w-full rounded-xl border border-[oklch(88%_0.02_250)] bg-[oklch(99%_0.01_250)] px-3 py-2.5 text-sm text-[oklch(22%_0.03_260)]"
                    />
                  </details>
                </div>
              )}

              {nlTab === "thankyou" && (
                <div
                  id={`${nlTabsId}-panel-thankyou`}
                  role="tabpanel"
                  aria-labelledby={`${nlTabsId}-thankyou`}
                  className="mt-6 space-y-5"
                >
                  <p className="text-sm text-[oklch(45%_0.03_260)]">
                    Shown right after someone submits their email. Keep it short and friendly.
                  </p>
                  <div>
                    <label className="block text-sm font-medium text-[oklch(28%_0.03_260)]">Confirmation message</label>
                    <p className="mt-0.5 text-xs text-[oklch(45%_0.03_260)]">
                      Appears under “Thank you!” on the success screen.
                    </p>
                    <textarea
                      value={nl.success_text}
                      onChange={(e) => patchNl({ success_text: e.target.value })}
                      rows={3}
                      placeholder={NL_DEFAULTS.success}
                      className="mt-2 w-full rounded-xl border border-[oklch(88%_0.02_250)] bg-white px-3 py-2.5 text-sm leading-relaxed"
                    />
                  </div>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-[oklch(48%_0.12_252)] px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save newsletter popup & rebuild site"}
            </button>
          </div>

          <aside className="w-full shrink-0 lg:sticky lg:top-6 lg:w-[min(100%,420px)] lg:self-start">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-[oklch(45%_0.03_260)]">Live preview</p>
              <p className="text-xs text-[oklch(45%_0.03_260)]">
                {nlTab === "popup" ? "Signup form" : "Thank-you screen"}
              </p>
            </div>
            <NewsletterPopupPreview nl={nl} activeTab={nlTab} />
            <p className="mt-3 text-xs leading-relaxed text-[oklch(45%_0.03_260)]">
              Switch the <strong className="font-medium text-[oklch(35%_0.03_260)]">Popup</strong> /{" "}
              <strong className="font-medium text-[oklch(35%_0.03_260)]">Thank you</strong> tab to preview each step. Empty
              fields use the site defaults until you save.
            </p>
          </aside>
        </div>
      </form>

      <details className="mt-10 max-w-3xl rounded-xl border border-[oklch(88%_0.02_250)] bg-[oklch(99%_0.01_250)] p-4">
        <summary className="cursor-pointer text-sm font-medium text-[oklch(32%_0.03_260)]">
          Advanced: all site settings (JSON)
        </summary>
        <p className="mt-2 text-xs text-[oklch(45%_0.03_260)]">
          Edit other keys such as <code className="rounded bg-[oklch(96%_0.02_250)] px-1">newsletter_popup</code>. Saving
          here overwrites the whole document—keep valid JSON.
        </p>
        <form onSubmit={saveAdvancedJson} className="mt-4">
          <textarea
            value={advancedRaw}
            onChange={(e) => setAdvancedRaw(e.target.value)}
            rows={16}
            className="w-full rounded-xl border border-[oklch(88%_0.02_250)] bg-[oklch(16%_0.04_260)] p-4 font-mono text-xs text-[oklch(96%_0.02_250)]"
          />
          <button
            type="submit"
            disabled={saving}
            className="mt-4 rounded-xl border border-[oklch(88%_0.02_250)] bg-white px-5 py-2 text-sm font-medium text-[oklch(28%_0.03_260)] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save all settings & rebuild"}
          </button>
        </form>
      </details>
    </div>
  );
}
