import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import { env } from "./config/env.js";
import { errorHandler, notFound } from "./middleware/error.js";
import { authRouter } from "./modules/auth/routes.js";
import { usersRouter } from "./modules/users/routes.js";
import { companiesRouter } from "./modules/companies/routes.js";
import { departmentsRouter } from "./modules/departments/routes.js";
import { categoriesRouter } from "./modules/categories/routes.js";
import { prioritiesRouter } from "./modules/priorities/routes.js";
import { statusesRouter } from "./modules/statuses/routes.js";
import { ticketsRouter } from "./modules/tickets/routes.js";
import { notificationsRouter } from "./modules/notifications/routes.js";
import { dashboardRouter } from "./modules/dashboard/routes.js";
import { reportsRouter } from "./modules/reports/routes.js";
import { auditRouter } from "./modules/audit/routes.js";
import { settingsRouter } from "./modules/settings/routes.js";

export const app = express();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (env.NODE_ENV === "production") {
  app.set("trust proxy", true);
}

// Configuración amplia de CORS para red local y desarrollo
app.use(
  cors({
    origin: (origin, callback) => {
      callback(null, true);
    },
    credentials: true,
  })
);

app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));

// Anti fuerza bruta
app.use(
  "/api/auth/login",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 15,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Demasiados intentos de inicio de sesión. Espera 15 minutos e intenta de nuevo." },
  })
);
app.use(
  "/api/auth/forgot-password",
  rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Demasiadas solicitudes de recuperación. Espera una hora e intenta de nuevo." },
  })
);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "helpdesk-api", time: new Date().toISOString() });
});

// Rutas de la API
app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/companies", companiesRouter);
app.use("/api/departments", departmentsRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/priorities", prioritiesRouter);
app.use("/api/statuses", statusesRouter);
app.use("/api/tickets", ticketsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/audit-logs", auditRouter);
app.use("/api/settings", settingsRouter);

// Servir el Frontend compilado
app.use(express.static(path.join(__dirname, "../../frontend/dist")));

// SPA Fallback para React Router
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return next();
  }
  res.sendFile(path.join(__dirname, "../../frontend/dist/index.html"));
});

app.use(notFound);
app.use(errorHandler);