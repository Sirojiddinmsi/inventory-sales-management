import { Router } from "express";
import { authorize } from "../../middlewares/auth.middleware.js";
import { asyncHandler } from "../../shared/async-handler.js";
import { validate } from "../../shared/validation.js";
import { categoryController } from "./category.controller.js";
import {
  categoryCreateSchema,
  categoryListSchema,
  categoryUpdateSchema,
  idParamSchema
} from "./category.schema.js";

export const categoryRouter = Router();

categoryRouter.get("/", validate(categoryListSchema, "query"), asyncHandler(categoryController.list));
categoryRouter.get("/:id", validate(idParamSchema, "params"), asyncHandler(categoryController.get));
categoryRouter.post(
  "/",
  authorize("ADMIN"),
  validate(categoryCreateSchema),
  asyncHandler(categoryController.create)
);
categoryRouter.patch(
  "/:id",
  authorize("ADMIN"),
  validate(idParamSchema, "params"),
  validate(categoryUpdateSchema),
  asyncHandler(categoryController.update)
);
categoryRouter.delete(
  "/:id",
  authorize("ADMIN"),
  validate(idParamSchema, "params"),
  asyncHandler(categoryController.delete)
);

