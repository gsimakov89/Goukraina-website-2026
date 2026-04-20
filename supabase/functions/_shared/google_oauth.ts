import { importPKCS8, SignJWT } from "https://esm.sh/jose@5.9.6";
import { getMergedAnalyticsConfig } from "./analytics_config.ts";

export async function getGoogleAccessToken(scopes: string | string[]): Promise<string | null> {
  const m = await getMergedAnalyticsConfig();
  const raw = (m.ga4_service_account_json || "").trim();
  if (!raw) return null;
  let sa: { private_key?: string; client_email?: string };
  try {
    sa = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!sa.private_key || !sa.client_email) return null;

  const scopeStr = Array.isArray(scopes) ? scopes.join(" ") : scopes;
  const pem = String(sa.private_key).replace(/\\n/g, "\n");
  const key = await importPKCS8(pem, "RS256");
  const now = Math.floor(Date.now() / 1000);

  const jwt = await new SignJWT({ scope: scopeStr })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const json = (await r.json()) as { access_token?: string; error_description?: string };
  if (!r.ok) throw new Error(json.error_description || "Token exchange failed");
  return json.access_token ?? null;
}
