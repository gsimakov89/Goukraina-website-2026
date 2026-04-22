-- Tracks emails submitted via the public newsletter popup so we do not call Givebutter twice for the same address.
-- Service role only (no RLS policies: anon/authenticated have no access; service role bypasses RLS).

create table if not exists public.newsletter_signups (
  email text primary key check (char_length(email) <= 254),
  source text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists newsletter_signups_created_idx on public.newsletter_signups (created_at desc);

alter table public.newsletter_signups enable row level security;
