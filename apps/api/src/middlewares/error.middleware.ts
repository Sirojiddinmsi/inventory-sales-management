import type { ErrorRequestHandler, RequestHandler } from "express";
import multer from "multer";
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
    if (req.originalUrl.includes("/products/import")) {
      const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
      const errors = error.issues.map((issue) => {
        const rowIndex = typeof issue.path[1] === "number" ? issue.path[1] : -1;
        const field = typeof issue.path[2] === "string"
          ? issue.path[2]
          : String(issue.path.at(-1) ?? "row");
        return {
          row: Number(rows[rowIndex]?.rowNumber ?? rowIndex + 2),
          field,
          message: issue.message
        };
      });
      res.status(422).json({
        error: {
          code: "IMPORT_VALIDATION_FAILED",
          message: "Excel import contains invalid rows",
          details: { errors }
        }
      });
      return;
    }
    res.status(422).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: error.issues
      }
    });
    return;
  }

  if (error instanceof multer.MulterError) {
    const fileTooLarge = error.code === "LIMIT_FILE_SIZE";
    res.status(422).json({
      error: {
        code: fileTooLarge ? "IMAGE_TOO_LARGE" : "IMAGE_UPLOAD_ERROR",
        message: fileTooLarge
          ? "Har bir rasm hajmi 5 MB dan oshmasligi kerak"
          : "Rasm yuklash cheklovi buzildi",
        details: error.code
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
