import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { api, readError } from "@/lib/api";
import type { MediaLibraryItem } from "@/lib/types";

export function MediaPage() {
  const [items, setItems] = useState<MediaLibraryItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    const res = await api("/api/media");
    if (!res.ok) {
      setErr(await readError(res));
      setLoading(false);
      return;
    }
    setItems((await res.json()) as MediaLibraryItem[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onFile(ev: ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0];
    ev.target.value = "";
    if (!f) return;
    setUploading(true);
    setErr(null);
    const b64 = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const dataUrl = String(r.result || "");
        const i = dataUrl.indexOf(",");
        resolve(i >= 0 ? dataUrl.slice(i + 1) : "");
      };
      r.onerror = () => reject(new Error("read failed"));
      r.readAsDataURL(f);
    });
    const res = await api("/api/media", {
      method: "POST",
      body: JSON.stringify({ filename: f.name, content_base64: b64 }),
    });
    setUploading(false);
    if (!res.ok) {
      setErr(await readError(res));
      return;
    }
    await load();
  }

  async function saveAlt(filename: string, alt: string) {
    const res = await api("/api/media/" + encodeURIComponent(filename), {
      method: "PUT",
      body: JSON.stringify({ alt_text: alt }),
    });
    if (!res.ok) setErr(await readError(res));
    else await load();
  }

  async function removeFile(filename: string) {
    if (!window.confirm("Remove this image from the media library?")) return;
    setErr(null);
    const res = await api("/api/media/" + encodeURIComponent(filename), { method: "DELETE" });
    if (!res.ok) setErr(await readError(res));
    else await load();
  }

  return (
    <div>
      <h2 className="font-serif text-2xl font-semibold tracking-tight">Media library</h2>
      <p className="mt-1 text-sm text-[oklch(42%_0.03_260)]">
        Files live in your Supabase Storage bucket (default{" "}
        <code className="rounded bg-[oklch(96%_0.02_250)] px-1">cms-uploads</code>, public read). URLs are stable CDN links
        for covers and rich text. Alt text improves SEO and accessibility.
      </p>
      <div className="mt-6">
        <label className="inline-flex cursor-pointer rounded-xl bg-[oklch(48%_0.12_252)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[oklch(42%_0.13_252)]">
          {uploading ? "Uploading…" : "Upload image"}
          <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={onFile} />
        </label>
      </div>
      {err && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{err}</p>
      )}
      {loading ? (
        <p className="mt-6 text-sm">Loading…</p>
      ) : (
        <ul className="mt-6 divide-y divide-[oklch(90%_0.02_250)] rounded-xl border border-[oklch(88%_0.02_250)] bg-white">
          {items.map((m) => (
            <li key={m.filename} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
              <img
                src={m.url}
                alt=""
                className="h-24 w-36 shrink-0 rounded-lg border border-[oklch(90%_0.02_250)] object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs text-[oklch(35%_0.03_260)]">{m.path}</p>
                <label className="mt-2 block text-sm">
                  <span className="text-[oklch(40%_0.03_260)]">Alt text</span>
                  <input
                    defaultValue={m.alt_text}
                    key={m.alt_text}
                    className="mt-1 w-full rounded border border-[oklch(88%_0.02_250)] px-2 py-1 text-sm"
                    onBlur={(e) => {
                      if (e.target.value !== m.alt_text) void saveAlt(m.filename, e.target.value);
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="mt-3 text-sm font-medium text-red-700 hover:underline"
                  onClick={() => void removeFile(m.filename)}
                >
                  Delete image
                </button>
              </div>
            </li>
          ))}
          {items.length === 0 && (
            <li className="p-8 text-center text-sm text-[oklch(45%_0.03_260)]">No images yet.</li>
          )}
        </ul>
      )}
    </div>
  );
}
