import { z } from "zod";
import { paginationSchema } from "../../shared/pagination.js";

export const paymentTypeSchema = z.enum(["CASH", "CARD", "DEBT"]);

export const saleListSchema = paginationSchema.extend({
  productId: z.uuid().optional(),
  categoryId: z.uuid().optional(),
  paymentType: paymentTypeSchema.optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  archived: z.enum(["true", "false"]).transform((value) => value === "true").default(false),
  sortBy: z.enum(["sold_at", "total_amount", "profit"]).default("sold_at")
});

const saleItemSchema = z.object({
  productId: z.uuid(),
  quantity: z.coerce.number().positive(),
  unit: z.string().trim().min(1).max(40),
  unitMultiplier: z.coerce.number().positive().default(1),
  salePrice: z.coerce.number().min(0),
  discount: z.coerce.number().min(0).default(0)
}).refine((item) => item.discount <= item.salePrice * item.quantity, {
  message: "Item discount cannot exceed item gross amount",
  path: ["discount"]
});

export const saleCreateSchema = z.object({
  customerId: z.uuid().nullish(),
  customerName: z.string().trim().max(255).nullish(),
  customerPhone: z.string().trim().max(40).nullish(),
  items: z.array(saleItemSchema).min(1).max(100),
  discount: z.coerce.number().min(0).default(0),
  paymentType: paymentTypeSchema,
  soldAt: z.iso.datetime().optional(),
  dueDate: z.iso.date().nullish(),
  note: z.string().trim().max(2000).nullish()
}).superRefine((sale, context) => {
  const subtotal = sale.items.reduce(
    (sum, item) => sum + item.salePrice * item.quantity - item.discount,
    0
  );
  if (sale.discount > subtotal) {
    context.addIssue({
      code: "custom",
      message: "Sale discount cannot exceed subtotal",
      path: ["discount"]
    });
  }
  if (sale.paymentType === "DEBT" && !sale.customerName && !sale.customerId) {
    context.addIssue({
      code: "custom",
      message: "Customer is required for debt sales",
      path: ["customerName"]
    });
  }
  if (sale.paymentType === "DEBT" && subtotal - sale.discount <= 0) {
    context.addIssue({
      code: "custom",
      message: "Debt sale total must be greater than zero",
      path: ["discount"]
    });
  }
});

export const saleUpdateSchema = saleCreateSchema;

export const saleArchiveSchema = z.object({
  reason: z.string().trim().min(2).max(1000)
});

export const saleReturnSchema = z.object({
  items: z.array(z.object({
    saleItemId: z.uuid(),
    quantity: z.coerce.number().positive()
  })).min(1).max(100),
  reason: z.string().trim().min(2).max(1000)
});

export const saleBulkDeleteSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(100),
  mode: z.enum(["archive", "permanent"]),
  reason: z.string().trim().min(2).max(1000).optional()
});
