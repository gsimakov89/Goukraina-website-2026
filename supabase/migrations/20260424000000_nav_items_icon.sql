-- Optional icon preset for mobile "More" toolbar tiles (see build_site.MOBILE_NAV_ICONS).

alter table public.nav_items
  add column if not exists icon_key text not null default '';

comment on column public.nav_items.icon_key is 'Preset key for mobile toolbar SVG (nav_group=mobile). Empty uses generic link icon.';
