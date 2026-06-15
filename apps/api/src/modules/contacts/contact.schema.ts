import { z } from "zod";
import { paginationSchema } from "../../shared/pagination.js";

export const contactListSchema = paginationSchema.extend({
  sortBy: z.enum(["name", "created_at"]).default("name")
});

export const contactCreateSchema = z.object({
  name: z.string().trim().min(2).max(255),
  phone: z.string().trim().max(40).nullish(),
  address: z.string().trim().max(1000).nullish(),
  note: z.string().trim().max(2000).nullish()
});

export const contactUpdateSchema = contactCreateSchema.partial();

