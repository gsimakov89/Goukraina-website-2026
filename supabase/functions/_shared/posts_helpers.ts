/** Shared blog post mapping — mirrors api/_lib/posts_utils + posts handlers. */

export function slugify(title: string, existing: Set<string>): string {
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

export function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function postsTable(): string {
  return (Deno.env.get("SUPABASE_POSTS_TABLE") || "blog_posts").trim() || "blog_posts";
}

export function draftJson(slug: string, title: string) {
  const date = todayISODate();
  const d = new Date(`${date}T12:00:00Z`);
  const dateLabel = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return {
    slug,
    title,
    desc: title,
    date,
    date_label: dateLabel,
    read: 1,
    tags: [] as string[],
    excerpt: "",
    cover: "",
    body_html: "<p></p>",
    status: "draft",
    seo: { meta_title: "", meta_description: "", og_image: "", og_image_alt: "" },
    updated_at: "",
    slug_manual: false,
  };
}

export function mapRow(row: Record<string, unknown> | null) {
  if (!row) return null;
  const tags = Array.isArray(row.tags) ? row.tags as string[] : [];
  const seo = row.seo && typeof row.seo === "object" ? row.seo as Record<string, unknown> : {};
  let date = row.date as string | Date | undefined;
  if (date && typeof date === "string") date = date.slice(0, 10);
  else if (date instanceof Date) date = date.toISOString().slice(0, 10);
  let updated_at = (row.updated_at as string | Date | undefined) || "";
  if (updated_at instanceof Date) updated_at = updated_at.toISOString();
  return {
    slug: row.slug,
    title: row.title,
    desc: row.desc || "",
    date,
    date_label: row.date_label || "",
    read: row.read ?? 1,
    tags,
    excerpt: row.excerpt || "",
    cover: row.cover || "",
    body_html: row.body_html || "",
    status: row.status || "draft",
    seo: {
      meta_title: seo.meta_title || "",
      meta_description: seo.meta_description || "",
      og_image: seo.og_image || "",
      og_image_alt: seo.og_image_alt || "",
    },
    updated_at: updated_at || "",
    slug_manual: !!row.slug_manual,
  };
}

export function rowFromPostBody(body: Record<string, unknown>) {
  const seo = body.seo && typeof body.seo === "object" ? body.seo as Record<string, unknown> : {};
  return {
    slug: body.slug,
    title: body.title,
    desc: body.desc || "",
    date: String(body.date).slice(0, 10),
    date_label: body.date_label || "",
    read: body.read ?? 1,
    tags: Array.isArray(body.tags) ? body.tags : [],
    excerpt: body.excerpt || "",
    cover: body.cover || "",
    body_html: body.body_html || "",
    status: body.status || "draft",
    seo: {
      meta_title: seo.meta_title || "",
      meta_description: seo.meta_description || "",
      og_image: seo.og_image || "",
      og_image_alt: seo.og_image_alt || "",
    },
    updated_at: body.updated_at || new Date().toISOString(),
    slug_manual: !!body.slug_manual,
  };
}
