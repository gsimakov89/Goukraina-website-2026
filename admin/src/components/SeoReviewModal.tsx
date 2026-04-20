import { useEffect, useMemo, useState } from "react";

export type SeoFieldRow = {
  field: string;
  label?: string;
  current?: string;
  suggested?: string;
  advice?: string;
  severity?: string;
};

export type SeoReviewData = {
  score?: number;
  grade?: string;
  summary?: string;
  fields?: SeoFieldRow[];
};

type Props = {
  open: boolean;
  data: SeoReviewData | null;
  onClose: () => void;
  /** Only includes fields the user chose to apply (all or selected). */
  onApply: (patch: Record<string, string>) => void;
};

const APPLYABLE = new Set([
  "title",
  "slug",
  "meta_title",
  "meta_description",
  "excerpt",
  "og_image",
  "og_image_alt",
  "tags",
]);

export function SeoReviewModal({ open, data, onClose, onApply }: Props) {
  const rows = useMemo(() => data?.fields ?? [], [data?.fields]);
  const actionable = useMemo(
    () =>
      rows.filter((r) => {
        if (!APPLYABLE.has(r.field)) return false;
        const s = (r.suggested ?? "").trim();
        const c = (r.current ?? "").trim();
        return s.length > 0 && s !== c;
      }),
    [rows],
  );

  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!open || !data?.fields) return;
    const act = data.fields.filter((r) => {
      if (!APPLYABLE.has(r.field)) return false;
      const s = (r.suggested ?? "").trim();
      const c = (r.current ?? "").trim();
      return s.length > 0 && s !== c;
    });
    setSelected(new Set(act.map((r) => r.field)));
  }, [open, data]);

  if (!open || !data) return null;

  function toggle(field: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(field)) n.delete(field);
      else n.add(field);
      return n;
    });
  }

  function buildPatch(mode: "all" | "selected"): Record<string, string> {
    const patch: Record<string, string> = {};
    const source = mode === "all" ? actionable : actionable.filter((r) => selected.has(r.field));
    for (const r of source) {
      const s = (r.suggested ?? "").trim();
      if (s) patch[r.field] = s;
    }
    return patch;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="border-b border-[oklch(88%_0.02_250)] px-6 py-4">
          <h3 className="text-lg font-semibold text-[oklch(22%_0.035_260)]">SEO review</h3>
          <p className="mt-1 text-sm text-[oklch(42%_0.03_260)]">
            Score: <strong>{data.score ?? "—"}</strong>
            {data.grade ? ` (${data.grade})` : ""}
            {data.summary ? ` — ${data.summary}` : ""}
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <ul className="space-y-4">
            {rows.map((r) => {
              const canApply = APPLYABLE.has(r.field);
              const hasSuggestion =
                canApply && (r.suggested ?? "").trim() && (r.suggested ?? "").trim() !== (r.current ?? "").trim();
              return (
                <li
                  key={r.field}
                  className="rounded-xl border border-[oklch(90%_0.02_250)] bg-[oklch(99%_0.005_250)] p-4 text-sm"
                >
                  <div className="flex flex-wrap items-start gap-3">
                    {hasSuggestion && (
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={selected.has(r.field)}
                        onChange={() => toggle(r.field)}
                        aria-label={`Apply ${r.label || r.field}`}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[oklch(28%_0.04_260)]">{r.label || r.field}</p>
                      {r.advice && <p className="mt-1 text-[oklch(40%_0.03_260)]">{r.advice}</p>}
                      <div className="mt-2 grid gap-2 md:grid-cols-2">
                        <div>
                          <p className="text-xs font-medium uppercase text-[oklch(45%_0.03_260)]">Current</p>
                          <pre className="mt-1 whitespace-pre-wrap break-words rounded bg-[oklch(16%_0.04_260)] p-2 text-xs text-[oklch(96%_0.02_250)]">
                            {(r.current ?? "").slice(0, 4000) || "—"}
                          </pre>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase text-[oklch(45%_0.03_260)]">Suggested</p>
                          <pre className="mt-1 whitespace-pre-wrap break-words rounded border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-950">
                            {(r.suggested ?? "").slice(0, 4000) || "—"}
                          </pre>
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[oklch(88%_0.02_250)] px-6 py-4">
          <button
            type="button"
            className="rounded-lg px-4 py-2 text-sm font-medium text-[oklch(35%_0.03_260)] hover:bg-[oklch(96%_0.02_250)]"
            onClick={onClose}
          >
            Close
          </button>
          <button
            type="button"
            className="rounded-lg border border-[oklch(88%_0.02_250)] bg-white px-4 py-2 text-sm font-semibold hover:bg-[oklch(98%_0.02_250)]"
            disabled={!actionable.length}
            onClick={() => {
              const patch = buildPatch("selected");
              onApply(patch);
              onClose();
            }}
          >
            Apply selected
          </button>
          <button
            type="button"
            className="rounded-lg bg-[oklch(48%_0.12_252)] px-4 py-2 text-sm font-semibold text-white hover:bg-[oklch(42%_0.13_252)]"
            disabled={!actionable.length}
            onClick={() => {
              const patch = buildPatch("all");
              onApply(patch);
              onClose();
            }}
          >
            Accept all suggestions
          </button>
        </div>
      </div>
    </div>
  );
}
