import { z } from "zod";
import { paginationSchema } from "../../shared/pagination.js";

export const debtListSchema = paginationSchema.extend({
  status: z.enum(["UNPAID", "PARTIALLY_PAID", "PAID"]).optional(),
  dueFrom: z.iso.date().optional(),
  dueTo: z.iso.date().optional(),
  archived: z.enum(["true", "false"]).transform((value) => value === "true").default(false),
  sortBy: z.enum(["created_at", "due_date", "remaining_amount"]).default("created_at")
});

export const debtPaymentSchema = z.object({
  amount: z.coerce.number().positive(),
  paidAt: z.iso.datetime().optional(),
  note: z.string().trim().max(2000).nullish()
});

export const debtArchiveSchema = z.object({
  reason: z.string().trim().min(2).max(1000)
});
