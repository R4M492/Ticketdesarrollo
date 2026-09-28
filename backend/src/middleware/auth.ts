import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";

export interface AccessTokenPayload {
  sub: number; // user id
}

export function signAccessToken(userId: number): string {
  return jwt.sign({ sub: userId }, env.JWT_SECRET, {
    expiresIn: `${env.ACCESS_TOKEN_MINUTES}m`,
  });
}

/** Verifica el token JWT y carga el usuario activo en req.user. */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No autenticado" });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as unknown as AccessTokenPayload;
    // Solo selecciona los campos que el backend usa en las rutas, evita SELECT * 
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        name: true,
        email: true,
        passwordHash: true,
        phone: true,
        position: true,
        roleId: true,
        companyId: true,
        departmentId: true,
        status: true,
        avatarUrl: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        role: true,
        company: true,
        department: true,
      },
    });
    if (!user) {
      return res.status(401).json({ error: "El usuario ya no existe" });
    }
    if (user.status !== "ACTIVE") {
      return res.status(401).json({ error: "El usuario está desactivado" });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Sesión inválida o expirada" });
  }
}
