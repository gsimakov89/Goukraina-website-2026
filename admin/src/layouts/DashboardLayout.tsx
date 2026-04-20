import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";

const nav = [
  { to: "/", label: "Overview", end: true },
  { to: "/blog", label: "Blog" },
  { to: "/media", label: "Media" },
  { to: "/nav", label: "Navigation" },
  { to: "/author", label: "Author card" },
  { to: "/settings", label: "Site & tracking" },
  { to: "/seo", label: "SEO tools" },
  { to: "/analytics", label: "Analytics" },
];

export function DashboardLayout() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b border-[oklch(88%_0.02_250)] bg-[linear-gradient(180deg,oklch(32%_0.07_252)_0%,oklch(28%_0.065_250)_100%)] text-white md:w-60 md:shrink-0 md:border-b-0 md:border-r">
        <div className="border-b border-white/10 px-5 py-6">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-[oklch(78%_0.06_250)]">
            Go Ukraina
          </p>
          <h1 className="mt-1 font-semibold tracking-tight text-white">Website admin</h1>
          <p className="mt-0.5 text-xs text-[oklch(82%_0.04_250)]">Field reports & site settings</p>
        </div>
        <nav className="flex flex-wrap gap-1 px-2 py-3 md:flex-col md:gap-0.5">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                [
                  "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-white/12 text-white"
                    : "text-[oklch(88%_0.04_250)] hover:bg-white/8 hover:text-white",
                ].join(" ")
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 px-2 pb-3 pt-2 md:hidden">
          <button
            type="button"
            onClick={async () => {
              await signOut();
              navigate("/login", { replace: true });
            }}
            className="w-full rounded-lg border border-white/20 px-3 py-2 text-sm font-medium text-white/90 hover:bg-white/10"
          >
            Sign out
          </button>
        </div>
        <div className="mt-auto hidden p-4 md:block">
          <button
            type="button"
            onClick={async () => {
              await signOut();
              navigate("/login", { replace: true });
            }}
            className="w-full rounded-lg border border-white/20 px-3 py-2 text-sm font-medium text-white/90 hover:bg-white/10"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="min-h-screen flex-1 bg-[oklch(99%_0.008_250)]">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
