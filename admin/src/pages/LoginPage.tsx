import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";

/** Same-origin path only — avoids open redirects via ?next= */
function safeInternalPath(path: string | null): string | null {
  if (!path || typeof path !== "string") return null;
  const p = path.trim();
  if (!p.startsWith("/") || p.startsWith("//")) return null;
  return p;
}

function postLoginDestination(
  location: ReturnType<typeof useLocation>,
  searchParams: URLSearchParams,
): string {
  const next = safeInternalPath(searchParams.get("next"));
  let path = "/";
  if (next) path = next;
  else {
    const st = location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null;
    const from = st?.from;
    if (from?.pathname?.startsWith("/")) {
      path = `${from.pathname}${from.search ?? ""}${from.hash ?? ""}`;
    }
  }
  // Never send authenticated users back to the login screen
  if (path === "/login" || path.startsWith("/login?")) return "/";
  return path;
}

export function LoginPage() {
  const { ready, configured, session, signIn, error: bootErr } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Already signed in → always leave the login screen for the dashboard (Overview).
  if (ready && configured && session) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setPending(true);
    const { error } = await signIn(email, password);
    setPending(false);
    if (error) {
      setErr(
        /invalid login|invalid credentials/i.test(error)
          ? "Invalid email or password. Try lowercase email. Reset password in Supabase if needed."
          : error,
      );
      return;
    }
    navigate(postLoginDestination(location, searchParams), { replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[linear-gradient(165deg,oklch(97%_0.02_250)_0%,oklch(99%_0.008_250)_45%,oklch(96%_0.015_85)_100%)] px-4">
      <div className="w-full max-w-md rounded-2xl border border-[oklch(88%_0.02_250)] bg-white p-8 shadow-[0_24px_80px_oklch(0%_0_0/0.06)]">
        <div className="mb-8 text-center">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[oklch(45%_0.03_260)]">
            Go Ukraina
          </p>
          <h1 className="mt-2 font-semibold tracking-tight text-[oklch(22%_0.035_260)]">Sign in to admin</h1>
          <p className="mt-2 text-sm text-[oklch(45%_0.03_260)]">Supabase accounts with admin access only.</p>
        </div>
        {bootErr && (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {bootErr}
          </p>
        )}
        {!configured && ready && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
            {bootErr ? (
              bootErr
            ) : (
              <>
                Supabase client config failed. Set <code className="rounded bg-red-100 px-1">SUPABASE_URL</code> and{" "}
                <code className="rounded bg-red-100 px-1">SUPABASE_ANON_KEY</code> on the server (Vercel env or Edge
                secrets if you use <code className="rounded bg-red-100 px-1">VITE_SUPABASE_FUNCTIONS_URL</code>), then
                redeploy.
              </>
            )}
          </p>
        )}
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[oklch(40%_0.03_260)]">
              Email
            </span>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-[oklch(88%_0.02_250)] px-3 py-2.5 text-sm outline-none ring-[oklch(52%_0.14_252)] focus:ring-2"
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[oklch(40%_0.03_260)]">
              Password
            </span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-[oklch(88%_0.02_250)] px-3 py-2.5 text-sm outline-none ring-[oklch(52%_0.14_252)] focus:ring-2"
              required
            />
          </label>
          {err && <p className="text-sm text-red-700">{err}</p>}
          <button
            type="submit"
            disabled={pending || !configured}
            className="rounded-lg bg-[oklch(48%_0.12_252)] px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[oklch(42%_0.13_252)] disabled:opacity-50"
          >
            {pending ? "Signing in…" : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
