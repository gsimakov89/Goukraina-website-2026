import { useEffect, useState, type FormEvent } from "react";
import { MediaPickerModal } from "@/components/MediaPickerModal";
import { api, readError } from "@/lib/api";
import type { AuthorProfile } from "@/lib/types";

export function AuthorPage() {
  const [p, setP] = useState<AuthorProfile>({});
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await api("/api/admin/author");
      if (!res.ok) {
        setErr(await readError(res));
        setLoading(false);
        return;
      }
      setP((await res.json()) as AuthorProfile);
      setLoading(false);
    })();
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    const res = await api("/api/admin/author", { method: "PUT", body: JSON.stringify(p) });
    setSaving(false);
    if (!res.ok) setErr(await readError(res));
  }

  if (loading) return <p className="text-sm">Loading…</p>;

  return (
    <div>
      <h2 className="font-serif text-2xl font-semibold tracking-tight">Author card</h2>
      <p className="mt-1 text-sm text-[oklch(42%_0.03_260)]">
        Shown with blog posts when the static templates read <code className="rounded bg-[oklch(96%_0.02_250)] px-1">author_profiles</code>.
      </p>
      {err && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{err}</p>
      )}
      <form onSubmit={save} className="mt-6 max-w-xl space-y-4">
        <div className="rounded-xl border border-[oklch(88%_0.02_250)] bg-[oklch(99%_0.01_250)] p-4">
          <p className="text-sm font-medium text-[oklch(28%_0.03_260)]">Profile photo</p>
          <p className="mt-1 text-xs text-[oklch(45%_0.03_260)]">
            Pick from your media library or paste a URL. Shown next to your name on blog posts.
          </p>
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[oklch(88%_0.02_250)] bg-[oklch(96%_0.02_250)]">
              {p.avatar_url ? (
                <img src={p.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-xs text-[oklch(50%_0.03_260)]">No photo</span>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <button
                type="button"
                onClick={() => setMediaOpen(true)}
                className="rounded-xl bg-[oklch(48%_0.12_252)] px-4 py-2 text-sm font-semibold text-white hover:bg-[oklch(42%_0.13_252)]"
              >
                Choose from media library
              </button>
              <label className="block text-sm text-[oklch(40%_0.03_260)]">
                Or image URL
                <input
                  value={p.avatar_url || ""}
                  onChange={(e) => setP({ ...p, avatar_url: e.target.value })}
                  placeholder="https://…"
                  className="mt-1 w-full rounded-lg border border-[oklch(88%_0.02_250)] bg-white px-3 py-2 font-mono text-xs"
                />
              </label>
            </div>
          </div>
        </div>

        {(
          [
            ["name", "Name"],
            ["role", "Role / title"],
            ["bio", "Bio"],
            ["initials", "Initials"],
            ["email", "Email"],
            ["twitter", "Twitter / X"],
            ["linkedin", "LinkedIn"],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="block text-sm">
            {label}
            {k === "bio" ? (
              <textarea
                value={(p[k] as string) || ""}
                onChange={(e) => setP({ ...p, [k]: e.target.value })}
                rows={4}
                className="mt-1 w-full rounded-lg border border-[oklch(88%_0.02_250)] px-3 py-2"
              />
            ) : (
              <input
                value={(p[k] as string) || ""}
                onChange={(e) => setP({ ...p, [k]: e.target.value })}
                className="mt-1 w-full rounded-lg border border-[oklch(88%_0.02_250)] px-3 py-2"
              />
            )}
          </label>
        ))}
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-[oklch(48%_0.12_252)] px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save author"}
        </button>
      </form>

      <MediaPickerModal
        open={mediaOpen}
        title="Choose profile photo"
        onClose={() => setMediaOpen(false)}
        onSelect={(item) => setP((prev) => ({ ...prev, avatar_url: item.url }))}
      />
    </div>
  );
}
