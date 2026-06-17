import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-ink-950 px-4 text-center">
      <p className="text-5xl font-bold text-ink-600">404</p>
      <h1 className="text-lg font-semibold text-slate-900">Page not found</h1>
      <p className="max-w-sm text-sm text-slate-400">
        The page you're looking for doesn't exist or may have been moved.
      </p>
      <Link to="/" className="btn-primary mt-2">
        Go home
      </Link>
    </div>
  );
}
