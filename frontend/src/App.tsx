import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import AppLayout from "./components/layout/AppLayout";
import { PageLoader } from "./components/ui";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import TicketsList from "./pages/TicketsList";
import TicketCreate from "./pages/TicketCreate";
import TicketDetail from "./pages/TicketDetail";
import Notifications from "./pages/Notifications";
import Profile from "./pages/Profile";
import Users from "./pages/admin/Users";
import Companies from "./pages/admin/Companies";
import Departments from "./pages/admin/Departments";
import Categories from "./pages/catalogs/Categories";
import Priorities from "./pages/catalogs/Priorities";
import Statuses from "./pages/catalogs/Statuses";
import Reports from "./pages/Reports";
import Audit from "./pages/Audit";
import Settings from "./pages/Settings";
import type { ReactNode } from "react";
import type { RoleCode } from "./types";

function Protected({ children, roles }: { children: ReactNode; roles?: RoleCode[] }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role.code as RoleCode)) {
    return <Navigate to="/" replace />;
  }
  return <AppLayout>{children}</AppLayout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/tickets" element={<Protected><TicketsList /></Protected>} />
      <Route path="/tickets/new" element={<Protected><TicketCreate /></Protected>} />
      <Route path="/tickets/:id" element={<Protected><TicketDetail /></Protected>} />
      <Route path="/notifications" element={<Protected><Notifications /></Protected>} />
      <Route path="/profile" element={<Protected><Profile /></Protected>} />

      <Route path="/admin/users" element={<Protected roles={["MASTER"]}><Users /></Protected>} />
      <Route path="/admin/companies" element={<Protected roles={["MASTER"]}><Companies /></Protected>} />
      <Route path="/admin/departments" element={<Protected roles={["MASTER"]}><Departments /></Protected>} />
      <Route path="/catalogs/categories" element={<Protected roles={["MASTER"]}><Categories /></Protected>} />
      <Route path="/catalogs/priorities" element={<Protected roles={["MASTER"]}><Priorities /></Protected>} />
      <Route path="/catalogs/statuses" element={<Protected roles={["MASTER"]}><Statuses /></Protected>} />
      <Route path="/reports" element={<Protected roles={["MASTER"]}><Reports /></Protected>} />
      <Route path="/audit" element={<Protected roles={["MASTER"]}><Audit /></Protected>} />
      <Route path="/settings" element={<Protected roles={["MASTER"]}><Settings /></Protected>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
