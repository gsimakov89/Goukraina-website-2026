"""Admin auth: Supabase user JWT (admin via app_metadata, admin_users, or ADMIN_EMAIL_ALLOWLIST)."""

from __future__ import annotations

import os
from typing import Annotated, Any

import httpx
import jwt
from jwt import PyJWKClient
from jwt.exceptions import MissingCryptographyError
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from urllib.parse import quote

from pipeline.config import supabase_project_url

# auto_error=False so we return 401 with a clear body instead of OAuth2-style 403
_http_bearer = HTTPBearer(auto_error=False)


def _jwt_secret() -> str:
    return (os.environ.get("SUPABASE_JWT_SECRET") or os.environ.get("JWT_SECRET") or "").strip()


def _decode_supabase_jwt(token: str) -> dict[str, Any]:
    """Verify Supabase Auth JWTs: HS256 (legacy JWT secret) or RS256/ES256 via JWKS (asymmetric keys)."""
    header = jwt.get_unverified_header(token)
    alg = (header.get("alg") or "HS256").upper()

    if alg.startswith("HS"):
        secret = _jwt_secret()
        if not secret:
            raise ValueError("SUPABASE_JWT_SECRET missing")
        try:
            return jwt.decode(
                token,
                secret,
                algorithms=[alg],
                audience="authenticated",
            )
        except jwt.InvalidAudienceError:
            return jwt.decode(
                token,
                secret,
                algorithms=[alg],
                options={"verify_aud": False},
            )

    # Asymmetric signing (common on newer Supabase projects) — no shared secret
    base = supabase_project_url().rstrip("/")
    if not base:
        raise ValueError("SUPABASE_URL required for asymmetric JWT (JWKS) verification")
    jwks_url = f"{base}/auth/v1/.well-known/jwks.json"
    jwks_client = PyJWKClient(jwks_url)
    signing_key = jwks_client.get_signing_key_from_jwt(token)
    key = signing_key.key
    issuer = f"{base}/auth/v1"
    try:
        return jwt.decode(
            token,
            key,
            algorithms=[alg],
            audience="authenticated",
            issuer=issuer,
        )
    except jwt.InvalidAudienceError:
        return jwt.decode(
            token,
            key,
            algorithms=[alg],
            issuer=issuer,
            options={"verify_aud": False},
        )
    except jwt.InvalidIssuerError:
        try:
            return jwt.decode(
                token,
                key,
                algorithms=[alg],
                audience="authenticated",
                options={"verify_iss": False},
            )
        except jwt.InvalidAudienceError:
            return jwt.decode(
                token,
                key,
                algorithms=[alg],
                options={"verify_aud": False, "verify_iss": False},
            )


def _claims_admin(payload: dict[str, Any]) -> bool:
    am = payload.get("app_metadata") or {}
    um = payload.get("user_metadata") or {}
    if am.get("admin") is True or um.get("admin") is True:
        return True
    return False


def _email_allowlisted(payload: dict[str, Any]) -> bool:
    raw = (os.environ.get("ADMIN_EMAIL_ALLOWLIST") or "").strip()
    if not raw:
        return False
    allowed = {e.strip().lower() for e in raw.split(",") if e.strip()}
    email = (payload.get("email") or "").strip().lower()
    if not email:
        um = payload.get("user_metadata") or {}
        if isinstance(um, dict):
            email = (um.get("email") or "").strip().lower()
    return bool(email and email in allowed)


def _admin_users_rows_via_rest(
    base: str,
    user_id: str,
    apikey: str,
    bearer_token: str,
) -> list[Any]:
    q = f"{base}/rest/v1/admin_users?user_id=eq.{quote(user_id, safe='')}&select=user_id"
    r = httpx.get(
        q,
        headers={"apikey": apikey, "Authorization": f"Bearer {bearer_token}"},
        timeout=10.0,
    )
    r.raise_for_status()
    rows = r.json()
    return rows if isinstance(rows, list) else []


def _admin_users_table_has(user_id: str, user_jwt: str) -> bool:
    """True if user_id is in public.admin_users (RLS allows self-read with user JWT + anon key)."""
    base = supabase_project_url().rstrip("/")
    if not base:
        return False
    anon = (os.environ.get("SUPABASE_ANON_KEY") or "").strip()
    if anon and user_jwt:
        try:
            rows = _admin_users_rows_via_rest(base, user_id, anon, user_jwt)
            if len(rows) > 0:
                return True
        except Exception:
            pass
    service = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not service:
        return False
    try:
        rows = _admin_users_rows_via_rest(base, user_id, service, service)
        return len(rows) > 0
    except Exception:
        return False


def verify_admin_credentials(creds: HTTPAuthorizationCredentials | None) -> None:
    """Raise 401/403 if Bearer token is missing or user is not an admin."""
    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Bearer token.")
    got = (creds.credentials or "").strip()
    if not got:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Bearer token.")

    # HS256 tokens need the shared JWT secret; RS256/ES256 use JWKS at SUPABASE_URL
    try:
        _hdr = jwt.get_unverified_header(got)
        _alg = (_hdr.get("alg") or "HS256").upper()
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed access token.",
        ) from None
    if _alg.startswith("HS") and not _jwt_secret():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="SUPABASE_JWT_SECRET is required for admin API access (HS256 tokens).",
        )

    try:
        payload = _decode_supabase_jwt(got)
    except MissingCryptographyError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "JWT verification needs the `cryptography` package for Supabase RS256/ES256 tokens. "
                "Install pipeline deps: pip install -r requirements-pipeline.txt "
                '(must include PyJWT[crypto] or `pip install "cryptography"`). Then restart the API.'
            ),
        ) from e
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e),
        ) from e
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Access token expired. Refresh the page or sign out and sign in again.",
        ) from None
    except jwt.InvalidSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=(
                "JWT signature invalid — SUPABASE_JWT_SECRET does not match this Supabase project. "
                "Copy JWT signing secret from Supabase → Project Settings → API → JWT settings, "
                "set SUPABASE_JWT_SECRET in .env, restart the API."
            ),
        ) from None
    except jwt.PyJWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid access token ({e.__class__.__name__}).",
        ) from e

    sub = payload.get("sub")
    if not sub or not isinstance(sub, str):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing subject (sub).")

    if _claims_admin(payload):
        return
    if _email_allowlisted(payload):
        return
    if _admin_users_table_has(sub, got):
        return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=(
            "Signed in, but this account is not an admin. Add a row in public.admin_users for your user id, "
            "or set app_metadata.admin = true on the user in Supabase Auth, "
            "or set ADMIN_EMAIL_ALLOWLIST in server env."
        ),
    )


def require_admin(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_http_bearer)],
) -> None:
    verify_admin_credentials(creds)
