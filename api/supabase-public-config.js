/**
 * GET — public Supabase URL + anon key for the admin SPA (safe to expose).
 */
const SUPABASE_PROJECT_URL_DEFAULT = "https://lrbrvkhddhuebmyazgcf.supabase.co";

const SETUP_HINT =
  "Set SUPABASE_URL and SUPABASE_ANON_KEY in Vercel → Project → Environment Variables (Production), then redeploy. " +
  "If the admin SPA was built with VITE_SUPABASE_FUNCTIONS_URL, set the same keys on Supabase → Edge Functions → site-api → Secrets.";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const url = (process.env.SUPABASE_URL || "").trim() || SUPABASE_PROJECT_URL_DEFAULT;
  const anonKey = (process.env.SUPABASE_ANON_KEY || "").trim();
  const fromSb = Boolean((process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim());
  const configured = Boolean(url && anonKey);
  return res.status(200).json({
    configured,
    url,
    anonKey: configured ? anonKey : "",
    blogPostsSource: fromSb ? "supabase" : "json",
    ...(configured ? {} : { setupHint: SETUP_HINT }),
  });
}
