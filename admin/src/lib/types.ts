export type PostRow = {
  slug: string;
  title: string;
  date: string;
  date_label?: string;
  tags: string[];
  excerpt: string;
  cover: string;
  body_html: string;
  status: string;
  slug_manual?: boolean;
  seo: {
    meta_title?: string;
    meta_description?: string;
    og_image?: string;
    og_image_alt?: string;
  };
};

export type NavItem = {
  id?: string;
  label: string;
  href: string;
  target?: string;
  sort_order: number;
  parent_id?: string | null;
  is_active: boolean;
  nav_group: string;
};

export type MediaLibraryItem = {
  filename: string;
  path: string;
  url: string;
  alt_text: string;
  size_bytes: number | null;
};

export type AuthorProfile = {
  id?: string;
  name?: string;
  role?: string;
  bio?: string;
  avatar_url?: string;
  initials?: string;
  email?: string;
  twitter?: string;
  linkedin?: string;
};
