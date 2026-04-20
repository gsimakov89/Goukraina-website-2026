/**
 * POST /api/rebuild-site — queue a production rebuild so static HTML picks up Supabase (e.g. site_settings.tracking).
 * On Vercel: uses VERCEL_DEPLOY_HOOK_URL (Deploy Hook) to trigger a new deployment that runs build_site.py.
 * Local FastAPI: use the pipeline server’s /api/rebuild-site which runs Python directly.
 */
import { requireAdmin } from "./_lib/admin_auth.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!(await requireAdmin(req, res))) return;

  const hook = process.env.VERCEL_DEPLOY_HOOK_URL;
  if (!hook) {
    return res.status(200).json({
      ok: true,
      skipped: true,
      message:
        "No VERCEL_DEPLOY_HOOK_URL. Add a Deploy Hook in Vercel → Project → Settings → Git → Deploy Hooks, then set the URL in env. Until then, push a commit or redeploy manually so tracking changes reach the built HTML.",
    });
  }
  try {
    const r = await fetch(hook, { method: "POST" });
    const text = await r.text().catch(() => "");
    return res.status(200).json({
      ok: r.ok,
      status: r.status,
      message: r.ok
        ? "Deployment started. Tracking and scripts appear in HTML after this build finishes (usually 1–3 minutes)."
        : `Deploy hook returned ${r.status}. ${text.slice(0, 200)}`,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}
