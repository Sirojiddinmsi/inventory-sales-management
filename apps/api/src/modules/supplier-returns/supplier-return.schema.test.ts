import { describe, expect, it } from "vitest";
import { supplierReturnCreateSchema } from "./supplier-return.schema.js";

const validInput = {
  productId: "ce61865c-0f1b-4f88-b8d2-7320575c1171",
  quantity: 3,
  agreedReturnPrice: 90_000,
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

  it("rejects a negative agreed return price", () => {
    expect(
      supplierReturnCreateSchema.safeParse({ ...validInput, agreedReturnPrice: -1 }).success
    ).toBe(false);
  });
});
