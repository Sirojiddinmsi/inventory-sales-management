import { AppError } from "../../shared/errors/AppError.js";

export type DebtPaymentMethod = "CASH" | "CARD" | "TRANSFER" | "MIXED";

export type DebtForAllocation = {
  id: string;
  invoice_number: string;
  remaining_amount: number;
};

export type PaymentSplitInput = {
  amount: number;
  paymentMethod: DebtPaymentMethod;
  cashAmount?: number;
  cardAmount?: number;
  transferAmount?: number;
};

export type DebtAllocation = {
  debtId: string;
  invoiceNumber: string;
  amount: number;
  cashAmount: number;
  cardAmount: number;
  transferAmount: number;
};

const MONEY_SCALE = 100;
const MONEY_EPSILON = 1e-9;

export function toMoneyCents(value: number, field = "amount") {
  const numericValue = Number(value);
  const cents = Math.round(numericValue * MONEY_SCALE);

  if (
    !Number.isFinite(numericValue) ||
    !Number.isSafeInteger(cents) ||
    Math.abs(numericValue - cents / MONEY_SCALE) > MONEY_EPSILON
  ) {
    throw new AppError(
      422,
      `${field} must be a monetary value with at most 2 decimal places`,
      "PAYMENT_MONEY_PRECISION_INVALID",
      { field, value }
    );
  }

  return cents;
}

function fromMoneyCents(value: number) {
  return value / MONEY_SCALE;
}

export function normalizePaymentSplit(input: PaymentSplitInput) {
  const amountCents = toMoneyCents(input.amount);
  if (amountCents <= 0) {
    throw new AppError(422, "Payment amount must be greater than zero", "PAYMENT_AMOUNT_INVALID");
  }

  const cashCents = input.paymentMethod === "CASH"
    ? amountCents
    : input.paymentMethod === "MIXED"
      ? toMoneyCents(input.cashAmount ?? 0, "cashAmount")
      : 0;
  const cardCents = input.paymentMethod === "CARD"
    ? amountCents
    : input.paymentMethod === "MIXED"
      ? toMoneyCents(input.cardAmount ?? 0, "cardAmount")
      : 0;
  const transferCents = input.paymentMethod === "TRANSFER"
    ? amountCents
    : input.paymentMethod === "MIXED"
      ? toMoneyCents(input.transferAmount ?? 0, "transferAmount")
      : 0;

  if (cashCents < 0 || cardCents < 0 || transferCents < 0) {
    throw new AppError(422, "Payment split cannot be negative", "DEBT_PAYMENT_SPLIT_INVALID");
  }
  if (cashCents + cardCents + transferCents !== amountCents) {
    throw new AppError(
      422,
      "Debt payment split must equal total amount",
      "DEBT_PAYMENT_SPLIT_INVALID",
      {
        amount: fromMoneyCents(amountCents),
        cashAmount: fromMoneyCents(cashCents),
        cardAmount: fromMoneyCents(cardCents),
        transferAmount: fromMoneyCents(transferCents)
      }
    );
  }

  return {
    amount: fromMoneyCents(amountCents),
    cashAmount: fromMoneyCents(cashCents),
    cardAmount: fromMoneyCents(cardCents),
    transferAmount: fromMoneyCents(transferCents),
    amountCents,
    cashCents,
    cardCents,
    transferCents
  };
}

export function allocateDebtPaymentOldestFirst(
  debts: DebtForAllocation[],
  splitInput: PaymentSplitInput
) {
  const split = normalizePaymentSplit(splitInput);
  const totalRemainingCents = debts.reduce(
    (sum, debt) => sum + toMoneyCents(debt.remaining_amount, "remainingAmount"),
    0
  );

  if (!Number.isSafeInteger(totalRemainingCents)) {
    throw new AppError(422, "Customer debt total is outside the supported money range", "PAYMENT_MONEY_RANGE_INVALID");
  }
  if (split.amountCents > totalRemainingCents) {
    throw new AppError(
      422,
      "Payment cannot exceed active customer debt",
      "PAYMENT_EXCEEDS_CUSTOMER_DEBT",
      {
        remainingAmount: fromMoneyCents(totalRemainingCents),
        amount: split.amount
      }
    );
  }

  let paymentLeftCents = split.amountCents;
  const buckets = {
    cash: split.cashCents,
    card: split.cardCents,
    transfer: split.transferCents
  };
  const allocations: DebtAllocation[] = [];

  for (const debt of debts) {
    if (paymentLeftCents === 0) break;

    const debtRemainingCents = toMoneyCents(debt.remaining_amount, "remainingAmount");
    if (debtRemainingCents <= 0) continue;

    const childAmountCents = Math.min(paymentLeftCents, debtRemainingCents);
    let childLeftCents = childAmountCents;

    const cashCents = Math.min(buckets.cash, childLeftCents);
    buckets.cash -= cashCents;
    childLeftCents -= cashCents;

    const cardCents = Math.min(buckets.card, childLeftCents);
    buckets.card -= cardCents;
    childLeftCents -= cardCents;

    const transferCents = Math.min(buckets.transfer, childLeftCents);
    buckets.transfer -= transferCents;
    childLeftCents -= transferCents;

    if (childLeftCents !== 0) {
      throw new AppError(500, "Payment allocation split is inconsistent", "PAYMENT_ALLOCATION_INVALID");
    }

    allocations.push({
      debtId: debt.id,
      invoiceNumber: debt.invoice_number,
      amount: fromMoneyCents(childAmountCents),
      cashAmount: fromMoneyCents(cashCents),
      cardAmount: fromMoneyCents(cardCents),
      transferAmount: fromMoneyCents(transferCents)
    });
    paymentLeftCents -= childAmountCents;
  }

  if (paymentLeftCents !== 0 || buckets.cash !== 0 || buckets.card !== 0 || buckets.transfer !== 0) {
    throw new AppError(500, "Payment allocation did not consume the full amount", "PAYMENT_ALLOCATION_INVALID");
  }

  return {
    amount: split.amount,
    cashAmount: split.cashAmount,
    cardAmount: split.cardAmount,
    transferAmount: split.transferAmount,
    allocations
  };
}
