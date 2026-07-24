import type { PoolClient } from "pg";
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

type CreateSupplierReturnDocumentInput = {
  returnedAt?: string;
  note?: string | null;
  rows: Array<Omit<CreateSupplierReturnInput, "returnedAt" | "createdBy">>;
  createdBy: string;
};

type SupplierReturnRowsInput = {
  rows: Array<Omit<CreateSupplierReturnInput, "returnedAt" | "createdBy">>;
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
    const conditions: string[] = [
      "srd.deleted_at IS NULL",
      `EXISTS (
        SELECT 1 FROM supplier_returns active_return
        WHERE active_return.supplier_return_document_id = srd.id
          AND active_return.deleted_at IS NULL
      )`
    ];
    const values: unknown[] = [];
    if (input.search) {
      values.push(`%${input.search}%`);
      conditions.push(`(
        srd.document_number ILIKE $${values.length}
        OR srd.note ILIKE $${values.length}
        OR EXISTS (
          SELECT 1
          FROM supplier_returns search_return
          JOIN products search_product ON search_product.id = search_return.product_id
          WHERE search_return.supplier_return_document_id = srd.id
            AND search_return.deleted_at IS NULL
            AND (
              search_product.name ILIKE $${values.length}
              OR search_product.code ILIKE $${values.length}
              OR search_return.note ILIKE $${values.length}
            )
        )
      )`);
    }
    if (input.productId) {
      values.push(input.productId);
      conditions.push(`EXISTS (
        SELECT 1 FROM supplier_returns product_return
        WHERE product_return.supplier_return_document_id = srd.id
          AND product_return.deleted_at IS NULL
          AND product_return.product_id = $${values.length}
      )`);
    }
    if (input.from) {
      values.push(input.from);
      conditions.push(`srd.returned_at >= $${values.length}`);
    }
    if (input.to) {
      values.push(input.to);
      conditions.push(`srd.returned_at <= $${values.length}`);
    }

    const direction = input.sortOrder === "asc" ? "ASC" : "DESC";
    values.push(input.limit, (input.page - 1) * input.limit);
    const documentsResult = await query(
      `SELECT srd.id, srd.document_number, srd.returned_at, srd.note,
              srd.created_by, srd.created_at, u.name AS created_by_name,
              document_stats.line_count,
              document_stats.total_quantity,
              document_stats.total_fifo_cost,
              document_stats.total_agreed_return_amount,
              document_stats.total_supplier_return_profit,
              COUNT(*) OVER()::int AS total_count
       FROM supplier_return_documents srd
       JOIN users u ON u.id = srd.created_by
       JOIN LATERAL (
         SELECT COUNT(*)::int AS line_count,
                COALESCE(SUM(sr.quantity), 0) AS total_quantity,
                COALESCE(SUM(sr.fifo_cost), 0) AS total_fifo_cost,
                COALESCE(SUM(sr.total_agreed_return_amount), 0) AS total_agreed_return_amount,
                COALESCE(SUM(sr.supplier_return_profit), 0) AS total_supplier_return_profit
         FROM supplier_returns sr
         WHERE sr.supplier_return_document_id = srd.id
           AND sr.deleted_at IS NULL
       ) document_stats ON document_stats.line_count > 0
       WHERE ${conditions.join(" AND ")}
       ORDER BY srd.returned_at ${direction}, srd.created_at ${direction}, srd.id ${direction}
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );

    const documentIds = documentsResult.rows.map((document) => document.id);
    const itemsResult = documentIds.length
      ? await query(
          `SELECT sr.*, p.name AS product_name, p.code AS product_code, p.unit,
                  u.name AS created_by_name
           FROM supplier_returns sr
           JOIN products p ON p.id = sr.product_id
           JOIN users u ON u.id = sr.created_by
           WHERE sr.supplier_return_document_id = ANY($1::uuid[])
             AND sr.deleted_at IS NULL
           ORDER BY sr.returned_at ASC, sr.created_at ASC, sr.id ASC`,
          [documentIds]
        )
      : { rows: [] };
    const itemsByDocument = new Map<string, typeof itemsResult.rows>();
    for (const item of itemsResult.rows) {
      const items = itemsByDocument.get(item.supplier_return_document_id) ?? [];
      items.push(item);
      itemsByDocument.set(item.supplier_return_document_id, items);
    }

    return {
      rows: documentsResult.rows.map(({ total_count: _total, ...document }) => ({
        ...document,
        items: itemsByDocument.get(document.id) ?? []
      })),
      total: Number(documentsResult.rows[0]?.total_count ?? 0)
    };
  }

  create(input: CreateSupplierReturnInput) {
    return withTransaction(async (client) => {
      const document = await this.createDocumentWithClient(client, {
        returnedAt: input.returnedAt,
        note: input.note,
        rows: [{
          productId: input.productId,
          quantity: input.quantity,
          agreedReturnPricePerUnit: input.agreedReturnPricePerUnit,
          note: input.note
        }],
        createdBy: input.createdBy
      });
      return document.items[0]!;
    });
  }

  createDocument(input: CreateSupplierReturnDocumentInput) {
    return withTransaction(async (client) => this.createDocumentWithClient(client, input));
  }

  appendDocument(id: string, input: SupplierReturnRowsInput) {
    return withTransaction(async (client) => {
      const documentResult = await client.query<{ id: string; document_number: string; returned_at: string }>(
        `SELECT id, document_number, returned_at
         FROM supplier_return_documents
         WHERE id = $1 AND deleted_at IS NULL
         FOR UPDATE`,
        [id]
      );
      const document = documentResult.rows[0];
      if (!document) {
        throw new AppError(404, "Supplier return document not found", "SUPPLIER_RETURN_DOCUMENT_NOT_FOUND");
      }

      const productIds = [...new Set(input.rows.map((row) => row.productId))].sort();
      const productResult = await client.query<{ id: string; name: string; stock_quantity: number }>(
        `SELECT id, name, stock_quantity
         FROM products
         WHERE id = ANY($1::uuid[]) AND is_active = TRUE
         ORDER BY id
         FOR UPDATE`,
        [productIds]
      );
      if (productResult.rows.length !== productIds.length) {
        throw new AppError(404, "Product not found", "PRODUCT_NOT_FOUND");
      }

      const products = new Map(productResult.rows.map((product) => [product.id, product]));
      const requestedByProduct = new Map<string, number>();
      for (const row of input.rows) {
        requestedByProduct.set(
          row.productId,
          Number(requestedByProduct.get(row.productId) ?? 0) + row.quantity
        );
      }
      for (const [productId, requested] of requestedByProduct) {
        const product = products.get(productId)!;
        if (Number(product.stock_quantity) < requested) {
          throw new AppError(
            409,
            `Insufficient stock for ${product.name}. Available: ${product.stock_quantity}`,
            "INSUFFICIENT_STOCK",
            { productId, available: Number(product.stock_quantity), requested }
          );
        }
      }

      const created = [];
      for (const row of input.rows) {
        created.push(await this.createOneWithClient(client, document.id, {
          ...row,
          returnedAt: document.returned_at,
          createdBy: input.createdBy
        }));
      }

      return {
        documentId: document.id,
        documentNumber: document.document_number,
        totalRows: created.length,
        totalQuantity: created.reduce((sum, row) => sum + Number(row.quantity), 0),
        totalFifoCost: created.reduce((sum, row) => sum + Number(row.fifo_cost), 0),
        totalAgreedReturnAmount: created.reduce((sum, row) => sum + Number(row.total_agreed_return_amount), 0),
        totalSupplierReturnProfit: created.reduce((sum, row) => sum + Number(row.supplier_return_profit), 0),
        items: created
      };
    });
  }

  updateDocument(id: string, input: {
    returnedAt?: string;
    note?: string | null;
    rows: Array<Omit<CreateSupplierReturnInput, "returnedAt" | "createdBy">>;
    updatedBy: string;
  }) {
    return withTransaction(async (client) => {
      const documentResult = await client.query<{
        id: string;
        document_number: string;
        returned_at: string;
      }>(
        `SELECT id, document_number, returned_at
         FROM supplier_return_documents
         WHERE id = $1 AND deleted_at IS NULL
         FOR UPDATE`,
        [id]
      );
      const document = documentResult.rows[0];
      if (!document) {
        throw new AppError(404, "Supplier return document not found", "SUPPLIER_RETURN_DOCUMENT_NOT_FOUND");
      }

      const oldReturnsResult = await client.query<{ id: string; product_id: string; quantity: number }>(
        `SELECT id, product_id, quantity
         FROM supplier_returns
         WHERE supplier_return_document_id = $1 AND deleted_at IS NULL
         ORDER BY id
         FOR UPDATE`,
        [id]
      );
      const productIds = [...new Set([
        ...oldReturnsResult.rows.map((row) => row.product_id),
        ...input.rows.map((row) => row.productId)
      ])].sort();
      if (productIds.length) {
        await client.query(
          `SELECT id FROM products WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
          [productIds]
        );
      }

      // Restore every old FIFO allocation before validating the replacement lines.
      for (const oldReturn of oldReturnsResult.rows) {
        await this.removeOneWithClient(client, oldReturn.id, input.updatedBy);
      }

      const productResult = await client.query<{ id: string; name: string; stock_quantity: number }>(
        `SELECT id, name, stock_quantity
         FROM products
         WHERE id = ANY($1::uuid[]) AND is_active = TRUE
         ORDER BY id`,
        [productIds]
      );
      if (productResult.rows.length !== productIds.length) {
        throw new AppError(404, "Product not found", "PRODUCT_NOT_FOUND");
      }
      const products = new Map(productResult.rows.map((product) => [product.id, product]));
      const requestedByProduct = new Map<string, number>();
      for (const row of input.rows) {
        requestedByProduct.set(
          row.productId,
          Number(requestedByProduct.get(row.productId) ?? 0) + row.quantity
        );
      }
      for (const [productId, requested] of requestedByProduct) {
        const product = products.get(productId)!;
        if (Number(product.stock_quantity) < requested) {
          throw new AppError(
            409,
            `Insufficient stock for ${product.name}. Available: ${product.stock_quantity}`,
            "INSUFFICIENT_STOCK",
            { productId, available: Number(product.stock_quantity), requested }
          );
        }
      }

      const returnedAt = input.returnedAt ?? document.returned_at;
      const created = [];
      for (const row of input.rows) {
        created.push(await this.createOneWithClient(client, document.id, {
          ...row,
          returnedAt,
          createdBy: input.updatedBy
        }));
      }
      await client.query(
        `UPDATE supplier_return_documents
         SET returned_at = $2, note = $3
         WHERE id = $1`,
        [id, returnedAt, input.note ?? null]
      );

      return {
        documentId: document.id,
        documentNumber: document.document_number,
        totalRows: created.length,
        totalQuantity: created.reduce((sum, row) => sum + Number(row.quantity), 0),
        totalFifoCost: created.reduce((sum, row) => sum + Number(row.fifo_cost), 0),
        totalAgreedReturnAmount: created.reduce((sum, row) => sum + Number(row.total_agreed_return_amount), 0),
        totalSupplierReturnProfit: created.reduce((sum, row) => sum + Number(row.supplier_return_profit), 0),
        items: created
      };
    });
  }

  removeDocument(id: string, deletedBy: string) {
    return withTransaction(async (client) => {
      const documentResult = await client.query(
        "SELECT id FROM supplier_return_documents WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
        [id]
      );
      if (!documentResult.rows[0]) {
        throw new AppError(404, "Supplier return document not found", "SUPPLIER_RETURN_DOCUMENT_NOT_FOUND");
      }
      const returnsResult = await client.query<{ id: string; product_id: string }>(
        `SELECT id, product_id
         FROM supplier_returns
         WHERE supplier_return_document_id = $1 AND deleted_at IS NULL
         ORDER BY id
         FOR UPDATE`,
        [id]
      );
      const productIds = [...new Set(returnsResult.rows.map((row) => row.product_id))].sort();
      if (productIds.length) {
        await client.query(
          `SELECT id FROM products WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
          [productIds]
        );
      }
      for (const row of returnsResult.rows) {
        await this.removeOneWithClient(client, row.id, deletedBy);
      }
      await client.query(
        `UPDATE supplier_return_documents
         SET deleted_by = $2, deleted_at = NOW()
         WHERE id = $1`,
        [id, deletedBy]
      );

      return { deleted: true, id };
    });
  }

  remove(id: string, deletedBy: string) {
    return withTransaction(async (client) => {
      await this.removeOneWithClient(client, id, deletedBy);
      return { deleted: true, id };
    });
  }

  private async createDocumentWithClient(client: PoolClient, input: CreateSupplierReturnDocumentInput) {
    const productIds = [...new Set(input.rows.map((row) => row.productId))].sort();
    const productResult = await client.query<{
      id: string;
      name: string;
      stock_quantity: number;
    }>(
      `SELECT id, name, stock_quantity
       FROM products
       WHERE id = ANY($1::uuid[]) AND is_active = TRUE
       ORDER BY id
       FOR UPDATE`,
      [productIds]
    );
    if (productResult.rows.length !== productIds.length) {
      throw new AppError(404, "Product not found", "PRODUCT_NOT_FOUND");
    }
    const products = new Map(productResult.rows.map((product) => [product.id, product]));
    const requestedByProduct = new Map<string, number>();
    for (const row of input.rows) {
      requestedByProduct.set(
        row.productId,
        Number(requestedByProduct.get(row.productId) ?? 0) + row.quantity
      );
    }
    for (const [productId, requested] of requestedByProduct) {
      const product = products.get(productId)!;
      if (Number(product.stock_quantity) < requested) {
        throw new AppError(
          409,
          `Insufficient stock for ${product.name}. Available: ${product.stock_quantity}`,
          "INSUFFICIENT_STOCK",
          {
            productId,
            available: Number(product.stock_quantity),
            requested
          }
        );
      }
    }

    const documentResult = await client.query<{ id: string; document_number: string }>(
      `INSERT INTO supplier_return_documents (returned_at, note, created_by)
       VALUES (COALESCE($1::timestamptz,NOW()),$2,$3)
       RETURNING id, document_number`,
      [input.returnedAt ?? null, input.note ?? null, input.createdBy]
    );
    const document = documentResult.rows[0]!;

    const created = [];
    for (const row of input.rows) {
      created.push(await this.createOneWithClient(client, document.id, {
        ...row,
        returnedAt: input.returnedAt,
        createdBy: input.createdBy
      }));
    }

    return {
      documentId: document.id,
      documentNumber: document.document_number,
      totalRows: created.length,
      totalQuantity: created.reduce((sum, row) => sum + Number(row.quantity), 0),
      totalFifoCost: created.reduce((sum, row) => sum + Number(row.fifo_cost), 0),
      totalAgreedReturnAmount: created.reduce((sum, row) => sum + Number(row.total_agreed_return_amount), 0),
      totalSupplierReturnProfit: created.reduce((sum, row) => sum + Number(row.supplier_return_profit), 0),
      items: created
    };
  }

  private async createOneWithClient(
    client: PoolClient,
    documentId: string,
    input: CreateSupplierReturnInput
  ) {
    const returnResult = await client.query<{ id: string }>(
      `INSERT INTO supplier_returns (
         supplier_return_document_id, product_id, quantity, fifo_cost,
         agreed_return_price_per_unit, total_agreed_return_amount,
         supplier_return_profit, returned_at, note, created_by
       ) VALUES ($1,$2,$3,0,$4,0,0,COALESCE($5::timestamptz,NOW()),$6,$7)
       RETURNING id`,
      [
        documentId,
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
  }

  private async removeOneWithClient(client: PoolClient, id: string, deletedBy: string) {
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

    const productResult = await client.query(
      "SELECT id FROM products WHERE id = $1 FOR UPDATE",
      [supplierReturn.product_id]
    );
    if (!productResult.rows[0]) {
      throw new AppError(404, "Product not found", "PRODUCT_NOT_FOUND");
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
  }
}

export const supplierReturnRepository = new SupplierReturnRepository();
