import { Router } from "express";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";
import { asyncHandler } from "../../shared/async-handler.js";
import { validate } from "../../shared/validation.js";
import { authController } from "./auth.controller.js";
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema,
  userIdParamSchema,
  userUpdateSchema
} from "./auth.schema.js";

export const authRouter = Router();

authRouter.post("/login", validate(loginSchema), asyncHandler(authController.login));
authRouter.post("/register", validate(registerSchema), asyncHandler(authController.register));
authRouter.get("/me", authenticate, asyncHandler(authController.me));
authRouter.patch("/profile", authenticate, validate(updateProfileSchema), asyncHandler(authController.updateProfile));
authRouter.post(
  "/change-password",
  authenticate,
  validate(changePasswordSchema),
  asyncHandler(authController.changePassword)
);
authRouter.get("/users", authenticate, authorize("ADMIN"), asyncHandler(authController.listUsers));
authRouter.post(
  "/users",
  authenticate,
  authorize("ADMIN"),
  validate(registerSchema),
  asyncHandler(authController.createUser)
);
authRouter.patch(
  "/users/:id",
  authenticate,
  authorize("ADMIN"),
  validate(userIdParamSchema, "params"),
  validate(userUpdateSchema),
  asyncHandler(authController.updateUser)
);
authRouter.post(
  "/users/:id/reset-password",
  authenticate,
  authorize("ADMIN"),
  validate(userIdParamSchema, "params"),
  validate(resetPasswordSchema),
  asyncHandler(authController.resetPassword)
);
authRouter.delete(
  "/users/:id",
  authenticate,
  authorize("ADMIN"),
  validate(userIdParamSchema, "params"),
  asyncHandler(authController.deleteUser)
);
