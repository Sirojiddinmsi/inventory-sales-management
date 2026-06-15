import { Router } from "express";
import { authorize } from "../../middlewares/auth.middleware.js";
import { asyncHandler } from "../../shared/async-handler.js";
import { validate } from "../../shared/validation.js";
import { idParamSchema } from "../categories/category.schema.js";
import { saleController } from "./sale.controller.js";
import {
  saleArchiveSchema,
  saleBulkDeleteSchema,
  saleCreateSchema,
  saleListSchema,
  saleReturnSchema,
  saleUpdateSchema
} from "./sale.schema.js";

export const saleRouter = Router();

saleRouter.get("/", validate(saleListSchema, "query"), asyncHandler(saleController.list));
saleRouter.post("/", validate(saleCreateSchema), asyncHandler(saleController.create));
saleRouter.post(
  "/bulk-delete",
  authorize("ADMIN"),
  validate(saleBulkDeleteSchema),
  asyncHandler(saleController.bulkDelete)
);
saleRouter.patch(
  "/:id",
  validate(idParamSchema, "params"),
  validate(saleUpdateSchema),
  asyncHandler(saleController.update)
);
saleRouter.post(
  "/:id/returns",
  validate(idParamSchema, "params"),
  validate(saleReturnSchema),
  asyncHandler(saleController.returnItems)
);
saleRouter.post(
  "/:id/archive",
  authorize("ADMIN"),
  validate(idParamSchema, "params"),
  validate(saleArchiveSchema),
  asyncHandler(saleController.archive)
);
saleRouter.post(
  "/:id/restore",
  authorize("ADMIN"),
  validate(idParamSchema, "params"),
  asyncHandler(saleController.restore)
);
saleRouter.delete(
  "/:id/permanent",
  authorize("ADMIN"),
  validate(idParamSchema, "params"),
  asyncHandler(saleController.purge)
);
saleRouter.get(
  "/:id/receipt.pdf",
  validate(idParamSchema, "params"),
  asyncHandler(saleController.receipt)
);
saleRouter.get("/:id", validate(idParamSchema, "params"), asyncHandler(saleController.get));
