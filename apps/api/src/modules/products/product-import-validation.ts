export type ImportRowError = {
  row: number;
  field: string;
  message: string;
};

export const normalizeImportText = (value: string) =>
  value.trim().toLocaleLowerCase().replace(/\s+/g, " ");

const categoryAliases: Record<string, string[]> = {
  lapka: ["lapka", "лапка"],
  ulitka: ["ulitka", "улитка"],
  nina: ["nina", "igna", "игла", "игна"],
  other: ["other", "другое", "boshqa"],
  plastina: ["plastina", "пластина"],
  pichoq: ["pichoq", "нож", "ножи"],
  disk: ["disk", "диск"],
  overlock: ["overlock parts", "overlock", "оверлок", "детали оверлока"]
};

export function categoryAliasKey(value: string) {
  const normalized = normalizeImportText(value);
  for (const [key, aliases] of Object.entries(categoryAliases)) {
    if (aliases.includes(normalized)) return key;
  }
  return null;
}

export function resolveImportCategory(
  value: string,
  directCategories: Map<string, string>,
  semanticCategories: Map<string, string>
) {
  const normalized = normalizeImportText(value);
  return directCategories.get(normalized)
    ?? (categoryAliasKey(normalized)
      ? semanticCategories.get(categoryAliasKey(normalized)!)
      : undefined);
}

export function duplicateImportNameErrors(
  rows: Array<{ rowNumber: number; name: string }>
) {
  const firstRows = new Map<string, number>();
  const errors: ImportRowError[] = [];
  for (const row of rows) {
    const key = normalizeImportText(row.name);
    const firstRow = firstRows.get(key);
    if (firstRow !== undefined) {
      errors.push({
        row: row.rowNumber,
        field: "name",
        message: `Product name is duplicated in Excel (first row: ${firstRow})`
      });
    } else {
      firstRows.set(key, row.rowNumber);
    }
  }
  return errors;
}

