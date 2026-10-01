import express from "express";
import cors from "cors";
import helmet from "helmet";
import { errorHandler, notFound, healthCheck } from "@helpdesk/common";
import { categoriesRouter } from "./modules/categories/routes.js";
import { prioritiesRouter } from "./modules/priorities/routes.js";
import { statusesRouter } from "./modules/statuses/routes.js";

export const app = express();

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "2mb" }));

app.get("/health", healthCheck("catalog-service"));

app.use("/api/categories", categoriesRouter);
app.use("/api/priorities", prioritiesRouter);
app.use("/api/statuses", statusesRouter);

app.use(notFound);
app.use(errorHandler);
