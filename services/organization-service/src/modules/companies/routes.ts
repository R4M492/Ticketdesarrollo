import { Router } from "express";
import { z } from "zod";
import { authenticate, requireRole, validate, HttpError } from "@helpdesk/common";
import { prisma } from "../../lib/prisma.js";
import { env } from "../../config/env.js";
import { ROLES } from "../../config/constants.js";
import { logAudit } from "../../lib/audit.js";

// Adaptado desde backend/src/modules/companies/routes.ts. Cambios respecto al original:
// - El DELETE ya no verifica `prisma.user.count(...)` antes de decidir si desactivar en vez de
//   borrar — User vive en identity-service, otra base de datos. Por ahora borra directo.
//   TODO: antes de borrar, consultar a identity-service si hay usuarios que referencian esta
//   empresa (mismo patrón usado en la Fase 6 para el sentido inverso, ver users/routes.ts).
// - Se agrega GET /:id (no existía en el monolito): identity-service lo necesita para validar
//   companyId al crear/editar un usuario (ver services/identity-service/src/lib/organization-client.ts).

const requireAuth = authenticate(env.JWT_SECRET);

const companySchema = z.object({
  name: z.string().min(2, "El nombre es obligatorio").max(150),
  description: z.string().max(500).nullable().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional().default("ACTIVE"),
});

export const companiesRouter = Router();

// GET /api/companies — listado (autenticado; para formularios de todos los roles)
companiesRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const companies = await prisma.company.findMany({
      where: req.user!.role === ROLES.MASTER ? undefined : { status: "ACTIVE" },
      include: { _count: { select: { departments: true } } },
      orderBy: { name: "asc" },
    });
    res.json(companies);
  } catch (err) {
    next(err);
  }
});

// GET /api/companies/:id
companiesRouter.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const company = await prisma.company.findUnique({ where: { id: Number(req.params.id) } });
    if (!company) throw new HttpError(404, "Empresa no encontrada");
    res.json(company);
  } catch (err) {
    next(err);
  }
});

// GET /api/companies/:id/departments
companiesRouter.get("/:id/departments", requireAuth, async (req, res, next) => {
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
companiesRouter.post("/", requireAuth, requireRole(ROLES.MASTER), validate({ body: companySchema }), async (req, res, next) => {
  try {
    const company = await prisma.company.create({ data: req.body });
    logAudit({
      userId: req.user!.sub,
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
companiesRouter.put("/:id", requireAuth, requireRole(ROLES.MASTER), validate({ body: companySchema.partial() }), async (req, res, next) => {
  try {
    const company = await prisma.company.update({
      where: { id: Number(req.params.id) },
      data: req.body,
    });
    logAudit({
      userId: req.user!.sub,
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

// DELETE /api/companies/:id
companiesRouter.delete("/:id", requireAuth, requireRole(ROLES.MASTER), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const company = await prisma.company.findUnique({ where: { id } });
    if (!company) throw new HttpError(404, "Empresa no encontrada");
    await prisma.company.delete({ where: { id } });
    logAudit({
      userId: req.user!.sub,
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
