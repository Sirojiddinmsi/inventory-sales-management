import { Router } from "express";
import { authorize } from "../../middlewares/auth.middleware.js";
import { asyncHandler } from "../../shared/async-handler.js";
import { validate } from "../../shared/validation.js";
import { idParamSchema } from "../categories/category.schema.js";
import { productController } from "./product.controller.js";
import {
  productCreateSchema,
  productImportSchema,
  productListSchema,
  productUpdateSchema
} from "./product.schema.js";
import { productImageUpload } from "./product.upload.js";

export const productRouter = Router();

productRouter.get("/", validate(productListSchema, "query"), asyncHandler(productController.list));
productRouter.get("/import-template.xlsx", asyncHandler(productController.importTemplate));
productRouter.get(
  "/:id/history/export.xlsx",
  validate(idParamSchema, "params"),
  asyncHandler(productController.historyExcel)
);
productRouter.get(
  "/:id/history",
  validate(idParamSchema, "params"),
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
