import { Router } from "express";
import { z } from "zod";
import { authenticate, requireRole, validate, HttpError } from "@helpdesk/common";
import { prisma } from "../../lib/prisma.js";
import { env } from "../../config/env.js";
import { ROLES } from "../../config/constants.js";
import { logAudit } from "../../lib/audit.js";

// Adaptado desde backend/src/modules/departments/routes.ts. Mismo cambio que companies/routes.ts
// en el DELETE (ya no valida contra User, ver esa nota). Se agrega GET /:id — lo necesita
// identity-service para validar departmentId (y que pertenezca a companyId) al crear/editar un
// usuario, ver services/identity-service/src/lib/organization-client.ts.

const requireAuth = authenticate(env.JWT_SECRET);

const departmentSchema = z.object({
  companyId: z.number().int().positive("Empresa obligatoria"),
  name: z.string().min(2, "El nombre es obligatorio").max(150),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional().default("ACTIVE"),
});

export const departmentsRouter = Router();

// GET /api/departments — opcional filtrar por empresa
departmentsRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const companyId = req.query.companyId ? Number(req.query.companyId) : undefined;
    const where = {
      ...(companyId ? { companyId } : {}),
      ...(req.user!.role === ROLES.MASTER ? {} : { status: "ACTIVE" }),
    };
    const departments = await prisma.department.findMany({
      where,
      include: { company: true },
      orderBy: { name: "asc" },
    });
    res.json(departments);
  } catch (err) {
    next(err);
  }
});

// GET /api/departments/:id
departmentsRouter.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const department = await prisma.department.findUnique({ where: { id: Number(req.params.id) } });
    if (!department) throw new HttpError(404, "Departamento no encontrado");
    res.json(department);
  } catch (err) {
    next(err);
  }
});

// POST /api/departments
departmentsRouter.post("/", requireAuth, requireRole(ROLES.MASTER), validate({ body: departmentSchema }), async (req, res, next) => {
  try {
    const department = await prisma.department.create({ data: req.body, include: { company: true } });
    logAudit({
      userId: req.user!.sub,
      action: "DEPARTMENT_CREATED",
      entityType: "DEPARTMENT",
      entityId: department.id,
      description: `Creó el departamento ${department.name}`,
      req,
    });
    res.status(201).json(department);
  } catch (err) {
    next(err);
  }
});

// PUT /api/departments/:id
departmentsRouter.put("/:id", requireAuth, requireRole(ROLES.MASTER), validate({ body: departmentSchema.partial() }), async (req, res, next) => {
  try {
    const department = await prisma.department.update({
      where: { id: Number(req.params.id) },
      data: req.body,
      include: { company: true },
    });
    logAudit({
      userId: req.user!.sub,
      action: "DEPARTMENT_UPDATED",
      entityType: "DEPARTMENT",
      entityId: department.id,
      description: `Modificó el departamento ${department.name}`,
      req,
    });
    res.json(department);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/departments/:id
departmentsRouter.delete("/:id", requireAuth, requireRole(ROLES.MASTER), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const department = await prisma.department.findUnique({ where: { id } });
    if (!department) throw new HttpError(404, "Departamento no encontrado");
    await prisma.department.delete({ where: { id } });
    logAudit({
      userId: req.user!.sub,
      action: "DEPARTMENT_DELETED",
      entityType: "DEPARTMENT",
      entityId: id,
      description: `Eliminó el departamento ${department.name}`,
      req,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
