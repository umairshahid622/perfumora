import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Icon, type IconName } from "../components/Icon";
import { useAuth } from "../auth/context";
import { cn } from "../lib/cn";

/* App shell for every authenticated page: a dark slate sidebar (pinned on
   desktop, slide-over on mobile) + the routed content. Kept deliberately plain
   — this is a working tool, not a showcase. */

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  /** Only match exactly (for the index route). */
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: "dashboard", end: true },
  { to: "/fragrances", label: "Fragrances", icon: "droplet" },
  { to: "/orders", label: "Orders", icon: "bag" },
];

export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Mobile sidebar toggle. On desktop the sidebar is always visible, so
          this only exists below lg. */}
      <button
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
        aria-expanded={mobileOpen}
        className="fixed left-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:text-slate-900 lg:hidden"
      >
        <Icon name="menu" className="h-5 w-5" />
      </button>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden animate-fade-in"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-slate-900 text-slate-300 transition-transform lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center gap-2.5 border-b border-white/10 px-6">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white">
            <Icon name="droplet" className="h-5 w-5" />
          </span>
          <div className="leading-tight">
            <p className="font-semibold text-white">Perfumora</p>
            <p className="text-xs text-slate-400">Admin</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-accent text-white"
                    : "text-slate-300 hover:bg-white/5 hover:text-white",
                )
              }
            >
              <Icon name={item.icon} className="h-5 w-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Storefront link — sits below nav, above user section */}
        <div className="border-t border-white/10 px-3 py-3">
          <a
            href="http://localhost:3000"
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
          >
            <Icon name="eye" className="h-5 w-5" />
            View storefront
          </a>
        </div>

        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-3 rounded-lg px-3 py-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white">
              {user?.name?.charAt(0) ?? "A"}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-medium text-white">
                {user?.name}
              </p>
              <p className="truncate text-xs text-slate-400">{user?.email}</p>
            </div>
            <button
              onClick={() => void handleLogout()}
              aria-label="Log out"
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <Icon name="logout" className="h-5 w-5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="lg:pl-64">
        <main className="px-4 pb-6 pt-16 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
