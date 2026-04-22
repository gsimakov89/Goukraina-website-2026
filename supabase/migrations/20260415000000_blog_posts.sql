-- Blog posts + admin allowlist. Run in Supabase SQL editor or via CLI.
-- After deploy: add admin rows with INSERT INTO public.admin_users (user_id) VALUES ('<uuid-from-auth.users>');

create table if not exists public.blog_posts (
  slug text primary key,
  title text not null,
  "desc" text not null default '',
  date date not null,
  date_label text not null default '',
  read int not null default 1,
  tags jsonb not null default '[]'::jsonb,
  excerpt text not null default '',
  cover text not null default '',
  body_html text not null default '',
  status text not null default 'draft',
  seo jsonb not null default '{}'::jsonb,
  updated_at timestamptz,
  slug_manual boolean not null default false,
  constraint blog_posts_status_check check (status in ('draft', 'published'))
);

create index if not exists blog_posts_date_idx on public.blog_posts (date desc);
create index if not exists blog_posts_status_idx on public.blog_posts (status);

alter table public.blog_posts enable row level security;

-- Anyone can read published posts (anon + authenticated) — used if clients hit PostgREST directly.
drop policy if exists "blog_posts_select_published" on public.blog_posts;
create policy "blog_posts_select_published"
  on public.blog_posts
  for select
  to anon, authenticated
  using (status = 'published');

-- Admins listed in admin_users may read/write all rows when using the anon key + user JWT.
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade
);

alter table public.admin_users enable row level security;

drop policy if exists "admin_users_no_direct_select" on public.admin_users;
create policy "admin_users_no_direct_select"
  on public.admin_users
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "blog_posts_admin_all" on public.blog_posts;
create policy "blog_posts_admin_all"
  on public.blog_posts
  for all
  to authenticated
  using (
    exists (select 1 from public.admin_users au where au.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.admin_users au where au.user_id = auth.uid())
  );

-- Optional: grant usage (Supabase defaults usually cover this)
-- Service role bypasses RLS for server-side pipelines (build, FastAPI with service role key).
