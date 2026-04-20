"""FastAPI app: JSON API + single-page admin with Quill (Medium-style editing)."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

# Load repo-root .env before app reads env (uvicorn workers, reload, IDE runs).
_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
try:
    from dotenv import load_dotenv

    load_dotenv(_REPO_ROOT / ".env", override=True)
except ImportError:
    pass

from typing import Annotated, Any

from fastapi import Body, Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, ValidationError

from pipeline.admin.auth import require_admin, verify_admin_credentials
from pipeline.admin import analytics_routes, author_routes, media_store, seo_tools_api, site_admin_rest
from pipeline.config import supabase_project_url
from pipeline.ai.enrich import alt_for_image_context, enrich_post
from pipeline.integration.build_adapter import resync_post_fields
from pipeline.models.post import BlogPost
from pipeline.services.post_service import PostService

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
_BUILT_ADMIN = _REPO_ROOT / "public" / "admin"
_LEGACY_ADMIN = Path(__file__).resolve().parent / "static"
STATIC_DIR = _BUILT_ADMIN if (_BUILT_ADMIN / "index.html").is_file() else _LEGACY_ADMIN
app = FastAPI(title="Go Ukraina Blog Admin", version="0.1.0")

_PUBLIC_SETTINGS_KEYS = frozenset({"newsletter_popup"})
_http_bearer_optional = HTTPBearer(auto_error=False)

if STATIC_DIR.is_dir():
    # Serves /admin/index.html, /admin/admin.css (same paths as Vercel public/admin/).
    app.mount("/admin", StaticFiles(directory=STATIC_DIR, html=True), name="admin_ui")
    app.mount("/admin-assets", StaticFiles(directory=STATIC_DIR), name="admin_assets")


class PostPayload(BaseModel):
    slug: str = Field(..., min_length=2, max_length=120)
    title: str = Field(..., min_length=1, max_length=300)
    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$")
    tags: list[str] = Field(default_factory=list)
    excerpt: str = ""
    cover: str = ""
    desc: str = ""
    body_html: str = "<p></p>"
    status: str = Field("draft", pattern="^(draft|published)$")
    seo: dict[str, str] = Field(default_factory=dict)
    slug_manual: bool = False


class EnrichPayload(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    body_html: str = ""
    excerpt: str = ""
    slug: str = ""
    slug_manual: bool = False
    tags: list[str] = Field(default_factory=list)
    share_image_hint: str = ""


class AltImagePayload(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    body_html: str = ""
    image_hint: str = ""


class NewDraftPayload(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)


def _service() -> PostService:
    return PostService()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "goukraina-pipeline-admin"}


@app.get("/api/admin/author")
def api_admin_author_get(_: None = Depends(require_admin)) -> dict:
    """Default author row from Supabase `author_profiles` (same as Vercel /api/admin/author)."""
    try:
        return author_routes.get_default_author()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e)) from e


@app.put("/api/admin/author")
def api_admin_author_put(payload: dict = Body(...), _: None = Depends(require_admin)) -> dict:
    try:
        return author_routes.upsert_author(payload)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e)) from e


@app.get("/api/admin/analytics")
def api_admin_analytics_get(action: str = "top_pages", _: None = Depends(require_admin)) -> dict:
    if action != "top_pages":
        raise HTTPException(400, "Unknown GET action")
    try:
        return analytics_routes.get_top_pages()
    except RuntimeError as e:
        raise HTTPException(500, str(e)) from e
    except Exception as e:
        raise HTTPException(500, str(e)) from e


@app.post("/api/admin/analytics")
def api_admin_analytics_post(payload: dict = Body(...), _: None = Depends(require_admin)) -> dict:
    action = str(payload.get("action") or "").strip()
    if action != "submit_sitemap":
        raise HTTPException(400, "Unknown POST action")
    try:
        return analytics_routes.submit_sitemap()
    except RuntimeError as e:
        raise HTTPException(500, str(e)) from e
    except Exception as e:
        raise HTTPException(500, str(e)) from e


@app.get("/api/admin/analytics-config")
def api_admin_analytics_config_get(_: None = Depends(require_admin)) -> dict[str, Any]:
    return analytics_routes.get_analytics_config_admin()


@app.put("/api/admin/analytics-config")
def api_admin_analytics_config_put(payload: dict = Body(...), _: None = Depends(require_admin)) -> dict[str, bool]:
    try:
        analytics_routes.save_analytics_config(payload)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e)) from e
    return {"ok": True}


@app.get("/api/admin/settings")
def api_admin_settings_get(
    key: str | None = None,
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_http_bearer_optional)] = None,
) -> dict[str, Any]:
    """All settings (admin), one key (admin), or public keys e.g. newsletter_popup without auth."""
    k = (key or "").strip()
    if k and k in _PUBLIC_SETTINGS_KEYS:
        return site_admin_rest.site_settings_get_one(k)
    verify_admin_credentials(creds)
    if k:
        return site_admin_rest.site_settings_get_one(k)
    return site_admin_rest.site_settings_get_all()


@app.put("/api/admin/settings")
def api_admin_settings_put(
    payload: Any = Body(...),
    _: None = Depends(require_admin),
) -> dict[str, Any]:
    items = payload if isinstance(payload, list) else [payload]
    n = site_admin_rest.site_settings_upsert(items)
    return {"ok": True, "updated": n}


@app.get("/api/admin/nav")
def api_admin_nav_get(_: None = Depends(require_admin)) -> list[dict[str, Any]]:
    return site_admin_rest.nav_items_get_all()


@app.put("/api/admin/nav")
def api_admin_nav_put(
    payload: list[dict[str, Any]] = Body(...),
    _: None = Depends(require_admin),
) -> dict[str, bool]:
    site_admin_rest.nav_items_replace_all(payload)
    return {"ok": True}


@app.post("/api/admin/nav")
def api_admin_nav_post(
    payload: dict[str, Any] = Body(...),
    _: None = Depends(require_admin),
) -> dict[str, Any]:
    return site_admin_rest.nav_items_insert_one(payload)


@app.post("/api/admin/seo-tools")
def api_admin_seo_tools(
    payload: dict[str, Any] = Body(...),
    _: None = Depends(require_admin),
) -> dict[str, Any]:
    action = str(payload.get("action") or "").strip()
    if not action:
        raise HTTPException(400, "action required")
    return seo_tools_api.run_seo_tools_action(action)


@app.get("/api/supabase-public-config")
def api_supabase_public_config() -> dict[str, str | bool]:
    """Public anon key + URL for the admin SPA (safe to expose)."""
    url = supabase_project_url().strip()
    anon = (os.environ.get("SUPABASE_ANON_KEY") or "").strip()
    # Where /api/posts loads from (not secret; helps explain empty lists in admin).
    from_sb = bool((os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip())
    return {
        "configured": bool(url and anon),
        "url": url,
        "anonKey": anon,
        "blogPostsSource": "supabase" if from_sb else "json",
    }


@app.get("/api/posts")
def api_list_posts(
    _: None = Depends(require_admin),
    svc: PostService = Depends(_service),
) -> list[dict]:
    return [p.to_dict() for p in svc.all_posts()]


@app.get("/api/posts/{slug}")
def api_get_post(
    slug: str,
    _: None = Depends(require_admin),
    svc: PostService = Depends(_service),
) -> dict:
    try:
        return svc.get(slug).to_dict()
    except KeyError:
        raise HTTPException(404, "Post not found") from None


@app.post("/api/posts")
def api_create_post(
    payload: dict = Body(...),
    _: None = Depends(require_admin),
    svc: PostService = Depends(_service),
) -> JSONResponse:
    """Create a post. Body `{ \"title\" }` only creates a draft (same as Vercel /api/posts)."""
    title = payload.get("title")
    slug_raw = payload.get("slug")
    slug_str = str(slug_raw).strip() if slug_raw is not None else ""
    if title and not slug_str:
        post = svc.create_draft(str(title).strip())
        return JSONResponse(post.to_dict(), status_code=201)
    try:
        validated = PostPayload.model_validate(payload)
    except ValidationError as e:
        raise HTTPException(422, e.errors()) from e
    if svc.slug_exists(validated.slug):
        raise HTTPException(409, "Slug already exists; use PUT to update.")
    post = BlogPost.from_dict(validated.model_dump())
    post = resync_post_fields(post)
    svc.save(post)
    return JSONResponse(post.to_dict(), status_code=201)


@app.put("/api/posts/{slug}")
def api_update_post(
    slug: str,
    payload: PostPayload,
    _: None = Depends(require_admin),
    svc: PostService = Depends(_service),
) -> dict:
    if payload.slug != slug:
        raise HTTPException(400, "Body slug must match URL (rename not supported in this version).")
    try:
        svc.get(slug)
    except KeyError:
        raise HTTPException(404, "Post not found") from None
    post = BlogPost.from_dict(payload.model_dump())
    post = resync_post_fields(post)
    svc.save(post)
    return {"ok": True, "slug": post.slug}


@app.get("/api/media")
def api_list_media(_: None = Depends(require_admin)) -> list[dict]:
    return media_store.list_uploads()


@app.post("/api/media")
def api_post_media_json(
    _: None = Depends(require_admin),
    payload: dict = Body(...),
) -> dict:
    """JSON upload (same contract as Vercel /api/media)."""
    import base64

    fn = str(payload.get("filename") or "upload.bin")
    b64 = payload.get("content_base64")
    if not b64 or not isinstance(b64, str):
        raise HTTPException(400, "content_base64 required")
    try:
        raw = base64.b64decode(b64)
    except Exception:
        raise HTTPException(400, "Invalid base64") from None
    try:
        return media_store.save_upload(fn, raw)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@app.post("/api/media/upload")
async def api_upload_media(
    _: None = Depends(require_admin),
    file: UploadFile = File(...),
) -> dict:
    raw = await file.read()
    try:
        return media_store.save_upload(file.filename or "upload.bin", raw)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@app.post("/api/ai/enrich")
def api_ai_enrich(
    payload: EnrichPayload,
    _: None = Depends(require_admin),
) -> dict:
    try:
        return enrich_post(
            title=payload.title.strip(),
            body_html=payload.body_html,
            excerpt=payload.excerpt,
            slug=payload.slug.strip(),
            slug_manual=payload.slug_manual,
            tags=list(payload.tags),
            share_image_hint=payload.share_image_hint.strip(),
        )
    except RuntimeError as e:
        raise HTTPException(503, str(e)) from e
    except Exception as e:
        raise HTTPException(500, str(e)) from e


@app.post("/api/ai/alt-image")
def api_ai_alt_image(
    payload: AltImagePayload,
    _: None = Depends(require_admin),
) -> dict:
    try:
        alt = alt_for_image_context(
            article_title=payload.title.strip(),
            image_hint=payload.image_hint.strip(),
            body_html=payload.body_html,
        )
        return {"og_image_alt": alt}
    except RuntimeError as e:
        raise HTTPException(503, str(e)) from e
    except Exception as e:
        raise HTTPException(500, str(e)) from e


@app.post("/api/ai/seo-review")
def api_ai_seo_review(
    payload: dict = Body(...),
    _: None = Depends(require_admin),
) -> dict:
    from pipeline.ai.seo_review import run_seo_review

    try:
        return run_seo_review(payload)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except RuntimeError as e:
        raise HTTPException(503, str(e)) from e
    except Exception as e:
        raise HTTPException(500, str(e)) from e


@app.post("/api/ai/blog-assist")
def api_ai_blog_assist(
    payload: dict = Body(...),
    _: None = Depends(require_admin),
) -> dict:
    from pipeline.ai.blog_assist import run_blog_assist

    try:
        return run_blog_assist(payload)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except RuntimeError as e:
        raise HTTPException(503, str(e)) from e
    except Exception as e:
        raise HTTPException(500, str(e)) from e


@app.delete("/api/media/{filename:path}")
def api_delete_media(filename: str, _: None = Depends(require_admin)) -> dict:
    media_store.delete_upload(filename)
    return {"ok": True, "filename": filename}


@app.delete("/api/posts/{slug}")
def api_delete_post(
    slug: str,
    _: None = Depends(require_admin),
    svc: PostService = Depends(_service),
) -> dict:
    try:
        svc.get(slug)
    except KeyError:
        raise HTTPException(404, "Post not found") from None
    svc.delete(slug)
    return {"ok": True, "soft_deleted": True}


@app.post("/api/posts/new-draft")
def api_new_draft(
    payload: NewDraftPayload,
    _: None = Depends(require_admin),
    svc: PostService = Depends(_service),
) -> dict:
    post = svc.create_draft(payload.title)
    return post.to_dict()


def _run_static_build() -> dict:
    """Run `python3 build_site.py` from repo root (matches CI / local static export)."""
    root = Path(__file__).resolve().parent.parent.parent
    proc = subprocess.run(
        [sys.executable, str(root / "build_site.py")],
        cwd=str(root),
        capture_output=True,
        text=True,
        timeout=300,
    )
    if proc.returncode != 0:
        return {"ok": False, "code": proc.returncode, "stderr": proc.stderr[-4000:]}
    return {"ok": True, "stdout_tail": proc.stdout[-2000:]}


@app.post("/api/rebuild-site")
def api_rebuild(_: None = Depends(require_admin)) -> dict:
    return _run_static_build()


@app.post("/api/redeploy")
def api_redeploy(_: None = Depends(require_admin)) -> dict:
    """Same as /api/rebuild-site (name matches Vercel serverless admin)."""
    return _run_static_build()

