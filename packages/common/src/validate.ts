import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny } from "zod";
import { HttpError } from "./http-error.js";

interface ValidateSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/** Valida body/query/params con Zod; en éxito reemplaza req.<parte> con el dato ya parseado/coercido. */
export function validate(schemas: ValidateSchemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) req.query = schemas.query.parse(req.query) as typeof req.query;
      if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params;
      next();
    } catch (err) {
      next(new HttpError(400, describeZodError(err)));
    }
  };
}

function describeZodError(err: unknown): string {
  if (err && typeof err === "object" && "issues" in err) {
    const issues = (err as { issues: Array<{ path: (string | number)[]; message: string }> }).issues;
    return issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") || "Datos inválidos";
  }
  return "Datos inválidos";
}
