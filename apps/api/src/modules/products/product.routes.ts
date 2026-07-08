import { Router } from "express";
import { authorize } from "../../middlewares/auth.middleware.js";
import { asyncHandler } from "../../shared/async-handler.js";
import { validate } from "../../shared/validation.js";
import { idParamSchema } from "../categories/category.schema.js";
import { productController } from "./product.controller.js";
import {
  productBulkCategorySchema,
  productBulkDeleteSchema,
  productBulkLocationSchema,
  productCreateSchema,
  productExportSelectedSchema,
  productInventoryExportSchema,
  fifoCostCorrectionSchema,
  productImportSchema,
  productHistorySchema,
  productListSchema,
  productUpdateSchema
} from "./product.schema.js";
import { productImageUpload } from "./product.upload.js";

export const productRouter = Router();

productRouter.get("/", validate(productListSchema, "query"), asyncHandler(productController.list));
productRouter.get("/import-template.xlsx", asyncHandler(productController.importTemplate));
productRouter.post(
  "/export-selected.xlsx",
  validate(productExportSelectedSchema),
  asyncHandler(productController.exportSelected)
);
productRouter.get(
  "/export-inventory.xlsx",
  validate(productInventoryExportSchema, "query"),
  asyncHandler(productController.exportInventory)
);
productRouter.post(
  "/bulk-location",
  validate(productBulkLocationSchema),
  asyncHandler(productController.bulkMove)
);
productRouter.post(
  "/bulk-category",
  validate(productBulkCategorySchema),
  asyncHandler(productController.bulkChangeCategory)
);
productRouter.post(
  "/bulk-delete",
  authorize("ADMIN"),
  validate(productBulkDeleteSchema),
  asyncHandler(productController.bulkDelete)
);
productRouter.get(
  "/:id/history/export.xlsx",
  validate(idParamSchema, "params"),
  validate(productHistorySchema, "query"),
  asyncHandler(productController.historyExcel)
);
productRouter.get(
  "/:id/history",
  validate(idParamSchema, "params"),
  validate(productHistorySchema, "query"),
  asyncHandler(productController.history)
);
productRouter.post(
  "/images",
  productImageUpload.array("images", 4),
  asyncHandler(productController.uploadImages)
);
productRouter.post(
  "/import",
  validate(productImportSchema),
  asyncHandler(productController.importRows)
);
productRouter.get("/:id", validate(idParamSchema, "params"), asyncHandler(productController.get));
productRouter.post("/", validate(productCreateSchema), asyncHandler(productController.create));
productRouter.post(
  "/:id/fifo-cost-correction",
  authorize("ADMIN"),
  validate(idParamSchema, "params"),
  validate(fifoCostCorrectionSchema),
  asyncHandler(productController.correctFifoCost)
);
productRouter.patch(
  "/:id",
  validate(idParamSchema, "params"),
  validate(productUpdateSchema),
  asyncHandler(productController.update)
);
productRouter.delete(
  "/:id",
  authorize("ADMIN"),
  validate(idParamSchema, "params"),
  asyncHandler(productController.delete)
);
