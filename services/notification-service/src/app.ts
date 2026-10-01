import express from "express";
import cors from "cors";
import helmet from "helmet";
import { errorHandler, notFound, healthCheck } from "@helpdesk/common";
import { notificationsRouter } from "./modules/notifications/routes.js";
import { jobsRouter } from "./modules/jobs/routes.js";

export const app = express();

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "2mb" }));

app.get("/health", healthCheck("notification-service"));

app.use("/api/notifications", notificationsRouter);
app.use("/api/jobs", jobsRouter);

app.use(notFound);
app.use(errorHandler);
