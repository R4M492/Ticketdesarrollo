
# HelpDesk — Sistema de Gestión de Tickets

## 🏗️ Arquitectura: microservicios

Este proyecto migró por completo de un backend monolítico a microservicios. El monolito original
se dio de baja una vez que los 9 servicios nuevos quedaron validados de punta a punta (ver el
punto 1 del README de [`tests/contract/`](tests/contract/README.md) y la sección 12 de
[`docs/plan-migracion-microservicios.md`](docs/plan-migracion-microservicios.md) para el detalle
fase por fase del proceso). No queda código del monolito en el repositorio — solo referencias
históricas en comentarios, que documentan de qué módulo original se adaptó cada pieza.

**Cómo correrlo:**

```bash
docker compose up --build
# o npm run dev (hace exactamente lo mismo)
```

Levanta los 9 microservicios (`identity`, `organization`, `catalog`, `ticketing`, `attachment`,
`notification`, `audit`, `reporting`, `settings`), MySQL, MongoDB, RabbitMQ, el API Gateway
(Traefik) y el frontend. El frontend queda en http://localhost:5174, hablando únicamente con el
gateway (`http://gateway:80` dentro de la red de Docker) — ningún servicio ni el frontend conocen
un "backend" monolítico.

Para desarrollar un servicio individual fuera de Docker (hot reload sin reconstruir la imagen):

```bash
npm install
npm run services:dev   # levanta los 9 microservicios con tsx watch
npm run dev:frontend   # levanta el frontend contra el gateway (necesita el resto del stack en Docker)
```

Esto requiere que `mysql`, `mongodb` y `rabbitmq` ya estén corriendo (vía `docker compose up
mysql mongodb rabbitmq -d`, por ejemplo) y variables de entorno locales (`DATABASE_URL`,
`MONGO_URI`, `RABBITMQ_URL`, `JWT_SECRET`) equivalentes a las de `docker-compose.yml` para cada
servicio.

**Validación automatizada:** [`tests/contract/`](tests/contract/) tiene la única suite de pruebas
del proyecto — una colección Postman/Newman que corre contra el gateway real (114 requests, 223
aserciones). Es la red de seguridad de regresión: antes de cambiar algo en un servicio, correrla
(`npx newman run tests/contract/helpdesk-api.postman_collection.json -e
tests/contract/local.postman_environment.json`) con el stack levantado y la base de datos recién
sembrada.

---

## 🔄 Flujo del ticket

`NUEVO → PENDIENTE_ASIGNACION → ASIGNADO → EN_PROCESO ⇄ ESPERA_USUARIO → RESUELTO → CERRADO`
· `REABIERTO` (si el problema continúa, vuelve a la bandeja del MASTER) · `CANCELADO`

- El solicitante puede **confirmar** la solución (cierre) o **reabrir** con motivo.
- El MASTER asigna/reasigna con motivo; cada evento queda en la **línea de tiempo** y en **auditoría**.
- El SLA se calcula por prioridad (respuesta y resolución) con indicadores: 🟢 normal · 🟡 próximo a vencer · 🔴 vencido.

## 🔐 Seguridad

- Contraseñas con **bcrypt** (nunca texto plano).
- **JWT**: access token corto en memoria + refresh token rotativo en cookie `httpOnly` (recordar sesión). Secreto compartido (HS256) entre todos los servicios — ver "Pendientes" abajo.
- **RBAC** en cada servicio: cada ruta valida rol y alcance (un técnico solo ve sus tickets; un usuario solo los suyos).
- Validación con **Zod** en todos los endpoints; consultas parametrizadas (Prisma) → sin SQL injection.
- React escapa el contenido → mitigación XSS; CORS restringido; rate-limit en autenticación (en memoria de cada servicio, no compartido entre réplicas).
- **Archivos**: whitelist de tipos, límite de tamaño (10 MB por defecto), nombres aleatorios, descarga con autorización — gestionados por `attachment-service`, no por `ticketing-service`.
- **Auditoría**: login/logout, tickets, asignaciones, estados, usuarios, catálogos, configuración (con IP y user-agent) — centralizada en `audit-service`.

## 📌 Notas

- Los adjuntos se guardan en el volumen `attachment-uploads` de `attachment-service` (Mongo para metadatos, filesystem para el binario); en producción se recomienda un bucket (S3) — la capa está separada para migrarlo.
- Las notificaciones por correo están **preparadas** (interfaz de servicio) pero deshabilitadas; la recuperación de contraseña entrega el enlace en la respuesta **solo en desarrollo**.
- Base de datos: cada microservicio respaldado por datos relacionales (`identity`, `organization`, `catalog`, `ticketing`) usa su propia base **MySQL** (`provider = "mysql"` en su `prisma/schema.prisma`); los respaldados por documentos (`attachment`, `notification`, `audit`, `settings`) usan **MongoDB**. El esquema se aplica con `prisma db push` (no hay migraciones versionadas todavía) y se siembra con `prisma db seed` automáticamente al arrancar cada contenedor — ver `docker-compose.yml`.

## ⚠️ Pendientes conocidos (fuera del alcance de la migración)

No bloquean el uso local, pero sí cualquier despliegue más allá de tu máquina:

- Migraciones versionadas (hoy es `prisma db push` en cada arranque de contenedor).
- Secretos hardcodeados en `docker-compose.yml` (`JWT_SECRET`, password de MySQL).
- JWT con secreto compartido (HS256), no RS256/JWKS.
- Sin TLS en ningún punto (el gateway es HTTP plano).
- Sin CI/CD — todo se construye y valida a mano con `docker compose up --build`.
- Sin observabilidad centralizada (logs, trazas, métricas) — solo `docker logs` por contenedor.
- Validaciones cross-servicio incompletas: `DELETE` de categorías/prioridades/empresas/departamentos ya no verifica dependientes antes de borrar (antes desactivaba, ahora borra directo salvo que una restricción de base de datos lo bloquee).
