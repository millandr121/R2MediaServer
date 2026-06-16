import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "../lib/auth";
import { api, ApiError } from "../lib/api";
import { Spinner, toast } from "../components/ui";

export function Login() {
  const { user, loading, login, setup } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "setup" | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.auth
      .status()
      .then((s) => setMode(s.needsSetup ? "setup" : "login"))
      .catch(() => setMode("login"));
  }, []);

  if (!loading && user) return <Navigate to="/drive" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "setup") await setup(email, password, name || undefined);
      else await login(email, password);
      navigate("/drive", { replace: true });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Something went wrong", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-pink shadow-sm">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Vault</h1>
          <p className="mt-1 text-sm text-slate-400">
            {mode === "setup" ? "Create your admin account to get started" : "Sign in to your media server"}
          </p>
        </div>

        {mode === null ? (
          <div className="flex justify-center py-8">
            <Spinner className="h-6 w-6 text-accent" />
          </div>
        ) : (
          <form onSubmit={submit} className="card space-y-4 p-6">
            {mode === "setup" && (
              <div>
                <label className="label">Display name</label>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Andrew Miller"
                />
              </div>
            )}
            <div>
              <label className="label">Email</label>
              <input
                className="input"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                className="input"
                type="password"
                required
                minLength={mode === "setup" ? 8 : undefined}
                autoComplete={mode === "setup" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "setup" ? "At least 8 characters" : "••••••••"}
              />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy && <Spinner className="h-4 w-4" />}
              {mode === "setup" ? "Create account" : "Sign in"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-slate-600">
          Cloudflare R2 · zero-egress media delivery
        </p>
      </div>
    </div>
  );
}
