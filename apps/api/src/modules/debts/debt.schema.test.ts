import { describe, expect, it } from "vitest";
import {
  customerDebtDetailsSchema,
  customerDebtPaymentSchema,
  debtPaymentParamSchema,
  debtPaymentUpdateSchema
} from "./debt.schema.js";

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

describe("customer debt payment schema", () => {
  const requestId = "33333333-3333-4333-8333-333333333333";
  const customerId = "44444444-4444-4444-8444-444444444444";

  it("accepts UUID identity and a two-decimal amount", () => {
    expect(customerDebtPaymentSchema.safeParse({
      requestId,
      identityType: "CUSTOMER_ID",
      customerId,
      amount: 250000.25,
      paymentMethod: "CASH"
    }).success).toBe(true);
  });

  it("accepts legacy name and phone identity", () => {
    expect(customerDebtPaymentSchema.safeParse({
      requestId,
      identityType: "LEGACY",
      customerName: "  Legacy Customer  ",
      phone: "+998 90 000 00 04",
      amount: 250000,
      paymentMethod: "MIXED",
      cashAmount: 100000,
      cardAmount: 100000,
      transferAmount: 50000
    }).success).toBe(true);
  });

  it("rejects missing, invalid, and reused identity fields", () => {
    expect(customerDebtPaymentSchema.safeParse({
      requestId,
      identityType: "CUSTOMER_ID",
      amount: 100000,
      paymentMethod: "CARD"
    }).success).toBe(false);

    expect(customerDebtPaymentSchema.safeParse({
      requestId,
      identityType: "LEGACY",
      customerId,
      customerName: "Legacy",
      amount: 100000,
      paymentMethod: "CARD"
    }).success).toBe(false);

    expect(customerDebtPaymentSchema.safeParse({
      requestId,
      identityType: "CUSTOMER_ID",
      customerId,
      customerName: "Must not be used",
      amount: 100000,
      paymentMethod: "CARD"
    }).success).toBe(false);
  });

  it("rejects invalid requestId, sub-cent amount, and mixed mismatch", () => {
    expect(customerDebtPaymentSchema.safeParse({
      requestId: "not-a-uuid",
      identityType: "CUSTOMER_ID",
      customerId,
      amount: 100000,
      paymentMethod: "CASH"
    }).success).toBe(false);

    expect(customerDebtPaymentSchema.safeParse({
      requestId,
      identityType: "CUSTOMER_ID",
      customerId,
      amount: 100.001,
      paymentMethod: "CASH"
    }).success).toBe(false);

    expect(customerDebtPaymentSchema.safeParse({
      requestId,
      identityType: "LEGACY",
      customerName: "Legacy",
      amount: 100000,
      paymentMethod: "MIXED",
      cashAmount: 40000,
      cardAmount: 10000,
      transferAmount: 0
    }).success).toBe(false);
  });

  it("defaults read-only customer details to the active scope", () => {
    const result = customerDebtDetailsSchema.safeParse({
      identityType: "CUSTOMER_ID",
      customerId
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.scope).toBe("active");
  });

  it.each(["active", "paid", "all", "archive"] as const)(
    "accepts the explicit %s customer details scope",
    (scope) => {
      const result = customerDebtDetailsSchema.safeParse({
        identityType: "CUSTOMER_ID",
        customerId,
        scope
      });

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.scope).toBe(scope);
    }
  );

  it("keeps archived=true as a backward-compatible archive scope", () => {
    const archived = customerDebtDetailsSchema.safeParse({
      identityType: "CUSTOMER_ID",
      customerId,
      archived: "true"
    });
    const current = customerDebtDetailsSchema.safeParse({
      identityType: "CUSTOMER_ID",
      customerId,
      archived: "false"
    });

    expect(archived.success && archived.data.scope).toBe("archive");
    expect(current.success && current.data.scope).toBe("active");
  });

  it("rejects an invalid customer details scope", () => {
    expect(customerDebtDetailsSchema.safeParse({
      identityType: "CUSTOMER_ID",
      customerId,
      scope: "overdue"
    }).success).toBe(false);
  });
});
