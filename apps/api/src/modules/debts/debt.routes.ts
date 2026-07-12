import { Router } from "express";
import { authorize } from "../../middlewares/auth.middleware.js";
import { asyncHandler } from "../../shared/async-handler.js";
import { validate } from "../../shared/validation.js";
import { idParamSchema } from "../categories/category.schema.js";
import { debtController } from "./debt.controller.js";
import { debtArchiveSchema, debtListSchema, debtPaymentSchema } from "./debt.schema.js";

export const debtRouter = Router();

debtRouter.get("/", validate(debtListSchema, "query"), asyncHandler(debtController.list));
debtRouter.get("/summary", asyncHandler(debtController.summary));
debtRouter.get("/customers", validate(debtListSchema, "query"), asyncHandler(debtController.customers));
debtRouter.get("/:id", validate(idParamSchema, "params"), asyncHandler(debtController.get));
debtRouter.post(
  "/:id/payments",
  validate(idParamSchema, "params"),
  validate(debtPaymentSchema),
  asyncHandler(debtController.pay)
);
debtRouter.post(
  "/:id/archive",
  authorize("ADMIN"),
  validate(idParamSchema, "params"),
  validate(debtArchiveSchema),
  asyncHandler(debtController.archive)
);
debtRouter.post(
  "/:id/restore",
  authorize("ADMIN"),
  validate(idParamSchema, "params"),
  asyncHandler(debtController.restore)
);
debtRouter.delete(
  "/:id/permanent",
  authorize("ADMIN"),
  validate(idParamSchema, "params"),
  asyncHandler(debtController.purge)
);
