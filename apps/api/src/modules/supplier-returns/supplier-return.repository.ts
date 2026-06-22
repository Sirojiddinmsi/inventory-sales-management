import { query, withTransaction } from "../../config/database.js";
import { AppError } from "../../shared/errors/AppError.js";
import { consumeFifo } from "../inventory/fifo.repository.js";

type CreateSupplierReturnInput = {
  productId: string;
  quantity: number;
  agreedReturnPrice: number;
  returnedAt?: string;
  note?: string | null;
  createdBy: string;
};

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

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
    const conditions: string[] = [];
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
           product_id, quantity, fifo_cost, agreed_return_price,
           supplier_return_profit, returned_at, note, created_by
         ) VALUES ($1,$2,0,$3,0,COALESCE($4::timestamptz,NOW()),$5,$6)
         RETURNING id`,
        [
          input.productId,
          input.quantity,
          input.agreedReturnPrice,
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

      const profit = money(input.agreedReturnPrice - fifo.fifoCost);
      await client.query(
        `UPDATE supplier_returns
         SET fifo_cost = $2, supplier_return_profit = $3
         WHERE id = $1`,
        [supplierReturnId, fifo.fifoCost, profit]
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
}

export const supplierReturnRepository = new SupplierReturnRepository();
