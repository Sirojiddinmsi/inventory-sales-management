import { Router } from "express";
import { asyncHandler } from "../../shared/async-handler.js";
import { validate } from "../../shared/validation.js";
import { purchaseController } from "./purchase.controller.js";
import {
  purchaseBulkCreateSchema,
  purchaseCreateSchema,
  purchaseDocumentIdSchema,
  purchaseDocumentUpdateSchema,
  purchaseImportSchema,
  purchaseListSchema,
  purchaseUpdateSchema
} from "./purchase.schema.js";

export const purchaseRouter = Router();

purchaseRouter.get("/", validate(purchaseListSchema, "query"), asyncHandler(purchaseController.list));
purchaseRouter.get("/import-template.xlsx", asyncHandler(purchaseController.importTemplate));
purchaseRouter.get("/documents/:id/export.pdf", validate(purchaseDocumentIdSchema, "params"), asyncHandler(purchaseController.exportPdf));
purchaseRouter.get("/documents/:id/export.xlsx", validate(purchaseDocumentIdSchema, "params"), asyncHandler(purchaseController.exportExcel));
purchaseRouter.post(
  "/bulk",
  validate(purchaseBulkCreateSchema),
  asyncHandler(purchaseController.bulkCreate)
);
purchaseRouter.post(
  "/import",
  validate(purchaseImportSchema),
  asyncHandler(purchaseController.importRows)
);
purchaseRouter.post("/", validate(purchaseCreateSchema), asyncHandler(purchaseController.create));
purchaseRouter.patch(
  "/documents/:id",
  validate(purchaseDocumentUpdateSchema),
  asyncHandler(purchaseController.updateDocument)
);
purchaseRouter.patch("/:id", validate(purchaseUpdateSchema), asyncHandler(purchaseController.update));
purchaseRouter.delete("/:id", asyncHandler(purchaseController.remove));
