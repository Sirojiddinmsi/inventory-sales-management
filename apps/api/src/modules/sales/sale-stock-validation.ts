export function availableForSaleEdit(
  currentStock: number,
  originalBaseQuantityForProduct: number
) {
  return Number(currentStock) + Number(originalBaseQuantityForProduct);
}

export function hasEnoughStockForSaleEdit(
  currentStock: number,
  originalBaseQuantityForProduct: number,
  requestedBaseQuantity: number
) {
  return requestedBaseQuantity <=
    availableForSaleEdit(currentStock, originalBaseQuantityForProduct) + 0.0001;
}

