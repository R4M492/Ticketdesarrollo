export type RoleCode = "MASTER" | "TECNICO" | "USUARIO";

export interface Role {
  id: number;
  code: RoleCode;
  name: string;
  description?: string | null;
}

export interface Company {
  id: number;
  name: string;
  description?: string | null;
  status: "ACTIVE" | "INACTIVE";
  _count?: { departments: number };
}

export interface Department {
  id: number;
  companyId: number;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  company?: Company;
}

export interface User {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  position?: string | null;
  roleId: number;
  role: Role;
  companyId?: number | null;
  company?: Company | null;
  departmentId?: number | null;
  department?: Department | null;
  status: "ACTIVE" | "INACTIVE";
  avatarUrl?: string | null;
  lastLoginAt?: string | null;
  createdAt: string;
}

export interface Category {
  id: number;
  name: string;
  description?: string | null;
  sortOrder: number;
  status: "ACTIVE" | "INACTIVE";
  subcategories?: Subcategory[];
}

export interface Subcategory {
  id: number;
  categoryId: number;
  name: string;
  sortOrder: number;
  status: "ACTIVE" | "INACTIVE";
  category?: Category;
}

export interface Priority {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  color: string;
  sortOrder: number;
  status: "ACTIVE" | "INACTIVE";
  sla?: SlaConfig | null;
}

export interface SlaConfig {
  id: number;
  priorityId: number;
  responseMinutes: number;
  resolutionHours: number;
  active: boolean;
}

export interface TicketStatus {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  color: string;
  sortOrder: number;
  isClosed: boolean;
  status: "ACTIVE" | "INACTIVE";
}

export type SlaIndicator = "normal" | "proximo" | "vencido" | "sin-sla";

export interface Ticket {
  id: number;
  ticketNumber: string;
  userId: number;
  user: { id: number; name: string; email: string };
  subject: string;
  categoryId: number;
  category: Category;
  subcategoryId?: number | null;
  subcategory?: Subcategory | null;
  priorityId: number;
  priority: Priority;
  statusId: number;
  status: TicketStatus;
  description: string;
  location?: string | null;
  device?: string | null;
  inventoryNumber?: string | null;
  requesterName: string;
  requesterEmail: string;
  requesterPhone?: string | null;
  companyId?: number | null;
  company?: Company | null;
  departmentId?: number | null;
  department?: Department | null;
  assignedTechnicianId?: number | null;
  assignedTechnician?: { id: number; name: string } | null;
  firstResponseAt?: string | null;
  resolvedAt?: string | null;
  closedAt?: string | null;
  reopenedCount: number;
  slaResponseDueAt?: string | null;
  slaResolutionDueAt?: string | null;
  createdAt: string;
  updatedAt: string;
  sla: SlaIndicator;
  attachments?: TicketAttachment[];
}

export interface TicketAttachment {
  id: number;
  ticketId: number;
  commentId?: number | null;
  userId: number;
  user?: { id: number; name: string };
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface TimelineItem {
  id: string;
  kind: "history" | "comment" | "assignment" | "solution";
  title: string;
  description?: string;
  user?: { id: number; name: string } | null;
  createdAt: string;
  meta?: {
    action?: string;
    oldValue?: string | null;
    newValue?: string | null;
    attachments?: TicketAttachment[];
    isReassign?: boolean;
    reason?: string | null;
    timeUsedMinutes?: number | null;
  };
}

export interface Notification {
  id: number;
  userId: number;
  ticketId?: number | null;
  ticket?: { id: number; ticketNumber: string; subject: string } | null;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DashboardSummary {
  total: number;
  nuevos: number;
  pendientes: number;
  asignados: number;
  enProceso: number;
  espera: number;
  resueltos: number;
  cerrados: number;
  reabiertos: number;
  cancelados: number;
  vencidos: number;
  avgResolutionMinutes: number;
  resolvedThisMonth: number;
}

export interface ChartDatum {
  [key: string]: string | number;
}

export interface AuditLog {
  id: number;
  userId?: number | null;
  user?: { id: number; name: string; email: string } | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  description: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
}
