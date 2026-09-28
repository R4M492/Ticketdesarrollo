import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";

interface Schemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

/** Valida body/query/params contra esquemas Zod. En caso de error responde 400. */
export function validate(schemas: Schemas) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) {
        const parsed = schemas.query.parse(req.query);
        req.query = parsed as Request["query"];
      }
      if (schemas.params) {
        const parsed = schemas.params.parse(req.params);
        req.params = parsed as Request["params"];
      }
      next();
    } catch (err: unknown) {
      const issues = (err as { issues?: { path: (string | number)[]; message: string }[] }).issues;
      if (issues) {
        return res.status(400).json({
          error: "Datos inválidos",
          details: issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
          })),
        });
      }
      next(err);
    }
  };
}
