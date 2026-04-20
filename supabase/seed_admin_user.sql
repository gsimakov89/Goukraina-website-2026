-- One-time: grant CMS admin API access for a Supabase Auth user.
-- 1) Dashboard → Authentication → Users → copy the user’s UUID.
-- 2) Replace PASTE_USER_UUID_HERE below, then run in SQL Editor.

INSERT INTO public.admin_users (user_id)
VALUES ('PASTE_USER_UUID_HERE'::uuid)
ON CONFLICT (user_id) DO NOTHING;

-- Or by email (run in SQL Editor; requires auth.users row):
-- INSERT INTO public.admin_users (user_id)
-- SELECT id FROM auth.users WHERE lower(email) = lower('you@example.com') LIMIT 1
-- ON CONFLICT (user_id) DO NOTHING;

-- Alternative: in the dashboard, open the user → App metadata → add JSON: { "admin": true }

-- Deploy env (optional): ADMIN_EMAIL_ALLOWLIST=you@example.com — grants admin API without DB row
-- (prefer admin_users or app_metadata for production).
