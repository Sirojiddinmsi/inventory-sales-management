import { z } from "zod";
import { paginationSchema } from "../../shared/pagination.js";

const hasMoneyPrecision = (value: number) => {
  const cents = Math.round(value * 100);
  return Number.isSafeInteger(cents) && Math.abs(value - cents / 100) <= 1e-9;
};

const positiveMoneySchema = z.coerce.number().positive().refine(hasMoneyPrecision, {
  message: "Amount must have at most 2 decimal places"
});

const nonNegativeMoneySchema = z.coerce.number().min(0).refine(hasMoneyPrecision, {
  message: "Amount must have at most 2 decimal places"
});

const customerIdentityFields = {
  identityType: z.enum(["CUSTOMER_ID", "LEGACY"]),
  customerId: z.uuid().optional(),
  customerName: z.string().trim().min(1).max(255).optional(),
  phone: z.string().trim().max(40).nullish()
} as const;

function validateCustomerIdentity(
  identity: {
    identityType: "CUSTOMER_ID" | "LEGACY";
    customerId?: string;
    customerName?: string;
    phone?: string | null;
  },
  context: z.RefinementCtx
) {
  if (identity.identityType === "CUSTOMER_ID") {
    if (!identity.customerId) {
      context.addIssue({
        code: "custom",
        message: "customerId is required for customer identity",
        path: ["customerId"]
      });
    }
    if (identity.customerName !== undefined || identity.phone !== undefined) {
      context.addIssue({
        code: "custom",
        message: "Name and phone fallback cannot be used with customerId",
        path: [identity.customerName !== undefined ? "customerName" : "phone"]
      });
    }
    return;
  }

  if (!identity.customerName) {
    context.addIssue({
      code: "custom",
      message: "customerName is required for legacy customer identity",
      path: ["customerName"]
    });
  }
  if (identity.customerId !== undefined) {
    context.addIssue({
      code: "custom",
      message: "customerId cannot be used for legacy customer identity",
      path: ["customerId"]
    });
  }
}

export const debtListSchema = paginationSchema.extend({
  status: z.enum(["UNPAID", "PARTIALLY_PAID", "PAID"]).optional(),
  filter: z.enum(["active", "paid", "archive", "overdue", "partial", "all"]).default("active"),
  dueFrom: z.iso.date().optional(),
  dueTo: z.iso.date().optional(),
  archived: z.enum(["true", "false"]).transform((value) => value === "true").default(false),
  sortBy: z.enum(["created_at", "due_date", "remaining_amount"]).default("created_at")
});

export const debtPaymentSchema = z.object({
  amount: positiveMoneySchema,
  paymentMethod: z.enum(["CASH", "CARD", "TRANSFER", "MIXED"]),
  cashAmount: nonNegativeMoneySchema.optional(),
  cardAmount: nonNegativeMoneySchema.optional(),
  transferAmount: nonNegativeMoneySchema.optional(),
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

export const debtPaymentUpdateSchema = debtPaymentSchema.safeExtend({
  paidAt: z.iso.datetime()
});

export const customerDebtIdentitySchema = z.object(customerIdentityFields)
  .superRefine(validateCustomerIdentity);

export const customerDebtDetailsSchema = z.object({
  ...customerIdentityFields,
  scope: z.enum(["active", "paid", "all", "archive"]).optional(),
  archived: z.enum(["true", "false"])
    .transform((value) => value === "true")
    .optional()
}).superRefine(validateCustomerIdentity).transform(({ archived, ...details }) => ({
  ...details,
  scope: details.scope ?? (archived ? "archive" : "active")
}));

export const customerDebtPaymentSchema = debtPaymentSchema.safeExtend({
  requestId: z.uuid(),
  ...customerIdentityFields
}).superRefine(validateCustomerIdentity);

export const debtPaymentParamSchema = z.object({
  id: z.uuid(),
  paymentId: z.uuid()
});

export const debtArchiveSchema = z.object({
  reason: z.string().trim().min(2).max(1000)
});
