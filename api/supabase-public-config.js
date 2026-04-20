/**
 * GET — public Supabase URL + anon key for the admin SPA (safe to expose).
 */
const SUPABASE_PROJECT_URL_DEFAULT = "https://lrbrvkhddhuebmyazgcf.supabase.co";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const url = (process.env.SUPABASE_URL || "").trim() || SUPABASE_PROJECT_URL_DEFAULT;
  const anonKey = (process.env.SUPABASE_ANON_KEY || "").trim();
  const fromSb = Boolean((process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim());
  return res.status(200).json({
    configured: Boolean(url && anonKey),
    url,
    anonKey,
    blogPostsSource: fromSb ? "supabase" : "json",
  });
}
