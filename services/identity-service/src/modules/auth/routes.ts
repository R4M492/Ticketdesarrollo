import { Router, type Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { z } from "zod";
import { authenticate, signAccessToken, validate, HttpError } from "@helpdesk/common";
import { prisma } from "../../lib/prisma.js";
import { env } from "../../config/env.js";
import { USER_STATUS, NOTIFICATION_TYPE_PASSWORD_RESET } from "../../config/constants.js";
import { logAudit } from "../../lib/audit.js";
import { createNotification } from "../../lib/notifications.js";

// Adaptado desde backend/src/modules/auth/routes.ts. Cambios respecto al original:
// - `authenticate` ya no carga el usuario completo desde BD en cada request (ver
//   packages/common/src/auth.ts): solo verifica la firma del JWT. req.user es
//   { sub: userId, role: roleCode }, no el registro completo de User.
// - Las consultas de usuario ya no incluyen `company`/`department` (esas relaciones
//   viven ahora en organization-service; company/department quedan ausentes en la
//   respuesta hasta que exista una composición entre servicios — ver plan, Fase 6).
// - `logAudit` y `createNotification` son stubs locales no-op (ver src/lib/) hasta
//   que audit-service (Fase 3) y notification-service (Fase 4) existan de verdad.

const requireAuth = authenticate(env.JWT_SECRET);

const REFRESH_COOKIE = "refresh_token";

function setRefreshCookie(res: Response, token: string, remember: boolean) {
  const days = remember ? env.REMEMBER_REFRESH_TOKEN_DAYS : env.REFRESH_TOKEN_DAYS;
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    maxAge: days * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, { path: "/" });
}

async function issueRefreshToken(userId: number, remember: boolean, res: Response) {
  const token = crypto.randomBytes(48).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const days = remember ? env.REMEMBER_REFRESH_TOKEN_DAYS : env.REFRESH_TOKEN_DAYS;
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
    },
  });
  setRefreshCookie(res, token, remember);
}

const loginSchema = z.object({
  email: z.string().email("Correo inválido").transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1, "La contraseña es obligatoria"),
  rememberMe: z.boolean().optional().default(false),
});

const forgotSchema = z.object({
  email: z.string().email("Correo inválido").transform((v) => v.toLowerCase().trim()),
});

const resetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

const profileSchema = z.object({
  name: z.string().min(2).max(150).optional(),
  phone: z.string().max(30).nullable().optional(),
  position: z.string().max(100).nullable().optional(),
  avatarUrl: z.string().max(300).nullable().optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

export const authRouter = Router();

// POST /api/auth/login
authRouter.post("/login", validate({ body: loginSchema }), async (req, res, next) => {
  try {
    const { email, password, rememberMe } = req.body;
    const user = await prisma.user.findUnique({
      where: { email },
      include: { role: true },
    });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      logAudit({
        userId: user?.id,
        action: "LOGIN_FAILED",
        entityType: "AUTH",
        description: `Intento de inicio de sesión fallido para ${email}`,
        req,
      }).catch(() => {});
      return res.status(401).json({ error: "Correo o contraseña incorrectos" });
    }
    if (user.status !== USER_STATUS.ACTIVE) {
      return res.status(403).json({ error: "El usuario está desactivado. Contacta al administrador." });
    }

    const { passwordHash: _ph, ...safe } = user;
    const token = signAccessToken({ sub: user.id, role: user.role.code, name: user.name }, env.JWT_SECRET, env.ACCESS_TOKEN_MINUTES);

    await Promise.all([
      prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
      issueRefreshToken(user.id, rememberMe, res),
      logAudit({
        userId: user.id,
        action: "LOGIN",
        entityType: "AUTH",
        description: `Inicio de sesión de ${user.email}`,
        req,
      }).catch(() => {}),
    ]);

    res.json({ token, user: safe });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
authRouter.post("/logout", async (req, res, next) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (token) {
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      await prisma.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    clearRefreshCookie(res);
    if (req.user) {
      logAudit({
        userId: req.user.sub,
        action: "LOGOUT",
        entityType: "AUTH",
        description: `Cierre de sesión del usuario ${req.user.sub}`,
        req,
      }).catch(() => {});
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/refresh
authRouter.post("/refresh", async (req, res, next) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!token) return res.status(401).json({ error: "Sesión expirada" });

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      clearRefreshCookie(res);
      return res.status(401).json({ error: "Sesión expirada" });
    }

    const user = await prisma.user.findUnique({
      where: { id: stored.userId },
      include: { role: true },
    });
    if (!user || user.status !== USER_STATUS.ACTIVE) {
      clearRefreshCookie(res);
      return res.status(401).json({ error: "Usuario no disponible" });
    }

    await Promise.all([
      prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } }),
      issueRefreshToken(user.id, true, res),
    ]);

    const { passwordHash: _ph, ...safe } = user;
    res.json({
      token: signAccessToken({ sub: user.id, role: user.role.code, name: user.name }, env.JWT_SECRET, env.ACCESS_TOKEN_MINUTES),
      user: safe,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/forgot-password
authRouter.post("/forgot-password", validate({ body: forgotSchema }), async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.json({ ok: true, message: "Si el correo existe, recibirás instrucciones para restablecer la contraseña." });
    }

    const token = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    await prisma.passwordReset.create({
      data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    });

    logAudit({
      userId: user.id,
      action: "PASSWORD_RESET_REQUESTED",
      entityType: "AUTH",
      description: `Solicitud de restablecimiento de contraseña para ${email}`,
      req,
    }).catch(() => {});

    const resetLink = `${req.protocol}://${req.get("host")}/reset-password?token=${token}`;
    console.log(`[email] Restablecer contraseña para ${email}: ${resetLink}`);
    createNotification({
      userId: user.id,
      type: NOTIFICATION_TYPE_PASSWORD_RESET,
      title: "Restablecimiento de contraseña",
      message: `Se solicitó restablecer tu contraseña. Usa el enlace (válido por 1 hora). Si no fuiste tú, ignora este mensaje.`,
    }).catch(() => {});

    res.json({
      ok: true,
      message: "Si el correo existe, recibirás instrucciones para restablecer la contraseña.",
      devResetToken: env.NODE_ENV !== "production" ? token : undefined,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/reset-password
authRouter.post("/reset-password", validate({ body: resetSchema }), async (req, res, next) => {
  try {
    const { token, password } = req.body;
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const record = await prisma.passwordReset.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      return res.status(400).json({ error: "El enlace de recuperación es inválido o ya expiró" });
    }
    const passwordHash = await bcrypt.hash(password, 8);
    await prisma.$transaction([
      prisma.passwordReset.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    ]);
    logAudit({
      userId: record.userId,
      action: "PASSWORD_RESET",
      entityType: "AUTH",
      description: "Contraseña restablecida",
      req,
    }).catch(() => {});
    res.json({ ok: true, message: "Contraseña actualizada. Ya puedes iniciar sesión." });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
authRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.sub },
      include: { role: true },
    });
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
    const { passwordHash: _ph, ...safe } = user;
    res.json(safe);
  } catch (err) {
    next(err);
  }
});

// PUT /api/auth/profile
authRouter.put("/profile", requireAuth, validate({ body: profileSchema }), async (req, res, next) => {
  try {
    const data = req.body;
    const user = await prisma.user.update({
      where: { id: req.user!.sub },
      data: {
        name: data.name ?? undefined,
        phone: data.phone === undefined ? undefined : data.phone,
        position: data.position === undefined ? undefined : data.position,
        avatarUrl: data.avatarUrl === undefined ? undefined : data.avatarUrl,
      },
      include: { role: true },
    });
    logAudit({
      userId: user.id,
      action: "PROFILE_UPDATED",
      entityType: "USER",
      entityId: user.id,
      description: "El usuario actualizó su propio perfil",
      req,
    }).catch(() => {});
    const { passwordHash: _ph, ...safe } = user;
    res.json(safe);
  } catch (err) {
    next(err);
  }
});

// PUT /api/auth/password
authRouter.put("/password", requireAuth, validate({ body: changePasswordSchema }), async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new HttpError(400, "La contraseña actual es incorrecta");
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(newPassword, 8) },
    });
    logAudit({
      userId: user.id,
      action: "PASSWORD_CHANGED",
      entityType: "AUTH",
      description: "El usuario cambió su contraseña",
      req,
    }).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
