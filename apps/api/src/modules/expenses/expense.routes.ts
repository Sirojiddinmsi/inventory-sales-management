import { Router } from "express";
import { authorize } from "../../middlewares/auth.middleware.js";
import { asyncHandler } from "../../shared/async-handler.js";
import { validate } from "../../shared/validation.js";
import { idParamSchema } from "../categories/category.schema.js";
import { expenseController } from "./expense.controller.js";
import {
  expenseCreateSchema,
  expenseListSchema,
  expenseUpdateSchema
} from "./expense.schema.js";

export const expenseRouter = Router();

expenseRouter.get("/", validate(expenseListSchema, "query"), asyncHandler(expenseController.list));
expenseRouter.post("/", validate(expenseCreateSchema), asyncHandler(expenseController.create));
expenseRouter.patch(
  "/:id",
  validate(idParamSchema, "params"),
  validate(expenseUpdateSchema),
  asyncHandler(expenseController.update)
);
expenseRouter.delete(
  "/:id",
  authorize("ADMIN"),
  validate(idParamSchema, "params"),
  asyncHandler(expenseController.delete)
);

