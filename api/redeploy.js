/**
 * POST /api/redeploy — optional Vercel deploy hook (GitHub commit already triggers deploy).
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
        "No VERCEL_DEPLOY_HOOK_URL set. Saving posts still triggers a deploy when GitHub notifies Vercel (typical setup).",
    });
  }
  try {
    const r = await fetch(hook, { method: "POST" });
    return res.status(200).json({ ok: r.ok, status: r.status });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
}
