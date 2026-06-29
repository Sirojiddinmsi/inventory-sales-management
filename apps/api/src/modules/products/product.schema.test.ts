import { describe, expect, it } from "vitest";
import {
  fifoCostCorrectionSchema,
  productCreateSchema,
  productImportSchema
} from "./product.schema.js";

describe("product schemas", () => {
  it("allows a product without a fixed sale price", () => {
    const result = productCreateSchema.safeParse({
      name: "Lapka",
      categoryId: "ce61865c-0f1b-4f88-b8d2-7320575c1171",
      unit: "dona",
      purchasePrice: 10_000
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.salePrice).toBe(0);
  });

  it("accepts products without a user-entered code", () => {
    const result = productCreateSchema.safeParse({
      name: "Pichoq",
      categoryId: "ce61865c-0f1b-4f88-b8d2-7320575c1171",
      unit: "dona",
      purchasePrice: 15_000
    });

    expect(result.success).toBe(true);
  });

  it("validates Excel import rows", () => {
    const result = productImportSchema.safeParse({
      rows: [{
        rowNumber: 2,
        code: "LP-002",
        name: "Excel lapka",
        category: "Lapka",
        unit: "dona",
        purchasePrice: 12_000,
        location: "Polka A1",
        quantity: 5
      }]
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.rows[0]?.salePrice).toBe(0);
  });

  it("rejects a negative import quantity", () => {
    const result = productImportSchema.safeParse({
      rows: [{
        rowNumber: 2,
        code: "LP-003",
        name: "Noto‘g‘ri lapka",
        category: "Lapka",
        unit: "dona",
        purchasePrice: 12_000,
        quantity: -1
      }]
    });

    expect(result.success).toBe(false);
  });

  it("accepts a non-negative corrected FIFO unit cost", () => {
    expect(
      fifoCostCorrectionSchema.safeParse({
        correctedUnitCost: 4_000,
        note: "Wrong opening cost correction"
      }).success
    ).toBe(true);
  });

  it("rejects a negative corrected FIFO unit cost", () => {
    expect(
      fifoCostCorrectionSchema.safeParse({ correctedUnitCost: -1 }).success
    ).toBe(false);
  });
});
