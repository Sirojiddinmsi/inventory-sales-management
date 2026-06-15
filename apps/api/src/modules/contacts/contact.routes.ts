import { Router } from "express";
import { authorize } from "../../middlewares/auth.middleware.js";
import { asyncHandler } from "../../shared/async-handler.js";
import { validate } from "../../shared/validation.js";
import { idParamSchema } from "../categories/category.schema.js";
import { contactController } from "./contact.controller.js";
import {
  contactCreateSchema,
  contactListSchema,
  contactUpdateSchema
} from "./contact.schema.js";

export const contactRouter = Router();

contactRouter.get("/", validate(contactListSchema, "query"), asyncHandler(contactController.list));
contactRouter.post("/", validate(contactCreateSchema), asyncHandler(contactController.create));
contactRouter.patch(
  "/:id",
  validate(idParamSchema, "params"),
  validate(contactUpdateSchema),
  asyncHandler(contactController.update)
);
contactRouter.delete(
  "/:id",
  authorize("ADMIN"),
  validate(idParamSchema, "params"),
  asyncHandler(contactController.delete)
);

