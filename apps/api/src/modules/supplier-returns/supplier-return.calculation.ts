const money = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export function calculateSupplierReturnAmounts(
  quantity: number,
  agreedReturnPricePerUnit: number,
  fifoCost: number
) {
  const totalAgreedReturnAmount = money(quantity * agreedReturnPricePerUnit);
  return {
    totalAgreedReturnAmount,
    supplierReturnProfit: money(totalAgreedReturnAmount - fifoCost)
  };
}
