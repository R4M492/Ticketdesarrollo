import express from "express";
import cors from "cors";
import helmet from "helmet";
import { errorHandler, notFound, healthCheck } from "@helpdesk/common";
import { companiesRouter } from "./modules/companies/routes.js";
import { departmentsRouter } from "./modules/departments/routes.js";

export const app = express();

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "2mb" }));

app.get("/health", healthCheck("organization-service"));

app.use("/api/companies", companiesRouter);
app.use("/api/departments", departmentsRouter);

app.use(notFound);
app.use(errorHandler);
