import { describe, expect, it } from "vitest";
import { calculateCashReport } from "./cash-report";

describe("calculateCashReport", () => {
  it("adds debt collections to receipts and excludes new credit sales", () => {
    expect(calculateCashReport(
      [
        { payment_type: "CASH", total_sales: 1_000_000 },
        { payment_type: "CARD", total_sales: 100_000 },
        { payment_type: "DEBT", total_sales: 500_000 }
      ],
      [{ total_amount: 200_000 }]
    )).toEqual({
      saleCollections: 1_100_000,
      debtCollections: 200_000,
      totalCollections: 1_300_000,
      creditSales: 500_000
    });
  });
});
