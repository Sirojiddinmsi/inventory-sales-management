const freePriceValues = new Set([
  "",
  "-",
  "erkin",
  "свободная цена",
  "free",
  "free price"
]);

export function parseLocalizedNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") return value;
  let text = String(value)
    .trim()
    .replace(/\bUZS\b/gi, "")
    .replace(/сум/gi, "")
    .replace(/\s+/g, "");
  if (/[^\d.,+-]/.test(text)) return Number.NaN;
  if (/^[+-]?\d{1,3}(,\d{3})+$/.test(text)) {
    text = text.replaceAll(",", "");
  } else if (/^[+-]?\d{1,3}(\.\d{3})+$/.test(text)) {
    text = text.replaceAll(".", "");
  } else {
    text = text.replace(",", ".");
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function parsePriceCell(value: unknown, allowFree: boolean) {
  const normalized = String(value ?? "").trim().toLocaleLowerCase();
  if (allowFree && freePriceValues.has(normalized)) return 0;
  return parseLocalizedNumber(value);
}

export function parseQuantityCell(value: unknown) {
  if (typeof value === "number") return { quantity: value, unit: "" };
  const text = String(value ?? "").trim();
  const match = text.match(/^([+-]?\d+(?:[.,]\d+)?)\s*(.*)$/u);
  if (!match) return { quantity: Number.NaN, unit: "" };
  return {
    quantity: parseLocalizedNumber(match[1]),
    unit: match[2]?.trim() ?? ""
  };
}

