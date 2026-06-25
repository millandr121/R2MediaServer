import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { FullPageSpinner } from "./components/ui";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Drive } from "./pages/Drive";
import { SharesPage } from "./pages/SharesPage";
import { PublicShare } from "./pages/PublicShare";
import { StorePage } from "./pages/StorePage";
import { StockDetail } from "./pages/StockDetail";
import { StockSuccess } from "./pages/StockSuccess";
import { StockAdmin } from "./pages/StockAdmin";
import { IntakePage } from "./pages/IntakePage";
import { NotFound } from "./pages/NotFound";

function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function RequireAdmin({ children }: { children: JSX.Element }) {
  const { isAdmin, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (!isAdmin) return <Navigate to="/drive" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />
      <Route path="/s/:token" element={<PublicShare />} />
      <Route path="/stock" element={<StorePage />} />
      <Route path="/stock/success" element={<StockSuccess />} />
      <Route path="/stock/:id" element={<StockDetail />} />

      {/* Authenticated app shell */}
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/drive" replace />} />
          <Route path="/drive" element={<Drive />} />
          <Route path="/drive/:folderId" element={<Drive />} />
          <Route path="/shares" element={<SharesPage />} />
          <Route path="/intake" element={<RequireAdmin><IntakePage /></RequireAdmin>} />
          <Route path="/stock/admin" element={<RequireAdmin><StockAdmin /></RequireAdmin>} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
