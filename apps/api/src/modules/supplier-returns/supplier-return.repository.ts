import { query, withTransaction } from "../../config/database.js";
import { AppError } from "../../shared/errors/AppError.js";
import { consumeFifo } from "../inventory/fifo.repository.js";
import { calculateSupplierReturnAmounts } from "./supplier-return.calculation.js";

type CreateSupplierReturnInput = {
  productId: string;
  quantity: number;
  agreedReturnPricePerUnit: number;
  returnedAt?: string;
  note?: string | null;
  createdBy: string;
};

export class SupplierReturnRepository {
  async list(input: {
    page: number;
    limit: number;
    search?: string;
    productId?: string;
    from?: string;
    to?: string;
    sortOrder: "asc" | "desc";
  }) {
    const conditions: string[] = ["sr.deleted_at IS NULL"];
    const values: unknown[] = [];
    if (input.search) {
      values.push(`%${input.search}%`);
      conditions.push(`(p.name ILIKE $${values.length} OR p.code ILIKE $${values.length}
        OR sr.note ILIKE $${values.length})`);
    }
    if (input.productId) {
      values.push(input.productId);
      conditions.push(`sr.product_id = $${values.length}`);
    }
    if (input.from) {
      values.push(input.from);
      conditions.push(`sr.returned_at >= $${values.length}`);
    }
    if (input.to) {
      values.push(input.to);
      conditions.push(`sr.returned_at <= $${values.length}`);
    }

    const direction = input.sortOrder === "asc" ? "ASC" : "DESC";
    values.push(input.limit, (input.page - 1) * input.limit);
    const result = await query(
      `SELECT sr.*, p.name AS product_name, p.code AS product_code, p.unit,
              u.name AS created_by_name, COUNT(*) OVER()::int AS total_count
       FROM supplier_returns sr
       JOIN products p ON p.id = sr.product_id
       JOIN users u ON u.id = sr.created_by
       ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
       ORDER BY sr.returned_at ${direction}, sr.created_at ${direction}, sr.id ${direction}
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );

    return {
      rows: result.rows.map(({ total_count: _total, ...row }) => row),
      total: Number(result.rows[0]?.total_count ?? 0)
    };
  }

  create(input: CreateSupplierReturnInput) {
    return withTransaction(async (client) => {
      const productResult = await client.query<{
        id: string;
        name: string;
        stock_quantity: number;
      }>(
        `SELECT id, name, stock_quantity
         FROM products
         WHERE id = $1 AND is_active = TRUE
         FOR UPDATE`,
        [input.productId]
      );
      const product = productResult.rows[0];
      if (!product) throw new AppError(404, "Product not found", "PRODUCT_NOT_FOUND");
      if (Number(product.stock_quantity) < input.quantity) {
        throw new AppError(
          409,
          `Insufficient stock for ${product.name}. Available: ${product.stock_quantity}`,
          "INSUFFICIENT_STOCK",
          {
            productId: product.id,
            available: Number(product.stock_quantity),
            requested: input.quantity
          }
        );
      }

      const returnResult = await client.query<{ id: string }>(
        `INSERT INTO supplier_returns (
           product_id, quantity, fifo_cost, agreed_return_price_per_unit,
           total_agreed_return_amount, supplier_return_profit,
           returned_at, note, created_by
         ) VALUES ($1,$2,0,$3,0,0,COALESCE($4::timestamptz,NOW()),$5,$6)
         RETURNING id`,
        [
          input.productId,
          input.quantity,
          input.agreedReturnPricePerUnit,
          input.returnedAt ?? null,
          input.note ?? null,
          input.createdBy
        ]
      );
      const supplierReturnId = returnResult.rows[0]!.id;
      const fifo = await consumeFifo(client, input.productId, input.quantity);

      for (const allocation of fifo.allocations) {
        await client.query(
          `INSERT INTO supplier_return_batch_allocations (
             supplier_return_id, batch_id, quantity, unit_cost, cost_amount
           ) VALUES ($1,$2,$3,$4,$5)`,
          [
            supplierReturnId,
            allocation.batchId,
            allocation.quantity,
            allocation.unitCost,
            allocation.costAmount
          ]
        );
      }

      const amounts = calculateSupplierReturnAmounts(
        input.quantity,
        input.agreedReturnPricePerUnit,
        fifo.fifoCost
      );
      await client.query(
        `UPDATE supplier_returns
         SET fifo_cost = $2,
             total_agreed_return_amount = $3,
             supplier_return_profit = $4
         WHERE id = $1`,
        [
          supplierReturnId,
          fifo.fifoCost,
          amounts.totalAgreedReturnAmount,
          amounts.supplierReturnProfit
        ]
      );
      await client.query(
        "UPDATE products SET stock_quantity = stock_quantity - $2 WHERE id = $1",
        [input.productId, input.quantity]
      );

      const created = await client.query(
        `SELECT sr.*, p.name AS product_name, p.code AS product_code, p.unit,
                u.name AS created_by_name
         FROM supplier_returns sr
         JOIN products p ON p.id = sr.product_id
         JOIN users u ON u.id = sr.created_by
         WHERE sr.id = $1`,
        [supplierReturnId]
      );
      return created.rows[0]!;
    });
  }

  remove(id: string, deletedBy: string) {
    return withTransaction(async (client) => {
      const lookupResult = await client.query<{
        id: string;
        product_id: string;
        quantity: number;
      }>(
        `SELECT id, product_id, quantity
         FROM supplier_returns
         WHERE id = $1 AND deleted_at IS NULL`,
        [id]
      );
      const lookup = lookupResult.rows[0];
      if (!lookup) {
        throw new AppError(404, "Supplier return not found", "SUPPLIER_RETURN_NOT_FOUND");
      }

      const productResult = await client.query(
        "SELECT id FROM products WHERE id = $1 FOR UPDATE",
        [lookup.product_id]
      );
      if (!productResult.rows[0]) {
        throw new AppError(404, "Product not found", "PRODUCT_NOT_FOUND");
      }

      const returnResult = await client.query<{
        id: string;
        product_id: string;
        quantity: number;
      }>(
        `SELECT id, product_id, quantity
         FROM supplier_returns
         WHERE id = $1 AND deleted_at IS NULL
         FOR UPDATE`,
        [id]
      );
      const supplierReturn = returnResult.rows[0];
      if (!supplierReturn) {
        throw new AppError(404, "Supplier return not found", "SUPPLIER_RETURN_NOT_FOUND");
      }

      const allocations = await client.query<{
        id: string;
        batch_id: string;
        quantity: number;
      }>(
        `SELECT a.id, a.batch_id, a.quantity
         FROM supplier_return_batch_allocations a
         JOIN inventory_batches b ON b.id = a.batch_id
         WHERE a.supplier_return_id = $1
         ORDER BY b.id
         FOR UPDATE OF a, b`,
        [id]
      );
      const allocatedQuantity = allocations.rows.reduce(
        (sum, allocation) => sum + Number(allocation.quantity),
        0
      );
      if (Math.abs(allocatedQuantity - Number(supplierReturn.quantity)) > 0.0001) {
        throw new AppError(
          409,
          "Supplier return FIFO allocation is incomplete",
          "SUPPLIER_RETURN_FIFO_INCOMPLETE",
          {
            supplierReturnId: id,
            expected: Number(supplierReturn.quantity),
            allocated: allocatedQuantity
          }
        );
      }

      for (const allocation of allocations.rows) {
        const restored = await client.query(
          `UPDATE inventory_batches
           SET remaining_quantity = remaining_quantity + $2
           WHERE id = $1
             AND remaining_quantity + $2 <= initial_quantity
           RETURNING id`,
          [allocation.batch_id, allocation.quantity]
        );
        if (!restored.rows[0]) {
          throw new AppError(
            409,
            "Supplier return FIFO batch cannot be restored safely",
            "SUPPLIER_RETURN_FIFO_RESTORE_BLOCKED",
            { supplierReturnId: id, batchId: allocation.batch_id }
          );
        }
      }

      await client.query(
        "UPDATE products SET stock_quantity = stock_quantity + $2 WHERE id = $1",
        [supplierReturn.product_id, supplierReturn.quantity]
      );
      await client.query(
        "DELETE FROM supplier_return_batch_allocations WHERE supplier_return_id = $1",
        [id]
      );
      await client.query(
        `UPDATE supplier_returns
         SET deleted_by = $2, deleted_at = NOW()
         WHERE id = $1`,
        [id, deletedBy]
      );

      return { deleted: true, id };
    });
  }
}

export const supplierReturnRepository = new SupplierReturnRepository();
