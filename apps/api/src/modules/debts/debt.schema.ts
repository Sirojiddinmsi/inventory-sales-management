import { z } from "zod";
import { paginationSchema } from "../../shared/pagination.js";

export const debtListSchema = paginationSchema.extend({
  status: z.enum(["UNPAID", "PARTIALLY_PAID", "PAID"]).optional(),
  filter: z.enum(["active", "paid", "archive", "overdue", "partial", "all"]).default("active"),
  dueFrom: z.iso.date().optional(),
  dueTo: z.iso.date().optional(),
  archived: z.enum(["true", "false"]).transform((value) => value === "true").default(false),
  sortBy: z.enum(["created_at", "due_date", "remaining_amount"]).default("created_at")
});

export const debtPaymentSchema = z.object({
  amount: z.coerce.number().positive(),
  paymentMethod: z.enum(["CASH", "CARD", "TRANSFER", "MIXED"]),
  cashAmount: z.coerce.number().min(0).optional(),
  cardAmount: z.coerce.number().min(0).optional(),
  transferAmount: z.coerce.number().min(0).optional(),
  paidAt: z.iso.datetime().optional(),
  note: z.string().trim().max(2000).nullish()
}).superRefine((payment, context) => {
  const cashAmount = Number(payment.cashAmount ?? 0);
  const cardAmount = Number(payment.cardAmount ?? 0);
  const transferAmount = Number(payment.transferAmount ?? 0);
  const totalSplit = cashAmount + cardAmount + transferAmount;

  if (payment.paymentMethod === "MIXED") {
    if (cashAmount <= 0 && cardAmount <= 0 && transferAmount <= 0) {
      context.addIssue({
        code: "custom",
        message: "At least one split amount is required for mixed payment",
        path: ["cashAmount"]
      });
    }
    if (Math.abs(totalSplit - payment.amount) > 0.009) {
      context.addIssue({
        code: "custom",
        message: "Mixed payment split must equal total amount",
        path: ["amount"]
      });
    }
    return;
  }

  const expectedField =
    payment.paymentMethod === "CASH"
      ? "cashAmount"
      : payment.paymentMethod === "CARD"
        ? "cardAmount"
        : "transferAmount";
  const expectedAmount =
    payment.paymentMethod === "CASH"
      ? cashAmount
      : payment.paymentMethod === "CARD"
        ? cardAmount
        : transferAmount;

  if (expectedAmount > 0 && Math.abs(expectedAmount - payment.amount) > 0.009) {
    context.addIssue({
      code: "custom",
      message: "Single payment method amount must equal total amount",
      path: [expectedField]
    });
  }
});

export const debtArchiveSchema = z.object({
  reason: z.string().trim().min(2).max(1000)
});
