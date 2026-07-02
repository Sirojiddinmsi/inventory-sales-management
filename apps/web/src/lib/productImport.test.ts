import { describe, expect, it } from "vitest";
import {
  parseLocalizedNumber,
  parsePriceCell,
  parseQuantityCell
} from "./productImport";

describe("Excel product import parsing", () => {
  it.each(["Erkin", "Свободная цена", "", "-"])(
    "treats %s as a free recommended price",
    (value) => {
      expect(parsePriceCell(value, true)).toBe(0);
    }
  );

  it.each([
    ["141000", 141_000],
    ["141,000", 141_000],
    ["141 000", 141_000],
    ["UZS 141,000", 141_000]
  ])("parses price %s", (value, expected) => {
    expect(parseLocalizedNumber(value)).toBe(expected);
  });

  it.each([
    ["2", 2, ""],
    ["2 шт", 2, "шт"],
    ["2 Шт", 2, "Шт"],
    ["2 Блок", 2, "Блок"],
    ["5 dona", 5, "dona"]
  ])("extracts quantity and unit from %s", (value, quantity, unit) => {
    expect(parseQuantityCell(value)).toEqual({ quantity, unit });
  });
});

