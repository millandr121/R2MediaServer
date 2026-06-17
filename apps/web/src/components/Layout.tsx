import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { HardDrive, Share2, Store, LogOut, Menu, X, Settings } from "lucide-react";
import { useAuth } from "../lib/auth";
import { UploadTray } from "./UploadTray";

function NavItem({ to, icon, label, onClick }: { to: string; icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <NavLink
      to={to}
      end
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          isActive ? "bg-accent/10 text-accent" : "text-slate-400 hover:bg-ink-800 hover:text-slate-900"
        }`
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}

export function Layout() {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const onLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      <NavItem to="/drive" icon={<HardDrive className="h-4 w-4" />} label="My Drive" onClick={() => setOpen(false)} />
      <NavItem to="/shares" icon={<Share2 className="h-4 w-4" />} label="Shares" onClick={() => setOpen(false)} />
      <NavItem to="/stock" icon={<Store className="h-4 w-4" />} label="Store" onClick={() => setOpen(false)} />
      {isAdmin && (
        <NavItem
          to="/stock/admin"
          icon={<Settings className="h-4 w-4" />}
          label="Manage store"
          onClick={() => setOpen(false)}
        />
      )}
    </nav>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-ink-950">
      {/* Sidebar (desktop) */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-ink-800 bg-ink-900 py-5 md:flex">
        <Link to="/drive" className="mb-6 flex items-center gap-2 px-5">
          <img src="/cloud1.png" alt="" className="h-9 w-9 object-contain" />
          <img src="/drive1.png" alt="Drive" className="h-6 object-contain" />
        </Link>
        {nav}
        <div className="mt-auto border-t border-ink-800 px-3 pt-4">
          <div className="px-2 pb-3">
            <p className="truncate text-sm font-medium text-slate-800">{user?.displayName ?? user?.email}</p>
            <p className="truncate text-xs text-slate-500">{isAdmin ? "Administrator" : "Member"}</p>
          </div>
          <button onClick={onLogout} className="btn-ghost w-full justify-start">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col border-r border-ink-800 bg-ink-900 py-5">
            <div className="mb-6 flex items-center justify-between px-5">
              <span className="flex items-center gap-2">
                <img src="/cloud1.png" alt="" className="h-8 w-8 object-contain" />
                <img src="/drive1.png" alt="Drive" className="h-6 object-contain" />
              </span>
              <button onClick={() => setOpen(false)} className="btn-ghost h-8 w-8 !p-0">
                <X className="h-4 w-4" />
              </button>
            </div>
            {nav}
            <div className="mt-auto border-t border-ink-800 px-3 pt-4">
              <button onClick={onLogout} className="btn-ghost w-full justify-start">
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          </aside>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-3 border-b border-ink-800 px-4 py-3 md:hidden">
          <button onClick={() => setOpen(true)} className="btn-ghost h-9 w-9 !p-0">
            <Menu className="h-5 w-5" />
          </button>
          <span className="flex items-center gap-2">
            <img src="/cloud1.png" alt="" className="h-7 w-7 object-contain" />
            <img src="/drive1.png" alt="Drive" className="h-5 object-contain" />
          </span>
        </header>
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      <UploadTray />
    </div>
  );
}
