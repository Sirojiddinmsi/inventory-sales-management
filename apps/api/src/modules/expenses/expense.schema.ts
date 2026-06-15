import { z } from "zod";
import { paginationSchema } from "../../shared/pagination.js";

export const expenseListSchema = paginationSchema.extend({
  expenseType: z.string().trim().max(120).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  sortBy: z.enum(["spent_at", "amount", "expense_type"]).default("spent_at")
});

export const expenseCreateSchema = z.object({
  expenseType: z.string().trim().min(2).max(120),
  amount: z.coerce.number().positive(),
  spentAt: z.iso.datetime().optional(),
  note: z.string().trim().max(2000).nullish()
});

export const expenseUpdateSchema = expenseCreateSchema.partial();

