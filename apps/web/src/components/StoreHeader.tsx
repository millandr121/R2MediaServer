import { Link } from "react-router-dom";
import { ShieldCheck, LayoutDashboard } from "lucide-react";
import { useAuth } from "../lib/auth";

export function StoreHeader() {
  const { user, isAdmin } = useAuth();
  return (
    <header className="border-b border-ink-800 bg-ink-900/60 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-2.5 px-5 py-4">
        <Link to="/stock" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-night bg-gradient-to-br from-accent to-pink shadow-[2px_2px_0_#1c1917]">
            <ShieldCheck className="h-5 w-5 text-white" />
          </div>
          <span className="font-display text-lg font-bold text-slate-900">Drive Store</span>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <Link to={isAdmin ? "/stock/admin" : "/drive"} className="btn-outline h-9">
              <LayoutDashboard className="h-4 w-4" />
              {isAdmin ? "Manage" : "Dashboard"}
            </Link>
          ) : (
            <Link to="/login" className="btn-ghost h-9">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
