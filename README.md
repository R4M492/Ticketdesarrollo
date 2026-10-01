
# MicroHelpDesk — Sistema de Gestión de Tickets

## 🏗️ Arquitectura: microservicios

Este proyecto migró por completo de un backend monolítico a microservicios. El monolito original
se dio de baja una vez que los 9 servicios nuevos quedaron validados de punta a punta (ver el
punto 1 del README de [`tests/contract/`](tests/contract/README.md) y la sección 12 de
[`docs/plan-migracion-microservicios.md`](docs/plan-migracion-microservicios.md) para el detalle
fase por fase del proceso). No queda código del monolito en el repositorio — solo referencias
históricas en comentarios, que documentan de qué módulo original se adaptó cada pieza.

## 🚀 Puesta en marcha

Todo el sistema (9 microservicios, bases de datos, cola de mensajes, gateway y frontend) se levanta
con un solo comando usando Docker. No hace falta instalar Node, MySQL, MongoDB ni nada más en tu
máquina — Docker se encarga de todo.

### 1. Instala Docker Desktop

Si no lo tienes, descárgalo de [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/)
e instálalo. Después de instalarlo, **ábrelo** (debe quedar corriendo en segundo plano — lo ves en
la barra de menú/bandeja del sistema) antes de seguir con el siguiente paso.

### 2. Clona el proyecto y entra a la carpeta

```bash
git clone https://github.com/R4M492/Ticketdesarrollo.git
cd Ticketdesarrollo
```

(Si ya tienes el proyecto en tu máquina, solo entra a la carpeta con `cd`.)

### 3. Levanta todo con un comando

```bash
docker compose up --build
```

La primera vez tarda varios minutos (Docker descarga las imágenes base y construye cada servicio).
Vas a ver mucho texto en la terminal — es normal, es el log de los 16 contenedores arrancando a la
vez. Espera a que el texto se calme y empieces a ver líneas repetidas tipo `GET /health 200` o
`Server listening on port...`; eso significa que ya está todo arriba. Las siguientes veces que lo
corras será mucho más rápido porque Docker reutiliza lo que ya construyó.

Si prefieres recuperar la terminal y dejarlo corriendo de fondo, usa `docker compose up --build -d`
(la `-d` es "detached"). Para ver los logs después: `docker compose logs -f`.

### 4. Confirma que todo esté levantado

En otra terminal (o la misma, si usaste `-d`):

```bash
docker compose ps
```

Deberías ver 16 contenedores con `Up` en la columna de estado, y la mayoría diciendo `(healthy)`.
Si alguno dice `(unhealthy)` o `Restarting`, dale uno o dos minutos más — algunos servicios esperan
a que la base de datos esté lista antes de arrancar.

### 5. Abre la aplicación

Entra a **http://localhost:5174** en tu navegador. Para iniciar sesión, usa cualquiera de las
cuentas de prueba que ya vienen cargadas:

| Rol | Correo | Contraseña |
|---|---|---|
| Jefe de soporte (MASTER) | `jefe.soporte@empresa.com` | `Admin123!` |
| Técnico | `carlos.tec@empresa.com` | `Tecnico123!` |
| Usuario final | `maria.usuario@empresa.com` | `Usuario123!` |

### 6. Para apagarlo

Con `Ctrl+C` en la terminal donde corre (si no usaste `-d`), o:

```bash
docker compose down
```

Esto apaga los contenedores pero conserva los datos (usuarios, tickets, etc. siguen ahí la próxima
vez que lo levantes). Si quieres empezar desde cero y borrar también los datos:

```bash
docker compose down -v
```

### Problemas comunes

- **"El puerto ya está en uso" / `address already in use`** — algo más en tu máquina está usando ese
  puerto. El más probable es el **80** (lo usa el gateway); ciérralo o, si no puedes, cambia el
  mapeo de puertos de `gateway` en `docker-compose.yml` (por ejemplo `"8080:80"` en vez de
  `"80:80"`, y entra por `http://localhost:8080` en tu navegador).
- **Docker no arranca nada / error de conexión al demonio** — Docker Desktop no está corriendo.
  Ábrelo y espera a que el ícono indique que está listo antes de repetir `docker compose up`.
- **Algún servicio queda en `Restarting` mucho tiempo** — revisa su log puntual con
  `docker compose logs <nombre-del-servicio>` (por ejemplo `docker compose logs identity-service`).

### Para desarrollar (no solo para probar)

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
del proyecto — una colección Postman/Newman que corre contra el gateway real (117 requests, 229
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

## ⚙️ Colas y trabajos asíncronos

RabbitMQ no es solo infraestructura declarada — es el bus de eventos real entre servicios (exchange
topic `helpdesk.events`, ver [`packages/common/src/events.ts`](packages/common/src/events.ts)).
Tres tipos de trabajo fluyen por ahí hoy:

| Evento | Publica | Consume | Qué hace |
|---|---|---|---|
| `audit.log` | todos los servicios | `audit-service` | Persiste cada acción auditable en Mongo |
| `notification.create` | `identity-service`, `ticketing-service` | `notification-service` | Persiste la notificación in-app (campanita) |
| `email.send` | `ticketing-service` (al crear un ticket) | `notification-service` | Simula el envío del correo de confirmación — **con fallo intermitente a propósito**, para poder demostrar reintentos |

**Reintentos y dead-letter queue:** si el handler de un consumidor lanza una excepción, el mensaje
no se descarta — se reencola en `<cola>.retry` con backoff lineal (intento 1: 3s, intento 2: 6s)
hasta agotar 3 intentos; al agotarlos se mueve a `<cola>.dlq` para inspección manual. Esto aplica a
los 3 eventos de la tabla, pero es más fácil de ver con `email.send`, porque tiene una probabilidad
de fallo simulada del 40% por intento. El estado de cada intento de `email.send` queda registrado
en una colección `jobs` de `notification-service`, consultable vía:

- `GET /api/jobs?ticketId=<id>` — trabajos de un ticket.
- `GET /api/jobs/:id` — detalle de un trabajo puntual.

En el frontend, el detalle de un ticket ([`TicketDetail.tsx`](frontend/src/pages/TicketDetail.tsx))
muestra el estado en vivo ("Enviando…" → "Reintentando (intento N de 3)" → "Correo enviado" o
"Falló tras 3 intentos: ‹motivo›"), refrescándose solo mientras el trabajo siga en curso.

Para verlo en acción: crea un ticket nuevo y mira la sección "Confirmación por correo" en su
detalle — tiene ~22% de probabilidad de fallar las 3 veces (0.4³) y terminar en la DLQ; si no falla
a la primera, igual puedes ver los logs de reintento con `docker compose logs -f
notification-service`.

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
- El correo de confirmación de ticket (`email.send`, ver sección de colas arriba) es **simulado**: no hay proveedor SMTP conectado, "enviar" es un `console.log` en `notification-service`. La recuperación de contraseña entrega el enlace en la respuesta **solo en desarrollo**, por el mismo motivo.
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
