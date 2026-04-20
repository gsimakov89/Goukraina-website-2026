import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import { MediaPickerModal } from "@/components/MediaPickerModal";
import { SeoReviewModal, type SeoReviewData } from "@/components/SeoReviewModal";
import { api, readError } from "@/lib/api";
import type { MediaLibraryItem, PostRow } from "@/lib/types";

/** Hero / OG preview when stored as filename or path (matches build_site blog URLs). */
const SITE_IMG_BASE = "https://www.goukraina.org/images";

function imageUrlForPreview(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  if (s.startsWith("/")) return `https://www.goukraina.org${s}`;
  return `${SITE_IMG_BASE}/${s.replace(/^\//, "")}`;
}

const ASSIST_ACTIONS = [
  { id: "intro", label: "Write intro" },
  { id: "conclusion", label: "Write conclusion" },
  { id: "outline", label: "Outline" },
  { id: "draft", label: "Draft article" },
  { id: "expand", label: "Expand selection" },
  { id: "improve", label: "Improve tone" },
] as const;

function applySeoPatch(
  patch: Record<string, string>,
  setters: {
    setTitle: (v: string) => void;
    setSlug: (v: string) => void;
    setSlugManual: (v: boolean) => void;
    setMetaTitle: (v: string) => void;
    setMetaDesc: (v: string) => void;
    setExcerpt: (v: string) => void;
    setOgImage: (v: string) => void;
    setOgImageAlt: (v: string) => void;
    setTags: (v: string) => void;
  },
) {
  for (const [k, v] of Object.entries(patch)) {
    switch (k) {
      case "title":
        setters.setTitle(v);
        break;
      case "slug":
        setters.setSlug(v);
        setters.setSlugManual(true);
        break;
      case "meta_title":
        setters.setMetaTitle(v);
        break;
      case "meta_description":
        setters.setMetaDesc(v);
        break;
      case "excerpt":
        setters.setExcerpt(v);
        break;
      case "og_image":
        setters.setOgImage(v);
        break;
      case "og_image_alt":
        setters.setOgImageAlt(v);
        break;
      case "tags":
        setters.setTags(
          v
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .join(", "),
        );
        break;
      default:
        break;
    }
  }
}

export function BlogEditorPage() {
  const { slug: slugParam } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [tags, setTags] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [cover, setCover] = useState("");
  const [bodyHtml, setBodyHtml] = useState("<p></p>");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDesc, setMetaDesc] = useState("");
  const [ogImage, setOgImage] = useState("");
  const [ogImageAlt, setOgImageAlt] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewData, setReviewData] = useState<SeoReviewData | null>(null);
  const [assistBusy, setAssistBusy] = useState(false);
  const [assistAction, setAssistAction] = useState<string>("intro");
  const [assistPrompt, setAssistPrompt] = useState("");
  const [mediaPicker, setMediaPicker] = useState<null | "cover" | "og" | "quill">(null);
  const quillRef = useRef<InstanceType<typeof ReactQuill> | null>(null);
  const openQuillMedia = useCallback(() => setMediaPicker("quill"), []);

  const quillModules = useMemo(
    () => ({
      toolbar: {
        container: [
          [{ header: [2, 3, false] }],
          ["bold", "italic", "underline", "blockquote"],
          [{ list: "ordered" }, { list: "bullet" }],
          ["link", "image", "video"],
          ["clean"],
        ],
        handlers: {
          image: () => openQuillMedia(),
        },
      },
    }),
    [openQuillMedia],
  );

  const load = useCallback(async () => {
    if (!slugParam) {
      setErr("Missing post slug in the URL.");
      setLoading(false);
      return;
    }
    setErr(null);
    setLoading(true);
    try {
      const res = await api("/api/posts/" + encodeURIComponent(slugParam));
      if (!res.ok) {
        setErr(await readError(res));
        return;
      }
      const p = (await res.json()) as PostRow;
      setTitle(p.title || "");
      setSlug(p.slug || "");
      setDate((p.date || "").slice(0, 10));
      setStatus(p.status === "published" ? "published" : "draft");
      setTags(Array.isArray(p.tags) ? p.tags.join(", ") : "");
      setExcerpt(p.excerpt || "");
      setCover(p.cover || "");
      setBodyHtml(p.body_html || "<p></p>");
      setMetaTitle(p.seo?.meta_title || "");
      setMetaDesc(p.seo?.meta_description || "");
      setOgImage(p.seo?.og_image || "");
      setOgImageAlt(p.seo?.og_image_alt || "");
      setSlugManual(!!p.slug_manual);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load post");
    } finally {
      setLoading(false);
    }
  }, [slugParam]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!slug.trim() || !title.trim()) {
      setErr("Title and slug are required.");
      return;
    }
    setSaving(true);
    setErr(null);
    const payload = {
      slug: slug.trim(),
      title: title.trim(),
      date,
      tags: tags
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      excerpt: excerpt.trim(),
      cover: cover.trim(),
      desc: excerpt.trim() || title.trim(),
      body_html: bodyHtml,
      status,
      slug_manual: slugManual,
      seo: {
        meta_title: metaTitle.trim(),
        meta_description: metaDesc.trim(),
        og_image: ogImage.trim(),
        og_image_alt: ogImageAlt.trim(),
      },
    };
    const check = await api("/api/posts/" + encodeURIComponent(slug.trim()));
    const exists = check.ok;
    const url = exists ? "/api/posts/" + encodeURIComponent(slug.trim()) : "/api/posts";
    const method = exists ? "PUT" : "POST";
    const res = await api(url, { method, body: JSON.stringify(payload) });
    setSaving(false);
    if (!res.ok) {
      setErr(await readError(res));
      return;
    }
    if (slugParam !== slug.trim()) {
      navigate(`/blog/${encodeURIComponent(slug.trim())}`, { replace: true });
    }
    await load();
  }

  async function runEnrich() {
    setErr(null);
    const res = await api("/api/ai/enrich", {
      method: "POST",
      body: JSON.stringify({
        title: title.trim(),
        body_html: bodyHtml,
        excerpt: excerpt.trim(),
        tags: tags
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        slug: slug.trim(),
        slug_manual: slugManual,
        share_image_hint: ogImageAlt.trim() || ogImage.trim(),
      }),
    });
    if (!res.ok) {
      setErr(await readError(res));
      return;
    }
    const d = (await res.json()) as {
      excerpt?: string;
      meta_description?: string;
      meta_title?: string;
      tags?: string[];
      suggested_slug?: string;
      og_image_alt?: string;
    };
    if (d.excerpt) setExcerpt(d.excerpt);
    if (d.meta_description) setMetaDesc(d.meta_description);
    if (d.meta_title) setMetaTitle(d.meta_title);
    if (d.tags?.length) setTags(d.tags.join(", "));
    if (d.og_image_alt) setOgImageAlt(d.og_image_alt);
    if (!slugManual && d.suggested_slug) setSlug(d.suggested_slug);
  }

  async function runSeoReview() {
    setErr(null);
    const res = await api("/api/ai/seo-review", {
      method: "POST",
      body: JSON.stringify({
        title: title.trim(),
        body_html: bodyHtml,
        excerpt: excerpt.trim(),
        tags: tags
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        slug: slug.trim(),
        cover: cover.trim(),
        date,
        seo: {
          meta_title: metaTitle,
          meta_description: metaDesc,
          og_image: ogImage,
          og_image_alt: ogImageAlt,
        },
      }),
    });
    if (!res.ok) {
      setErr(await readError(res));
      return;
    }
    const j = (await res.json()) as SeoReviewData;
    setReviewData(j);
    setReviewOpen(true);
  }

  async function runBlogAssist() {
    setErr(null);
    setAssistBusy(true);
    const res = await api("/api/ai/blog-assist", {
      method: "POST",
      body: JSON.stringify({
        action: assistAction,
        context: `${title}\n\n${excerpt}\n\n${bodyHtml}`.slice(0, 8000),
        prompt: assistPrompt,
      }),
    });
    setAssistBusy(false);
    if (!res.ok) {
      setErr(await readError(res));
      return;
    }
    const d = (await res.json()) as { content?: string };
    if (d.content) {
      setBodyHtml((prev) => (prev.trim() === "<p></p>" || prev.trim() === "" ? d.content! : `${prev}\n${d.content}`));
    }
  }

  function applyMediaSelection(item: MediaLibraryItem) {
    if (mediaPicker === "cover") {
      setCover(item.filename);
    } else if (mediaPicker === "og") {
      setOgImage(item.url);
      if (item.alt_text.trim() && !ogImageAlt.trim()) {
        setOgImageAlt(item.alt_text.trim());
      }
    } else if (mediaPicker === "quill") {
      const quill = quillRef.current?.getEditor();
      if (quill) {
        const range = quill.getSelection(true);
        const index = range ? range.index : Math.max(0, quill.getLength() - 1);
        quill.insertEmbed(index, "image", item.url);
        quill.setSelection(index + 1, 0);
      }
    }
  }

  async function removePost() {
    if (!window.confirm("Remove this post from the site? (Soft-delete in the database.)")) return;
    const res = await api("/api/posts/" + encodeURIComponent(slug.trim()), { method: "DELETE" });
    if (!res.ok) {
      setErr(await readError(res));
      return;
    }
    navigate("/blog");
  }

  if (loading) {
    return <p className="text-sm text-[oklch(45%_0.03_260)]">Loading editor…</p>;
  }

  return (
    <div className="pb-24">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link to="/blog" className="text-sm font-semibold text-[oklch(48%_0.12_252)] hover:underline">
          ← All posts
        </Link>
      </div>
      {err && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{err}</p>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-[oklch(40%_0.03_260)]">
              Title
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[oklch(88%_0.02_250)] px-3 py-2 font-serif text-xl outline-none ring-[oklch(52%_0.14_252)] focus:ring-2"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-[oklch(40%_0.03_260)]">
                Slug
              </span>
              <input
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setSlugManual(true);
                }}
                className="mt-1 w-full rounded-lg border border-[oklch(88%_0.02_250)] px-3 py-2 font-mono text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-[oklch(40%_0.03_260)]">
                Date
              </span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[oklch(88%_0.02_250)] px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-[oklch(40%_0.03_260)]">
              Status
            </span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as "draft" | "published")}
              className="mt-1 rounded-lg border border-[oklch(88%_0.02_250)] px-3 py-2 text-sm"
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </label>

          <div className="rounded-xl border border-[oklch(90%_0.02_250)] bg-[oklch(99%_0.01_250)] p-4">
            <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-[oklch(45%_0.03_260)]">
              AI writing assistant
            </h3>
            <p className="mt-1 text-xs text-[oklch(42%_0.03_260)]">
              Uses your title, excerpt, and body as context. Generated HTML is appended to the article.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="flex-1 text-sm">
                Action
                <select
                  value={assistAction}
                  onChange={(e) => setAssistAction(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[oklch(88%_0.02_250)] px-2 py-1.5 text-sm"
                >
                  {ASSIST_ACTIONS.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="mt-2 block text-sm">
              Instructions (optional)
              <textarea
                value={assistPrompt}
                onChange={(e) => setAssistPrompt(e.target.value)}
                rows={2}
                placeholder="e.g. Focus on ReH2O water programs in Mykolaiv"
                className="mt-1 w-full rounded-lg border border-[oklch(88%_0.02_250)] px-2 py-1.5 text-sm"
              />
            </label>
            <button
              type="button"
              disabled={assistBusy}
              onClick={() => void runBlogAssist()}
              className="mt-3 rounded-lg bg-[oklch(42%_0.11_252)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {assistBusy ? "Working…" : "Generate with AI"}
            </button>
          </div>

          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-[oklch(40%_0.03_260)]">
              Article body
            </span>
            <p className="mb-2 text-xs text-[oklch(45%_0.03_260)]">
              Use the toolbar <strong className="font-medium">image</strong> button to insert from the media library.
            </p>
            <div className="mt-2 overflow-hidden rounded-xl border border-[oklch(88%_0.02_250)] bg-white">
              <ReactQuill
                ref={quillRef}
                theme="snow"
                modules={quillModules}
                value={bodyHtml}
                onChange={setBodyHtml}
              />
            </div>
          </div>
        </div>

        <aside className="space-y-4 rounded-2xl border border-[oklch(88%_0.02_250)] bg-white p-5 shadow-sm">
          <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-[oklch(45%_0.03_260)]">
            SEO & sharing
          </h3>
          <label className="block text-sm">
            <span className="text-[oklch(40%_0.03_260)]">Tags</span>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[oklch(88%_0.02_250)] px-2 py-1.5 text-sm"
              placeholder="Water, Advocacy"
            />
          </label>
          <label className="block text-sm">
            <span className="text-[oklch(40%_0.03_260)]">Excerpt</span>
            <textarea
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-[oklch(88%_0.02_250)] px-2 py-1.5 text-sm"
            />
          </label>
          <div className="block text-sm">
            <span className="text-[oklch(40%_0.03_260)]">Cover image</span>
            <p className="mt-0.5 text-xs text-[oklch(45%_0.03_260)]">
              Main image at the top of the post. Stored as a filename under{" "}
              <code className="rounded bg-[oklch(96%_0.02_250)] px-1">/images/</code> on the live site.
            </p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                value={cover}
                onChange={(e) => setCover(e.target.value)}
                placeholder="e.g. my-photo.jpg"
                className="min-w-0 flex-1 rounded-lg border border-[oklch(88%_0.02_250)] px-2 py-1.5 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setMediaPicker("cover")}
                className="shrink-0 rounded-lg border border-[oklch(88%_0.02_250)] bg-[oklch(98%_0.02_250)] px-3 py-1.5 text-xs font-semibold hover:bg-[oklch(96%_0.02_250)]"
              >
                Media library
              </button>
            </div>
            {cover.trim() ? (
              <div className="mt-2 overflow-hidden rounded-lg border border-[oklch(90%_0.02_250)] bg-[oklch(96%_0.02_250)]">
                <img
                  src={imageUrlForPreview(cover)}
                  alt=""
                  className="max-h-40 w-full object-cover"
                />
              </div>
            ) : null}
          </div>
          <label className="block text-sm">
            <span className="text-[oklch(40%_0.03_260)]">Meta title</span>
            <input
              value={metaTitle}
              onChange={(e) => setMetaTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[oklch(88%_0.02_250)] px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="text-[oklch(40%_0.03_260)]">Meta description</span>
            <textarea
              value={metaDesc}
              onChange={(e) => setMetaDesc(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-[oklch(88%_0.02_250)] px-2 py-1.5 text-sm"
            />
          </label>
          <div className="block text-sm">
            <span className="text-[oklch(40%_0.03_260)]">Social / Open Graph image</span>
            <p className="mt-0.5 text-xs text-[oklch(45%_0.03_260)]">
              Used when sharing the post. Leave blank to use the cover image.
            </p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                value={ogImage}
                onChange={(e) => setOgImage(e.target.value)}
                placeholder="URL or path"
                className="min-w-0 flex-1 rounded-lg border border-[oklch(88%_0.02_250)] px-2 py-1.5 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setMediaPicker("og")}
                className="shrink-0 rounded-lg border border-[oklch(88%_0.02_250)] bg-[oklch(98%_0.02_250)] px-3 py-1.5 text-xs font-semibold hover:bg-[oklch(96%_0.02_250)]"
              >
                Media library
              </button>
            </div>
            {ogImage.trim() ? (
              <div className="mt-2 overflow-hidden rounded-lg border border-[oklch(90%_0.02_250)] bg-[oklch(96%_0.02_250)]">
                <img
                  src={imageUrlForPreview(ogImage)}
                  alt=""
                  className="max-h-32 w-full object-cover"
                />
              </div>
            ) : null}
          </div>
          <label className="block text-sm">
            <span className="text-[oklch(40%_0.03_260)]">OG image alt text</span>
            <input
              value={ogImageAlt}
              onChange={(e) => setOgImageAlt(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[oklch(88%_0.02_250)] px-2 py-1.5 text-sm"
              placeholder="Describe the image for screen readers"
            />
          </label>

          <div className="flex flex-col gap-2 border-t border-[oklch(92%_0.02_250)] pt-4">
            <button
              type="button"
              onClick={() => void runEnrich()}
              className="rounded-lg border border-[oklch(88%_0.02_250)] bg-[oklch(98%_0.02_250)] px-3 py-2 text-sm font-semibold hover:bg-[oklch(96%_0.02_250)]"
            >
              AI: summarize & SEO
            </button>
            <button
              type="button"
              onClick={() => void runSeoReview()}
              className="rounded-lg bg-[oklch(48%_0.12_252)] px-3 py-2 text-sm font-semibold text-white hover:bg-[oklch(42%_0.13_252)]"
            >
              AI: full SEO review
            </button>
          </div>
        </aside>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-[oklch(88%_0.02_250)] bg-[oklch(99%_0.008_250)]/95 px-4 py-3 backdrop-blur md:pl-[15.5rem]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => void removePost()}
            className="text-sm font-medium text-red-700 hover:underline"
          >
            Remove from site
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="rounded-xl bg-[oklch(48%_0.12_252)] px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[oklch(42%_0.13_252)] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save post"}
          </button>
        </div>
      </div>

      <MediaPickerModal
        open={mediaPicker !== null}
        title={
          mediaPicker === "cover"
            ? "Choose cover image"
            : mediaPicker === "og"
              ? "Choose social preview image"
              : "Insert image in article"
        }
        onClose={() => setMediaPicker(null)}
        onSelect={(item) => {
          applyMediaSelection(item);
        }}
      />

      <SeoReviewModal
        open={reviewOpen}
        data={reviewData}
        onClose={() => setReviewOpen(false)}
        onApply={(patch) =>
          applySeoPatch(patch, {
            setTitle,
            setSlug,
            setSlugManual,
            setMetaTitle,
            setMetaDesc,
            setExcerpt,
            setOgImage,
            setOgImageAlt,
            setTags,
          })
        }
      />
    </div>
  );
}
