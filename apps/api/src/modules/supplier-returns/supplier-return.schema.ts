import { z } from "zod";
import { paginationSchema } from "../../shared/pagination.js";

export const supplierReturnListSchema = paginationSchema.extend({
  productId: z.uuid().optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional()
});

export const supplierReturnCreateSchema = z.object({
  productId: z.uuid(),
  quantity: z.coerce.number().positive(),
  agreedReturnPricePerUnit: z.coerce.number().min(0),
  returnedAt: z.iso.datetime().optional(),
  note: z.string().trim().max(2000).nullish()
});

export const supplierReturnBulkCreateSchema = z.object({
  returnedAt: z.iso.datetime().optional(),
  note: z.string().trim().max(2000).nullish(),
  rows: z.array(
    z.object({
      productId: z.uuid(),
      quantity: z.coerce.number().positive(),
      agreedReturnPricePerUnit: z.coerce.number().min(0),
      note: z.string().trim().max(2000).nullish()
    })
  ).min(1).max(200)
});

export const supplierReturnAppendSchema = z.object({
  rows: z.array(
    z.object({
      productId: z.uuid(),
      quantity: z.coerce.number().positive(),
      agreedReturnPricePerUnit: z.coerce.number().min(0),
      note: z.string().trim().max(2000).nullish()
    })
  ).min(1).max(200)
});
