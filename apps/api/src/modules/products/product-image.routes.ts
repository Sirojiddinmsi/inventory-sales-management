import { Router } from "express";
import { asyncHandler } from "../../shared/async-handler.js";
import { validate } from "../../shared/validation.js";
import { idParamSchema } from "../categories/category.schema.js";
import { productImageController } from "./product-image.controller.js";

export const productImageRouter = Router();

productImageRouter.get(
  "/:id",
  validate(idParamSchema, "params"),
  asyncHandler(productImageController.show)
);
