import { z } from "zod";
import { paginationSchema } from "../../shared/pagination.js";

export const categoryListSchema = paginationSchema.extend({
  sortBy: z.enum(["name", "created_at"]).default("name")
});

export const categoryCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).nullish()
});

export const categoryUpdateSchema = categoryCreateSchema.partial();
export const idParamSchema = z.object({ id: z.uuid() });

