-- Admin features migration: site_settings, media_library, nav_items, author_profiles
-- Run in Supabase SQL editor or via CLI.

-- ─── Site Settings (key-value store) ────────────────────────────────────────
create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null default 'null'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.site_settings enable row level security;

-- Anyone can read the newsletter popup settings (needed for public popup JS)
create policy "site_settings_public_newsletter_read"
  on public.site_settings for select to anon, authenticated
  using (key = 'newsletter_popup');

create policy "site_settings_admin_all"
  on public.site_settings for all to authenticated
  using (exists (select 1 from public.admin_users au where au.user_id = auth.uid()))
  with check (exists (select 1 from public.admin_users au where au.user_id = auth.uid()));

-- ─── Media Library (image metadata + alt tags) ───────────────────────────────
create table if not exists public.media_library (
  id uuid primary key default gen_random_uuid(),
  filename text not null unique,
  path text not null,
  url text not null,
  alt_text text not null default '',
  size_bytes int,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists media_library_created_idx on public.media_library (created_at desc);
create index if not exists media_library_active_idx on public.media_library (deleted_at) where deleted_at is null;

alter table public.media_library enable row level security;

create policy "media_library_admin_all"
  on public.media_library for all to authenticated
  using (exists (select 1 from public.admin_users au where au.user_id = auth.uid()))
  with check (exists (select 1 from public.admin_users au where au.user_id = auth.uid()));

-- ─── Navigation Items ────────────────────────────────────────────────────────
create table if not exists public.nav_items (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  href text not null,
  target text not null default '',
  sort_order int not null default 0,
  parent_id uuid references public.nav_items(id) on delete cascade,
  is_active boolean not null default true,
  nav_group text not null default 'desktop',
  created_at timestamptz not null default now()
);

create index if not exists nav_items_sort_idx on public.nav_items (nav_group, sort_order);

alter table public.nav_items enable row level security;

-- Public can read active nav items (for dynamic nav rendering if needed)
create policy "nav_items_public_read"
  on public.nav_items for select to anon, authenticated
  using (is_active = true);

create policy "nav_items_admin_all"
  on public.nav_items for all to authenticated
  using (exists (select 1 from public.admin_users au where au.user_id = auth.uid()))
  with check (exists (select 1 from public.admin_users au where au.user_id = auth.uid()));

-- ─── Author Profiles ─────────────────────────────────────────────────────────
create table if not exists public.author_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  role text not null default '',
  bio text not null default '',
  avatar_url text not null default '',
  initials text not null default '',
  email text not null default '',
  twitter text not null default '',
  linkedin text not null default '',
  website text not null default '',
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.author_profiles enable row level security;

-- Public can read author profiles (shown on blog posts)
create policy "author_profiles_public_read"
  on public.author_profiles for select to anon, authenticated
  using (true);

create policy "author_profiles_admin_all"
  on public.author_profiles for all to authenticated
  using (exists (select 1 from public.admin_users au where au.user_id = auth.uid()))
  with check (exists (select 1 from public.admin_users au where au.user_id = auth.uid()));

-- ─── Update blog_posts: soft delete + author ─────────────────────────────────
alter table public.blog_posts
  drop constraint if exists blog_posts_status_check;

alter table public.blog_posts
  add column if not exists deleted_at timestamptz,
  add column if not exists author_id uuid references public.author_profiles(id) on delete set null;

alter table public.blog_posts
  add constraint blog_posts_status_check
  check (status in ('draft', 'published', 'deleted'));

-- Update published-only read policy to also exclude deleted rows
drop policy if exists "blog_posts_select_published" on public.blog_posts;
create policy "blog_posts_select_published"
  on public.blog_posts for select to anon, authenticated
  using (status = 'published' and deleted_at is null);

-- ─── Seed default nav items (matches current hardcoded nav) ──────────────────
insert into public.nav_items (label, href, target, sort_order, nav_group) values
  ('About',       'about/',                          '',       10, 'desktop'),
  ('ReH2O',       'initiatives/reh2o/',              '',       20, 'desktop'),
  ('Power',       'initiatives/power-generators/',   '',       30, 'desktop'),
  ('Advocacy',    'initiatives/advocacy/',           '',       40, 'desktop'),
  ('Dreamzzz',    'initiatives/ukraine-dreamzzz/',   '',       50, 'desktop'),
  ('Summit',      'https://www.ursummit.com/',       '_blank', 60, 'desktop'),
  ('Impact',      'impact/',                         '',       70, 'desktop'),
  ('Blog',        'blog/',                           '',       80, 'desktop'),
  ('Contact',     'contact/',                        '',       90, 'desktop')
on conflict do nothing;

-- ─── Seed default author profile ─────────────────────────────────────────────
insert into public.author_profiles (name, role, bio, initials, email, is_default) values
  (
    'German Simakovski',
    'Communications · Go Ukraina',
    'German leads communications and field reporting for Go Ukraina, a Los Angeles-based 501(c)(3) nonprofit delivering clean water, emergency power, and advocacy for war-affected Ukraine.',
    'GS',
    'info@goukraina.com',
    true
  )
on conflict do nothing;
