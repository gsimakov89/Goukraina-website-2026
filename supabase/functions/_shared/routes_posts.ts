import { getSupabaseService, requireAdmin, supabasePostsEnabled } from "./admin_auth.ts";
import { json } from "./http.ts";
import { readJsonBody } from "./http.ts";
import {
  draftJson,
  mapRow,
  postsTable,
  rowFromPostBody,
  slugify,
} from "./posts_helpers.ts";

export async function handlePostsIndex(req: Request): Promise<Response> {
  if (!supabasePostsEnabled()) {
    return json(
      { error: "Blog API requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY." },
      503,
    );
  }
  const table = postsTable();
  if (req.method === "GET") {
    const gate = await requireAdmin(req);
    if (gate) return gate;
    try {
      const supabase = getSupabaseService();
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .neq("status", "deleted")
        .order("date", { ascending: false });
      if (error) throw error;
      const out = (data || []).map((r) => mapRow(r as Record<string, unknown>));
      return json(out);
    } catch (e) {
      return json({ error: (e as Error).message || String(e) }, 500);
    }
  }

  if (req.method === "POST") {
    const gate = await requireAdmin(req);
    if (gate) return gate;
    let body: Record<string, unknown>;
    try {
      body = (await readJsonBody(req)) as Record<string, unknown>;
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    try {
      const supabase = getSupabaseService();
      const { data: rows } = await supabase.from(table).select("slug");
      const existing = new Set((rows || []).map((r: { slug: string }) => r.slug));

      const titleOnly = body.title && typeof body.title === "string" && !body.slug;
      if (titleOnly) {
        const slug = slugify(body.title as string, existing);
        const post = draftJson(slug, (body.title as string).trim());
        const row = rowFromPostBody(post as unknown as Record<string, unknown>);
        const { data, error } = await supabase.from(table).insert(row).select("*").single();
        if (error) throw error;
        return json(mapRow(data as Record<string, unknown>), 201);
      }

      if (!body.slug || !body.title) {
        return json({ error: "slug and title are required" }, 400);
      }
      const slug = String(body.slug).trim();
      if (existing.has(slug)) {
        return json({ error: "Slug already exists; use PUT to update." }, 409);
      }
      const row = rowFromPostBody(body);
      const { data, error } = await supabase.from(table).insert(row).select("*").single();
      if (error) throw error;
      return json(mapRow(data as Record<string, unknown>), 201);
    } catch (e) {
      return json({ error: (e as Error).message || String(e) }, 500);
    }
  }

  return json({ error: "Method not allowed" }, 405);
}

export async function handlePostSlug(req: Request, slug: string): Promise<Response> {
  if (!supabasePostsEnabled()) {
    return json(
      { error: "Blog API requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY." },
      503,
    );
  }
  const table = postsTable();

  if (req.method === "GET") {
    const gate = await requireAdmin(req);
    if (gate) return gate;
    try {
      const supabase = getSupabaseService();
      const { data, error } = await supabase.from(table).select("*").eq("slug", slug).maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "Not found" }, 404);
      if (data.status === "deleted") return json({ error: "Not found" }, 404);
      return json(mapRow(data as Record<string, unknown>));
    } catch (e) {
      return json({ error: (e as Error).message || String(e) }, 500);
    }
  }

  if (req.method === "PUT") {
    const gate = await requireAdmin(req);
    if (gate) return gate;
    let body: Record<string, unknown>;
    try {
      body = (await readJsonBody(req)) as Record<string, unknown>;
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    if (String(body.slug || "") !== slug) {
      return json({ error: "Body slug must match URL" }, 400);
    }
    try {
      const supabase = getSupabaseService();
      const row = rowFromPostBody(body);
      const { data, error } = await supabase.from(table).update(row).eq("slug", slug).select("*").single();
      if (error) throw error;
      return json({ ok: true, slug: data?.slug || slug });
    } catch (e) {
      return json({ error: (e as Error).message || String(e) }, 500);
    }
  }

  if (req.method === "DELETE") {
    const gate = await requireAdmin(req);
    if (gate) return gate;
    try {
      const supabase = getSupabaseService();
      const { error } = await supabase
        .from(table)
        .update({ status: "deleted", deleted_at: new Date().toISOString() })
        .eq("slug", slug);
      if (error) throw error;
      return json({ ok: true, soft_deleted: true });
    } catch (e) {
      return json({ error: (e as Error).message || String(e) }, 500);
    }
  }

  return json({ error: "Method not allowed" }, 405);
}
