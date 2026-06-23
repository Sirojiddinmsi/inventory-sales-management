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

type UpdatePurchaseInput = Omit<CreatePurchaseInput, "createdBy"> & {
  editedBy: string;
};

type PurchaseRow = {
  id: string;
  purchase_document_id: string;
  supplier_id: string | null;
  product_id: string;
  quantity: number;
  purchase_price: number;
  total_cost: number;
  purchased_at: string;
  location: string | null;
  note: string | null;
  created_by: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string | null;
  deleted_by: string | null;
  deleted_at: string | null;
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
    const conditions: string[] = [`EXISTS (
      SELECT 1 FROM purchases active_purchase
      WHERE active_purchase.purchase_document_id = pd.id
        AND active_purchase.deleted_at IS NULL
    )`];
    const values: unknown[] = [];

    if (input.search) {
      values.push(`%${input.search}%`);
      conditions.push(`(
        pd.document_number ILIKE $${values.length}
        OR EXISTS (
          SELECT 1
          FROM purchases search_purchase
          JOIN products search_product ON search_product.id = search_purchase.product_id
          LEFT JOIN suppliers search_supplier ON search_supplier.id = search_purchase.supplier_id
          WHERE search_purchase.purchase_document_id = pd.id
            AND search_purchase.deleted_at IS NULL
            AND (
              search_product.name ILIKE $${values.length}
              OR search_product.code ILIKE $${values.length}
              OR search_supplier.name ILIKE $${values.length}
            )
        )
      )`);
    }
    if (input.supplierId) {
      values.push(input.supplierId);
      conditions.push(`EXISTS (
        SELECT 1 FROM purchases supplier_purchase
        WHERE supplier_purchase.purchase_document_id = pd.id
          AND supplier_purchase.deleted_at IS NULL
          AND supplier_purchase.supplier_id = $${values.length}
      )`);
    }
    if (input.productId) {
      values.push(input.productId);
      conditions.push(`EXISTS (
        SELECT 1 FROM purchases product_purchase
        WHERE product_purchase.purchase_document_id = pd.id
          AND product_purchase.deleted_at IS NULL
          AND product_purchase.product_id = $${values.length}
      )`);
    }
    if (input.from) {
      values.push(input.from);
      conditions.push(`pd.purchased_at >= $${values.length}`);
    }
    if (input.to) {
      values.push(input.to);
      conditions.push(`pd.purchased_at <= $${values.length}`);
    }

    const sortColumns: Record<string, string> = {
      purchased_at: "pd.purchased_at",
      total_cost: "document_stats.total_amount",
      quantity: "document_stats.total_quantity"
    };
    const orderBy = sortColumns[input.sortBy] ?? "pd.purchased_at";
    const direction = input.sortOrder === "asc" ? "ASC" : "DESC";
    values.push(input.limit, (input.page - 1) * input.limit);

    const documentsResult = await query(
      `SELECT pd.id, pd.document_number, pd.purchased_at, pd.created_at,
              pd.created_by, u.name AS created_by_name,
              document_stats.line_count,
              document_stats.total_quantity,
              document_stats.total_amount,
              document_stats.supplier_count,
              CASE WHEN document_stats.supplier_count = 1
                   THEN document_stats.supplier_name
                   ELSE NULL
              END AS supplier_name,
              COUNT(*) OVER()::int AS total_count
       FROM purchase_documents pd
       JOIN users u ON u.id = pd.created_by
       JOIN LATERAL (
         SELECT COUNT(*)::int AS line_count,
                COALESCE(SUM(pu.quantity), 0) AS total_quantity,
                COALESCE(SUM(pu.total_cost), 0) AS total_amount,
                COUNT(DISTINCT COALESCE(pu.supplier_id::text, 'NONE'))::int AS supplier_count,
                MIN(s.name) AS supplier_name
         FROM purchases pu
         LEFT JOIN suppliers s ON s.id = pu.supplier_id
         WHERE pu.purchase_document_id = pd.id
           AND pu.deleted_at IS NULL
       ) document_stats ON document_stats.line_count > 0
       WHERE ${conditions.join(" AND ")}
       ORDER BY ${orderBy} ${direction}, pd.id ${direction}
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );

    const documentIds = documentsResult.rows.map((document) => document.id);
    const itemsResult = documentIds.length
      ? await query(
          `SELECT pu.*, p.name AS product_name, p.code AS product_code,
                  p.unit, s.name AS supplier_name,
                  u.name AS created_by_name, editor.name AS updated_by_name,
                  COALESCE(pu.location, p.location) AS product_location
           FROM purchases pu
           JOIN products p ON p.id = pu.product_id
           LEFT JOIN suppliers s ON s.id = pu.supplier_id
           JOIN users u ON u.id = pu.created_by
           LEFT JOIN users editor ON editor.id = pu.updated_by
           WHERE pu.purchase_document_id = ANY($1::uuid[])
             AND pu.deleted_at IS NULL
           ORDER BY pu.purchased_at ASC, pu.created_at ASC, pu.id ASC`,
          [documentIds]
        )
      : { rows: [] };
    const itemsByDocument = new Map<string, typeof itemsResult.rows>();
    for (const item of itemsResult.rows) {
      const items = itemsByDocument.get(item.purchase_document_id) ?? [];
      items.push(item);
      itemsByDocument.set(item.purchase_document_id, items);
    }

    return {
      rows: documentsResult.rows.map(({ total_count: _total, ...document }) => ({
        ...document,
        items: itemsByDocument.get(document.id) ?? []
      })),
      total: Number(documentsResult.rows[0]?.total_count ?? 0)
    };
  }

  create(input: CreatePurchaseInput) {
    return withTransaction(async (client) => {
      const document = await this.createDocument(client, [input], input.createdBy);
      return this.createOne(client, input, document.id);
    });
  }

  update(id: string, input: UpdatePurchaseInput) {
    return withTransaction(async (client) => {
      const existing = await this.getPurchaseForUpdate(client, id);
      const productIds = [...new Set([existing.product_id, input.productId])].sort();
      await this.lockProducts(client, productIds);
      if (input.supplierId) {
        await this.ensureSuppliers(client, [input.supplierId]);
      }

      const batch = await this.getPurchaseBatchForUpdate(client, id);
      const hasAllocations = await this.purchaseBatchHasAllocations(client, batch.id);
      if (existing.product_id !== input.productId && hasAllocations) {
        throw new AppError(
          409,
          "This purchase already has FIFO sales allocations and cannot be moved to another product",
          "PURCHASE_PRODUCT_CHANGE_BLOCKED"
        );
      }

      const quantityDelta = input.quantity - Number(existing.quantity);
      const newRemaining = Number(batch.remaining_quantity) + quantityDelta;
      if (newRemaining < -0.0001) {
        throw new AppError(
          409,
          "Cannot reduce purchase quantity below the already sold FIFO quantity",
          "PURCHASE_QUANTITY_BELOW_CONSUMED",
          {
            currentQuantity: Number(existing.quantity),
            availableToReduce: Number(batch.remaining_quantity),
            requestedQuantity: input.quantity
          }
        );
      }

      const totalCost = input.quantity * input.purchasePrice;
      const updatedResult = await client.query(
        `UPDATE purchases
         SET supplier_id = $2,
             product_id = $3,
             quantity = $4,
             purchase_price = $5,
             total_cost = $6,
             purchased_at = COALESCE($7::timestamptz, purchased_at),
             location = $8,
             note = $9,
             updated_by = $10,
             updated_at = NOW()
         WHERE id = $1 AND deleted_at IS NULL
         RETURNING *`,
        [
          id,
          input.supplierId ?? null,
          input.productId,
          input.quantity,
          input.purchasePrice,
          totalCost,
          input.purchasedAt ?? null,
          input.location?.trim() || null,
          input.note ?? null,
          input.editedBy
        ]
      );
      const updated = updatedResult.rows[0]!;

      await client.query(
        `UPDATE inventory_batches
         SET product_id = $2,
             initial_quantity = $3,
             remaining_quantity = $4,
             purchase_price = $5,
             received_at = $6
         WHERE id = $1`,
        [
          batch.id,
          input.productId,
          input.quantity,
          Math.max(0, newRemaining),
          input.purchasePrice,
          updated.purchased_at
        ]
      );

      if (Number(existing.purchase_price) !== input.purchasePrice) {
        await this.repriceBatchAllocations(client, batch.id);
      }

      if (existing.product_id !== input.productId) {
        await client.query(
          "UPDATE products SET stock_quantity = stock_quantity - $2 WHERE id = $1",
          [existing.product_id, existing.quantity]
        );
        await client.query(
          `UPDATE products
           SET stock_quantity = stock_quantity + $2,
               purchase_price = $3,
               location = COALESCE($4, location)
           WHERE id = $1`,
          [input.productId, input.quantity, input.purchasePrice, input.location?.trim() || null]
        );
      } else {
        await client.query(
          `UPDATE products
           SET stock_quantity = stock_quantity + $2,
               purchase_price = $3,
               location = COALESCE($4, location)
           WHERE id = $1`,
          [input.productId, quantityDelta, input.purchasePrice, input.location?.trim() || null]
        );
      }

      await this.writeAudit(client, id, "UPDATE", existing, updated, input.editedBy);
      await this.syncDocument(client, existing.purchase_document_id);
      return updated;
    });
  }

  remove(id: string, editedBy: string) {
    return withTransaction(async (client) => {
      const existing = await this.getPurchaseForUpdate(client, id);
      await this.lockProduct(client, existing.product_id);
      const batch = await this.getPurchaseBatchForUpdate(client, id);
      const hasAllocations = await this.purchaseBatchHasAllocations(client, batch.id);
      if (hasAllocations || Number(batch.remaining_quantity) < Number(batch.initial_quantity)) {
        throw new AppError(
          409,
          "This purchase has already affected sales and cannot be deleted safely",
          "PURCHASE_DELETE_BLOCKED"
        );
      }

      const deletedResult = await client.query(
        `UPDATE purchases
         SET deleted_by = $2,
             deleted_at = NOW(),
             updated_by = $2,
             updated_at = NOW()
         WHERE id = $1 AND deleted_at IS NULL
         RETURNING *`,
        [id, editedBy]
      );
      const deleted = deletedResult.rows[0]!;

      await client.query("DELETE FROM inventory_batches WHERE id = $1", [batch.id]);
      await client.query(
        "UPDATE products SET stock_quantity = stock_quantity - $2 WHERE id = $1",
        [existing.product_id, existing.quantity]
      );

      await this.writeAudit(client, id, "DELETE", existing, deleted, editedBy);
      await this.syncDocument(client, existing.purchase_document_id);
      return { deleted: true, id };
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

      const document = await this.createDocument(client, rows, createdBy);
      const created = [];
      let totalAmount = 0;
      for (const row of rows) {
        const purchase = await this.createOne(client, { ...row, createdBy }, document.id);
        created.push(purchase);
        totalAmount += Number(purchase.total_cost);
      }
      return {
        documentId: document.id,
        documentNumber: document.document_number,
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
    const document = await this.createDocument(client, rows, rows[0]!.createdBy);
    const created = [];
    let totalAmount = 0;
    for (const row of rows) {
      const purchase = await this.createOne(client, row, document.id);
      created.push(purchase);
      totalAmount += Number(purchase.total_cost);
    }
    return {
      documentId: document.id,
      documentNumber: document.document_number,
      rows: created,
      totalAmount
    };
  }

  private async createOne(
    client: PoolClient,
    input: CreatePurchaseInput,
    purchaseDocumentId: string
  ) {
    const totalCost = input.quantity * input.purchasePrice;

    const result = await client.query(
      `INSERT INTO purchases (
         purchase_document_id, supplier_id, product_id, quantity,
         purchase_price, total_cost, purchased_at, note, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz, NOW()),$8,$9)
       RETURNING *`,
      [
        purchaseDocumentId,
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
    if (input.location?.trim()) {
      await client.query("UPDATE purchases SET location = $2 WHERE id = $1", [
        purchase.id,
        input.location.trim()
      ]);
      purchase.location = input.location.trim();
    }

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

  private async createDocument(
    client: PoolClient,
    rows: CreatePurchaseInput[],
    createdBy: string
  ) {
    const supplierKeys = new Set(rows.map((row) => row.supplierId ?? "NONE"));
    const supplierId = supplierKeys.size === 1 && !supplierKeys.has("NONE")
      ? rows[0]!.supplierId
      : null;
    const purchasedAt = rows
      .map((row) => row.purchasedAt)
      .filter((value): value is string => Boolean(value))
      .sort()[0];
    const result = await client.query<{ id: string; document_number: string }>(
      `INSERT INTO purchase_documents (supplier_id, purchased_at, created_by)
       VALUES ($1,COALESCE($2::timestamptz,NOW()),$3)
       RETURNING id, document_number`,
      [supplierId ?? null, purchasedAt ?? null, createdBy]
    );
    return result.rows[0]!;
  }

  private async syncDocument(client: PoolClient, documentId: string) {
    await client.query(
      `WITH document_items AS (
         SELECT
           COUNT(*)::int AS line_count,
           MIN(purchased_at) AS purchased_at,
           COUNT(DISTINCT COALESCE(supplier_id::text, 'NONE'))::int AS supplier_count,
           MAX(supplier_id::text) FILTER (WHERE supplier_id IS NOT NULL) AS supplier_id
         FROM purchases
         WHERE purchase_document_id = $1 AND deleted_at IS NULL
       )
       UPDATE purchase_documents pd
       SET purchased_at = COALESCE(document_items.purchased_at, pd.purchased_at),
           supplier_id = CASE
             WHEN document_items.supplier_count = 1
               THEN document_items.supplier_id::uuid
             ELSE NULL
           END,
           updated_at = NOW()
       FROM document_items
       WHERE pd.id = $1`,
      [documentId]
    );
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

  private async getPurchaseForUpdate(client: PoolClient, id: string) {
    const result = await client.query<PurchaseRow>(
      "SELECT * FROM purchases WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
      [id]
    );
    const purchase = result.rows[0];
    if (!purchase) throw new AppError(404, "Purchase not found", "PURCHASE_NOT_FOUND");
    return purchase;
  }

  private async getPurchaseBatchForUpdate(client: PoolClient, purchaseId: string) {
    const result = await client.query<{
      id: string;
      initial_quantity: number;
      remaining_quantity: number;
    }>(
      `SELECT id, initial_quantity, remaining_quantity
       FROM inventory_batches
       WHERE purchase_id = $1
       ORDER BY created_at ASC, id ASC
       FOR UPDATE`,
      [purchaseId]
    );
    if (result.rows.length !== 1) {
      throw new AppError(
        409,
        "Purchase FIFO batch is missing or duplicated",
        "PURCHASE_BATCH_INVALID"
      );
    }
    return result.rows[0]!;
  }

  private async purchaseBatchHasAllocations(client: PoolClient, batchId: string) {
    const result = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM sale_item_batch_allocations WHERE batch_id = $1
         UNION ALL
         SELECT 1
         FROM supplier_return_batch_allocations a
         JOIN supplier_returns sr ON sr.id = a.supplier_return_id
         WHERE a.batch_id = $1 AND sr.deleted_at IS NULL
       ) AS exists`,
      [batchId]
    );
    return Boolean(result.rows[0]?.exists);
  }

  private async repriceBatchAllocations(client: PoolClient, batchId: string) {
    await client.query(
      `UPDATE sale_item_batch_allocations a
       SET unit_cost = b.purchase_price,
           cost_amount = ROUND((a.quantity * b.purchase_price)::numeric, 2)
       FROM inventory_batches b
       WHERE a.batch_id = b.id AND b.id = $1`,
      [batchId]
    );
    await client.query(
      `UPDATE supplier_return_batch_allocations a
       SET unit_cost = b.purchase_price,
           cost_amount = ROUND((a.quantity * b.purchase_price)::numeric, 2)
       FROM inventory_batches b, supplier_returns sr
       WHERE a.batch_id = b.id
         AND a.supplier_return_id = sr.id
         AND sr.deleted_at IS NULL
         AND b.id = $1`,
      [batchId]
    );
    await client.query(
      `WITH affected_returns AS (
         SELECT DISTINCT supplier_return_id
         FROM supplier_return_batch_allocations a
         JOIN supplier_returns sr ON sr.id = a.supplier_return_id
         WHERE a.batch_id = $1 AND sr.deleted_at IS NULL
       ), return_costs AS (
         SELECT a.supplier_return_id,
                ROUND(SUM(a.cost_amount)::numeric, 2) AS fifo_cost
         FROM supplier_return_batch_allocations a
         JOIN affected_returns ar ON ar.supplier_return_id = a.supplier_return_id
         GROUP BY a.supplier_return_id
       )
       UPDATE supplier_returns sr
       SET fifo_cost = rc.fifo_cost,
           total_agreed_return_amount =
             ROUND((sr.agreed_return_price_per_unit * sr.quantity)::numeric, 2),
           supplier_return_profit =
             ROUND((sr.agreed_return_price_per_unit * sr.quantity)::numeric, 2) - rc.fifo_cost
       FROM return_costs rc
       WHERE sr.id = rc.supplier_return_id`,
      [batchId]
    );

    const affectedSales = await client.query<{ sale_id: string }>(
      `WITH affected_items AS (
         SELECT DISTINCT sale_item_id
         FROM sale_item_batch_allocations
         WHERE batch_id = $1
       ), item_costs AS (
         SELECT
           a.sale_item_id,
           ROUND(SUM(a.quantity * a.unit_cost)::numeric, 2) AS fifo_cost,
           ROUND(SUM(a.returned_quantity * a.unit_cost)::numeric, 2) AS returned_fifo_cost
         FROM sale_item_batch_allocations a
         JOIN affected_items ai ON ai.sale_item_id = a.sale_item_id
         GROUP BY a.sale_item_id
       )
       UPDATE sale_items si
       SET fifo_cost = ic.fifo_cost,
           returned_fifo_cost = ic.returned_fifo_cost,
           purchase_price = CASE WHEN si.quantity > 0 THEN ROUND((ic.fifo_cost / si.quantity)::numeric, 2) ELSE 0 END,
           profit = si.total_amount - ic.fifo_cost
       FROM item_costs ic
       WHERE si.id = ic.sale_item_id
       RETURNING si.sale_id`,
      [batchId]
    );

    const saleIds = [...new Set(affectedSales.rows.map((row) => row.sale_id))];
    if (!saleIds.length) return;

    await client.query(
      `WITH sale_costs AS (
         SELECT
           sale_id,
           COALESCE(SUM(fifo_cost), 0) AS fifo_cost,
           COALESCE(SUM(returned_fifo_cost), 0) AS returned_fifo_cost
         FROM sale_items
         WHERE sale_id = ANY($1::uuid[])
         GROUP BY sale_id
       )
       UPDATE sales s
       SET fifo_cost = sc.fifo_cost,
           returned_fifo_cost = sc.returned_fifo_cost,
           profit = s.total_amount - sc.fifo_cost,
           returned_profit = s.returned_amount - sc.returned_fifo_cost
       FROM sale_costs sc
       WHERE s.id = sc.sale_id`,
      [saleIds]
    );
  }

  private async writeAudit(
    client: PoolClient,
    purchaseId: string,
    action: "UPDATE" | "DELETE",
    beforeData: unknown,
    afterData: unknown,
    editedBy: string
  ) {
    await client.query(
      `INSERT INTO purchase_audit_logs (
         purchase_id, action, before_data, after_data, edited_by
       ) VALUES ($1,$2,$3::jsonb,$4::jsonb,$5)`,
      [
        purchaseId,
        action,
        JSON.stringify(beforeData),
        afterData ? JSON.stringify(afterData) : null,
        editedBy
      ]
    );
  }
}

export const purchaseRepository = new PurchaseRepository();
