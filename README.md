
# 🎫 HelpDesk — Sistema de Gestión de Tickets de Soporte Técnico

Plataforma web profesional para gestionar incidentes y solicitudes de soporte técnico:

**Usuario → crea ticket → Jefe de Soporte asigna técnico → Técnico atiende → Resuelve → Usuario confirma o reabre**

Con historial completo (línea de tiempo), SLA por prioridad, notificaciones internas, dashboards por rol, reportes, auditoría y control de acceso basado en roles.

## 🧱 Stack

| Capa | Tecnología |
| --- | --- |
| Frontend | React 18 + Vite + TypeScript, Tailwind CSS, React Router, TanStack Query, Recharts |
| Backend | Node.js + Express + TypeScript, Prisma ORM, Zod (validación), JWT + bcrypt, Multer |
| Base de datos | SQLite (desarrollo) — migrable a PostgreSQL cambiando `DATABASE_URL` y `provider` |

## 🚀 Puesta en marcha

Requisitos: Node.js ≥ 20.

```bash
# 1. Instalar dependencias (raíz del proyecto)
npm install

# 2. Crear la base de datos (SQLite) — opcional, ya está creada si usaste el seed
cd backend
npx prisma db push

# 3. Sembrar datos iniciales (roles, estados, prioridades+SLA, categorías, usuarios demo)
npm run db:seed

# 4. Arrancar frontend + backend (dev)
cd ..
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:3001/api (health: `/api/health`)

### Cuentas de demostración

| Rol | Correo | Contraseña |
| --- | --- | --- |
| Jefe de Soporte (MASTER) | `jefe.soporte@empresa.com` | `Admin123!` |
| Técnico | `carlos.tec@empresa.com` / `ana.tec@empresa.com` | `Tecnico123!` |
| Usuario | `maria.usuario@empresa.com` / `pedro.usuario@empresa.com` | `Usuario123!` |

> Cambia estas contraseñas en producción (`SEED_ADMIN_PASSWORD` y las credenciales del seed).

## 📁 Estructura

```
helpdesk/
├── backend/
│   ├── prisma/            # schema.prisma + seed.ts
│   ├── src/
│   │   ├── config/        # env, constantes de dominio
│   │   ├── lib/           # prisma, números de ticket, SLA, auditoría, notificaciones
│   │   ├── middleware/    # auth (JWT), rbac, validación Zod, errores, uploads
│   │   └── modules/       # auth, users, companies, departments, categories,
│   │                      # priorities (SLA), statuses, tickets, notifications,
│   │                      # dashboard, reports, audit, settings
│   ├── uploads/           # archivos adjuntos (gitignored)
│   └── .env.example
├── frontend/
│   └── src/
│       ├── api/           # cliente axios + endpoints tipados
│       ├── components/    # UI (badges, modales, timeline, layout)
│       ├── context/       # autenticación
│       └── pages/         # auth, dashboard, tickets, admin, catálogos, reportes...
└── docs/propuesta-tecnica.md   # diseño completo (BD, API, permisos, flujo)
```

## 🔄 Flujo del ticket

`NUEVO → PENDIENTE_ASIGNACION → ASIGNADO → EN_PROCESO ⇄ ESPERA_USUARIO → RESUELTO → CERRADO`
· `REABIERTO` (si el problema continúa, vuelve a la bandeja del MASTER) · `CANCELADO`

- El solicitante puede **confirmar** la solución (cierre) o **reabrir** con motivo.
- El MASTER asigna/reasigna con motivo; cada evento queda en la **línea de tiempo** y en **auditoría**.
- El SLA se calcula por prioridad (respuesta y resolución) con indicadores: 🟢 normal · 🟡 próximo a vencer · 🔴 vencido.

## 🔐 Seguridad

- Contraseñas con **bcrypt** (nunca texto plano).
- **JWT**: access token corto en memoria + refresh token rotativo en cookie `httpOnly` (recordar sesión).
- **RBAC** en backend: cada ruta valida rol y alcance (un técnico solo ve sus tickets; un usuario solo los suyos).
- Validación con **Zod** en todos los endpoints; consultas parametrizadas (Prisma) → sin SQL injection.
- React escapa el contenido → mitigación XSS; CORS restringido; rate-limit en autenticación.
- **Archivos**: whitelist de tipos, límite de tamaño (10 MB por defecto), nombres aleatorios, descarga con autorización.
- **Auditoría**: login/logout, tickets, asignaciones, estados, usuarios, catálogos (con IP y user-agent).

## 📌 Notas

- Los adjuntos se guardan en `backend/uploads/`; en producción se recomienda un bucket (S3) — la capa está separada para migrarlo.
- Las notificaciones por correo están **preparadas** (interfaz de servicio) pero deshabilitadas; la recuperación de contraseña entrega el enlace en la respuesta **solo en desarrollo**.
- Para migrar a PostgreSQL: instalar el motor, cambiar `provider = "postgresql"` en `schema.prisma` y `DATABASE_URL`, luego `prisma migrate deploy`.
