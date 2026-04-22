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
import { useEffect, useState, type CSSProperties, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { api, readError } from "@/lib/api";
import type { NavItem } from "@/lib/types";

type NavItemRow = NavItem & { _clientId: string };

const MOBILE_ICON_OPTIONS: { value: string; label: string }[] = [
  { value: "link", label: "Link (default)" },
  { value: "home", label: "Home" },
  { value: "about", label: "Info / About" },
  { value: "reh2o", label: "Water drop" },
  { value: "power", label: "Lightning / power" },
  { value: "advocacy", label: "Shield" },
  { value: "dream", label: "Moon" },
  { value: "summit", label: "Calendar" },
  { value: "blog", label: "Document / blog" },
  { value: "contact", label: "Mail" },
  { value: "impact", label: "Activity / impact" },
  { value: "donate", label: "Heart / donate" },
  { value: "heart", label: "Heart" },
  { value: "globe", label: "Globe" },
  { value: "users", label: "People" },
  { value: "star", label: "Star" },
  { value: "gift", label: "Gift" },
];

function newClientId(): string {
  return `nav-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function rowSortId(row: NavItemRow): string {
  return row.id || row._clientId;
}

function normalizeLoaded(items: NavItem[]): NavItemRow[] {
  return items.map((row) => ({
    ...row,
    nav_group: row.nav_group || "desktop",
    icon_key: row.icon_key || (row.nav_group === "mobile" ? "link" : ""),
    target: row.target || "",
    _clientId: row.id || newClientId(),
  }));
}

function stripForApi(rows: NavItemRow[]): NavItem[] {
  return rows.map(({ _clientId: _c, ...rest }) => {
    const nav_group = rest.nav_group || "desktop";
    const item: NavItem = {
      label: rest.label,
      href: rest.href,
      target: (rest.target || "").trim(),
      sort_order: rest.sort_order,
      parent_id: rest.parent_id ?? null,
      is_active: rest.is_active,
      nav_group,
      icon_key: nav_group === "mobile" ? (rest.icon_key || "link").trim() : "",
    };
    if (rest.id) item.id = rest.id;
    return item;
  });
}

function SortableRow({
  row,
  index,
  sortId,
  update,
  remove,
  showIcon,
}: {
  row: NavItemRow;
  index: number;
  sortId: string;
  update: (i: number, patch: Partial<NavItemRow>) => void;
  remove: (i: number) => void;
  showIcon: boolean;
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
      className="grid gap-3 rounded-xl border border-[oklch(88%_0.02_250)] bg-white p-4 lg:grid-cols-[auto_1fr_1fr_1fr_auto_auto_auto] lg:items-end"
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
        URL or path
        <input
          value={row.href}
          onChange={(e) => update(index, { href: e.target.value })}
          placeholder="about/index.html or https://…"
          className="mt-1 w-full rounded border border-[oklch(88%_0.02_250)] px-2 py-1 font-mono text-xs"
        />
      </label>
      <label className="text-sm">
        Open in new tab
        <select
          value={row.target === "_blank" ? "_blank" : ""}
          onChange={(e) => update(index, { target: e.target.value })}
          className="mt-1 w-full rounded border border-[oklch(88%_0.02_250)] px-2 py-1"
        >
          <option value="">Same tab</option>
          <option value="_blank">New tab</option>
        </select>
      </label>
      {showIcon ? (
        <label className="text-sm lg:col-span-1">
          Mobile icon
          <select
            value={row.icon_key || "link"}
            onChange={(e) => update(index, { icon_key: e.target.value })}
            className="mt-1 w-full rounded border border-[oklch(88%_0.02_250)] px-2 py-1"
          >
            {MOBILE_ICON_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <span className="hidden lg:block" aria-hidden />
      )}
      <label className="text-sm">
        Order
        <input
          type="number"
          value={row.sort_order}
          onChange={(e) => update(index, { sort_order: Number(e.target.value) })}
          className="mt-1 w-full rounded border border-[oklch(88%_0.02_250)] px-2 py-1"
        />
      </label>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={row.is_active}
            onChange={(e) => update(index, { is_active: e.target.checked })}
          />
          Active
        </label>
        <button
          type="button"
          onClick={() => remove(index)}
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-100"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function NavSection({
  title,
  description,
  items,
  setItems,
  showIcon,
  addLabel,
}: {
  title: string;
  description: string;
  items: NavItemRow[];
  setItems: Dispatch<SetStateAction<NavItemRow[]>>;
  showIcon: boolean;
  addLabel: string;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function update(i: number, patch: Partial<NavItemRow>) {
    setItems((prev) => prev.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  }

  function remove(i: number) {
    setItems((prev) => prev.filter((_, j) => j !== i));
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const ids = prev.map((it, idx) => rowSortId(it));
      const oldIndex = ids.findIndex((id) => id === active.id);
      const newIndex = ids.findIndex((id) => id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      const next = arrayMove(prev, oldIndex, newIndex);
      return next.map((row, idx) => ({ ...row, sort_order: idx * 10 }));
    });
  }

  const sortableIds = items.map((it) => rowSortId(it));

  function addRow() {
    setItems((prev) => {
      const nextOrder = prev.length ? Math.max(...prev.map((r) => r.sort_order)) + 10 : 0;
      const base: NavItemRow = {
        label: "New link",
        href: "about/index.html",
        target: "",
        sort_order: nextOrder,
        is_active: true,
        nav_group: showIcon ? "mobile" : "desktop",
        icon_key: showIcon ? "link" : "",
        _clientId: newClientId(),
      };
      return [...prev, base];
    });
  }

  return (
    <section className="space-y-4">
      <div>
        <h3 className="font-serif text-lg font-semibold tracking-tight text-[oklch(22%_0.035_260)]">{title}</h3>
        <p className="mt-1 text-sm text-[oklch(42%_0.03_260)]">{description}</p>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {items.map((row, i) => (
              <SortableRow
                key={sortableIds[i]}
                sortId={sortableIds[i]}
                row={row}
                index={i}
                update={update}
                remove={remove}
                showIcon={showIcon}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <button
        type="button"
        onClick={addRow}
        className="rounded-xl border border-dashed border-[oklch(78%_0.02_250)] bg-[oklch(99%_0.01_250)] px-4 py-2.5 text-sm font-medium text-[oklch(38%_0.03_260)] hover:border-[oklch(48%_0.12_252)] hover:text-[oklch(48%_0.12_252)]"
      >
        {addLabel}
      </button>
    </section>
  );
}

export function NavEditorPage() {
  const [desktopItems, setDesktopItems] = useState<NavItemRow[]>([]);
  const [mobileItems, setMobileItems] = useState<NavItemRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [rebuildNote, setRebuildNote] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await api("/api/admin/nav");
      if (!res.ok) {
        setErr(await readError(res));
        setLoading(false);
        return;
      }
      const all = normalizeLoaded((await res.json()) as NavItem[]);
      setDesktopItems(all.filter((r) => r.nav_group !== "mobile"));
      setMobileItems(all.filter((r) => r.nav_group === "mobile"));
      setLoading(false);
    })();
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    setMsg(null);
    setRebuildNote(null);

    const payload = stripForApi([...desktopItems, ...mobileItems]);
    const res = await api("/api/admin/nav", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      setErr(await readError(res));
      setSaving(false);
      return;
    }
    setMsg("Navigation saved.");
    const reload = await api("/api/admin/nav");
    if (reload.ok) {
      const all = normalizeLoaded((await reload.json()) as NavItem[]);
      setDesktopItems(all.filter((r) => r.nav_group !== "mobile"));
      setMobileItems(all.filter((r) => r.nav_group === "mobile"));
    }
    const rb = await api("/api/rebuild-site", { method: "POST" });
    const rebuildJson = (await rb.json().catch(() => ({}))) as { message?: string; skipped?: boolean };
    if (rb.ok && rebuildJson.message) {
      setRebuildNote(rebuildJson.message);
    } else if (!rb.ok) {
      setRebuildNote(
        "Rebuild could not be started automatically. Save succeeded—trigger a deploy or rebuild from your host if the menu doesn’t update.",
      );
    }
    setSaving(false);
  }

  if (loading) return <p className="text-sm">Loading…</p>;

  return (
    <div>
      <h2 className="font-serif text-2xl font-semibold tracking-tight">Navigation</h2>
      <p className="mt-1 text-sm text-[oklch(42%_0.03_260)]">
        <strong className="font-medium text-[oklch(32%_0.03_260)]">Desktop</strong> links appear in the top bar.{" "}
        <strong className="font-medium text-[oklch(32%_0.03_260)]">Mobile quick links</strong> appear in the horizontal
        strip when visitors tap <em>More</em> on phones. Add, delete, reorder, and pick an icon for each mobile tile. You
        need at least two active <em>desktop</em> links for the database-driven top menu to replace the default menu.
      </p>
      <p className="mt-2 text-xs text-[oklch(48%_0.03_260)]">
        After you add mobile quick links, the site uses your list instead of the built-in default. Leave the mobile list
        empty to keep the default quick links.
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
      <form onSubmit={save} className="mt-8 space-y-12">
        <NavSection
          title="Desktop (top navigation)"
          description="Shown on wide screens. Use paths like blog/index.html or full https URLs for external pages."
          items={desktopItems}
          setItems={setDesktopItems}
          showIcon={false}
          addLabel="+ Add desktop link"
        />
        <NavSection
          title="Mobile quick links (More menu)"
          description="Shown as tappable tiles when visitors open the More panel on small screens. Choose an icon for each tile."
          items={mobileItems}
          setItems={setMobileItems}
          showIcon
          addLabel="+ Add mobile quick link"
        />
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
