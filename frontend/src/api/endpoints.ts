import { api } from "./client";
import type {
  AuditLog,
  Category,
  ChartDatum,
  Company,
  DashboardSummary,
  Department,
  Notification,
  Paginated,
  Priority,
  Subcategory,
  Ticket,
  TicketStatus,
  TimelineItem,
  User,
} from "../types";

// ---------- Auth ----------
export const authApi = {
  login: (email: string, password: string, rememberMe: boolean) =>
    api.post("/auth/login", { email, password, rememberMe }),
  logout: () => api.post("/auth/logout"),
  me: () => api.get("/auth/me").then((r) => r.data as User),
  forgotPassword: (email: string) => api.post("/auth/forgot-password", { email }),
  resetPassword: (token: string, password: string) =>
    api.post("/auth/reset-password", { token, password }),
  updateProfile: (data: { name?: string; phone?: string | null; position?: string | null }) =>
    api.put("/auth/profile", data).then((r) => r.data as User),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.put("/auth/password", { currentPassword, newPassword }),
};

// ---------- Catálogos ----------
export const catalogApi = {
  companies: () => api.get("/companies").then((r) => r.data as Company[]),
  createCompany: (data: Partial<Company>) => api.post("/companies", data),
  updateCompany: (id: number, data: Partial<Company>) => api.put(`/companies/${id}`, data),
  deleteCompany: (id: number) => api.delete(`/companies/${id}`),
  departments: (companyId?: number) =>
    api.get("/departments", { params: { companyId } }).then((r) => r.data as Department[]),
  createDepartment: (data: { companyId: number; name: string }) => api.post("/departments", data),
  updateDepartment: (id: number, data: Partial<Department>) => api.put(`/departments/${id}`, data),
  deleteDepartment: (id: number) => api.delete(`/departments/${id}`),
  categories: () => api.get("/categories").then((r) => r.data as Category[]),
  createCategory: (data: { name: string; description?: string }) => api.post("/categories", data),
  updateCategory: (id: number, data: Partial<Category>) => api.put(`/categories/${id}`, data),
  deleteCategory: (id: number) => api.delete(`/categories/${id}`),
  createSubcategory: (data: { categoryId: number; name: string }) => api.post("/categories/subcategories", data),
  updateSubcategory: (id: number, data: Partial<Subcategory>) => api.put(`/categories/subcategories/${id}`, data),
  deleteSubcategory: (id: number) => api.delete(`/categories/subcategories/${id}`),
  priorities: () => api.get("/priorities").then((r) => r.data as Priority[]),
  createPriority: (data: Partial<Priority>) => api.post("/priorities", data),
  updatePriority: (id: number, data: Partial<Priority>) => api.put(`/priorities/${id}`, data),
  deletePriority: (id: number) => api.delete(`/priorities/${id}`),
  updateSla: (priorityId: number, data: { responseMinutes: number; resolutionHours: number; active: boolean }) =>
    api.put(`/priorities/${priorityId}/sla`, data),
  statuses: () => api.get("/statuses").then((r) => r.data as TicketStatus[]),
  createStatus: (data: Partial<TicketStatus>) => api.post("/statuses", data),
  updateStatus: (id: number, data: Partial<TicketStatus>) => api.put(`/statuses/${id}`, data),
};

// ---------- Usuarios ----------
export const usersApi = {
  list: (params?: Record<string, unknown>) =>
    api.get("/users", { params }).then((r) => r.data as Paginated<User>),
  technicians: () => api.get("/users/technicians").then((r) => r.data as User[]),
  create: (data: Record<string, unknown>) => api.post("/users", data),
  update: (id: number, data: Record<string, unknown>) => api.put(`/users/${id}`, data),
  setStatus: (id: number, status: "ACTIVE" | "INACTIVE") => api.patch(`/users/${id}/status`, { status }),
  resetPassword: (id: number, password: string) => api.post(`/users/${id}/reset-password`, { password }),
};

// ---------- Tickets ----------
export interface TicketFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  statusId?: number;
  statusCode?: string;
  priorityId?: number;
  categoryId?: number;
  technicianId?: number;
  companyId?: number;
  from?: string;
  to?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  sla?: string;
}

export const ticketsApi = {
  list: (params?: TicketFilters) => api.get("/tickets", { params }).then((r) => r.data as Paginated<Ticket>),
  get: (id: number) => api.get(`/tickets/${id}`).then((r) => r.data as Ticket),
  history: (id: number) => api.get(`/tickets/${id}/history`).then((r) => r.data as TimelineItem[]),
  create: (form: FormData) =>
    api.post("/tickets", form, { headers: { "Content-Type": "multipart/form-data" } }).then((r) => r.data as Ticket),
  update: (id: number, data: { subject?: string; description?: string }) => api.patch(`/tickets/${id}`, data),
  addComment: (id: number, form: FormData) =>
    api
      .post(`/tickets/${id}/comments`, form, { headers: { "Content-Type": "multipart/form-data" } })
      .then((r) => r.data),
  assign: (id: number, technicianId: number, reason?: string) =>
    api.post(`/tickets/${id}/assign`, { technicianId, reason }),
  reassign: (id: number, technicianId: number, reason?: string) =>
    api.post(`/tickets/${id}/reassign`, { technicianId, reason }),
  changeStatus: (id: number, status: string, comment?: string) =>
    api.post(`/tickets/${id}/status`, { status, comment }),
  resolve: (id: number, data: Record<string, unknown>) => api.post(`/tickets/${id}/resolve`, data),
  confirm: (id: number) => api.post(`/tickets/${id}/confirm`),
  reopen: (id: number, reason: string) => api.post(`/tickets/${id}/reopen`, { reason }),
  cancel: (id: number) => api.post(`/tickets/${id}/cancel`),
  attachmentUrl: (ticketId: number, fileId: number) => `/api/tickets/${ticketId}/attachments/${fileId}`,
};

// ---------- Notificaciones ----------
export const notificationsApi = {
  list: (params?: { page?: number; pageSize?: number; unreadOnly?: boolean }) =>
    api.get("/notifications", { params }).then((r) => r.data as Paginated<Notification>),
  unreadCount: () => api.get("/notifications/unread-count").then((r) => r.data as { count: number }),
  markRead: (id: number) => api.post(`/notifications/${id}/read`),
  markAllRead: () => api.post("/notifications/read-all"),
};

// ---------- Dashboard ----------
export const dashboardApi = {
  summary: () => api.get("/dashboard/summary").then((r) => r.data as DashboardSummary),
  byStatus: () => api.get("/dashboard/by-status").then((r) => r.data as ChartDatum[]),
  byPriority: () => api.get("/dashboard/by-priority").then((r) => r.data as ChartDatum[]),
  byCategory: () => api.get("/dashboard/by-category").then((r) => r.data as ChartDatum[]),
  byTechnician: () => api.get("/dashboard/by-technician").then((r) => r.data as ChartDatum[]),
  perDay: () => api.get("/dashboard/per-day").then((r) => r.data as ChartDatum[]),
  avgResolution: () => api.get("/dashboard/avg-resolution").then((r) => r.data as ChartDatum[]),
};

// ---------- Reportes ----------
export const reportsApi = {
  tickets: (params?: Record<string, unknown>) => api.get("/reports/tickets", { params }).then((r) => r.data),
  productivity: (params?: Record<string, unknown>) => api.get("/reports/productivity", { params }).then((r) => r.data),
  sla: (params?: Record<string, unknown>) => api.get("/reports/sla", { params }).then((r) => r.data),
  companies: (params?: Record<string, unknown>) => api.get("/reports/companies", { params }).then((r) => r.data),
  exportUrl: (params?: Record<string, unknown>) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return `/api/reports/export${qs ? `?${qs}` : ""}`;
  },
};

// ---------- Auditoría ----------
export const auditApi = {
  list: (params?: Record<string, unknown>) =>
    api.get("/audit-logs", { params }).then((r) => r.data as Paginated<AuditLog>),
  actions: () => api.get("/audit-logs/actions").then((r) => r.data as string[]),
};

// ---------- Configuración ----------
export const settingsApi = {
  get: () => api.get("/settings").then((r) => r.data as Record<string, string>),
  update: (data: Record<string, unknown>) => api.put("/settings", data).then((r) => r.data as Record<string, string>),
};
