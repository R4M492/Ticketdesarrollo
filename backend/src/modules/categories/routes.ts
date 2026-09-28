import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { ROLES } from "../../config/constants.js";
import { authenticate } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/rbac.js";
import { validate } from "../../middleware/validate.js";
import { HttpError } from "../../middleware/error.js";
import { logAudit } from "../../lib/audit.js";

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
categoriesRouter.get("/", authenticate, async (req, res, next) => {
  try {
    const categories = await prisma.ticketCategory.findMany({
      where: req.user!.role.code === ROLES.MASTER ? undefined : { status: "ACTIVE" },
      include: { subcategories: { where: { status: "ACTIVE" }, orderBy: { sortOrder: "asc" } } },
      orderBy: { sortOrder: "asc" },
    });
    res.json(categories);
  } catch (err) {
    next(err);
  }
});

// POST /api/categories
categoriesRouter.post("/", authenticate, requireRole(ROLES.MASTER), validate({ body: categorySchema }), async (req, res, next) => {
  try {
    const category = await prisma.ticketCategory.create({ data: req.body });
    logAudit({
      userId: req.user!.id,
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
categoriesRouter.put("/:id", authenticate, requireRole(ROLES.MASTER), validate({ body: categorySchema.partial() }), async (req, res, next) => {
  try {
    const category = await prisma.ticketCategory.update({
      where: { id: Number(req.params.id) },
      data: req.body,
    });
    logAudit({
      userId: req.user!.id,
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
categoriesRouter.delete("/:id", authenticate, requireRole(ROLES.MASTER), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const ticketsCount = await prisma.ticket.count({ where: { categoryId: id } });
    if (ticketsCount > 0) {
      await prisma.ticketCategory.update({ where: { id }, data: { status: "INACTIVE" } });
      return res.json({ ok: true, deactivated: true });
    }
    await prisma.ticketCategory.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/categories/:id/subcategories
categoriesRouter.get("/:id/subcategories", authenticate, async (req, res, next) => {
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

// POST /api/subcategories
categoriesRouter.post("/subcategories", authenticate, requireRole(ROLES.MASTER), validate({ body: subcategorySchema }), async (req, res, next) => {
  try {
    const subcategory = await prisma.ticketSubcategory.create({ data: req.body, include: { category: true } });
    logAudit({
      userId: req.user!.id,
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

// PUT /api/subcategories/:id
categoriesRouter.put("/subcategories/:id", authenticate, requireRole(ROLES.MASTER), validate({ body: subcategorySchema.partial() }), async (req, res, next) => {
  try {
    const subcategory = await prisma.ticketSubcategory.update({
      where: { id: Number(req.params.id) },
      data: req.body,
      include: { category: true },
    });
    logAudit({
      userId: req.user!.id,
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

// DELETE /api/subcategories/:id
categoriesRouter.delete("/subcategories/:id", authenticate, requireRole(ROLES.MASTER), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const ticketsCount = await prisma.ticket.count({ where: { subcategoryId: id } });
    if (ticketsCount > 0) {
      await prisma.ticketSubcategory.update({ where: { id }, data: { status: "INACTIVE" } });
      return res.json({ ok: true, deactivated: true });
    }
    await prisma.ticketSubcategory.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export { HttpError };
