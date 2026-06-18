import { z } from "zod";

export const reportFilterSchema = z.object({
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  productId: z.uuid().optional(),
  categoryId: z.uuid().optional(),
  paymentType: z.enum(["CASH", "CARD", "DEBT", "TRANSFER", "MIXED"]).optional()
});
