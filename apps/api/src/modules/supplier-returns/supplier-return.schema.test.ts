import { describe, expect, it } from "vitest";
import { supplierReturnCreateSchema } from "./supplier-return.schema.js";

const validInput = {
  productId: "ce61865c-0f1b-4f88-b8d2-7320575c1171",
  quantity: 3,
  agreedReturnPricePerUnit: 30_000,
  returnedAt: "2026-06-22T12:00:00.000Z",
  note: "Supplier accepted the return"
};

describe("supplierReturnCreateSchema", () => {
  it("accepts a valid supplier return", () => {
    expect(supplierReturnCreateSchema.safeParse(validInput).success).toBe(true);
  });

  it("rejects zero and negative quantities", () => {
    expect(supplierReturnCreateSchema.safeParse({ ...validInput, quantity: 0 }).success).toBe(false);
    expect(supplierReturnCreateSchema.safeParse({ ...validInput, quantity: -1 }).success).toBe(false);
  });

  it("rejects zero and negative agreed return unit prices", () => {
    expect(
      supplierReturnCreateSchema.safeParse({ ...validInput, agreedReturnPricePerUnit: 0 }).success
    ).toBe(false);
    expect(
      supplierReturnCreateSchema.safeParse({ ...validInput, agreedReturnPricePerUnit: -1 }).success
    ).toBe(false);
  });
});
