import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, apiUrl, readError } from "@/lib/api";
import type { PostRow } from "@/lib/types";

type PostsSource = "unknown" | "supabase" | "json";

export function BlogListPage() {
  const [rows, setRows] = useState<PostRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [postsSource, setPostsSource] = useState<PostsSource>("unknown");
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState("Untitled field report");
  const [draftBusy, setDraftBusy] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setErr(null);
    const cfgRes = await fetch(apiUrl("/api/supabase-public-config"));
    if (cfgRes.ok) {
      const cfg = (await cfgRes.json()) as { blogPostsSource?: string };
      setPostsSource(cfg.blogPostsSource === "supabase" ? "supabase" : cfg.blogPostsSource === "json" ? "json" : "unknown");
    }
    const res = await api("/api/posts");
    if (!res.ok) {
      setErr(await readError(res));
      setLoading(false);
      return;
    }
    const data = (await res.json()) as PostRow[];
    setRows(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submitNewDraft(e: FormEvent) {
    e.preventDefault();
    const title = draftTitle.trim();
    if (!title) return;
    setDraftBusy(true);
    setErr(null);
    const res = await api("/api/posts", { method: "POST", body: JSON.stringify({ title }) });
    setDraftBusy(false);
    if (!res.ok) {
      setErr(await readError(res));
      return;
    }
    const p = (await res.json()) as PostRow;
    setDraftOpen(false);
    setDraftTitle("Untitled field report");
    navigate(`/blog/${encodeURIComponent(p.slug)}`);
  }

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-serif text-2xl font-semibold tracking-tight">Blog posts</h2>
          <p className="mt-1 text-sm text-[oklch(42%_0.03_260)]">
            Drafts and published posts. Deleting a post soft-removes it from the site and sitemaps.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDraftOpen(true)}
          className="rounded-xl bg-[oklch(48%_0.12_252)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[oklch(42%_0.13_252)]"
        >
          + New draft
        </button>
      </div>

      {draftOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[oklch(22%_0.04_260)]/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-draft-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDraftOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-[oklch(88%_0.02_250)] bg-white p-6 shadow-xl">
            <h3 id="new-draft-title" className="font-serif text-lg font-semibold text-[oklch(22%_0.035_260)]">
              New draft
            </h3>
            <p className="mt-1 text-sm text-[oklch(42%_0.03_260)]">Give your post a working title. You can change it later.</p>
            <form onSubmit={(e) => void submitNewDraft(e)} className="mt-5 space-y-4">
              <label className="block text-sm font-medium text-[oklch(28%_0.03_260)]">
                Title
                <input
                  type="text"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  autoFocus
                  className="mt-1.5 w-full rounded-xl border border-[oklch(88%_0.02_250)] px-3 py-2.5 text-sm"
                />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDraftOpen(false)}
                  className="rounded-xl px-4 py-2 text-sm font-medium text-[oklch(35%_0.03_260)] hover:bg-[oklch(96%_0.02_250)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={draftBusy || !draftTitle.trim()}
                  className="rounded-xl bg-[oklch(48%_0.12_252)] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {draftBusy ? "Creating…" : "Create draft"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {err && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{err}</p>
      )}
      {loading ? (
        <p className="text-sm text-[oklch(45%_0.03_260)]">Loading…</p>
      ) : (
        <ul className="divide-y divide-[oklch(90%_0.02_250)] rounded-xl border border-[oklch(88%_0.02_250)] bg-white">
          {rows.map((p) => (
            <li key={p.slug}>
              <Link
                to={`/blog/${encodeURIComponent(p.slug)}`}
                className="flex flex-col gap-1 px-4 py-4 transition hover:bg-[oklch(98%_0.015_250)] sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="font-medium text-[oklch(22%_0.035_260)]">{p.title}</span>
                <span className="font-mono text-xs text-[oklch(45%_0.03_260)]">
                  {p.date} · {p.status}
                </span>
              </Link>
            </li>
          ))}
          {rows.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-[oklch(45%_0.03_260)]">
              <p>No posts yet.</p>
              {!err && postsSource === "supabase" && (
                <p className="mx-auto mt-3 max-w-md text-left text-xs leading-relaxed text-[oklch(40%_0.03_260)]">
                  This server loads the blog list from the Supabase <code className="rounded bg-[oklch(96%_0.02_250)] px-1">blog_posts</code>{" "}
                  table (because <code className="rounded bg-[oklch(96%_0.02_250)] px-1">SUPABASE_SERVICE_ROLE_KEY</code> is set).
                  If your articles only exist as JSON under <code className="rounded bg-[oklch(96%_0.02_250)] px-1">pipeline/data/posts/</code>{" "}
                  or in production, import them into this project&apos;s Supabase, or run the admin against an env that uses the same
                  database. To use local JSON files only for posts, remove the service role key from this machine&apos;s env and
                  restart the API.
                </p>
              )}
              {!err && postsSource === "json" && (
                <p className="mx-auto mt-3 max-w-md text-xs text-[oklch(40%_0.03_260)]">
                  Posts are read from <code className="rounded bg-[oklch(96%_0.02_250)] px-1">pipeline/data/posts/*.json</code>. Add JSON
                  files there or set <code className="rounded bg-[oklch(96%_0.02_250)] px-1">SUPABASE_SERVICE_ROLE_KEY</code> to use
                  Supabase.
                </p>
              )}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
