


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
