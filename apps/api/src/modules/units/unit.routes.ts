import { Router } from "express";
import { authorize } from "../../middlewares/auth.middleware.js";
import { asyncHandler } from "../../shared/async-handler.js";
import { validate } from "../../shared/validation.js";
import { unitController } from "./unit.controller.js";
import { unitCreateSchema, unitIdSchema } from "./unit.schema.js";

export const unitRouter = Router();

unitRouter.get("/", asyncHandler(unitController.list));
unitRouter.post(
  "/",
  authorize("ADMIN"),
  validate(unitCreateSchema),
  asyncHandler(unitController.create)
);
unitRouter.delete(
  "/:id",
  authorize("ADMIN"),
  validate(unitIdSchema, "params"),
  asyncHandler(unitController.delete)
);
