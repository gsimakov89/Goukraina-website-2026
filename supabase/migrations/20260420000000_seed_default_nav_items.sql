-- Seed desktop nav_items to match build_site.py hardcoded primary nav (flat links).
-- The static generator uses DB nav when ≥2 active desktop rows exist; otherwise it falls back to HTML with an "Our Work" dropdown.
-- DB-driven nav is a single row of links (no dropdown) — same destinations as the default site.
-- Safe to run once: only inserts when nav_items is completely empty.

insert into public.nav_items (label, href, target, sort_order, nav_group, is_active)
select v.label, v.href, v.target, v.sort_order, 'desktop', true
from (
  values
    ('About', 'about/index.html', '', 10),
    ('ReH2O Clean Water', 'initiatives/reh2o/index.html', '', 20),
    ('Power Generators', 'initiatives/power-generators/index.html', '', 30),
    ('Advocacy', 'initiatives/advocacy/index.html', '', 40),
    ('Ukraine Dreamzzz', 'initiatives/ukraine-dreamzzz/index.html', '', 50),
    ('Summit', 'https://www.ursummit.com/', '_blank', 60),
    ('Impact', 'impact/index.html', '', 70),
    ('Blog', 'blog/index.html', '', 80),
    ('Donate', 'donate/index.html', '', 90),
    ('Contact', 'contact/index.html', '', 100)
) as v(label, href, target, sort_order)
where not exists (select 1 from public.nav_items limit 1);
