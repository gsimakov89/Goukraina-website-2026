/** Shared helpers for blog post API. */

export function slugify(title, existing) {
  let s = String(title || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!s) s = "post";
  s = s.slice(0, 80);
  if (!existing.has(s)) return s;
  return `${s}-${Math.random().toString(36).slice(2, 8)}`;
}

export function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}
