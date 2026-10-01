import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Ticket,
  PlusCircle,
  Bell,
  User as UserIcon,
  Users,
  Building2,
  FolderTree,
  ListOrdered,
  BarChart3,
  ShieldCheck,
  Settings as SettingsIcon,
  LogOut,
  Menu,
  X,
  Headset,
  ChevronDown,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { notificationsApi } from "../../api/endpoints";
import { timeAgo } from "../../utils/format";
import type { Notification, RoleCode } from "../../types";

interface MenuItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}

const baseItems: Record<RoleCode, MenuItem[]> = {
  MASTER: [
    { to: "/", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" />, end: true },
    { to: "/tickets", label: "Tickets", icon: <Ticket className="h-4 w-4" /> },
    { to: "/tickets/new", label: "Nuevo ticket", icon: <PlusCircle className="h-4 w-4" /> },
  ],
  TECNICO: [
    { to: "/", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" />, end: true },
    { to: "/tickets", label: "Mis tickets", icon: <Ticket className="h-4 w-4" /> },
  ],
  USUARIO: [
    { to: "/", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" />, end: true },
    { to: "/tickets", label: "Mis tickets", icon: <Ticket className="h-4 w-4" /> },
    { to: "/tickets/new", label: "Crear ticket", icon: <PlusCircle className="h-4 w-4" /> },
  ],
};

const masterExtra: { group: string; items: MenuItem[] }[] = [
  {
    group: "Usuarios",
    items: [
      { to: "/admin/users", label: "Usuarios", icon: <Users className="h-4 w-4" /> },
      { to: "/admin/companies", label: "Empresas", icon: <Building2 className="h-4 w-4" /> },
      { to: "/admin/departments", label: "Departamentos", icon: <Building2 className="h-4 w-4" /> },
    ],
  },
  {
    group: "Catálogos",
    items: [
      { to: "/catalogs/categories", label: "Categorías", icon: <FolderTree className="h-4 w-4" /> },
      { to: "/catalogs/priorities", label: "Prioridades / SLA", icon: <ListOrdered className="h-4 w-4" /> },
      { to: "/catalogs/statuses", label: "Estados", icon: <ListOrdered className="h-4 w-4" /> },
    ],
  },
  {
    group: "Reportes",
    items: [
      { to: "/reports", label: "Reportes", icon: <BarChart3 className="h-4 w-4" /> },
      { to: "/audit", label: "Auditoría", icon: <ShieldCheck className="h-4 w-4" /> },
      { to: "/settings", label: "Configuración", icon: <SettingsIcon className="h-4 w-4" /> },
    ],
  },
];

const commonBottom: MenuItem[] = [
  { to: "/notifications", label: "Notificaciones", icon: <Bell className="h-4 w-4" /> },
  { to: "/profile", label: "Mi perfil", icon: <UserIcon className="h-4 w-4" /> },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [count, list] = await Promise.all([notificationsApi.unreadCount(), notificationsApi.list({ pageSize: 6 })]);
        setUnread((prev) => (prev === count.count ? prev : count.count));
        setNotifs((prev) => (JSON.stringify(prev) === JSON.stringify(list.data) ? prev : list.data));
      } catch {
        // sin sesión
      }
    };
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!user) return null;
  const role = user.role.code as RoleCode;

  const items = [...baseItems[role], ...(role === "MASTER" ? [] : commonBottom)];
  const allItems = role === "MASTER" ? [...items, ...masterExtra.flatMap((g) => g.items), ...commonBottom] : items;

  const markAllRead = async () => {
    await notificationsApi.markAllRead();
    setUnread(0);
    setNotifs((n) => n.map((x) => ({ ...x, isRead: true })));
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2 border-b border-slate-700/50 px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
          <Headset className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-bold text-white">HelpDesk</p>
          <p className="text-[10px] text-slate-400">Soporte técnico</p>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {role === "MASTER" ? (
          <>
            {baseItems[role].map((it) => (
              <SideLink key={it.to} item={it} onClick={() => setSidebarOpen(false)} />
            ))}
            {masterExtra.map((g) => (
              <div key={g.group} className="mt-4">
                <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{g.group}</p>
                {g.items.map((it) => (
                  <SideLink key={it.to} item={it} onClick={() => setSidebarOpen(false)} />
                ))}
              </div>
            ))}
            <div className="mt-4">
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">General</p>
              {commonBottom.map((it) => (
                <SideLink key={it.to} item={it} onClick={() => setSidebarOpen(false)} />
              ))}
            </div>
          </>
        ) : (
          <>
            {items.map((it) => (
              <SideLink key={it.to} item={it} onClick={() => setSidebarOpen(false)} />
            ))}
          </>
        )}
      </nav>
      <div className="border-t border-slate-700/50 p-3">
        <button
          onClick={async () => {
            await logout();
            navigate("/login");
          }}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-700/50 hover:text-white"
        >
          <LogOut className="h-4 w-4" /> Cerrar sesión
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-slate-900 lg:block">{sidebar}</aside>

      {/* Sidebar móvil */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-slate-900">
            <button className="absolute right-3 top-4 text-slate-400" onClick={() => setSidebarOpen(false)}>
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        {/* Header */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm lg:px-6">
          <div className="flex items-center gap-3">
            <button className="rounded p-2 text-slate-500 hover:bg-slate-100 lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-sm font-semibold text-slate-700 lg:text-base">Sistema de Tickets de Soporte</h1>
          </div>

          <div className="flex items-center gap-2">
            {/* Notificaciones */}
            <div className="relative" ref={bellRef}>
              <button
                className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                onClick={() => setNotifOpen((v) => !v)}
              >
                <Bell className="h-5 w-5" />
                {unread > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 top-11 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
                    <p className="text-sm font-semibold text-slate-700">Notificaciones</p>
                    <button className="text-xs text-brand-600 hover:underline" onClick={markAllRead}>
                      Marcar todas leídas
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifs.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-400">Sin notificaciones</p>}
                    {notifs.map((n) => (
                      <button
                        key={n.id}
                        className={`block w-full border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50 ${!n.isRead ? "bg-brand-50/50" : ""}`}
                        onClick={() => {
                          notificationsApi.markRead(n.id).catch(() => undefined);
                          setUnread((u) => Math.max(0, u - (n.isRead ? 0 : 1)));
                          setNotifs((arr) => arr.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
                          setNotifOpen(false);
                          if (n.ticketId) navigate(`/tickets/${n.ticketId}`);
                        }}
                      >
                        <p className="text-xs font-semibold text-slate-700">{n.title}</p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{n.message}</p>
                        <p className="mt-1 text-[10px] text-slate-400">{timeAgo(n.createdAt)}</p>
                      </button>
                    ))}
                  </div>
                  <button
                    className="block w-full border-t border-slate-100 px-4 py-2 text-center text-xs font-medium text-brand-600 hover:bg-slate-50"
                    onClick={() => {
                      setNotifOpen(false);
                      navigate("/notifications");
                    }}
                  >
                    Ver todas
                  </button>
                </div>
              )}
            </div>

            {/* Menú de usuario */}
            <div className="relative" ref={userMenuRef}>
              <button
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-100"
                onClick={() => setUserMenuOpen((v) => !v)}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="hidden text-left sm:block">
                  <p className="text-xs font-semibold text-slate-700">{user.name}</p>
                  <p className="text-[10px] text-slate-400">{user.role.name}</p>
                </div>
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 top-11 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                  <button
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                    onClick={() => {
                      setUserMenuOpen(false);
                      navigate("/profile");
                    }}
                  >
                    <UserIcon className="h-4 w-4" /> Mi perfil
                  </button>
                  <button
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                    onClick={async () => {
                      await logout();
                      navigate("/login");
                    }}
                  >
                    <LogOut className="h-4 w-4" /> Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

function SideLink({ item, onClick }: { item: MenuItem; onClick?: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onClick}
      className={({ isActive }) =>
        `mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
          isActive ? "bg-brand-600 text-white" : "text-slate-300 hover:bg-slate-700/50 hover:text-white"
        }`
      }
    >
      {item.icon}
      {item.label}
    </NavLink>
  );
}
