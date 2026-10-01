import { Router } from "express";
import { z } from "zod";
import { authenticate, requireRole, validate } from "@helpdesk/common";
import { prisma } from "../../lib/prisma.js";
import { env } from "../../config/env.js";
import { ROLES } from "../../config/constants.js";
import { logAudit } from "../../lib/audit.js";

// Adaptado desde backend/src/modules/categories/routes.ts. Cambio respecto al original:
// - Los DELETE ya no verifican `prisma.ticket.count(...)` antes de decidir si desactivar en vez
//   de borrar — Ticket vive ahora en ticketing-service, otra base de datos. Por ahora el borrado
//   es directo (no hay tickets creados todavía porque ticketing-service no existe: Fase 8).
//   TODO (Fase 8): antes de borrar, consultar a ticketing-service si hay tickets que referencian
//   esta categoría/subcategoría, o migrar a "desactivar siempre, nunca borrar duro".

const requireAuth = authenticate(env.JWT_SECRET);

const categorySchema = z.object({
  name: z.string().min(2, "El nombre es obligatorio").max(100),
  description: z.string().max(500).nullable().optional(),
  sortOrder: z.number().int().optional().default(0),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional().default("ACTIVE"),
});

const subcategorySchema = z.object({
  categoryId: z.number().int().positive("Categoría obligatoria"),
  name: z.string().min(2, "El nombre es obligatorio").max(100),
  sortOrder: z.number().int().optional().default(0),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional().default("ACTIVE"),
});

export const categoriesRouter = Router();

// GET /api/categories — con subcategorías activas
categoriesRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const categories = await prisma.ticketCategory.findMany({
      where: req.user!.role === ROLES.MASTER ? undefined : { status: "ACTIVE" },
      include: { subcategories: { where: { status: "ACTIVE" }, orderBy: { sortOrder: "asc" } } },
      orderBy: { sortOrder: "asc" },
    });
    res.json(categories);
  } catch (err) {
    next(err);
  }
});

// POST /api/categories
categoriesRouter.post("/", requireAuth, requireRole(ROLES.MASTER), validate({ body: categorySchema }), async (req, res, next) => {
  try {
    const category = await prisma.ticketCategory.create({ data: req.body });
    logAudit({
      userId: req.user!.sub,
      action: "CATEGORY_CREATED",
      entityType: "CATEGORY",
      entityId: category.id,
      description: `Creó la categoría ${category.name}`,
      req,
    });
    res.status(201).json(category);
  } catch (err) {
    next(err);
  }
});

// PUT /api/categories/:id
categoriesRouter.put("/:id", requireAuth, requireRole(ROLES.MASTER), validate({ body: categorySchema.partial() }), async (req, res, next) => {
  try {
    const category = await prisma.ticketCategory.update({
      where: { id: Number(req.params.id) },
      data: req.body,
    });
    logAudit({
      userId: req.user!.sub,
      action: "CATEGORY_UPDATED",
      entityType: "CATEGORY",
      entityId: category.id,
      description: `Modificó la categoría ${category.name}`,
      req,
    });
    res.json(category);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/categories/:id
categoriesRouter.delete("/:id", requireAuth, requireRole(ROLES.MASTER), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await prisma.ticketCategory.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/categories/:id/subcategories
categoriesRouter.get("/:id/subcategories", requireAuth, async (req, res, next) => {
  try {
    const subcategories = await prisma.ticketSubcategory.findMany({
      where: { categoryId: Number(req.params.id) },
      orderBy: { sortOrder: "asc" },
    });
    res.json(subcategories);
  } catch (err) {
    next(err);
  }
});

// POST /api/categories/subcategories
categoriesRouter.post("/subcategories", requireAuth, requireRole(ROLES.MASTER), validate({ body: subcategorySchema }), async (req, res, next) => {
  try {
    const subcategory = await prisma.ticketSubcategory.create({ data: req.body, include: { category: true } });
    logAudit({
      userId: req.user!.sub,
      action: "SUBCATEGORY_CREATED",
      entityType: "SUBCATEGORY",
      entityId: subcategory.id,
      description: `Creó la subcategoría ${subcategory.name}`,
      req,
    });
    res.status(201).json(subcategory);
  } catch (err) {
    next(err);
  }
});

// PUT /api/categories/subcategories/:id
categoriesRouter.put("/subcategories/:id", requireAuth, requireRole(ROLES.MASTER), validate({ body: subcategorySchema.partial() }), async (req, res, next) => {
  try {
    const subcategory = await prisma.ticketSubcategory.update({
      where: { id: Number(req.params.id) },
      data: req.body,
      include: { category: true },
    });
    logAudit({
      userId: req.user!.sub,
      action: "SUBCATEGORY_UPDATED",
      entityType: "SUBCATEGORY",
      entityId: subcategory.id,
      description: `Modificó la subcategoría ${subcategory.name}`,
      req,
    });
    res.json(subcategory);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/categories/subcategories/:id
categoriesRouter.delete("/subcategories/:id", requireAuth, requireRole(ROLES.MASTER), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await prisma.ticketSubcategory.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
