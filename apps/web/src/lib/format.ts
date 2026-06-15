import { format } from "date-fns";

export function money(value: number | string | null | undefined, currency = "UZS") {
  return new Intl.NumberFormat("uz-UZ", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(Number(value ?? 0));
}

export function number(value: number | string | null | undefined) {
  return new Intl.NumberFormat("uz-UZ", { maximumFractionDigits: 3 }).format(Number(value ?? 0));
}

export function date(value: string | null | undefined, pattern = "dd.MM.yyyy") {
  if (!value) return "-";
  return format(new Date(value), pattern);
}

export function dateTime(value: string | null | undefined) {
  return date(value, "dd.MM.yyyy HH:mm");
}

export const paymentLabels = {
  CASH: "Naqd",
  CARD: "Plastik",
  DEBT: "Qarz"
} as const;

export const debtLabels = {
  UNPAID: "To‘lanmagan",
  PARTIALLY_PAID: "Qisman to‘langan",
  PAID: "To‘langan"
} as const;

export function toIsoFromDateInput(value: string) {
  return value ? new Date(`${value}T00:00:00`).toISOString() : undefined;
}

export function toIsoEndOfDay(value: string) {
  return value ? new Date(`${value}T23:59:59.999`).toISOString() : undefined;
}

