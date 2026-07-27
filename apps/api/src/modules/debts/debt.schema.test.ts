import { describe, expect, it } from "vitest";
import { debtPaymentParamSchema, debtPaymentUpdateSchema } from "./debt.schema.js";

const debtId = "11111111-1111-4111-8111-111111111111";
const paymentId = "22222222-2222-4222-8222-222222222222";

describe("debt payment edit schemas", () => {
  it("keeps both debt id and payment id route params", () => {
    const result = debtPaymentParamSchema.safeParse({ id: debtId, paymentId });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ id: debtId, paymentId });
    }
  });

  it("accepts valid card payment update", () => {
    expect(
      debtPaymentUpdateSchema.safeParse({
        amount: 100000,
        paymentMethod: "CARD",
        paidAt: "2026-07-27T06:00:00.000Z",
        note: "Corrected from cash"
      }).success
    ).toBe(true);
  });

  it("rejects mixed payment when split does not match amount", () => {
    expect(
      debtPaymentUpdateSchema.safeParse({
        amount: 100000,
        paymentMethod: "MIXED",
        cashAmount: 30000,
        cardAmount: 30000,
        transferAmount: 0,
        paidAt: "2026-07-27T06:00:00.000Z"
      }).success
    ).toBe(false);
  });
});
