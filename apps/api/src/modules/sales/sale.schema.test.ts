import { describe, expect, it } from "vitest";
import { saleCreateSchema, saleUpdateSchema } from "./sale.schema.js";

const item = {
  productId: "ce61865c-0f1b-4f88-b8d2-7320575c1171",
  quantity: 2,
  unit: "dona",
  unitMultiplier: 1,
  salePrice: 50_000,
  discount: 0
};

describe("saleCreateSchema", () => {
  it("requires a customer for debt sales", () => {
    const result = saleCreateSchema.safeParse({
      items: [item],
      discount: 0,
      paymentType: "DEBT"
    });

    expect(result.success).toBe(false);
  });

  it("rejects discounts greater than subtotal", () => {
    const result = saleCreateSchema.safeParse({
      items: [item],
      discount: 100_001,
      paymentType: "CASH"
    });

    expect(result.success).toBe(false);
  });

  it("accepts a valid cash sale", () => {
    const result = saleCreateSchema.safeParse({
      customerName: "Ali",
      items: [item],
      discount: 5_000,
      paymentType: "CASH"
    });

    expect(result.success).toBe(true);
  });

  it("accepts an existing sale item id during invoice editing", () => {
    const result = saleUpdateSchema.safeParse({
      items: [{
        ...item,
        saleItemId: "beaf06e2-0d3d-4e20-8195-72f44fdf8ea8"
      }],
      discount: 0,
      paymentType: "CASH"
    });

    expect(result.success).toBe(true);
  });
});
