import { json } from "./http.ts";
import {
  handleAdminAnalytics,
  handleAdminAuthor,
  handleAdminNav,
  handleAdminSettings,
  handleAnalyticsConfig,
  handleImportLocalPosts,
  handleRebuildSite,
  handleRedeploy,
  handleSeoTools,
} from "./routes_admin.ts";
import { handleAiAltImage, handleAiBlogAssist, handleAiEnrich, handleAiSeoReview } from "./routes_ai.ts";
import { handleMediaFilename, handleMediaIndex } from "./routes_media.ts";
import { handlePostSlug, handlePostsIndex } from "./routes_posts.ts";
import { handleNewsletterSubscribe, handleSupabasePublicConfig } from "./routes_public.ts";

function normalizePath(p: string): string {
  let s = p.startsWith("/") ? p : `/${p}`;
  if (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1);
  return s || "/";
}

export async function dispatch(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const pathParam = url.searchParams.get("path") || "";
  if (!pathParam) {
    return json({ error: "Missing path query parameter" }, 400);
  }

  const synthetic = new URL(`http://local${pathParam.startsWith("/") ? "" : "/"}${pathParam}`);
  for (const [k, v] of url.searchParams) {
    if (k === "path") continue;
    synthetic.searchParams.append(k, v);
  }

  const p = normalizePath(synthetic.pathname);
  const u = synthetic;

  if (p === "/api/supabase-public-config") {
    if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
    return handleSupabasePublicConfig(req);
  }

  if (p === "/api/newsletter/subscribe") {
    return handleNewsletterSubscribe(req);
  }

  if (p === "/api/admin/settings") {
    return handleAdminSettings(req, u);
  }

  if (p === "/api/admin/nav") {
    return handleAdminNav(req);
  }

  if (p === "/api/admin/author") {
    return handleAdminAuthor(req);
  }

  if (p === "/api/admin/analytics-config") {
    return handleAnalyticsConfig(req);
  }

  if (p === "/api/admin/analytics") {
    return handleAdminAnalytics(req, u);
  }

  if (p === "/api/admin/seo-tools") {
    return handleSeoTools(req);
  }

  if (p === "/api/admin/import-local-posts") {
    return handleImportLocalPosts(req);
  }

  if (p === "/api/rebuild-site") {
    return handleRebuildSite(req);
  }

  if (p === "/api/redeploy") {
    return handleRedeploy(req);
  }

  if (p === "/api/ai/enrich") {
    return handleAiEnrich(req);
  }

  if (p === "/api/ai/seo-review") {
    return handleAiSeoReview(req);
  }

  if (p === "/api/ai/blog-assist") {
    return handleAiBlogAssist(req);
  }

  if (p === "/api/ai/alt-image") {
    return handleAiAltImage(req);
  }

  const mediaFile = p.match(/^\/api\/media\/([^/]+)$/);
  if (mediaFile) {
    return handleMediaFilename(req, decodeURIComponent(mediaFile[1]));
  }

  if (p === "/api/media") {
    return handleMediaIndex(req);
  }

  const postSlug = p.match(/^\/api\/posts\/([^/]+)$/);
  if (postSlug) {
    return handlePostSlug(req, decodeURIComponent(postSlug[1]));
  }

  if (p === "/api/posts") {
    return handlePostsIndex(req);
  }

  return json({ error: "Not found", path: p }, 404);
}
