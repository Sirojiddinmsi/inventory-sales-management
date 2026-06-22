import { describe, expect, it } from "vitest";
import { calculateSupplierReturnAmounts } from "./supplier-return.calculation.js";

describe("calculateSupplierReturnAmounts", () => {
  it("calculates unit-price supplier return totals", () => {
    expect(calculateSupplierReturnAmounts(12, 38_000, 414_000)).toEqual({
      totalAgreedReturnAmount: 456_000,
      supplierReturnProfit: 42_000
    });
  });

  it("reduces amount to submit by positive supplier return profit", () => {
    const { supplierReturnProfit } = calculateSupplierReturnAmounts(12, 38_000, 414_000);
    expect(10_281_952 - supplierReturnProfit).toBe(10_239_952);
  });
});
