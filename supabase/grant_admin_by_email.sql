-- Grant CMS admin API access for an existing Auth user by email.
-- Run in Supabase → SQL Editor. Requires migration 20260415000000_blog_posts.sql (admin_users table).

-- Replace with the real address, then run once:
INSERT INTO public.admin_users (user_id)
SELECT id
FROM auth.users
WHERE lower(email) = lower('greg@goukraina.com')
LIMIT 1
ON CONFLICT (user_id) DO NOTHING;

-- Verify:
-- SELECT u.email, a.user_id
-- FROM public.admin_users a
-- JOIN auth.users u ON u.id = a.user_id;
