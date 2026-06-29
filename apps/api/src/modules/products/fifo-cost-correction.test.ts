import { describe, expect, it } from "vitest";
import { summarizeCostCorrection } from "./fifo-cost-correction.js";

describe("FIFO remaining stock cost correction", () => {
  it("revalues only the supplied remaining quantity", () => {
    expect(
      summarizeCostCorrection(
        [{ remainingQuantity: 421, unitCost: 1 }],
        4_000
      )
    ).toEqual({
      affectedQuantity: 421,
      oldTotalCost: 421,
      oldUnitCost: 1,
      newUnitCost: 4_000,
      newTotalCost: 1_684_000
    });
  });

  it("produces the expected future sale profit", () => {
    const correction = summarizeCostCorrection(
      [{ remainingQuantity: 421, unitCost: 1 }],
      4_000
    );
    const fifoCost = 2 * correction.newUnitCost;
    expect(fifoCost).toBe(8_000);
    expect(20_000 - fifoCost).toBe(12_000);
  });
});

