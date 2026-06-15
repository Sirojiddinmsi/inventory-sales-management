import { Router } from "express";
import { asyncHandler } from "../../shared/async-handler.js";
import { validate } from "../../shared/validation.js";
import { reportController } from "./report.controller.js";
import { reportFilterSchema } from "./report.schema.js";

export const reportRouter = Router();
reportRouter.get("/", validate(reportFilterSchema, "query"), asyncHandler(reportController.get));
reportRouter.get(
  "/export.xlsx",
  validate(reportFilterSchema, "query"),
  asyncHandler(reportController.excel)
);

