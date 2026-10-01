# Pruebas de contrato — MicroHelpDesk API

Colección Postman (v2.1) que cubre los endpoints reales de la arquitectura de microservicios, ejecutados **a
través del gateway** (Traefik, `http://localhost/api`, ver `gateway/traefik/dynamic.yml`), no contra ningún
servicio individual por su puerto directo (excepto los `GET /health` — ver más abajo).

Nació como el insumo del **punto 5** del "gate de salida" documentado en
[`docs/plan-migracion-microservicios.md`](../../docs/plan-migracion-microservicios.md#11-gate-de-salida--test-de-prerequisitos-antes-de-iniciar-la-fase-0),
cuando el backend todavía era el monolito (`backend/src/modules/*`, puerto 3001): en ese momento no existía
ninguna suite de pruebas automatizada, así que esta colección sirvió como **red de seguridad de regresión**
durante las 9+1 fases de extracción a microservicios.

**Adaptación post-migración (2026-09-30):** con los 9 microservicios ya detrás del gateway, se adaptó esta misma
colección para que apunte a `http://localhost/api` (antes `http://localhost:3001/api`, el monolito) y para que
sus requests reflejen el contrato real de los servicios nuevos, no el del monolito. Se corrió contra el stack
completo (`docker compose up`, base de datos reseteada) y quedó en 114 requests / 223 aserciones, 0 fallos.
Sigue siendo la única suite automatizada del proyecto — todo lo validado durante las fases de migración fue con
`curl` manual, sesión por sesión.

**Colas con reintentos (2026-10-01):** se agregó la carpeta `14 - Jobs`, que cubre `GET /api/jobs` y
`GET /api/jobs/:id` — el endpoint de `notification-service` que expone el estado de los trabajos
asíncronos (ver la sección "Colas y trabajos asíncronos" del [`README.md`](../../README.md) raíz).
Como el estado de un job depende de un backoff que puede tardar más que toda la corrida de la
colección, esas pruebas no asumen un estado terminal — solo validan la forma de la respuesta y que
el estado sea uno de los reconocidos. Total actual: **117 requests / 229 aserciones, 0 fallos**.

No se modificó ningún archivo de `backend/`, `frontend/`, `gateway/` ni `services/` para adaptar esta colección —
todo el cambio vive bajo `tests/contract/`.

## Qué cambió al adaptarla al gateway

- **`baseUrl`** en `local.postman_environment.json`: `http://localhost:3001/api` → `http://localhost/api`.
- **`00 - Health`**: el monolito exponía un único `GET /api/health`. El gateway no expone un health check
  agregado (`gateway/traefik/dynamic.yml` solo enruta por prefijo de dominio de negocio: `/api/auth`,
  `/api/tickets`, etc. — no hay un router para `/api/health`). Se reemplazó ese único request por **9 requests**,
  uno por microservicio, pegando directo a su puerto publicado (`http://localhost:400X/health`, ver
  `docker-compose.yml`) con nuevas variables de entorno (`identityHealthUrl`, `organizationHealthUrl`, etc.).
- **Creación de tickets y comentarios** (`POST /tickets`, `POST /tickets/:id/comments`): el monolito los aceptaba
  como `multipart/form-data` (para poder adjuntar archivos en la misma llamada). `ticketing-service` los acepta
  como **JSON puro** — los adjuntos se separaron a su propio servicio en la Fase 7 (ver el comentario de cabecera
  de `services/ticketing-service/src/modules/tickets/routes.ts`). Se cambiaron esos requests de `formdata` a
  `raw`/JSON.
- **Comentario con adjunto**: en el monolito era una sola llamada multipart. Ahora son **dos pasos**: `POST
  Comentar Ticket - previo a adjuntar (Usuario Final)` (JSON, guarda `commentId`) seguido de `POST Adjuntar
  Archivo al Comentario (Usuario Final)` (multipart a `attachment-service`, con `commentId` en el form-data). Ver
  el comentario de cabecera de `services/attachment-service/src/modules/attachments/routes.ts`.
- **`DELETE Prioridad de prueba (MASTER)`**: el monolito devolvía 500 (bug documentado abajo). En
  `catalog-service` sigue sin validar SLA/tickets asociados antes de borrar (limitación conocida, ver el punto 2
  del plan de migración — deliberadamente fuera de alcance de esta adaptación), pero ahora el errorHandler
  compartido traduce la violación de llave foránea a **409 Conflict** en vez de un 500 genérico. Se actualizó la
  aserción para reflejar ese 409 real, documentando la limitación en vez de ocultarla u ocultándola con un
  "arreglo" que además rompería la reutilización de `priorityId` en la carpeta de Tickets.

## Contenido

- `helpdesk-api.postman_collection.json` — la colección (14 carpetas, ~105 peticiones).
- `local.postman_environment.json` — variables de entorno para correr contra un backend local.
- `fixtures/sample-attachment.txt` — archivo de ejemplo usado en las peticiones multipart de adjuntos.

## Prerequisito: stack de microservicios corriendo y sembrado

Desde la raíz del repositorio:

```bash
docker compose up --build -d
```

Espera a que los 9 microservicios reporten `healthy` (`docker compose ps`) — cada uno corre `prisma db push` +
`prisma db seed` (upsert, no destructivo) al arrancar su contenedor, así que no hace falta ningún paso manual de
migración o seed aparte.

La colección asume la contraseña `Admin123!` para el usuario MASTER `jefe.soporte@empresa.com` (seed de
`identity-service`, ver `services/identity-service/prisma/seed.ts`). Si cambiaste esa contraseña en el seed,
actualiza la variable `adminPassword` en `local.postman_environment.json` antes de correr la colección.

**Re-ejecutar la colección contra la misma base de datos:** a diferencia del monolito (que exponía
`npm run db:reset -w backend`), resetear las 4 bases MySQL (`identity_db`, `organization_db`, `catalog_db`,
`ticketing_db`) y las 4 bases Mongo (`attachment_db`, `notification_db`, `audit_db`, `settings_db`) hoy requiere
recrearlas a mano (`DROP DATABASE` / `dropDatabase()`) y reiniciar los contenedores de esos 8 servicios para que
`prisma db push` + seed las reconstruyan limpias. No hay un único comando de reset en este entorno.

La colección también usa dos cuentas semilla adicionales solo para casos negativos de RBAC (no se crean por la
colección, ya vienen del seed):

- Técnico: `carlos.tec@empresa.com` / `Tecnico123!`
- Usuario: `maria.usuario@empresa.com` / `Usuario123!`

## Cómo importarla

**Postman:** File → Import → selecciona `helpdesk-api.postman_collection.json` y
`local.postman_environment.json` (puedes arrastrar ambos archivos a la vez). Luego elige el entorno
"MicroHelpDesk API - Local" en el selector superior derecho antes de ejecutar cualquier petición.

**Insomnia:** Insomnia importa colecciones Postman v2.1 vía Application → Preferences → Data → Import Data →
"From File", apuntando al archivo de la colección. Las variables de entorno de Postman requieren mapearlas
manualmente a un "Environment" de Insomnia (Insomnia no importa `*.postman_environment.json` de forma nativa).

## Cómo correrla headless con Newman

Newman no está instalado como dependencia del proyecto (ver justificación más abajo); se ejecuta vía `npx` sin
agregarlo a ningún `package.json`:

```bash
npx newman run tests/contract/helpdesk-api.postman_collection.json -e tests/contract/local.postman_environment.json
```

**Ejecutar desde la raíz del repositorio** (igual que el resto de los comandos del proyecto, `npm run dev -w backend`,
etc.): las peticiones multipart de adjuntos referencian el archivo `tests/contract/fixtures/sample-attachment.txt`
con una ruta relativa al **directorio de trabajo (cwd) del proceso** — así es como Newman resuelve las rutas de
`formdata`, no a la ubicación del archivo de colección. Si corres Newman desde otro directorio, ajusta el `src` de
esos dos campos de archivo en el JSON de la colección, o usa rutas absolutas.

**Por qué no se agregó Newman como dependencia:** el punto 5 del gate solo pide la colección de pruebas de
contrato como red de seguridad, no una integración de CI todavía; agregar Newman al `package.json` raíz o de
`backend` habría significado tocar archivos fuera del alcance de esta tarea (`backend/`, `frontend/` o el
`package.json` raíz). `npx newman` descarga y ejecuta la versión más reciente sin necesidad de instalarlo.

## Limitación conocida: endpoint de adjuntos

`POST /api/tickets` (con archivos), `POST /api/tickets/:id/comments` (con archivo) y
`POST /api/tickets/:id/attachments` usan `multipart/form-data` con el campo de archivo `files` (ver
`backend/src/middleware/upload.ts`, límite 5 archivos, extensiones permitidas: imágenes, PDF, Office, txt/csv/log,
zip/rar/7z). En Postman GUI, si el campo de archivo aparece vacío al importar la colección, debes volver a
seleccionar el archivo manualmente (Postman no exporta el contenido binario, solo la ruta). En Newman, el archivo
se resuelve por ruta relativa al cwd como se explicó arriba — si el archivo no existe en esa ruta, esas peticiones
puntuales fallarán con un error de Newman al armar el request, no un 4xx/5xx del backend.

## Orden de ejecución y dependencias (no es idempotente)

La colección **debe ejecutarse de principio a fin en cada corrida**, no petición por petición ni carpeta por
carpeta de forma aislada (salvo las excepciones documentadas abajo). Cada carpeta consume variables de entorno
que las carpetas anteriores generan:

| Carpeta | Qué produce | Quién lo consume después |
|---|---|---|
| `00 - Health` | — | — |
| `01 - Auth` | `accessToken` (MASTER), `seedTechToken`, `seedUserToken` | todas las demás carpetas |
| `02 - Companies` | `companyId` | Departments, Users |
| `03 - Departments` | `departmentId` | Users |
| `04 - Categories & Subcategories` | `categoryId`, `subcategoryId` | Tickets |
| `05 - Priorities` | `priorityId` (+ SLA configurado) | Tickets |
| `06 - Statuses` | `customStatusId` (solo catálogo; no participa en el flujo real de tickets) | — |
| `07 - Users` | `technicianId`, `technician2Id`, `finalUserId` + sus tokens | Tickets, Notifications |
| `08 - Tickets` | `ticketId`, `ticketToCancelId`, `commentId`, `attachmentId` | Tickets (encadenado internamente) |
| `09 - Notifications` | — | — |
| `10-13` | — | — |

La colección **crea datos nuevos en cada corrida** (empresa, departamento, categoría, prioridad, usuarios, tickets
con numeración incremental, etc.) porque el backend no expone un modo de "reset" por API. Volver a correrla no
falla por duplicados (los nombres/correos de prueba usan un sufijo `.contract@empresa.com` fijo, así que una
segunda corrida fallará al crear los mismos usuarios con `POST /api/users` — email duplicado). Si necesitas
volver a correrla contra la misma base de datos, ejecuta antes `npm run db:reset -w backend` (recrea el esquema y
vuelve a sembrar) o cambia manualmente los correos/nombres únicos en la colección.

### Excepciones deliberadas a la idempotencia / cobertura

- `Auth`: el flujo de recuperación de contraseña (forgot → reset → login con clave temporal → revertir con
  `PUT /auth/password` → re-login) deja al usuario MASTER con la contraseña original al final, para que
  `adminPassword` siga siendo válido en la siguiente corrida.
- `Settings`: `GET /settings` captura los valores originales; `PUT /settings` los cambia; una última
  `PUT /settings` los revierte, para no dejar configuración global residual.
- `Users`: `POST /users/:id/reset-password` sobre el usuario final se hace con la misma contraseña que ya tenía,
  solo para cubrir el endpoint sin invalidar el login posterior.
- `Companies`, `Departments`, `Categories/Subcategories`: **se omitió a propósito** ejecutar `DELETE /:id`
  (y `DELETE /subcategories/:id`) sobre los recursos creados, porque `companyId`, `departmentId`, `categoryId` y
  `subcategoryId` se reutilizan más abajo (Users y Tickets). Borrarlos rompería el resto de la corrida. El código
  de esos endpoints DELETE existe y es simple (soft-delete a `INACTIVE` si hay dependientes, hard-delete si no);
  no se consideró de alto riesgo dejarlos sin una petición dedicada.
- `Priorities`: la petición `DELETE Prioridad de prueba (MASTER)` tiene `"disabled": true` en el JSON de la
  colección. **Ojo:** ese flag solo lo respeta la app de Postman (la muestra atenuada/no seleccionable); **Newman
  la ejecuta igual** al correr la colección completa por CLI, `disabled` no tiene ningún efecto ahí. En la práctica
  esto es útil: expone un bug real del backend (ver "Hallazgos" abajo) cada vez que se corre por Newman, en vez de
  ocultarlo silenciosamente.
- `Statuses`: el backend real no expone `DELETE /api/statuses/:id`, así que no falta ninguna petición ahí.

## Cobertura de endpoints

Se inventariaron **78 endpoints reales** (incluyendo `GET /api/health`), leyendo directamente el código de
`backend/src/app.ts` y cada `modules/*/routes.ts` — más que los ~65 estimados en el plan de migración. De esos 78:

- **73 se ejecutan por defecto** en una corrida completa de la colección (positivos + varios negativos de
  auth/RBAC por endpoint crítico).
- **1 más está presente pero deshabilitada** (`DELETE /api/priorities/:id`), documentada arriba.
- **4 quedaron fuera intencionalmente**: `DELETE /api/companies/:id`, `DELETE /api/departments/:id`,
  `DELETE /api/categories/:id`, `DELETE /api/categories/subcategories/:id` — mismo motivo que arriba (preservar
  la cadena de dependencias del resto de la colección).

Casos negativos incluidos (no exhaustivos; priorizan autenticación y RBAC como pidió el encargo): login con
credenciales inválidas, acceso sin token, creación de ticket con payload inválido, y un 403 por rol insuficiente
para al menos un endpoint crítico de cada módulo protegido por `requireRole(MASTER)` (Companies, Departments,
Categories, Statuses, Users, Reports, Audit, Settings) además de las reglas de negocio específicas de Tickets
(solo el solicitante/MASTER puede confirmar/reabrir/cancelar/editar; solo el técnico asignado puede resolver; el
solicitante no puede cambiar estados; transiciones de estado inválidas).

## Hallazgos: bugs reales detectados al correr esta colección

Se corrió tres veces (2026-09-29, backend local contra un Postgres 16 efímero en Docker) mientras se depuraba la
colección misma:

- **Corrida 1** (colección con 4 defectos propios sin corregir): 12 aserciones fallidas. 10 eran defectos de la
  colección (ya corregidos: comillas faltantes al interpolar variables de texto en JSON crudo en `Reset Password`
  y `Revertir Configuración`, strings demasiado cortas para pasar la validación Zod en el caso negativo de
  `Resolver Ticket`, y una ruta de archivo relativa mal resuelta en los adjuntos). Las 2 restantes ya eran los
  bugs reales descritos abajo.
- **Corrida 2** (colección ya corregida, pero re-ejecutada contra el **mismo proceso de backend** ~3 minutos
  después de la corrida 1): 62 aserciones fallidas. Causa: el rate-limiter de `POST /api/auth/login`
  (`backend/src/app.ts`, 15 intentos / 15 minutos por IP, **en memoria del proceso**, no se reinicia con
  `db:reset` ni con una base nueva) acumuló los intentos de ambas corridas (~9 logins por corrida) y empezó a
  rechazar logins con `429` a mitad de la corrida 2. Los tokens que nunca se obtuvieron dejaron sin autenticación
  en cascada a todo lo que dependía de ellos (Notifications, parte de Dashboard, y los negativos RBAC de
  Reports/Audit). **No es un bug ni de la colección ni del backend** — es la protección anti fuerza bruta
  funcionando como se espera. **Importante para quien vuelva a correr esta colección:** si necesitas correrla más
  de una vez en menos de 15 minutos, reinicia el proceso del backend entre corridas (el contador del rate-limiter
  vive en memoria del proceso, no en la base de datos).
- **Corrida 3** (backend recién reiniciado + base de datos recién sembrada): **4 aserciones fallidas, siempre las
  mismas 2**, confirmando que son defectos reales y estables del backend:

1. **Los errores 403/404 de `getTicketOrThrow` se devuelven como 500.**
   `backend/src/modules/tickets/helpers.ts:50-58` lanza `new Error(...)` con una propiedad `.status` añadida
   manualmente, en vez de usar la clase `HttpError` (`backend/src/middleware/error.ts:5-11`). El manejador global
   de errores (`backend/src/middleware/error.ts:17-38`) solo reconoce `instanceof HttpError`, así que estos dos
   casos (ticket no encontrado → debería ser 404; sin permiso para verlo → debería ser 403) caen al `catch` final
   y responden **500 Internal Server Error**. `getTicketOrThrow` lo usan prácticamente todos los endpoints de
   `tickets/:id/*` (detalle, edición, comentarios, adjuntos, historial, asignar, reasignar, cambiar estado,
   resolver, confirmar, reabrir, cancelar), así que el impacto es transversal a todo el módulo de tickets.
   Reproducido por dos peticiones distintas, ambas cayendo en el mismo defecto:
   - `08 - Tickets / GET Detalle de Ticket - Acceso denegado (negativo)` (esperaba 403, recibe 500).
   - `08 - Tickets / POST Resolver Ticket - Técnico no asignado (negativo)` (esperaba 403, recibe 500): aquí el
     técnico ya reasignado deja de cumplir `canAccessTicket` (`helpers.ts:30-34`), así que `getTicketOrThrow`
     lo bloquea con el mismo defecto **antes** de que el endpoint llegue a su propio chequeo de rol, correcto y
     con `HttpError`, en `backend/src/modules/tickets/routes.ts:783-785`.

2. **Eliminar una prioridad con SLA configurado devuelve 500 en vez de manejarse con gracia.**
   `backend/src/modules/priorities/routes.ts:83-96` sí contempla desactivar (en vez de borrar) una prioridad con
   tickets asociados (`ticketsCount > 0`), pero no contempla la relación 1:1 con `SlaConfiguration`
   (`backend/prisma/schema.prisma`, modelo `SlaConfiguration.priorityId`, sin `onDelete` — por defecto restringe el
   borrado a nivel de base de datos). Si la prioridad tiene SLA configurado pero cero tickets, el
   `prisma.ticketPriority.delete(...)` dispara una violación de llave foránea (Prisma `P2003`), que el manejador de
   errores tampoco traduce (solo mapea `P2002` y `P2025`), y cae al mismo 500 genérico.
   Reproducido por: `05 - Priorities / DELETE Prioridad de prueba (MASTER)`.

**Ambos bugs comparten la misma causa raíz de fondo:** `backend/src/middleware/error.ts:17-38` solo traduce a un
código HTTP correcto los errores que son `instanceof HttpError` o ciertos códigos de Prisma (`P2002`, `P2025`).
Cualquier otro error lanzado con una forma distinta (un `Error` plano con `.status`, o un código de Prisma no
contemplado como `P2003`) cae al `catch` genérico y siempre responde 500. Corregirlo en un solo lugar (ampliar
`errorHandler` para reconocer objetos con `.status` numérico y mapear `P2003`) resolvería los dos hallazgos a la
vez, sin tocar `helpers.ts` ni `priorities/routes.ts`.

## Notas sobre autenticación

- El **access token** va en el body de la respuesta de `POST /auth/login` (campo `token`) y se envía como header
  `Authorization: Bearer {{accessToken}}` en el resto de las peticiones (ver `backend/src/middleware/auth.ts`).
- El **refresh token** se entrega como cookie `httpOnly` (`refresh_token`, ver `setRefreshCookie` en
  `backend/src/modules/auth/routes.ts`) — nunca se lee ni se envía manualmente en la colección; Postman y Newman
  mantienen su propio cookie jar durante la corrida y lo reenvían automáticamente a `POST /auth/refresh` y
  `POST /auth/logout`.
