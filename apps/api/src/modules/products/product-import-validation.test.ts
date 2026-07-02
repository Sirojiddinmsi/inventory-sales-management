import { describe, expect, it } from "vitest";
import {
  categoryAliasKey,
  duplicateImportNameErrors,
  resolveImportCategory
} from "./product-import-validation.js";

describe("product import validation", () => {
  it.each([
    ["Лапка", "lapka"],
    ["Улитка", "ulitka"],
    ["Игла", "nina"],
    ["Игна", "nina"],
    ["Nina", "nina"],
    ["Igna", "nina"],
    ["Другое", "other"]
  ])("maps category alias %s", (value, expected) => {
    expect(categoryAliasKey(value)).toBe(expected);
  });

  it("resolves an alias only to an existing semantic category", () => {
    expect(
      resolveImportCategory(
        "Игна",
        new Map(),
        new Map([["nina", "needle-category-id"]])
      )
    ).toBe("needle-category-id");
  });

  it("reports duplicate names with their Excel row", () => {
    expect(
      duplicateImportNameErrors([
        { rowNumber: 2, name: "Lapka P36" },
        { rowNumber: 5, name: " lapka p36 " }
      ])
    ).toEqual([{
      row: 5,
      field: "name",
      message: "Product name is duplicated in Excel (first row: 2)"
    }]);
  });
});

