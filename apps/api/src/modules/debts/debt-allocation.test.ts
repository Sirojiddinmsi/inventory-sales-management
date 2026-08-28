import { describe, expect, it } from "vitest";
import { AppError } from "../../shared/errors/AppError.js";
import {
  allocateDebtPaymentOldestFirst,
  normalizePaymentSplit,
  type DebtPaymentMethod
} from "./debt-allocation.js";

const debts = [
  { id: "debt-1", invoice_number: "INV-1", remaining_amount: 100000 },
  { id: "debt-2", invoice_number: "INV-2", remaining_amount: 200000 },
  { id: "debt-3", invoice_number: "INV-3", remaining_amount: 300000 }
];

describe("oldest-first customer debt allocation", () => {
  it("allocates 250k as 100k plus 150k", () => {
    const result = allocateDebtPaymentOldestFirst(debts, {
      amount: 250000,
      paymentMethod: "CASH"
    });

    expect(result.allocations.map((item) => [item.debtId, item.amount])).toEqual([
      ["debt-1", 100000],
      ["debt-2", 150000]
    ]);
    expect(result.allocations.map((item) => item.cashAmount)).toEqual([100000, 150000]);
  });

  it("closes the first two invoices for an exact 300k payment", () => {
    const result = allocateDebtPaymentOldestFirst(debts, {
      amount: 300000,
      paymentMethod: "CARD"
    });

    expect(result.allocations.map((item) => [item.debtId, item.amount])).toEqual([
      ["debt-1", 100000],
      ["debt-2", 200000]
    ]);
  });

  it("rejects total remaining plus 0.01 without clamping", () => {
    expect(() => allocateDebtPaymentOldestFirst(debts, {
      amount: 600000.01,
      paymentMethod: "TRANSFER"
    })).toThrowError(expect.objectContaining<AppError>({
      code: "PAYMENT_EXCEEDS_CUSTOMER_DEBT",
      statusCode: 422
    }));
  });

  it("consumes mixed buckets deterministically across children", () => {
    const result = allocateDebtPaymentOldestFirst(debts, {
      amount: 250000,
      paymentMethod: "MIXED",
      cashAmount: 120000,
      cardAmount: 80000,
      transferAmount: 50000
    });

    expect(result.allocations).toEqual([
      {
        debtId: "debt-1",
        invoiceNumber: "INV-1",
        amount: 100000,
        cashAmount: 100000,
        cardAmount: 0,
        transferAmount: 0
      },
      {
        debtId: "debt-2",
        invoiceNumber: "INV-2",
        amount: 150000,
        cashAmount: 20000,
        cardAmount: 80000,
        transferAmount: 50000
      }
    ]);
  });

  it.each<[DebtPaymentMethod, keyof ReturnType<typeof normalizePaymentSplit>]>([
    ["CASH", "cashAmount"],
    ["CARD", "cardAmount"],
    ["TRANSFER", "transferAmount"]
  ])("keeps %s child splits equal to every child amount", (paymentMethod, splitField) => {
    const result = allocateDebtPaymentOldestFirst(debts, { amount: 250000, paymentMethod });

    for (const allocation of result.allocations) {
      expect(allocation[splitField as "cashAmount" | "cardAmount" | "transferAmount"])
        .toBe(allocation.amount);
    }
  });

  it("handles the 0.01 boundary and floating representation without drift", () => {
    expect(normalizePaymentSplit({
      amount: 0.1 + 0.2,
      paymentMethod: "MIXED",
      cashAmount: 0.1,
      cardAmount: 0.2,
      transferAmount: 0
    })).toMatchObject({ amount: 0.3, cashAmount: 0.1, cardAmount: 0.2 });

    expect(allocateDebtPaymentOldestFirst(
      [{ id: "cent", invoice_number: "CENT", remaining_amount: 0.01 }],
      { amount: 0.01, paymentMethod: "CASH" }
    ).allocations[0]?.amount).toBe(0.01);
  });

  it("rejects sub-cent precision", () => {
    expect(() => normalizePaymentSplit({
      amount: 10.001,
      paymentMethod: "CASH"
    })).toThrowError(expect.objectContaining<AppError>({
      code: "PAYMENT_MONEY_PRECISION_INVALID",
      statusCode: 422
    }));
  });
});
