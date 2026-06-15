import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { query } from "../config/database.js";
import { env } from "../config/env.js";
import { AppError } from "../shared/errors/AppError.js";

type TokenPayload = {
  sub: string;
  email: string;
  role: "ADMIN" | "SELLER";
};

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    next(new AppError(401, "Authentication token is required", "UNAUTHORIZED"));
    return;
  }

  try {
    const token = authorization.slice(7);
    const payload = jwt.verify(token, env.JWT_SECRET) as TokenPayload;

    const result = await query<{
      id: string;
      email: string;
      role: "ADMIN" | "SELLER";
      is_active: boolean;
    }>(
      `SELECT id, email, role, is_active
       FROM users
       WHERE id = $1`,
      [payload.sub]
    );

    const user = result.rows[0];

    if (!user?.is_active) {
      next(new AppError(401, "This account is inactive", "ACCOUNT_INACTIVE"));
      return;
    }

    req.user = { id: user.id, email: user.email, role: user.role };
    next();
  } catch {
    next(new AppError(401, "Invalid or expired token", "INVALID_TOKEN"));
  }
}

export function authorize(...roles: Express.AuthUser["role"][]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(new AppError(403, "You do not have permission for this action", "FORBIDDEN"));
      return;
    }
    next();
  };
}
