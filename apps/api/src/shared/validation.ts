import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

type RequestTarget = "body" | "query" | "params";

export function validate(schema: ZodType, target: RequestTarget = "body") {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      next(result.error);
      return;
    }

    Object.defineProperty(req, target, {
      value: result.data,
      writable: true,
      configurable: true,
      enumerable: true
    });
    next();
  };
}

