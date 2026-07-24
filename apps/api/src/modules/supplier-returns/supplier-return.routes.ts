import { Router } from "express";
import { asyncHandler } from "../../shared/async-handler.js";
import { validate } from "../../shared/validation.js";
import { idParamSchema } from "../categories/category.schema.js";
import { supplierReturnController } from "./supplier-return.controller.js";
import {
  supplierReturnAppendSchema,
  supplierReturnBulkCreateSchema,
  supplierReturnCreateSchema,
  supplierReturnListSchema,
  supplierReturnUpdateSchema
} from "./supplier-return.schema.js";

export const supplierReturnRouter = Router();

supplierReturnRouter.get(
  "/",
  validate(supplierReturnListSchema, "query"),
  asyncHandler(supplierReturnController.list)
);
supplierReturnRouter.post(
  "/documents",
  validate(supplierReturnBulkCreateSchema),
  asyncHandler(supplierReturnController.createDocument)
);
supplierReturnRouter.post(
  "/documents/:id/items",
  validate(idParamSchema, "params"),
  validate(supplierReturnAppendSchema),
  asyncHandler(supplierReturnController.appendDocument)
);
supplierReturnRouter.patch(
  "/documents/:id",
  validate(idParamSchema, "params"),
  validate(supplierReturnUpdateSchema),
  asyncHandler(supplierReturnController.updateDocument)
);
supplierReturnRouter.delete(
  "/documents/:id",
  validate(idParamSchema, "params"),
  asyncHandler(supplierReturnController.removeDocument)
);
supplierReturnRouter.post(
  "/",
  validate(supplierReturnCreateSchema),
  asyncHandler(supplierReturnController.create)
);
supplierReturnRouter.delete(
  "/:id",
  validate(idParamSchema, "params"),
  asyncHandler(supplierReturnController.remove)
);
