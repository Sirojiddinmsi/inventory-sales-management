import { describe, expect, it } from "vitest";
import {
  availableForSaleEdit,
  hasEnoughStockForSaleEdit
} from "./sale-stock-validation.js";

describe("sale edit stock validation", () => {
  it("credits the quantity already allocated to the same product", () => {
    expect(availableForSaleEdit(1, 2)).toBe(3);
    expect(hasEnoughStockForSaleEdit(1, 2, 2)).toBe(true);
    expect(hasEnoughStockForSaleEdit(1, 2, 3)).toBe(true);
    expect(hasEnoughStockForSaleEdit(1, 2, 4)).toBe(false);
    expect(hasEnoughStockForSaleEdit(1, 2, 1)).toBe(true);
  });

  it("does not credit an original line to a different or new product", () => {
    expect(availableForSaleEdit(1, 0)).toBe(1);
    expect(hasEnoughStockForSaleEdit(1, 0, 2)).toBe(false);
  });

  it("works in base units after unit conversion", () => {
    const currentBaseStock = 1;
    const originalBaseQuantity = 2;
    const requestedSaleQuantity = 1.5;
    const unitMultiplier = 2;
    expect(
      hasEnoughStockForSaleEdit(
        currentBaseStock,
        originalBaseQuantity,
        requestedSaleQuantity * unitMultiplier
      )
    ).toBe(true);
  });
});

