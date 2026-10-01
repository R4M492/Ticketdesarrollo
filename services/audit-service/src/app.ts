import express from "express";
import cors from "cors";
import helmet from "helmet";
import { errorHandler, notFound, healthCheck } from "@helpdesk/common";
import { auditRouter } from "./modules/audit/routes.js";

export const app = express();

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "2mb" }));

app.get("/health", healthCheck("audit-service"));

app.use("/api/audit-logs", auditRouter);

app.use(notFound);
app.use(errorHandler);
