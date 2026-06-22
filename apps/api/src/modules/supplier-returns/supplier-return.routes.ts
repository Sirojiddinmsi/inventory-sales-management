import { Router } from "express";
import { asyncHandler } from "../../shared/async-handler.js";
import { validate } from "../../shared/validation.js";
import { supplierReturnController } from "./supplier-return.controller.js";
import {
  supplierReturnCreateSchema,
  supplierReturnListSchema
} from "./supplier-return.schema.js";

export const supplierReturnRouter = Router();

supplierReturnRouter.get(
  "/",
  validate(supplierReturnListSchema, "query"),
  asyncHandler(supplierReturnController.list)
);
supplierReturnRouter.post(
  "/",
  validate(supplierReturnCreateSchema),
  asyncHandler(supplierReturnController.create)
);
