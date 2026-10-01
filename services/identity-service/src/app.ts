import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { errorHandler, notFound, healthCheck } from "@helpdesk/common";
import { authRouter } from "./modules/auth/routes.js";
import { usersRouter } from "./modules/users/routes.js";

export const app = express();

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));

// Anti fuerza bruta (igual que en el monolito original, backend/src/app.ts)
app.use(
  "/api/auth/login",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 15,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Demasiados intentos de inicio de sesión. Espera 15 minutos e intenta de nuevo." },
  }),
);
app.use(
  "/api/auth/forgot-password",
  rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Demasiadas solicitudes de recuperación. Espera una hora e intenta de nuevo." },
  }),
);

app.get("/health", healthCheck("identity-service"));

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);

app.use(notFound);
app.use(errorHandler);
