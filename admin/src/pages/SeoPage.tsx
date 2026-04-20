import { useState } from "react";
import { api, readError } from "@/lib/api";

export function SeoPage() {
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ title: string; body: string; mime: string } | null>(null);
  const [analyze, setAnalyze] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  async function run(action: string) {
    setErr(null);
    setLoading(action);
    const res = await api("/api/admin/seo-tools", {
      method: "POST",
      body: JSON.stringify({ action }),
    });
    setLoading(null);
    if (!res.ok) {
      setErr(await readError(res));
      return;
    }
    const data = await res.json();
    if (action === "analyze") {
      setAnalyze(JSON.stringify(data, null, 2));
      setPreview(null);
      return;
    }
    setPreview({
      title: data.filename || "file",
      body: data.content || "",
      mime: data.contentType || "text/plain",
    });
    setAnalyze(null);
  }

  return (
    <div>
      <h2 className="font-serif text-2xl font-semibold tracking-tight">SEO tools</h2>
      <p className="mt-2 max-w-2xl text-sm text-[oklch(42%_0.03_260)]">
        Generate previews for sitemap, robots, RSS, and LLM discovery text. Site-wide AI analysis uses your OpenAI key
        on the server. Deploy hooks apply after build.
      </p>
      {err && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{err}</p>
      )}
      <div className="mt-6 flex flex-wrap gap-2">
        {(["sitemap", "robots", "rss", "llms"] as const).map((a) => (
          <button
            key={a}
            type="button"
            disabled={!!loading}
            onClick={() => void run(a)}
            className="rounded-lg border border-[oklch(88%_0.02_250)] bg-white px-4 py-2 text-sm font-semibold hover:bg-[oklch(98%_0.02_250)] disabled:opacity-50"
          >
            {loading === a ? "…" : `Preview ${a}`}
          </button>
        ))}
        <button
          type="button"
          disabled={!!loading}
          onClick={() => void run("analyze")}
          className="rounded-lg bg-[oklch(48%_0.12_252)] px-4 py-2 text-sm font-semibold text-white hover:bg-[oklch(42%_0.13_252)] disabled:opacity-50"
        >
          {loading === "analyze" ? "…" : "AI site SEO analysis"}
        </button>
      </div>
      {preview && (
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-[oklch(35%_0.03_260)]">{preview.title}</h3>
          <pre className="mt-2 max-h-[480px] overflow-auto rounded-xl border border-[oklch(88%_0.02_250)] bg-[oklch(16%_0.04_260)] p-4 text-xs text-[oklch(96%_0.02_250)]">
            {preview.body}
          </pre>
        </div>
      )}
      {analyze && (
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-[oklch(35%_0.03_260)]">AI analysis</h3>
          <pre className="mt-2 max-h-[480px] overflow-auto rounded-xl border border-[oklch(88%_0.02_250)] bg-[oklch(16%_0.04_260)] p-4 text-xs text-[oklch(96%_0.02_250)]">
            {analyze}
          </pre>
        </div>
      )}
    </div>
  );
}
