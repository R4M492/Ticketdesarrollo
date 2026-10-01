import express from "express";
import cors from "cors";
import helmet from "helmet";
import { errorHandler, notFound, healthCheck } from "@helpdesk/common";
import { dashboardRouter } from "./modules/dashboard/routes.js";
import { reportsRouter } from "./modules/reports/routes.js";

export const app = express();

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "2mb" }));

app.get("/health", healthCheck("reporting-service"));

app.use("/api/dashboard", dashboardRouter);
app.use("/api/reports", reportsRouter);

app.use(notFound);
app.use(errorHandler);
