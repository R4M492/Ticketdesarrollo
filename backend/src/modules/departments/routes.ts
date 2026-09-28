import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { ROLES } from "../../config/constants.js";
import { authenticate } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/rbac.js";
import { validate } from "../../middleware/validate.js";
import { HttpError } from "../../middleware/error.js";
import { logAudit } from "../../lib/audit.js";

const departmentSchema = z.object({
  companyId: z.number().int().positive("Empresa obligatoria"),
  name: z.string().min(2, "El nombre es obligatorio").max(150),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional().default("ACTIVE"),
});

export const departmentsRouter = Router();

// GET /api/departments — opcional filtrar por empresa
departmentsRouter.get("/", authenticate, async (req, res, next) => {
  try {
    const companyId = req.query.companyId ? Number(req.query.companyId) : undefined;
    const where = {
      ...(companyId ? { companyId } : {}),
      ...(req.user!.role.code === ROLES.MASTER ? {} : { status: "ACTIVE" }),
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

// POST /api/departments
departmentsRouter.post("/", authenticate, requireRole(ROLES.MASTER), validate({ body: departmentSchema }), async (req, res, next) => {
  try {
    const department = await prisma.department.create({ data: req.body, include: { company: true } });
    logAudit({
      userId: req.user!.id,
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
departmentsRouter.put("/:id", authenticate, requireRole(ROLES.MASTER), validate({ body: departmentSchema.partial() }), async (req, res, next) => {
  try {
    const department = await prisma.department.update({
      where: { id: Number(req.params.id) },
      data: req.body,
      include: { company: true },
    });
    logAudit({
      userId: req.user!.id,
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

// DELETE /api/departments/:id — desactiva si tiene usuarios/tickets
departmentsRouter.delete("/:id", authenticate, requireRole(ROLES.MASTER), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const department = await prisma.department.findUnique({ where: { id } });
    if (!department) throw new HttpError(404, "Departamento no encontrado");
    const usersCount = await prisma.user.count({ where: { departmentId: id } });
    if (usersCount > 0) {
      await prisma.department.update({ where: { id }, data: { status: "INACTIVE" } });
      logAudit({
        userId: req.user!.id,
        action: "DEPARTMENT_DEACTIVATED",
        entityType: "DEPARTMENT",
        entityId: id,
        description: `Desactivó el departamento ${department.name} (tiene usuarios asociados)`,
        req,
      });
      return res.json({ ok: true, deactivated: true });
    }
    await prisma.department.delete({ where: { id } });
    logAudit({
      userId: req.user!.id,
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
