import { Router } from "express";
import { z } from "zod";
import { authenticate, requireRole, validate, HttpError } from "@helpdesk/common";
import { getDb } from "../../db/mongo.js";
import { env } from "../../config/env.js";
import { ROLES } from "../../config/constants.js";
import { logAudit } from "../../lib/audit.js";

// Adaptado desde backend/src/modules/settings/routes.ts. Único cambio real: la tabla relacional
// `Setting { key @id, value }` se convierte en documentos Mongo `{ _id: key, value, updatedAt }`
// en la colección `settings` — mismo modelo clave-valor, otro motor de almacenamiento.

const requireAuth = authenticate(env.JWT_SECRET);

export const DEFAULT_SETTINGS: Record<string, string> = {
  systemName: "MicroHelpDesk — Soporte Técnico",
  businessName: "",
  uploadMaxMb: "10",
  notificationEmailEnabled: "false",
  slaWarningPercent: "80",
};

const updateSchema = z.object({
  systemName: z.string().min(2).max(100).optional(),
  businessName: z.string().max(150).optional(),
  uploadMaxMb: z.coerce.number().int().min(1).max(100).optional(),
  notificationEmailEnabled: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === "string" ? v === "true" : v))
    .optional(),
  slaWarningPercent: z.coerce.number().int().min(1).max(99).optional(),
});

export const settingsRouter = Router();

settingsRouter.use(requireAuth, requireRole(ROLES.MASTER));

interface SettingDoc {
  _id: string;
  value: string;
  updatedAt: Date;
}

async function loadSettings(): Promise<Record<string, string>> {
  const db = await getDb();
  const rows = await db.collection<SettingDoc>("settings").find().toArray();
  const settings: Record<string, string> = { ...DEFAULT_SETTINGS };
  for (const r of rows) settings[r._id] = r.value;
  return settings;
}

// GET /api/settings
settingsRouter.get("/", async (_req, res, next) => {
  try {
    res.json(await loadSettings());
  } catch (err) {
    next(err);
  }
});

// PUT /api/settings
settingsRouter.put("/", validate({ body: updateSchema }), async (req, res, next) => {
  try {
    const entries = Object.entries(req.body);
    if (entries.length === 0) throw new HttpError(400, "Sin datos para actualizar");
    const db = await getDb();
    const collection = db.collection<SettingDoc>("settings");
    await Promise.all(
      entries.map(([key, value]) =>
        collection.updateOne({ _id: key }, { $set: { value: String(value), updatedAt: new Date() } }, { upsert: true }),
      ),
    );
    await logAudit({
      userId: req.user!.sub,
      action: "SETTINGS_UPDATED",
      entityType: "SETTINGS",
      description: `Actualizó configuración del sistema: ${entries.map(([k]) => k).join(", ")}`,
      req,
    });
    res.json(await loadSettings());
  } catch (err) {
    next(err);
  }
});
