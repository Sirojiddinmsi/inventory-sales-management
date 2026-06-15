import type { PoolClient } from "pg";
import { query, withTransaction } from "../../config/database.js";
import { AppError } from "../../shared/errors/AppError.js";
import { createInventoryBatch } from "../inventory/fifo.repository.js";
import type { PurchaseImportRow } from "./purchase.schema.js";

type CreatePurchaseInput = {
  supplierId?: string | null;
  productId: string;
  quantity: number;
  purchasePrice: number;
  location?: string | null;
  purchasedAt?: string;
  note?: string | null;
  createdBy: string;
};

export class PurchaseRepository {
  async list(input: {
    page: number;
    limit: number;
    search?: string;
    supplierId?: string;
    productId?: string;
    from?: string;
    to?: string;
    sortBy: string;
    sortOrder: "asc" | "desc";
  }) {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (input.search) {
      values.push(`%${input.search}%`);
      conditions.push(`(p.name ILIKE $${values.length} OR p.code ILIKE $${values.length}
        OR s.name ILIKE $${values.length})`);
    }
    for (const [column, value] of [
      ["pu.supplier_id", input.supplierId],
      ["pu.product_id", input.productId]
    ] as const) {
      if (value) {
        values.push(value);
        conditions.push(`${column} = $${values.length}`);
      }
    }
    if (input.from) {
      values.push(input.from);
      conditions.push(`pu.purchased_at >= $${values.length}`);
    }
    if (input.to) {
      values.push(input.to);
      conditions.push(`pu.purchased_at <= $${values.length}`);
    }

    const sortColumns: Record<string, string> = {
      purchased_at: "pu.purchased_at",
      total_cost: "pu.total_cost",
      quantity: "pu.quantity"
    };
    const orderBy = sortColumns[input.sortBy] ?? "pu.purchased_at";
    const direction = input.sortOrder === "asc" ? "ASC" : "DESC";
    values.push(input.limit, (input.page - 1) * input.limit);

    const result = await query(
      `SELECT pu.*, p.name AS product_name, p.code AS product_code,
              s.name AS supplier_name, u.name AS created_by_name,
              p.location AS product_location,
              COUNT(*) OVER()::int AS total_count
       FROM purchases pu
       JOIN products p ON p.id = pu.product_id
       LEFT JOIN suppliers s ON s.id = pu.supplier_id
       JOIN users u ON u.id = pu.created_by
       ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
       ORDER BY ${orderBy} ${direction}
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );

    return {
      rows: result.rows.map(({ total_count: _total, ...row }) => row),
      total: Number(result.rows[0]?.total_count ?? 0)
    };
  }

  create(input: CreatePurchaseInput) {
    return withTransaction(async (client) => {
      return this.createOne(client, input);
    });
  }

  bulkCreate(rows: CreatePurchaseInput[], createdBy: string) {
    return withTransaction(async (client) => {
      const productIds = [...new Set(rows.map((row) => row.productId))].sort();
      await this.lockProducts(client, productIds);
      const supplierIds = rows
        .map((row) => row.supplierId)
        .filter((value): value is string => Boolean(value));
      if (supplierIds.length > 0) {
        await this.ensureSuppliers(client, [...new Set(supplierIds)]);
      }

      const created = [];
      let totalAmount = 0;
      for (const row of rows) {
        const purchase = await this.createOne(client, { ...row, createdBy });
        created.push(purchase);
        totalAmount += Number(purchase.total_cost);
      }
      return {
        totalRows: created.length,
        totalAmount,
        rows: created
      };
    });
  }

  importRows(rows: PurchaseImportRow[], createdBy: string) {
    return withTransaction(async (client) => {
      const productResult = await client.query<{
        id: string;
        code: string;
        name: string;
        location: string | null;
      }>("SELECT id, code, name, location FROM products WHERE is_active = TRUE");
      const supplierResult = await client.query<{ id: string; name: string }>(
        "SELECT id, name FROM suppliers"
      );
      const productMap = new Map<string, { id: string; location: string | null }>();
      for (const product of productResult.rows) {
        productMap.set(product.code.toLowerCase(), { id: product.id, location: product.location });
        productMap.set(product.name.toLowerCase(), { id: product.id, location: product.location });
      }
      const supplierMap = new Map(
        supplierResult.rows.map((supplier) => [supplier.name.toLowerCase(), supplier.id])
      );

      const resolved = rows.map((row) => {
        const product = productMap.get(row.product.toLowerCase());
        if (!product) {
          throw new AppError(
            422,
            "Excel faylda mavjud bo‘lmagan mahsulot bor",
            "PURCHASE_IMPORT_PRODUCT_NOT_FOUND",
            { rowNumber: row.rowNumber, product: row.product }
          );
        }
        const supplierId = row.supplier?.trim()
          ? supplierMap.get(row.supplier.toLowerCase())
          : null;
        if (row.supplier?.trim() && !supplierId) {
          throw new AppError(
            422,
            "Excel faylda mavjud bo‘lmagan yetkazib beruvchi bor",
            "PURCHASE_IMPORT_SUPPLIER_NOT_FOUND",
            { rowNumber: row.rowNumber, supplier: row.supplier }
          );
        }

        return {
          supplierId,
          productId: product.id,
          quantity: row.quantity,
          purchasePrice: row.purchasePrice,
          location: row.location?.trim() || product.location || null,
          purchasedAt: row.purchasedAt,
          note: row.note?.trim() || null,
          createdBy
        } satisfies CreatePurchaseInput;
      });

      const created = await this.bulkCreateWithClient(client, resolved);
      return {
        totalRows: created.rows.length,
        totalAmount: created.totalAmount,
        importedQuantity: created.rows.reduce((sum, row) => sum + Number(row.quantity), 0),
        rows: created.rows
      };
    });
  }

  private async bulkCreateWithClient(client: PoolClient, rows: CreatePurchaseInput[]) {
    const productIds = [...new Set(rows.map((row) => row.productId))].sort();
    await this.lockProducts(client, productIds);
    const supplierIds = rows
      .map((row) => row.supplierId)
      .filter((value): value is string => Boolean(value));
    if (supplierIds.length > 0) {
      await this.ensureSuppliers(client, [...new Set(supplierIds)]);
    }
    const created = [];
    let totalAmount = 0;
    for (const row of rows) {
      const purchase = await this.createOne(client, row);
      created.push(purchase);
      totalAmount += Number(purchase.total_cost);
    }
    return {
      rows: created,
      totalAmount
    };
  }

  private async createOne(client: PoolClient, input: CreatePurchaseInput) {
    const totalCost = input.quantity * input.purchasePrice;

    const result = await client.query(
      `INSERT INTO purchases (
         supplier_id, product_id, quantity, purchase_price, total_cost,
         purchased_at, note, created_by
       ) VALUES ($1,$2,$3,$4,$5,COALESCE($6::timestamptz, NOW()),$7,$8)
       RETURNING *`,
      [
        input.supplierId ?? null,
        input.productId,
        input.quantity,
        input.purchasePrice,
        totalCost,
        input.purchasedAt ?? null,
        input.note ?? null,
        input.createdBy
      ]
    );
    const purchase = result.rows[0]!;

    await createInventoryBatch(client, {
      productId: input.productId,
      purchaseId: purchase.id,
      quantity: input.quantity,
      purchasePrice: input.purchasePrice,
      receivedAt: purchase.purchased_at,
      source: "PURCHASE"
    });

    await client.query(
      `UPDATE products
       SET stock_quantity = stock_quantity + $2,
           purchase_price = $3,
           location = COALESCE($4, location)
       WHERE id = $1`,
      [input.productId, input.quantity, input.purchasePrice, input.location?.trim() || null]
    );

    return purchase;
  }

  private async lockProduct(client: PoolClient, productId: string) {
    const result = await client.query(
      "SELECT id FROM products WHERE id = $1 AND is_active = TRUE FOR UPDATE",
      [productId]
    );
    if (!result.rows[0]) {
      throw new AppError(404, "Product not found", "PRODUCT_NOT_FOUND");
    }
  }

  private async lockProducts(client: PoolClient, productIds: string[]) {
    const result = await client.query(
      `SELECT id FROM products
       WHERE id = ANY($1::uuid[]) AND is_active = TRUE
       ORDER BY id FOR UPDATE`,
      [productIds]
    );
    if (result.rows.length !== productIds.length) {
      throw new AppError(404, "Product not found", "PRODUCT_NOT_FOUND");
    }
  }

  private async ensureSuppliers(client: PoolClient, supplierIds: string[]) {
    const result = await client.query(
      "SELECT id FROM suppliers WHERE id = ANY($1::uuid[])",
      [supplierIds]
    );
    if (result.rows.length !== supplierIds.length) {
      throw new AppError(404, "Supplier not found", "SUPPLIER_NOT_FOUND");
    }
  }
}

export const purchaseRepository = new PurchaseRepository();
