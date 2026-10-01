import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authenticate, requireRole, validate, HttpError } from "@helpdesk/common";
import { prisma } from "../../lib/prisma.js";
import { env } from "../../config/env.js";
import { USER_STATUS, ROLES } from "../../config/constants.js";
import { logAudit } from "../../lib/audit.js";
import { companyExists, getDepartment } from "../../lib/organization-client.js";

// Adaptado desde backend/src/modules/users/routes.ts. Cambios respecto al original:
// - companyId/departmentId ya no se validan contra una tabla local (Department vivía en la misma
//   base en el monolito) sino con una llamada HTTP a organization-service (ver
//   lib/organization-client.ts) — "validación síncrona al escribir", plan de migración sección 4.3.
// - Las consultas ya no incluyen `company`/`department` (ver nota en auth/routes.ts): siguen sin
//   venir pobladas como objeto anidado, solo el companyId/departmentId numérico.
// - `logAudit` publica un evento real desde la Fase 3 (antes era un stub no-op).

/** Valida companyId/departmentId contra organization-service; lanza HttpError(400) si no cuadran. */
async function validateOrganizationRefs(
  companyId: number | null | undefined,
  departmentId: number | null | undefined,
  authorization: string,
): Promise<void> {
  if (companyId != null && !(await companyExists(companyId, authorization))) {
    throw new HttpError(400, "Empresa inválida");
  }
  if (departmentId != null) {
    const dept = await getDepartment(departmentId, authorization);
    if (!dept) throw new HttpError(400, "Departamento inválido");
    if (companyId != null && dept.companyId !== companyId) {
      throw new HttpError(400, "El departamento no pertenece a la empresa seleccionada");
    }
  }
}

const requireAuth = authenticate(env.JWT_SECRET);

const userCreateSchema = z.object({
  name: z.string().min(2, "El nombre es obligatorio").max(150),
  email: z.string().email("Correo inválido").transform((v) => v.toLowerCase().trim()),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  roleCode: z.enum([ROLES.MASTER, ROLES.TECNICO, ROLES.USUARIO]),
  phone: z.string().max(30).nullable().optional(),
  position: z.string().max(100).nullable().optional(),
  companyId: z.number().int().positive().nullable().optional(),
  departmentId: z.number().int().positive().nullable().optional(),
  status: z.enum([USER_STATUS.ACTIVE, USER_STATUS.INACTIVE]).optional().default(USER_STATUS.ACTIVE),
});

const userUpdateSchema = userCreateSchema.partial().omit({ password: true });

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(150).optional(),
  roleCode: z.string().optional(),
  companyId: z.coerce.number().int().optional(),
  status: z.string().optional(),
});

export const usersRouter = Router();

// Las siguientes dos rutas van ANTES del guard de MASTER a propósito: las llama otro servicio
// (ticketing-service, Fase 8) para resolver usuarios sin importar el rol de quien originó el
// request — ej. un USUARIO crea un ticket y hay que avisarle a todos los MASTER, o el listado de
// tickets necesita el nombre del solicitante/técnico de cada fila. Exponen solo lo mínimo
// (id/nombre/correo/rol/estado, nunca el hash de contraseña) y siguen exigiendo un JWT válido.

const lookupQuerySchema = z.object({
  ids: z.string().min(1),
});

// GET /api/users/lookup?ids=1,2,3 — resolución en lote para enriquecer respuestas de otros servicios.
usersRouter.get("/lookup", requireAuth, validate({ query: lookupQuerySchema }), async (req, res, next) => {
  try {
    const ids = String(req.query.ids)
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
    const users = await prisma.user.findMany({
      where: { id: { in: ids } },
      include: { role: true },
    });
    res.json(
      users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        roleCode: u.role.code,
        status: u.status,
      })),
    );
  } catch (err) {
    next(err);
  }
});

// GET /api/users/by-role/:roleCode — usuarios activos de un rol (ej. todos los MASTER, para notifyRole).
usersRouter.get("/by-role/:roleCode", requireAuth, async (req, res, next) => {
  try {
    const role = await prisma.role.findUnique({ where: { code: req.params.roleCode } });
    if (!role) return res.json([]);
    const users = await prisma.user.findMany({
      where: { roleId: role.id, status: USER_STATUS.ACTIVE },
      select: { id: true, name: true },
    });
    res.json(users);
  } catch (err) {
    next(err);
  }
});

usersRouter.use(requireAuth, requireRole(ROLES.MASTER));

// GET /api/users
usersRouter.get("/", validate({ query: listQuerySchema }), async (req, res, next) => {
  try {
    const { search, roleCode, companyId, status } = req.query;
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 20;
    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { name: { contains: String(search) } },
        { email: { contains: String(search) } },
        { position: { contains: String(search) } },
      ];
    }
    if (roleCode) where.role = { code: String(roleCode) };
    if (companyId) where.companyId = Number(companyId);
    if (status) where.status = String(status);

    const [total, rows] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        include: { role: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const data = rows.map(({ passwordHash: _ph, ...u }) => u);
    res.json({ data, total, page, pageSize });
  } catch (err) {
    next(err);
  }
});

// GET /api/users/technicians (técnicos activos para asignación)
usersRouter.get("/technicians", async (_req, res, next) => {
  try {
    const role = await prisma.role.findUnique({ where: { code: ROLES.TECNICO } });
    if (!role) return res.json([]);
    const technicians = await prisma.user.findMany({
      where: { roleId: role.id, status: USER_STATUS.ACTIVE },
      orderBy: { name: "asc" },
    });
    res.json(technicians.map(({ passwordHash: _ph, ...t }) => t));
  } catch (err) {
    next(err);
  }
});

// GET /api/users/:id
usersRouter.get("/:id", async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: Number(req.params.id) },
      include: { role: true },
    });
    if (!user) throw new HttpError(404, "Usuario no encontrado");
    const { passwordHash: _ph, ...safe } = user;
    res.json(safe);
  } catch (err) {
    next(err);
  }
});

// POST /api/users
usersRouter.post("/", validate({ body: userCreateSchema }), async (req, res, next) => {
  try {
    const { roleCode, password, ...rest } = req.body;
    const role = await prisma.role.findUnique({ where: { code: roleCode } });
    if (!role) throw new HttpError(400, "Rol inválido");

    await validateOrganizationRefs(rest.companyId, rest.departmentId, req.headers.authorization!);

    const user = await prisma.user.create({
      data: {
        ...rest,
        passwordHash: await bcrypt.hash(password, 12),
        roleId: role.id,
        companyId: rest.companyId ?? null,
        departmentId: rest.departmentId ?? null,
      },
      include: { role: true },
    });
    logAudit({
      userId: req.user!.sub,
      action: "USER_CREATED",
      entityType: "USER",
      entityId: user.id,
      description: `Creó el usuario ${user.email} con rol ${role.code}`,
      req,
    });
    const { passwordHash: _ph, ...safe } = user;
    res.status(201).json(safe);
  } catch (err) {
    next(err);
  }
});

// PUT /api/users/:id
usersRouter.put("/:id", validate({ body: userUpdateSchema }), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "Usuario no encontrado");

    const { roleCode, ...rest } = req.body;
    let roleId: number | undefined;
    if (roleCode) {
      const role = await prisma.role.findUnique({ where: { code: roleCode } });
      if (!role) throw new HttpError(400, "Rol inválido");
      roleId = role.id;
    }

    if (rest.departmentId != null) {
      const effectiveCompanyId = rest.companyId ?? existing.companyId ?? undefined;
      await validateOrganizationRefs(effectiveCompanyId, rest.departmentId, req.headers.authorization!);
    } else if (rest.companyId != null) {
      await validateOrganizationRefs(rest.companyId, null, req.headers.authorization!);
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...rest,
        companyId: rest.companyId === undefined ? undefined : rest.companyId,
        departmentId: rest.departmentId === undefined ? undefined : rest.departmentId,
        roleId,
      },
      include: { role: true },
    });
    logAudit({
      userId: req.user!.sub,
      action: "USER_UPDATED",
      entityType: "USER",
      entityId: user.id,
      description: `Modificó el usuario ${user.email}`,
      req,
    });
    const { passwordHash: _ph, ...safe } = user;
    res.json(safe);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/users/:id/status
usersRouter.patch("/:id/status", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const status = String(req.body.status ?? "");
    if (!([USER_STATUS.ACTIVE, USER_STATUS.INACTIVE] as string[]).includes(status)) {
      throw new HttpError(400, "Estado inválido");
    }
    const user = await prisma.user.update({
      where: { id },
      data: { status: status as "ACTIVE" | "INACTIVE" },
      include: { role: true },
    });
    logAudit({
      userId: req.user!.sub,
      action: "USER_STATUS_CHANGED",
      entityType: "USER",
      entityId: user.id,
      description: `Cambió el estado del usuario ${user.email} a ${status}`,
      req,
    });
    res.json({ ok: true, user: { id: user.id, status: user.status } });
  } catch (err) {
    next(err);
  }
});

// POST /api/users/:id/reset-password
usersRouter.post("/:id/reset-password", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const newPassword = String(req.body.password ?? "");
    if (newPassword.length < 8) throw new HttpError(400, "La contraseña debe tener al menos 8 caracteres");
    const user = await prisma.user.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(newPassword, 12) },
    });
    logAudit({
      userId: req.user!.sub,
      action: "USER_PASSWORD_RESET",
      entityType: "USER",
      entityId: user.id,
      description: `Restableció la contraseña del usuario ${user.email}`,
      req,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
