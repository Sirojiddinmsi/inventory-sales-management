import type { PoolClient } from "pg";
import { AppError } from "../../shared/errors/AppError.js";

type CreateBatchInput = {
  productId: string;
  purchaseId?: string | null;
  quantity: number;
  purchasePrice: number;
  receivedAt?: string | null;
  source?: "PURCHASE" | "OPENING" | "ADJUSTMENT" | "IMPORT";
};

type FifoBatch = {
  id: string;
  remaining_quantity: number;
  purchase_price: number;
};

export type FifoAllocation = {
  batchId: string;
  quantity: number;
  unitCost: number;
  costAmount: number;
};

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const stockQuantity = (value: number) =>
  Math.round((value + Number.EPSILON) * 1000) / 1000;

export async function createInventoryBatch(client: PoolClient, input: CreateBatchInput) {
  if (input.quantity <= 0) return null;

  const result = await client.query(
    `INSERT INTO inventory_batches (
       product_id, purchase_id, initial_quantity, remaining_quantity,
       purchase_price, received_at, source
     ) VALUES ($1,$2,$3,$3,$4,COALESCE($5::timestamptz,NOW()),$6)
     RETURNING *`,
    [
      input.productId,
      input.purchaseId ?? null,
      input.quantity,
      input.purchasePrice,
      input.receivedAt ?? null,
      input.source ?? "PURCHASE"
    ]
  );
  return result.rows[0] ?? null;
}

export async function consumeFifo(
  client: PoolClient,
  productId: string,
  quantity: number,
  saleItemId?: string
) {
  if (quantity <= 0) return { fifoCost: 0, weightedUnitCost: 0, allocations: [] };

  const result = await client.query<FifoBatch>(
    `SELECT id, remaining_quantity, purchase_price
     FROM inventory_batches
     WHERE product_id = $1 AND remaining_quantity > 0
     ORDER BY received_at ASC, created_at ASC, id ASC
     FOR UPDATE`,
    [productId]
  );

  let needed = quantity;
  let fifoCost = 0;
  const allocations: FifoAllocation[] = [];
  for (const batch of result.rows) {
    if (needed <= 0) break;
    const allocated = Math.min(needed, batch.remaining_quantity);
    const costAmount = money(allocated * batch.purchase_price);

    await client.query(
      `UPDATE inventory_batches
       SET remaining_quantity = remaining_quantity - $2
       WHERE id = $1`,
      [batch.id, allocated]
    );
    if (saleItemId) {
      await client.query(
        `INSERT INTO sale_item_batch_allocations (
           sale_item_id, batch_id, quantity, unit_cost, cost_amount
         ) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (sale_item_id, batch_id) DO UPDATE SET
           quantity = sale_item_batch_allocations.quantity + EXCLUDED.quantity,
           cost_amount = sale_item_batch_allocations.cost_amount + EXCLUDED.cost_amount`,
        [saleItemId, batch.id, allocated, batch.purchase_price, costAmount]
      );
    }
    fifoCost += costAmount;
    allocations.push({
      batchId: batch.id,
      quantity: allocated,
      unitCost: batch.purchase_price,
      costAmount
    });
    needed = stockQuantity(needed - allocated);
  }

  if (needed > 0.0001) {
    throw new AppError(
      409,
      "FIFO inventory batches do not contain enough stock",
      "INSUFFICIENT_FIFO_STOCK",
      { productId, available: stockQuantity(quantity - needed), requested: quantity }
    );
  }

  return {
    fifoCost: money(fifoCost),
    weightedUnitCost: money(fifoCost / quantity),
    allocations
  };
}

export async function releaseActiveAllocations(
  client: PoolClient,
  saleItemId: string,
  markArchived: boolean
) {
  const result = await client.query<{
    id: string;
    batch_id: string;
    quantity: number;
    returned_quantity: number;
    archived_released_quantity: number;
  }>(
    `SELECT id, batch_id, quantity, returned_quantity, archived_released_quantity
     FROM sale_item_batch_allocations
     WHERE sale_item_id = $1
     ORDER BY id
     FOR UPDATE`,
    [saleItemId]
  );

  for (const allocation of result.rows) {
    const active =
      allocation.quantity -
      allocation.returned_quantity -
      allocation.archived_released_quantity;
    if (active <= 0) continue;

    await client.query(
      `UPDATE inventory_batches
       SET remaining_quantity = remaining_quantity + $2
       WHERE id = $1`,
      [allocation.batch_id, active]
    );
    if (markArchived) {
      await client.query(
        `UPDATE sale_item_batch_allocations
         SET archived_released_quantity = archived_released_quantity + $2
         WHERE id = $1`,
        [allocation.id, active]
      );
    }
  }
}

export async function returnFifoToBatches(
  client: PoolClient,
  saleItemId: string,
  quantity: number
) {
  const result = await client.query<{
    id: string;
    batch_id: string;
    quantity: number;
    returned_quantity: number;
    archived_released_quantity: number;
    unit_cost: number;
  }>(
    `SELECT a.id, a.batch_id, a.quantity, a.returned_quantity,
            a.archived_released_quantity, a.unit_cost
     FROM sale_item_batch_allocations a
     JOIN inventory_batches b ON b.id = a.batch_id
     WHERE a.sale_item_id = $1
     ORDER BY b.received_at DESC, b.created_at DESC, b.id DESC
     FOR UPDATE OF a, b`,
    [saleItemId]
  );

  let needed = quantity;
  let fifoCost = 0;
  for (const allocation of result.rows) {
    if (needed <= 0) break;
    const available =
      allocation.quantity -
      allocation.returned_quantity -
      allocation.archived_released_quantity;
    if (available <= 0) continue;
    const restored = Math.min(needed, available);

    await client.query(
      `UPDATE inventory_batches
       SET remaining_quantity = remaining_quantity + $2
       WHERE id = $1`,
      [allocation.batch_id, restored]
    );
    await client.query(
      `UPDATE sale_item_batch_allocations
       SET returned_quantity = returned_quantity + $2
       WHERE id = $1`,
      [allocation.id, restored]
    );
    fifoCost += restored * allocation.unit_cost;
    needed = stockQuantity(needed - restored);
  }

  if (needed > 0.0001) {
    throw new AppError(
      409,
      "Sale FIFO allocation is incomplete",
      "INCOMPLETE_FIFO_ALLOCATION",
      { saleItemId, requested: quantity }
    );
  }
  return money(fifoCost);
}
