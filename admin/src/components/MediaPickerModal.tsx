import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { api, readError } from "@/lib/api";
import type { MediaLibraryItem } from "@/lib/types";

type Props = {
  open: boolean;
  title?: string;
  onClose: () => void;
  /** Called when user confirms (button or double-click). */
  onSelect: (item: MediaLibraryItem) => void;
};

export function MediaPickerModal({ open, title = "Media library", onClose, onSelect }: Props) {
  const [items, setItems] = useState<MediaLibraryItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<MediaLibraryItem | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    const res = await api("/api/media");
    setLoading(false);
    if (!res.ok) {
      setErr(await readError(res));
      return;
    }
    setItems((await res.json()) as MediaLibraryItem[]);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(null);
    void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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
    const raw = (await res.json()) as Partial<MediaLibraryItem>;
    await load();
    setSelected({
      filename: String(raw.filename ?? ""),
      path: String(raw.path ?? ""),
      url: String(raw.url ?? ""),
      alt_text: String(raw.alt_text ?? ""),
      size_bytes: raw.size_bytes ?? null,
    });
    setQuery("");
  }

  const filtered = query.trim()
    ? items.filter((m) => m.filename.toLowerCase().includes(query.trim().toLowerCase()))
    : items;

  function confirm() {
    if (!selected) return;
    onSelect(selected);
    onClose();
  }

  function pick(item: MediaLibraryItem) {
    onSelect(item);
    onClose();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[oklch(22%_0.04_260)]/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="media-picker-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[min(90vh,720px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[oklch(88%_0.02_250)] bg-white shadow-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[oklch(90%_0.02_250)] px-5 py-4">
          <div>
            <h2 id="media-picker-title" className="font-serif text-lg font-semibold text-[oklch(22%_0.035_260)]">
              {title}
            </h2>
            <p className="mt-1 text-xs text-[oklch(45%_0.03_260)]">
              Choose an image or upload a new one. Double-click to insert immediately.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-[oklch(45%_0.03_260)] hover:bg-[oklch(96%_0.02_250)]"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="shrink-0 border-b border-[oklch(92%_0.02_250)] px-5 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by filename…"
              className="min-w-0 flex-1 rounded-xl border border-[oklch(88%_0.02_250)] px-3 py-2 text-sm"
            />
            <label className="inline-flex cursor-pointer shrink-0 items-center justify-center rounded-xl bg-[oklch(48%_0.12_252)] px-4 py-2 text-sm font-semibold text-white hover:bg-[oklch(42%_0.13_252)] disabled:opacity-50">
              {uploading ? "Uploading…" : "Upload new"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                disabled={uploading}
                onChange={onFile}
              />
            </label>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {err && (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{err}</p>
          )}
          {loading ? (
            <p className="py-12 text-center text-sm text-[oklch(45%_0.03_260)]">Loading images…</p>
          ) : filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-[oklch(45%_0.03_260)]">
              {items.length === 0 ? "No images yet. Upload one to get started." : "No matches. Try another search."}
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {filtered.map((m) => {
                const isSel = selected?.filename === m.filename;
                return (
                  <li key={m.filename}>
                    <button
                      type="button"
                      onClick={() => setSelected(m)}
                      onDoubleClick={() => pick(m)}
                      className={[
                        "w-full overflow-hidden rounded-xl border-2 text-left transition-colors",
                        isSel
                          ? "border-[oklch(48%_0.12_252)] ring-2 ring-[oklch(48%_0.12_252)]/30"
                          : "border-[oklch(90%_0.02_250)] hover:border-[oklch(80%_0.03_260)]",
                      ].join(" ")}
                    >
                      <div className="aspect-[4/3] bg-[oklch(96%_0.02_250)]">
                        <img src={m.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                      </div>
                      <p className="truncate px-2 py-1.5 font-mono text-[0.65rem] text-[oklch(38%_0.03_260)]">
                        {m.filename}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[oklch(92%_0.02_250)] bg-[oklch(99%_0.01_250)] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm font-medium text-[oklch(38%_0.03_260)] hover:bg-[oklch(96%_0.02_250)]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selected}
            onClick={confirm}
            className="rounded-xl bg-[oklch(48%_0.12_252)] px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            Use selected image
          </button>
        </div>
      </div>
    </div>
  );
}
