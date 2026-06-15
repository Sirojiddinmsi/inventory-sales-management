import { z } from "zod";
import { paginationSchema } from "../../shared/pagination.js";

const nullableText = z.string().trim().max(2000).nullish();
const imagePath = z.string().trim().refine(
  (value) => value.startsWith("/uploads/") || z.url().safeParse(value).success,
  "Rasm manzili noto'g'ri"
);

export const productListSchema = paginationSchema.extend({
  categoryId: z.uuid().optional(),
  location: z.string().trim().max(120).optional(),
  lowStock: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  sortBy: z
    .enum(["name", "code", "stock_quantity", "sale_price", "created_at"])
    .default("created_at")
});

export const productCreateSchema = z.object({
  code: z.string().trim().max(80).optional(),
  name: z.string().trim().min(2).max(255),
  categoryId: z.uuid(),
  unit: z.string().trim().min(1).max(40).default("dona"),
  purchasePrice: z.coerce.number().min(0),
  salePrice: z.coerce.number().min(0).default(0),
  stockQuantity: z.coerce.number().min(0).default(0),
  minimumStock: z.coerce.number().min(0).default(0),
  location: z.string().trim().max(120).nullish(),
  imageUrl: imagePath.nullish(),
  imageUrls: z.array(imagePath).max(4).optional(),
  description: nullableText
});

export const productUpdateSchema = productCreateSchema.partial();

const productIds = z
  .array(z.uuid())
  .min(1)
  .max(500)
  .transform((ids) => [...new Set(ids)]);

export const productBulkDeleteSchema = z.object({
  ids: productIds
});

export const productBulkLocationSchema = z.object({
  ids: productIds,
  location: z.string().trim().min(1).max(120)
});

export const productBulkCategorySchema = z.object({
  ids: productIds,
  categoryId: z.uuid()
});

export const productExportSelectedSchema = z.object({
  ids: productIds
});

export const productImportSchema = z.object({
  rows: z.array(
    z.object({
      rowNumber: z.coerce.number().int().min(2),
      code: z.string().trim().max(80).optional(),
      name: z.string().trim().min(2).max(255),
      category: z.string().trim().min(1).max(120),
      unit: z.string().trim().min(1).max(40).default("dona"),
      purchasePrice: z.coerce.number().min(0),
      salePrice: z.coerce.number().min(0).default(0),
      quantity: z.coerce.number().min(0),
      minimumStock: z.coerce.number().min(0).default(0),
      location: z.string().trim().max(120).nullish(),
      imageUrl: imagePath.nullish(),
      description: nullableText
    })
  ).min(1).max(2000)
});

export type ProductImportRow = z.infer<typeof productImportSchema>["rows"][number];
