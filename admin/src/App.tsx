import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { AnalyticsPage } from "@/pages/AnalyticsPage";
import { AuthorPage } from "@/pages/AuthorPage";
import { BlogEditorPage } from "@/pages/BlogEditorPage";
import { BlogListPage } from "@/pages/BlogListPage";
import { LoginPage } from "@/pages/LoginPage";
import { MediaPage } from "@/pages/MediaPage";
import { NavEditorPage } from "@/pages/NavEditorPage";
import { OverviewPage } from "@/pages/OverviewPage";
import { SeoPage } from "@/pages/SeoPage";
import { SiteSettingsPage } from "@/pages/SiteSettingsPage";

/**
 * Auth model (same-origin SPA):
 * - Public: `/admin/login` only (no shell, no API calls that need a user).
 * - Protected: everything else under `/admin/*` — requires Supabase session; route guard redirects
 *   to login with `state.from` so we return after sign-in (Lovable-style).
 * - API authorization is still enforced server-side (JWT + admin allowlist); the UI gate is UX only.
 */
function RequireSession() {
  const { ready, session, configured } = useAuth();
  const location = useLocation();

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[oklch(98%_0.01_250)]">
        <div className="text-center">
          <p className="text-sm font-medium text-[oklch(40%_0.03_260)]">Loading session…</p>
          <p className="mt-2 text-xs text-[oklch(50%_0.03_260)]">Checking Supabase auth</p>
        </div>
      </div>
    );
  }
  if (!configured) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
}

export default function App() {
  return (
    <Routes>
      {/* Public: sign-in only (full URL: /admin/login with basename) */}
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireSession />}>
        <Route element={<DashboardLayout />}>
          <Route index element={<OverviewPage />} />
          <Route path="blog" element={<BlogListPage />} />
          <Route path="blog/:slug" element={<BlogEditorPage />} />
          <Route path="media" element={<MediaPage />} />
          <Route path="settings" element={<SiteSettingsPage />} />
          <Route path="seo" element={<SeoPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="nav" element={<NavEditorPage />} />
          <Route path="author" element={<AuthorPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
