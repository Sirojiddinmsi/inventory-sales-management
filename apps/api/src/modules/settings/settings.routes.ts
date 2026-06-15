import { Router } from "express";
import { authorize } from "../../middlewares/auth.middleware.js";
import { asyncHandler } from "../../shared/async-handler.js";
import { validate } from "../../shared/validation.js";
import { settingsController } from "./settings.controller.js";
import { settingsUpdateSchema } from "./settings.schema.js";

export const settingsRouter = Router();
settingsRouter.get("/", asyncHandler(settingsController.get));
settingsRouter.patch(
  "/",
  authorize("ADMIN"),
  validate(settingsUpdateSchema),
  asyncHandler(settingsController.update)
);

