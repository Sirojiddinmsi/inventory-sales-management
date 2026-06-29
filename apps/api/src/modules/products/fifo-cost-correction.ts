export type RemainingCostLayer = {
  remainingQuantity: number;
  unitCost: number;
};

const money = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export function summarizeCostCorrection(
  layers: RemainingCostLayer[],
  newUnitCost: number
) {
  const affectedQuantity = layers.reduce(
    (sum, layer) => sum + layer.remainingQuantity,
    0
  );
  const oldTotalCost = money(
    layers.reduce(
      (sum, layer) => sum + layer.remainingQuantity * layer.unitCost,
      0
    )
  );
  return {
    affectedQuantity,
    oldTotalCost,
    oldUnitCost: affectedQuantity > 0
      ? money(oldTotalCost / affectedQuantity)
      : 0,
    newUnitCost: money(newUnitCost),
    newTotalCost: money(affectedQuantity * newUnitCost)
  };
}

