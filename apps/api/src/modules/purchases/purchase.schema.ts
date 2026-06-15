import { z } from "zod";
import { paginationSchema } from "../../shared/pagination.js";

export const purchaseListSchema = paginationSchema.extend({
  supplierId: z.uuid().optional(),
  productId: z.uuid().optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  sortBy: z.enum(["purchased_at", "total_cost", "quantity"]).default("purchased_at")
});

export const purchaseCreateSchema = z.object({
  supplierId: z.uuid().nullish(),
  productId: z.uuid(),
  quantity: z.coerce.number().positive(),
  purchasePrice: z.coerce.number().min(0),
  location: z.string().trim().max(120).nullish(),
  purchasedAt: z.iso.datetime().optional(),
  note: z.string().trim().max(2000).nullish()
});

export const purchaseBulkRowSchema = z.object({
  supplierId: z.uuid().nullish(),
  productId: z.uuid(),
  quantity: z.coerce.number().positive(),
  purchasePrice: z.coerce.number().min(0),
  location: z.string().trim().max(120).nullish(),
  purchasedAt: z.iso.datetime().optional(),
  note: z.string().trim().max(2000).nullish()
});

export const purchaseBulkCreateSchema = z.object({
  rows: z.array(purchaseBulkRowSchema).min(1).max(200)
});

export const purchaseImportSchema = z.object({
  rows: z.array(
    z.object({
      rowNumber: z.coerce.number().int().min(2),
      product: z.string().trim().min(1).max(255),
      quantity: z.coerce.number().positive(),
      purchasePrice: z.coerce.number().min(0),
      location: z.string().trim().max(120).nullish(),
      supplier: z.string().trim().max(255).nullish(),
      purchasedAt: z.iso.datetime().optional(),
      note: z.string().trim().max(2000).nullish()
    })
  ).min(1).max(2000)
});

export type PurchaseImportRow = z.infer<typeof purchaseImportSchema>["rows"][number];
