import { useEffect, useState, type FormEvent } from "react";
import { api, readError } from "@/lib/api";

type ApiKeysValue = {
  openai_api_key?: string;
  givebutter_api_key?: string;
};

function normalizeApiKeys(raw: unknown): ApiKeysValue {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  return {
    openai_api_key: typeof o.openai_api_key === "string" ? o.openai_api_key : "",
    givebutter_api_key: typeof o.givebutter_api_key === "string" ? o.givebutter_api_key : "",
  };
}

function hintForKey(val: string | undefined): string | null {
  const s = String(val || "").trim();
  if (!s) return null;
  if (s.length <= 4) return "•••• (saved)";
  return `••••${s.slice(-4)} (saved)`;
}

export function IntegrationsPage() {
  const [stored, setStored] = useState<ApiKeysValue>({});
  const [openaiInput, setOpenaiInput] = useState("");
  const [givebutterInput, setGivebutterInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await api("/api/admin/settings?key=api_keys");
      if (!res.ok) {
        setErr(await readError(res));
        setLoading(false);
        return;
      }
      const data = (await res.json()) as { value?: unknown };
      setStored(normalizeApiKeys(data.value));
      setLoading(false);
    })();
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    setMsg(null);

    const merged: ApiKeysValue = {
      openai_api_key: stored.openai_api_key || "",
      givebutter_api_key: stored.givebutter_api_key || "",
    };
    if (openaiInput.trim()) merged.openai_api_key = openaiInput.trim();
    if (givebutterInput.trim()) merged.givebutter_api_key = givebutterInput.trim();

    const putRes = await api("/api/admin/settings", {
      method: "PUT",
      body: JSON.stringify([{ key: "api_keys", value: merged }]),
    });
    if (!putRes.ok) {
      setErr(await readError(putRes));
      setSaving(false);
      return;
    }

    setStored(merged);
    setOpenaiInput("");
    setGivebutterInput("");
    setMsg("API keys saved. They are stored in your site database and used by the live site (newsletter, AI tools).");
    setSaving(false);
  }

  async function clearOpenAI() {
    setSaving(true);
    setErr(null);
    setMsg(null);
    const merged: ApiKeysValue = {
      openai_api_key: "",
      givebutter_api_key: stored.givebutter_api_key || "",
    };
    const putRes = await api("/api/admin/settings", {
      method: "PUT",
      body: JSON.stringify([{ key: "api_keys", value: merged }]),
    });
    if (!putRes.ok) {
      setErr(await readError(putRes));
      setSaving(false);
      return;
    }
    setStored(merged);
    setMsg("OpenAI key removed from the database.");
    setSaving(false);
  }

  async function clearGivebutter() {
    setSaving(true);
    setErr(null);
    setMsg(null);
    const merged: ApiKeysValue = {
      openai_api_key: stored.openai_api_key || "",
      givebutter_api_key: "",
    };
    const putRes = await api("/api/admin/settings", {
      method: "PUT",
      body: JSON.stringify([{ key: "api_keys", value: merged }]),
    });
    if (!putRes.ok) {
      setErr(await readError(putRes));
      setSaving(false);
      return;
    }
    setStored(merged);
    setMsg("Givebutter key removed from the database.");
    setSaving(false);
  }

  if (loading) {
    return (
      <p className="text-sm text-[oklch(45%_0.03_260)]">Loading integrations…</p>
    );
  }

  return (
    <div>
      <header className="mb-10 border-b border-[oklch(88%_0.02_250)] pb-8">
        <h2 className="font-serif text-3xl font-semibold tracking-tight text-[oklch(22%_0.035_260)]">
          Integrations &amp; API keys
        </h2>
        <p className="mt-2 max-w-2xl text-[oklch(42%_0.03_260)]">
          Connect third-party services without touching code. Keys are saved to your secure database and are only visible
          to signed-in admins on this page.{" "}
          <span className="font-medium text-[oklch(32%_0.03_260)]">
            They are never shown on the public website.
          </span>
        </p>
        <p className="mt-3 max-w-2xl text-sm text-[oklch(45%_0.03_260)]">
          If your team also sets keys on the hosting dashboard (Vercel), those values take priority—use this page when you
          prefer to manage everything here.
        </p>
      </header>

      {err && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {err}
        </div>
      )}
      {msg && (
        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {msg}
        </div>
      )}

      <form onSubmit={save} className="max-w-2xl space-y-12">
        <section className="rounded-2xl border border-[oklch(88%_0.02_250)] bg-white p-6 shadow-sm">
          <h3 className="font-serif text-xl font-semibold tracking-tight text-[oklch(22%_0.035_260)]">Givebutter</h3>
          <p className="mt-2 text-sm text-[oklch(42%_0.03_260)]">
            Used when visitors join the email list from the popup. Create a key under{" "}
            <span className="font-medium">Givebutter → Settings → Integrations → API Keys</span>.
          </p>
          <p className="mt-1 text-xs text-[oklch(48%_0.03_260)]">
            Status:{" "}
            {hintForKey(stored.givebutter_api_key) ? (
              <span className="font-mono text-[oklch(35%_0.03_260)]">{hintForKey(stored.givebutter_api_key)}</span>
            ) : (
              <span>Not saved here yet</span>
            )}
          </p>
          <label className="mt-4 block text-sm font-medium text-[oklch(28%_0.03_260)]">API key</label>
          <input
            type="password"
            name="givebutter_api_key"
            autoComplete="off"
            value={givebutterInput}
            onChange={(e) => setGivebutterInput(e.target.value)}
            placeholder="Paste a new key to add or replace"
            className="mt-1.5 w-full rounded-xl border border-[oklch(88%_0.02_250)] bg-[oklch(99%_0.01_250)] px-3 py-2.5 font-mono text-sm"
          />
          {stored.givebutter_api_key ? (
            <button
              type="button"
              disabled={saving}
              onClick={clearGivebutter}
              className="mt-3 text-sm font-medium text-red-700 underline decoration-red-300 hover:text-red-900 disabled:opacity-50"
            >
              Remove Givebutter key from database
            </button>
          ) : null}
        </section>

        <section className="rounded-2xl border border-[oklch(88%_0.02_250)] bg-white p-6 shadow-sm">
          <h3 className="font-serif text-xl font-semibold tracking-tight text-[oklch(22%_0.035_260)]">OpenAI</h3>
          <p className="mt-2 text-sm text-[oklch(42%_0.03_260)]">
            Powers AI helpers in the blog editor and SEO tools. Create a key in the{" "}
            <span className="font-medium">OpenAI platform</span> under API keys.
          </p>
          <p className="mt-1 text-xs text-[oklch(48%_0.03_260)]">
            Status:{" "}
            {hintForKey(stored.openai_api_key) ? (
              <span className="font-mono text-[oklch(35%_0.03_260)]">{hintForKey(stored.openai_api_key)}</span>
            ) : (
              <span>Not saved here yet</span>
            )}
          </p>
          <label className="mt-4 block text-sm font-medium text-[oklch(28%_0.03_260)]">API key</label>
          <input
            type="password"
            name="openai_api_key"
            autoComplete="off"
            value={openaiInput}
            onChange={(e) => setOpenaiInput(e.target.value)}
            placeholder="Paste a new key to add or replace"
            className="mt-1.5 w-full rounded-xl border border-[oklch(88%_0.02_250)] bg-[oklch(99%_0.01_250)] px-3 py-2.5 font-mono text-sm"
          />
          {stored.openai_api_key ? (
            <button
              type="button"
              disabled={saving}
              onClick={clearOpenAI}
              className="mt-3 text-sm font-medium text-red-700 underline decoration-red-300 hover:text-red-900 disabled:opacity-50"
            >
              Remove OpenAI key from database
            </button>
          ) : null}
        </section>

        <button
          type="submit"
          disabled={saving || (!openaiInput.trim() && !givebutterInput.trim())}
          className="rounded-xl bg-[oklch(48%_0.12_252)] px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save keys"}
        </button>
        <p className="text-xs text-[oklch(48%_0.03_260)]">
          Leave fields empty to keep existing keys. Fill in only what you want to add or replace.
        </p>
      </form>
    </div>
  );
}
