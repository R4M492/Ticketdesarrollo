# Propuesta Técnica — Sistema de Gestión de Tickets / Help Desk

> Documento de diseño previo al desarrollo. Se implementa solo después de la aprobación del usuario.

---

## 1. Análisis de requerimientos (resumen)

El sistema gestiona el ciclo de vida completo de tickets de soporte técnico con 3 roles:

| Rol | Necesidad principal |
| --- | --- |
| **USUARIO** (solicitante) | Crear tickets, dar seguimiento, adjuntar archivos, confirmar o reabrir soluciones. |
| **TECNICO** (agente) | Atender únicamente sus tickets asignados: seguimientos, solución, resolución. |
| **MASTER** (jefe de soporte) | Administración total: tickets, asignación, usuarios, catálogos, SLA, reportes, auditoría, configuración. |

Requisitos transversales:
- **Historial completo** de cada ticket (línea de tiempo: usuario + fecha + hora + acción).
- **Números de ticket únicos** con formato `TKT-AAAA-NNNNNN`.
- **SLA configurable por prioridad** con indicadores visuales (normal / próximo a vencer / vencido).
- **Notificaciones internas** (preparadas para ampliarse a correo electrónico después).
- **Seguridad**: hash de contraseñas, RBAC, protección de rutas, validación, archivos controlados, auditoría.
- **Diseño responsive** tipo sistema empresarial (sidebar + header + dashboards + tablas).
- **Todo conectado realmente a la base de datos** (sin datos simulados).

---

## 2. Arquitectura propuesta

```
┌─────────────────────┐        ┌──────────────────────┐        ┌─────────────────┐
│   FRONTEND (SPA)    │  REST  │       BACKEND        │  ORM   │   BASE DE DATOS │
│  React + Vite + TS  │ ─────► │  Node + Express + TS │ ─────► │  Prisma (SQLite │
│  Tailwind + Recharts│  JSON  │  JWT + RBAC + Multer │        │  / PostgreSQL)  │
└─────────────────────┘        └──────────────────────┘        └─────────────────┘
        │                              │
   Roles por ruta                  /uploads (archivos adjuntos,
   (sidebar y páginas              servidos con autorización)
    según rol)
```

- **Frontend**: React + Vite + TypeScript, Tailwind CSS, React Router, TanStack Query (estado de servidor/caché), Recharts (gráficas), date-fns.
- **Backend**: Node.js + Express + TypeScript, Prisma ORM, JWT (access + refresh), bcrypt, Zod (validación), Multer (archivos), Helmet + CORS + rate-limit.
- **Base de datos**: relacional normalizada vía Prisma. **SQLite** para desarrollo local inmediato (cero configuración) y **PostgreSQL** para producción; el cambio es solo de configuración porque el esquema Prisma se diseña portable (sin enums nativos, se usan códigos string).
- **Autenticación**: access token JWT de corta duración (15–30 min) + refresh token rotativo (hash en BD) que habilita **"Recordar sesión"**. Contraseñas con bcrypt (nunca texto plano).
- **Archivos**: almacenados en `backend/uploads/` con nombre aleatorio, validación de tipo y tamaño (límite configurable, p. ej. 10 MB; imágenes, PDF, documentos comunes). Servidos solo con token válido y autorización. Preparado para migrar a S3 después.
- **Correo electrónico**: interfaz `EmailService` (contrato) implementada con proveedor real (SMTP / SendGrid / Resend) en una fase posterior; por ahora notificaciones internas en BD.
- **Variables de entorno**: `.env` con `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, límites de archivo, CORS origin, etc. Nunca secretos en el código. Se entrega `.env.example`.

### Estructura de carpetas

```
helpdesk/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma          # Modelo de datos
│   │   └── seed.ts                # Datos iniciales (roles, estados, prioridades, categorías, admin)
│   ├── src/
│   │   ├── server.ts              # Arranque
│   │   ├── app.ts                 # Express app (middlewares globales, rutas)
│   │   ├── config/                # env, cors, multer, constants
│   │   ├── middleware/
│   │   │   ├── auth.ts            # Verifica JWT
│   │   │   ├── rbac.ts            # requireRole(...)
│   │   │   ├── validate.ts        # Validación con Zod
│   │   │   ├── error.ts           # Manejo central de errores
│   │   │   ├── audit.ts           # Registro de auditoría
│   │   │   └── upload.ts          # Multer (tipos y tamaño)
│   │   ├── modules/
│   │   │   ├── auth/              # login, logout, refresh, forgot/reset password
│   │   │   ├── users/             # CRUD usuarios (MASTER)
│   │   │   ├── companies/         # CRUD empresas
│   │   │   ├── departments/       # CRUD departamentos
│   │   │   ├── categories/        # Categorías + subcategorías
│   │   │   ├── priorities/        # Prioridades + SLA
│   │   │   ├── statuses/          # Catálogo de estados
│   │   │   ├── tickets/           # CRUD, asignación, seguimiento, solución, adjuntos, historial
│   │   │   ├── notifications/     # Notificaciones internas
│   │   │   ├── dashboard/         # KPIs y gráficas por rol
│   │   │   ├── reports/           # Reportes + exportación
│   │   │   ├── sla/               # Cálculo de SLA
│   │   │   ├── audit/             # Consulta de auditoría
│   │   │   └── settings/          # Configuración del sistema
│   │   ├── utils/                 # ticket-number, sla, helpers
│   │   └── types/
│   ├── uploads/                   # Adjuntos (gitignored)
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── api/                   # Cliente HTTP (axios) + endpoints
│   │   ├── components/            # UI reutilizable (tablas, badges, modales, timeline, ...)
│   │   ├── layouts/               # Layout con sidebar + header (según rol)
│   │   ├── pages/
│   │   │   ├── auth/              # Login, recuperar contraseña
│   │   │   ├── dashboard/         # 3 dashboards según rol
│   │   │   ├── tickets/           # Lista, detalle, crear, seguimiento
│   │   │   ├── admin/             # Usuarios, técnicos, empresas, departamentos
│   │   │   ├── catalogs/          # Categorías, subcategorías, prioridades, estados
│   │   │   ├── reports/           # Reportes y productividad
│   │   │   ├── audit/             # Auditoría
│   │   │   └── profile/           # Mi perfil, notificaciones
│   │   ├── context/               # Auth context
│   │   ├── hooks/
│   │   ├── types/                 # Tipos compartidos con la API
│   │   └── utils/
│   ├── .env.example               # VITE_API_URL
│   └── package.json
├── docs/                          # Documentación
└── README.md
```

---

## 3. Modelo de base de datos

### Diagrama de entidades

```
roles ──< users ──< tickets >── ticket_history
companies ──< departments            │
companies ──< users                 ├──< ticket_comments ──< users
departments ──< users               ├──< ticket_attachments ──< users
ticket_categories ──< ticket_subcategories
ticket_categories ──< tickets       ├──< ticket_assignments (assigned_by, prev, new)
ticket_priorities ──< tickets       │
ticket_statuses ──< tickets         ├──< ticket_solutions
users ──< tickets (assigned_technician) │
sla_configurations ──< ticket_priorities
users ──< notifications ──< tickets
users ──< audit_logs
users ──< password_resets
users ──< refresh_tokens
```

### Tablas (esquema normalizado, 3FN)

**Catálogos base**

| Tabla | Campos clave | Notas |
| --- | --- | --- |
| `roles` | id, code (`MASTER`/`TECNICO`/`USUARIO`), name | Un rol por usuario. |
| `companies` | id, name, description, status | Catálogo administrable. |
| `departments` | id, company_id FK, name, status | Pertenece a una empresa. |
| `ticket_categories` | id, name, description, sort_order, status | Ej.: Hardware, Software, Red, SAP… |
| `ticket_subcategories` | id, category_id FK, name, sort_order, status | Depende de la categoría. |
| `ticket_priorities` | id, code (`CRITICA`/`ALTA`/`MEDIA`/`BAJA`), name, description, color, sort_order, status | SLA vive en `sla_configurations`. |
| `ticket_statuses` | id, code, name, description, color, sort_order, is_closed, status | Los 9 estados del flujo. |

**Usuarios y sesiones**

| Tabla | Campos clave | Notas |
| --- | --- | --- |
| `users` | id, name, email (único), password_hash, phone, position, role_id FK, company_id FK, department_id FK, status (`ACTIVE`/`INACTIVE`), avatar_url, last_login_at, created_at, updated_at | Empresa/departamento desde catálogos. |
| `refresh_tokens` | id, user_id FK, token_hash, expires_at, revoked_at, created_at | Soporta "recordar sesión". |
| `password_resets` | id, user_id FK, token_hash, expires_at, used_at | Recuperación de contraseña. |

**Núcleo de tickets**

| Tabla | Campos clave | Notas |
| --- | --- | --- |
| `tickets` | id, ticket_number (único, `TKT-2026-000001`), user_id FK (solicitante), subject, category_id FK, subcategory_id FK, priority_id FK, status_id FK, description, location, device, inventory_number, requester_name/email/phone (instantánea al crear), company_id FK, department_id FK, assigned_technician_id FK (nulable), first_response_at, resolved_at, closed_at, reopened_count, sla_response_due_at, sla_resolution_due_at, created_at, updated_at | Instantánea del solicitante para que el ticket no cambie si cambia el perfil. |
| `ticket_comments` | id, ticket_id FK, user_id FK, comment, created_at | Seguimiento/diagnóstico del técnico. |
| `ticket_attachments` | id, ticket_id FK, comment_id FK (nulable), user_id FK, original_name, stored_name, mime_type, size_bytes, created_at | Adjuntos del ticket o de un comentario. |
| `ticket_history` | id, ticket_id FK, user_id FK, action (code), description, old_value, new_value, created_at | Línea de tiempo: creación, asignación, estados, prioridad, comentarios, solución, cierre, reapertura. |
| `ticket_assignments` | id, ticket_id FK, assigned_by FK, previous_technician_id FK (nulable), new_technician_id FK, reason, created_at | Registro de quién asignó, técnico anterior/nuevo, motivo. |
| `ticket_solutions` | id, ticket_id FK, user_id FK, problem_identified, cause, solution_applied, observations, time_used_minutes, created_at | Formulario de solución al marcar "Resuelto". |
| `notifications` | id, user_id FK, ticket_id FK (nulable), type (code), title, message, is_read, read_at, created_at | Notificaciones internas; preparadas para correo. |
| `sla_configurations` | id, priority_id FK (único), response_minutes, resolution_hours, active, updated_by FK, created_at, updated_at | SLA editable por prioridad desde configuración. |
| `audit_logs` | id, user_id FK (nulable), action, entity_type, entity_id, description, ip_address, user_agent, created_at | Auditoría de acciones importantes. |

### Relaciones principales

- `users` → `roles` (N:1) · `companies` (N:1) · `departments` (N:1).
- `departments` → `companies` (N:1).
- `tickets` → `users` solicitante (N:1) · `ticket_categories` (N:1) · `ticket_subcategories` (N:1) · `ticket_priorities` (N:1) · `ticket_statuses` (N:1) · `users` técnico asignado (N:1, nulable).
- `ticket_subcategories` → `ticket_categories` (N:1).
- `ticket_comments`, `ticket_attachments`, `ticket_history`, `ticket_assignments`, `ticket_solutions` → `tickets` (N:1) y a `users` (N:1).
- `sla_configurations` → `ticket_priorities` (1:1).
- `notifications`, `audit_logs`, `refresh_tokens`, `password_resets` → `users` (N:1).
- Toda FK con integridad referencial y `ON DELETE RESTRICT` (nada se borra en cascada: el historial se conserva siempre). Índices en `ticket_number`, `status_id`, `priority_id`, `assigned_technician_id`, `user_id`, `created_at`.

---

## 4. Roles y permisos (matriz)

| Módulo / acción | USUARIO | TECNICO | MASTER |
| --- | :-: | :-: | :-: |
| Ver su perfil / editar su perfil | ✔ | ✔ | ✔ |
| Crear ticket | ✔ | ✔ | ✔ |
| Ver sus propios tickets | ✔ | ✔ (solo asignados) | ✔ (todos) |
| Ver tickets ajenos | ✖ | ✖ | ✔ |
| Agregar comentarios | ✔ (solo su ticket) | ✔ (solo asignados) | ✔ |
| Adjuntar archivos | ✔ (su ticket) | ✔ (asignados) | ✔ |
| Asignar / reasignar técnico | ✖ | ✖ | ✔ |
| Cambiar prioridad / categoría / estado | ✖ | Estado según flujo (su ticket) | ✔ |
| Marcar como resuelto | ✖ | ✔ (su ticket) | ✔ |
| Confirmar solución (cerrar) | ✔ (su ticket) | ✖ | ✔ |
| Reabrir ticket | ✔ (su ticket, con motivo) | ✖ | ✔ |
| Cancelar ticket | ✔ (su ticket, abierto) | ✖ | ✔ |
| CRUD usuarios / técnicos | ✖ | ✖ | ✔ |
| CRUD empresas / departamentos | ✖ | ✖ | ✔ |
| CRUD categorías / subcategorías / prioridades / estados / SLA | ✖ | ✖ | ✔ |
| Dashboards y estadísticas | Solo sus tickets | Solo sus tickets | Global |
| Reportes / exportación | ✖ | ✖ | ✔ |
| Auditoría | ✖ | ✖ | ✔ |
| Configuración del sistema | ✖ | ✖ | ✔ |

**Control de acceso**: middleware `requireRole('MASTER')` en el backend + guardias de ruta en el frontend. El backend **siempre** valida el alcance (p. ej., un técnico solo puede leer tickets donde `assigned_technician_id = su id`; un usuario solo los suyos). Un usuario jamás accede por URL a lo que no le corresponde.

---

## 5. Flujo completo del ticket

### Estados (códigos)

`NUEVO` → `PENDIENTE_ASIGNACION` → `ASIGNADO` → `EN_PROCESO` ⇄ `ESPERA_USUARIO` → `RESUELTO` → `CERRADO` · `REABIERTO` · `CANCELADO`

### Diagrama del ciclo de vida

```
USUARIO crea ticket ──► NUEVO ──(MASTER revisa)──► PENDIENTE_ASIGNACION
                          │                              │
                          └──────────(MASTER asigna)─────┴──► ASIGNADO ──► EN_PROCESO
                                                                              │  ▲
                                              (técnico solicita info)        │  │ (usuario responde /
                                                                             ▼  │  técnico retoma)
                                                                        ESPERA_USUARIO
                                                                              │
                                                                              ▼
                                                          (técnico registra solución)
                                                                              │
                                                                              ▼
                                                                           RESUELTO
                                                                          ┌────┴────┐
                                                     (usuario confirma)   │         │ (usuario: "el problema continúa" + motivo)
                                                                          ▼         ▼
                                                                        CERRADO   REABIERTO ──► (vuelve a bandeja MASTER)
                                                                          │                          │
                                                     (usuario solicita    │                          ▼
                                                      reapertura)         ├──► REABIERTO        ASIGNADO (reasignación) ──► ...
                                                                          │
                                                                          ▼
                                                                      (fin del ciclo)

CANCELADO: permitido por el solicitante (su ticket, abierto) o MASTER, desde cualquier estado abierto.
```

### Transiciones permitidas

| Desde | Hacia | Quién |
| --- | --- | --- |
| NUEVO | PENDIENTE_ASIGNACION, ASIGNADO, CANCELADO | MASTER (cancelar: también solicitante) |
| PENDIENTE_ASIGNACION | ASIGNADO, CANCELADO | MASTER |
| ASIGNADO | EN_PROCESO, CANCELADO | Técnico asignado (iniciar), MASTER |
| EN_PROCESO | ESPERA_USUARIO, RESUELTO, CANCELADO | Técnico asignado |
| ESPERA_USUARIO | EN_PROCESO, RESUELTO | Técnico asignado |
| RESUELTO | CERRADO, REABIERTO | Solicitante (o MASTER) |
| CERRADO | REABIERTO | Solicitante (con motivo) o MASTER |
| REABIERTO | ASIGNADO (reasignación), EN_PROCESO | MASTER / técnico |

Cada transición genera: entrada en `ticket_history` + notificación a los implicados + registro en `audit_logs`.

### Asignación y reasignación

1. Usuario crea ticket → `NUEVO` + notificación al MASTER.
2. MASTER abre la bandeja y asigna técnico → `ASIGNADO` + notificación al técnico.
3. Registro en `ticket_assignments` (quién, técnico anterior, técnico nuevo, fecha, motivo).
4. Reasignación en cualquier momento → mismo registro + notificación a ambos técnicos.
5. Ticket reabierto → vuelve a la bandeja del MASTER para reasignación.

### SLA

- Al crear el ticket se toma la `sla_configurations` activa de su prioridad y se calculan `sla_response_due_at` y `sla_resolution_due_at` (instantánea).
- **Tiempo de respuesta**: creación → primera respuesta del técnico (primer comentario/actividad del técnico o la asignación, configurable).
- **Tiempo de resolución**: creación → `resolved_at`.
- Estado visual: **Normal** (verde) / **Próximo a vencer** (amarillo, dentro del 80–100 % del plazo) / **Vencido** (rojo).

### Notificaciones (triggers)

| Evento | Destinatario |
| --- | --- |
| Ticket creado / reabierto | MASTER |
| Ticket asignado / reasignado | Técnico nuevo (y anterior en reasignación) |
| Comentario del usuario | Técnico asignado + MASTER |
| Comentario del técnico / cambio de estado | Solicitante |
| Ticket resuelto / cerrado / reabierto | Solicitante |

---

## 6. API REST — rutas propuestas

Base: `/api`. Autenticación: `Authorization: Bearer <token>`.

| Método | Ruta | Acceso | Descripción |
| --- | --- | --- | --- |
| POST | `/auth/login` | Público | Inicia sesión (devuelve access + refresh) |
| POST | `/auth/logout` | Autenticado | Revoca refresh token |
| POST | `/auth/refresh` | Público | Renueva access token |
| POST | `/auth/forgot-password` | Público | Envía enlace/token de recuperación |
| POST | `/auth/reset-password` | Público | Restablece contraseña con token |
| GET | `/auth/me` | Autenticado | Perfil + rol actual |
| PUT | `/auth/profile` | Autenticado | Actualiza su perfil |
| PUT | `/auth/password` | Autenticado | Cambia su contraseña |
| GET | `/users` | MASTER | Lista + filtros (rol, empresa, estado, búsqueda) |
| POST | `/users` | MASTER | Crea usuario/técnico |
| GET | `/users/:id` | MASTER | Detalle |
| PUT | `/users/:id` | MASTER | Edita (rol, empresa, departamento, estado) |
| PATCH | `/users/:id/status` | MASTER | Activa / desactiva |
| POST | `/users/:id/reset-password` | MASTER | Restablece contraseña |
| GET | `/users/technicians` | MASTER, TECNICO | Lista de técnicos (para asignación) |
| GET/POST | `/companies` | GET: autenticado · POST: MASTER | Catálogo de empresas |
| PUT/DELETE | `/companies/:id` | MASTER | Edita / desactiva empresa |
| GET | `/companies/:id/departments` | Autenticado | Departamentos de la empresa |
| GET/POST | `/departments` | GET: autenticado · POST: MASTER | Catálogo de departamentos |
| PUT/DELETE | `/departments/:id` | MASTER | Edita / desactiva |
| GET/POST | `/categories` | GET: autenticado · POST: MASTER | Categorías |
| PUT/DELETE | `/categories/:id` | MASTER | Edita / desactiva |
| GET | `/categories/:id/subcategories` | Autenticado | Subcategorías |
| POST/PUT/DELETE | `/subcategories` | MASTER | CRUD subcategorías |
| GET/POST | `/priorities` | GET: autenticado · POST: MASTER | Prioridades |
| PUT/DELETE | `/priorities/:id` | MASTER | Edita / desactiva |
| GET/PUT | `/priorities/:id/sla` | GET: autenticado · PUT: MASTER | Configuración SLA por prioridad |
| GET | `/statuses` | Autenticado | Estados del catálogo |
| GET | `/tickets` | Autenticado | Lista + filtros (número, usuario, correo, empresa, técnico, categoría, prioridad, estado, fechas, equipo, ubicación) + paginación + orden; alcance por rol |
| POST | `/tickets` | Autenticado | Crea ticket (genera número + SLA) |
| GET | `/tickets/:id` | Autenticado (alcance) | Detalle completo |
| PATCH | `/tickets/:id` | Solicitante/MASTER | Edita asunto/descripción |
| GET | `/tickets/:id/history` | Autenticado (alcance) | Línea de tiempo (historial + comentarios) |
| POST | `/tickets/:id/comments` | Autenticado (alcance) | Agrega seguimiento |
| POST | `/tickets/:id/attachments` | Autenticado (alcance) | Sube adjunto (multipart) |
| GET | `/tickets/:id/attachments/:fileId` | Autenticado (alcance) | Descarga adjunto |
| POST | `/tickets/:id/assign` | MASTER | Asigna técnico (`{ technicianId, reason }`) |
| POST | `/tickets/:id/reassign` | MASTER | Reasigna (`{ technicianId, reason }`) |
| POST | `/tickets/:id/status` | Según flujo | Cambio de estado (transición validada) |
| POST | `/tickets/:id/resolve` | Técnico asignado/MASTER | Marca resuelto (formulario de solución) |
| POST | `/tickets/:id/confirm` | Solicitante/MASTER | Confirma solución → CERRADO |
| POST | `/tickets/:id/reopen` | Solicitante/MASTER | Reabre (`{ reason }`) |
| POST | `/tickets/:id/cancel` | Solicitante/MASTER | Cancela |
| GET | `/tickets/export` | MASTER | Exporta (CSV/Excel) |
| GET | `/notifications` | Autenticado | Mis notificaciones |
| GET | `/notifications/unread-count` | Autenticado | Contador no leídas |
| POST | `/notifications/:id/read` | Autenticado | Marca leída |
| POST | `/notifications/read-all` | Autenticado | Marca todas leídas |
| GET | `/dashboard/summary` | Autenticado | KPIs según rol |
| GET | `/dashboard/by-status` / `by-priority` / `by-category` / `by-technician` / `per-day` / `avg-resolution` | Autenticado (alcance) | Datos de gráficas |
| GET | `/reports/tickets` | MASTER | Reporte de tickets con filtros |
| GET | `/reports/productivity` | MASTER | Productividad por técnico (mensual) |
| GET | `/reports/sla` | MASTER | Cumplimiento de SLA |
| GET | `/reports/companies` | MASTER | Tickets por empresa |
| GET | `/reports/export` | MASTER | Exportación |
| GET | `/audit-logs` | MASTER | Auditoría con filtros (usuario, acción, fechas) |
| GET/PUT | `/settings` | MASTER | Configuración del sistema |

---

## 7. Seguridad (mapeo de requisitos)

| Requisito | Implementación |
| --- | --- |
| Hash de contraseñas | bcrypt (cost 12); nunca texto plano |
| Autenticación | JWT access (15–30 min) + refresh rotativo con hash en BD ("recordar sesión") |
| RBAC / protección de rutas | Middleware `requireRole` + validación de alcance por recurso (backend) y guardias en frontend |
| SQL Injection | Prisma (consultas parametrizadas); sin SQL concatenado |
| XSS | React escapa por defecto; sin `dangerouslySetInnerHTML`; sanitización en backend |
| CSRF | Tokens en header `Authorization` (no cookies) → riesgo CSRF mínimo; CORS restringido a origen configurado |
| Validación de datos | Zod en todas las rutas (schemas por endpoint) |
| Sanitización de entradas | Zod + normalización (trim, tipos) |
| Archivos adjuntos | Multer: whitelist de MIME/extensiones, límite de tamaño (env), nombre aleatorio en disco, servicio con autorización |
| Sesiones seguras | Tokens con expiración, revocación en logout, rotación de refresh |
| Auditoría | `audit_logs` en acciones críticas (login, logout, creación/edición, asignación, estados, comentarios, usuarios) con IP y user-agent |
| Secretos | Solo variables de entorno (`.env` + `.env.example`), `.gitignore` |

---

## 8. Plan de desarrollo por módulos (fases)

Se entrega progresivamente, cada fase con backend + frontend conectados a la base de datos real:

1. **Arquitectura y scaffolding** — monorepo `backend/` + `frontend/`, config, CI básica, `.env.example`.
2. **Base de datos** — esquema Prisma + migraciones + seed (roles, 9 estados, 4 prioridades con SLA, categorías, empresa/departamentos demo, usuario MASTER inicial).
3. **Autenticación** — login, logout, refresh, recuperación de contraseña, perfil.
4. **Roles y permisos** — middleware RBAC + guardias de frontend.
5. **CRUD de usuarios** (MASTER) — crear, editar, desactivar, roles, restablecer contraseña.
6. **CRUD de empresas** y 7. **CRUD de departamentos** — catálogos vinculados.
8. **CRUD de categorías** (incl. subcategorías) y 9. **CRUD de prioridades + SLA**.
10. **CRUD de tickets** — creación con número `TKT-AAAA-NNNNNN`, adjuntos, listado con filtros/paginación.
11. **Sistema de asignación** — asignar/reasignar con motivo y registro.
12. **Seguimiento de tickets** — comentarios, solución, confirmación/reapertura.
13. **Historial** — línea de tiempo completa del ticket.
14. **Notificaciones** — internas en BD, con contador no leídas.
15. **Dashboards** — 3 dashboards (MASTER global, TÉCNICO propio, USUARIO propio) con KPIs y gráficas (dona, barras, línea).
16. **SLA** — indicadores normal/próximo/vencido en tabla y detalle.
17. **Auditoría** — módulo de consulta con filtros.
18. **Reportes** — tickets, productividad, SLA, empresas; exportación CSV/Excel.
19. **Responsive y pulido** — validación en móvil/tablet, estados de carga, mensajes de error.

Al final del plan: flujo completo operativo **USUARIO → ticket → MASTER asigna → TÉCNICO atiende → RESUELTO → CERRADO/REABIERTO**, con historial íntegro.

---

## 9. Decisiones pendientes de aprobación

1. **Stack**: React + Vite + TS (frontend) + Node/Express + TS (backend) + Prisma (ORM). ¿De acuerdo?
2. **Base de datos**: SQLite para desarrollo local inmediato (migrable a PostgreSQL en producción) — no hay Postgres/MySQL/Docker instalados en esta máquina. ¿SQLite ahora o prefieres instalar PostgreSQL?
3. UI 100 % en español (sí, según el requerimiento).
4. Notificaciones internas primero; correo electrónico en fase posterior (interfaz preparada).

**Al aprobar, comienzo con las fases 1 y 2 (scaffolding + base de datos + seed) y continúo módulo a módulo.**
