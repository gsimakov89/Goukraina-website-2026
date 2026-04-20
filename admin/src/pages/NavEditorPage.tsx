import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { api, readError } from "@/lib/api";
import type { NavItem } from "@/lib/types";

function rowSortId(row: NavItem, index: number): string {
  return row.id || row.href || `row-${index}`;
}

function SortableRow({
  row,
  index,
  sortId,
  update,
}: {
  row: NavItem;
  index: number;
  sortId: string;
  update: (i: number, patch: Partial<NavItem>) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sortId });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="grid gap-3 rounded-xl border border-[oklch(88%_0.02_250)] bg-white p-4 sm:grid-cols-[auto_1fr_1fr_auto_auto] sm:items-end"
    >
      <button
        type="button"
        className="flex h-10 w-10 cursor-grab touch-none items-center justify-center rounded-lg border border-[oklch(88%_0.02_250)] bg-[oklch(98%_0.02_250)] text-[oklch(35%_0.03_260)] active:cursor-grabbing"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M8 6a2 2 0 11-4 0 2 2 0 014 0zm0 6a2 2 0 11-4 0 2 2 0 014 0zm0 6a2 2 0 11-4 0 2 2 0 014 0zm10-12a2 2 0 11-4 0 2 2 0 014 0zm0 6a2 2 0 11-4 0 2 2 0 014 0zm0 6a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      </button>
      <label className="text-sm">
        Label
        <input
          value={row.label}
          onChange={(e) => update(index, { label: e.target.value })}
          className="mt-1 w-full rounded border border-[oklch(88%_0.02_250)] px-2 py-1"
        />
      </label>
      <label className="text-sm">
        URL
        <input
          value={row.href}
          onChange={(e) => update(index, { href: e.target.value })}
          className="mt-1 w-full rounded border border-[oklch(88%_0.02_250)] px-2 py-1"
        />
      </label>
      <label className="text-sm">
        Sort
        <input
          type="number"
          value={row.sort_order}
          onChange={(e) => update(index, { sort_order: Number(e.target.value) })}
          className="mt-1 w-full rounded border border-[oklch(88%_0.02_250)] px-2 py-1"
        />
      </label>
      <label className="flex items-end gap-2 text-sm">
        <input
          type="checkbox"
          checked={row.is_active}
          onChange={(e) => update(index, { is_active: e.target.checked })}
        />
        Active
      </label>
    </div>
  );
}

export function NavEditorPage() {
  const [items, setItems] = useState<NavItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [rebuildNote, setRebuildNote] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    (async () => {
      const res = await api("/api/admin/nav");
      if (!res.ok) {
        setErr(await readError(res));
        setLoading(false);
        return;
      }
      setItems((await res.json()) as NavItem[]);
      setLoading(false);
    })();
  }, []);

  function update(i: number, patch: Partial<NavItem>) {
    setItems((prev) => prev.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const ids = prev.map((it, i) => rowSortId(it, i));
      const oldIndex = ids.findIndex((id) => id === active.id);
      const newIndex = ids.findIndex((id) => id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      const next = arrayMove(prev, oldIndex, newIndex);
      return next.map((row, i) => ({ ...row, sort_order: i * 10 }));
    });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    setMsg(null);
    setRebuildNote(null);
    const res = await api("/api/admin/nav", {
      method: "PUT",
      body: JSON.stringify(items),
    });
    if (!res.ok) {
      setErr(await readError(res));
      setSaving(false);
      return;
    }
    setMsg("Navigation saved.");
    const rb = await api("/api/rebuild-site", { method: "POST" });
    const rebuildJson = (await rb.json().catch(() => ({}))) as { message?: string; skipped?: boolean };
    if (rb.ok && rebuildJson.message) {
      setRebuildNote(rebuildJson.message);
    } else if (!rb.ok) {
      setRebuildNote("Rebuild could not be started automatically. Save succeeded—trigger a deploy or rebuild from your host if the menu doesn’t update.");
    }
    setSaving(false);
  }

  if (loading) return <p className="text-sm">Loading…</p>;

  const sortableIds = items.map((it, i) => rowSortId(it, i));

  return (
    <div>
      <h2 className="font-serif text-2xl font-semibold tracking-tight">Navigation</h2>
      <p className="mt-1 text-sm text-[oklch(42%_0.03_260)]">
        Drag to reorder links. Saving writes to the database and starts a rebuild so the live menu updates (like Site
        settings). You need at least two active links for the desktop bar to use this list.
      </p>
      {err && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{err}</p>
      )}
      {msg && (
        <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{msg}</p>
      )}
      {rebuildNote && (
        <p className="mt-3 rounded-lg border border-[oklch(88%_0.02_250)] bg-[oklch(98%_0.01_250)] px-3 py-2 text-sm text-[oklch(32%_0.03_260)]">
          {rebuildNote}
        </p>
      )}
      <form onSubmit={save} className="mt-6 space-y-4">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            {items.map((row, i) => (
              <SortableRow key={sortableIds[i]} sortId={sortableIds[i]} row={row} index={i} update={update} />
            ))}
          </SortableContext>
        </DndContext>
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-[oklch(48%_0.12_252)] px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save navigation & update site"}
        </button>
      </form>
    </div>
  );
}
