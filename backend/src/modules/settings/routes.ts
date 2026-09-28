import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { ROLES } from "../../config/constants.js";
import { authenticate } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/rbac.js";
import { validate } from "../../middleware/validate.js";
import { logAudit } from "../../lib/audit.js";

export const DEFAULT_SETTINGS: Record<string, string> = {
  systemName: "HelpDesk — Soporte Técnico",
  businessName: "",
  uploadMaxMb: "10",
  notificationEmailEnabled: "false",
  slaWarningPercent: "80",
};

const updateSchema = z.object({
  systemName: z.string().min(2).max(100).optional(),
  businessName: z.string().max(150).optional(),
  uploadMaxMb: z.coerce.number().int().min(1).max(100).optional(),
  notificationEmailEnabled: z.coerce.boolean().optional(),
  slaWarningPercent: z.coerce.number().int().min(1).max(99).optional(),
});

export const settingsRouter = Router();

settingsRouter.use(authenticate, requireRole(ROLES.MASTER));

// GET /api/settings
settingsRouter.get("/", async (_req, res, next) => {
  try {
    const rows = await prisma.setting.findMany();
    const settings: Record<string, string> = { ...DEFAULT_SETTINGS };
    for (const r of rows) settings[r.key] = r.value;
    res.json(settings);
  } catch (err) {
    next(err);
  }
});

// PUT /api/settings
settingsRouter.put("/", validate({ body: updateSchema }), async (req, res, next) => {
  try {
    const entries = Object.entries(req.body);
    if (entries.length === 0) throw new Error("Sin datos para actualizar");
    await prisma.$transaction(
      entries.map(([key, value]) =>
        prisma.setting.upsert({
          where: { key },
          create: { key, value: String(value) },
          update: { value: String(value) },
        }),
      ),
    );
    await logAudit({
      userId: req.user!.id,
      action: "SETTINGS_UPDATED",
      entityType: "SETTINGS",
      description: `Actualizó configuración del sistema: ${entries.map(([k]) => k).join(", ")}`,
      req,
    });
    const rows = await prisma.setting.findMany();
    const settings: Record<string, string> = { ...DEFAULT_SETTINGS };
    for (const r of rows) settings[r.key] = r.value;
    res.json(settings);
  } catch (err) {
    next(err);
  }
});
