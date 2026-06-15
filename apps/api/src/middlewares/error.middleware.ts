import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { env } from "../config/env.js";
import { AppError } from "../shared/errors/AppError.js";

type DatabaseError = Error & { code?: string; constraint?: string };

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, `Route not found: ${req.method} ${req.originalUrl}`, "NOT_FOUND"));
};

export const errorHandler: ErrorRequestHandler = (error: DatabaseError, req, res, _next) => {
  req.log?.error({ err: error }, "Request failed");

  if (error instanceof ZodError) {
    res.status(422).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: error.issues
      }
    });
    return;
  }

  if (error.code === "23505") {
    res.status(409).json({
      error: {
        code: "DUPLICATE_RESOURCE",
        message: "A record with the same unique value already exists",
        details: error.constraint
      }
    });
    return;
  }

  if (error.code === "23503") {
    res.status(409).json({
      error: {
        code: "RESOURCE_IN_USE",
        message: "This record is referenced by another resource",
        details: error.constraint
      }
    });
    return;
  }

  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details
      }
    });
    return;
  }

  res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: env.NODE_ENV === "production" ? "Internal server error" : error.message
    }
  });
};

