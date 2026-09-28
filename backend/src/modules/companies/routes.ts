import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { ROLES } from "../../config/constants.js";
import { authenticate } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/rbac.js";
import { validate } from "../../middleware/validate.js";
import { HttpError } from "../../middleware/error.js";
import { logAudit } from "../../lib/audit.js";

const companySchema = z.object({
  name: z.string().min(2, "El nombre es obligatorio").max(150),
  description: z.string().max(500).nullable().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional().default("ACTIVE"),
});

export const companiesRouter = Router();

// GET /api/companies — listado (autenticado; para formularios de todos los roles)
companiesRouter.get("/", authenticate, async (req, res, next) => {
  try {
    const companies = await prisma.company.findMany({
      where: req.user!.role.code === ROLES.MASTER ? undefined : { status: "ACTIVE" },
      include: { _count: { select: { departments: true } } },
      orderBy: { name: "asc" },
    });
    res.json(companies);
  } catch (err) {
    next(err);
  }
});

// GET /api/companies/:id/departments
companiesRouter.get("/:id/departments", authenticate, async (req, res, next) => {
  try {
    const departments = await prisma.department.findMany({
      where: { companyId: Number(req.params.id), status: "ACTIVE" },
      orderBy: { name: "asc" },
    });
    res.json(departments);
  } catch (err) {
    next(err);
  }
});

// POST /api/companies
companiesRouter.post("/", authenticate, requireRole(ROLES.MASTER), validate({ body: companySchema }), async (req, res, next) => {
  try {
    const company = await prisma.company.create({ data: req.body });
    logAudit({
      userId: req.user!.id,
      action: "COMPANY_CREATED",
      entityType: "COMPANY",
      entityId: company.id,
      description: `Creó la empresa ${company.name}`,
      req,
    });
    res.status(201).json(company);
  } catch (err) {
    next(err);
  }
});

// PUT /api/companies/:id
companiesRouter.put("/:id", authenticate, requireRole(ROLES.MASTER), validate({ body: companySchema.partial() }), async (req, res, next) => {
  try {
    const company = await prisma.company.update({
      where: { id: Number(req.params.id) },
      data: req.body,
    });
    logAudit({
      userId: req.user!.id,
      action: "COMPANY_UPDATED",
      entityType: "COMPANY",
      entityId: company.id,
      description: `Modificó la empresa ${company.name}`,
      req,
    });
    res.json(company);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/companies/:id — desactiva (no elimina por integridad del historial)
companiesRouter.delete("/:id", authenticate, requireRole(ROLES.MASTER), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const company = await prisma.company.findUnique({ where: { id } });
    if (!company) throw new HttpError(404, "Empresa no encontrada");
    const usersCount = await prisma.user.count({ where: { companyId: id } });
    if (usersCount > 0) {
      await prisma.company.update({ where: { id }, data: { status: "INACTIVE" } });
      logAudit({
        userId: req.user!.id,
        action: "COMPANY_DEACTIVATED",
        entityType: "COMPANY",
        entityId: id,
        description: `Desactivó la empresa ${company.name} (tiene usuarios asociados)`,
        req,
      });
      return res.json({ ok: true, deactivated: true });
    }
    await prisma.company.delete({ where: { id } });
    logAudit({
      userId: req.user!.id,
      action: "COMPANY_DELETED",
      entityType: "COMPANY",
      entityId: id,
      description: `Eliminó la empresa ${company.name}`,
      req,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
