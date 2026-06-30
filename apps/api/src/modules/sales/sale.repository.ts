import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { query, withTransaction } from "../../config/database.js";
import { AppError } from "../../shared/errors/AppError.js";
import {
  consumeFifo,
  releaseActiveAllocations,
  returnFifoToBatches
} from "../inventory/fifo.repository.js";
import {
  availableForSaleEdit,
  hasEnoughStockForSaleEdit
} from "./sale-stock-validation.js";

type SaleItemInput = {
  saleItemId?: string;
  productId: string;
  quantity: number;
  unit: string;
  unitMultiplier: number;
  salePrice: number;
  discount: number;
};

type CreateSaleInput = {
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  items: SaleItemInput[];
  discount: number;
  paymentType: "CASH" | "CARD" | "DEBT";
  soldAt?: string;
  dueDate?: string | null;
  note?: string | null;
  createdBy: string;
};

type UpdateSaleInput = CreateSaleInput & { updatedBy: string };

type LockedProduct = {
  id: string;
  code: string;
  name: string;
  unit: string;
  purchase_price: number;
  stock_quantity: number;
};

export type SaleDetails = {
  id: string;
  invoice_number: string;
  customer_name: string | null;
  payment_type: "CASH" | "CARD" | "DEBT";
  subtotal: number;
  discount: number;
  total_amount: number;
  sold_at: string;
  returned_amount: number;
  returned_profit: number;
  archived_at: string | null;
  items: Array<{
    product_code: string;
    product_name: string;
    base_unit: string;
    unit: string;
    quantity: number;
    sale_quantity: number;
    returned_quantity: number;
    returned_sale_quantity: number;
    unit_multiplier: number;
    sale_price: number;
    total_amount: number;
  }>;
  [key: string]: unknown;
};

export class SaleRepository {
  async list(input: {
    page: number;
    limit: number;
    search?: string;
    productId?: string;
    categoryId?: string;
    paymentType?: "CASH" | "CARD" | "DEBT";
    from?: string;
    to?: string;
    archived: boolean;
    sortBy: string;
    sortOrder: "asc" | "desc";
  }) {
    const conditions: string[] = [
      input.archived ? "s.archived_at IS NOT NULL" : "s.archived_at IS NULL"
    ];
    const values: unknown[] = [];

    if (input.search) {
      values.push(`%${input.search}%`);
      conditions.push(
        `(s.invoice_number ILIKE $${values.length} OR s.customer_name ILIKE $${values.length}
          OR EXISTS (
            SELECT 1 FROM sale_items si2 JOIN products p2 ON p2.id = si2.product_id
            WHERE si2.sale_id = s.id
              AND (p2.name ILIKE $${values.length} OR p2.code ILIKE $${values.length})
          ))`
      );
    }
    if (input.productId) {
      values.push(input.productId);
      conditions.push(`EXISTS (
        SELECT 1 FROM sale_items si WHERE si.sale_id = s.id AND si.product_id = $${values.length}
      )`);
    }
    if (input.categoryId) {
      values.push(input.categoryId);
      conditions.push(`EXISTS (
        SELECT 1 FROM sale_items si JOIN products p ON p.id = si.product_id
        WHERE si.sale_id = s.id AND p.category_id = $${values.length}
      )`);
    }
    if (input.paymentType) {
      values.push(input.paymentType);
      conditions.push(`s.payment_type = $${values.length}`);
    }
    if (input.from) {
      values.push(input.from);
      conditions.push(`s.sold_at >= $${values.length}`);
    }
    if (input.to) {
      values.push(input.to);
      conditions.push(`s.sold_at <= $${values.length}`);
    }

    const sortColumns: Record<string, string> = {
      sold_at: "s.sold_at",
      total_amount: "s.total_amount",
      profit: "s.profit"
    };
    const orderBy = sortColumns[input.sortBy] ?? "s.sold_at";
    const direction = input.sortOrder === "asc" ? "ASC" : "DESC";
    values.push(input.limit, (input.page - 1) * input.limit);

    const result = await query(
       `SELECT s.*, u.name AS seller_name,
              debt.id AS debt_id,
              debt.paid_amount AS debt_paid_amount,
              debt.remaining_amount AS debt_remaining_amount,
              debt.due_date AS due_date,
              CASE
                WHEN debt.id IS NULL THEN NULL
                WHEN debt.remaining_amount = 0 THEN 'PAID'
                WHEN debt.remaining_amount > 0 AND debt.due_date IS NOT NULL AND debt.due_date < CURRENT_DATE THEN 'OVERDUE'
                WHEN debt.paid_amount > 0 AND debt.remaining_amount > 0 THEN 'PARTIALLY_PAID'
                ELSE 'UNPAID'
              END AS debt_status,
              (s.total_amount - s.returned_amount) AS net_total_amount,
              (s.profit - s.returned_profit) AS net_profit,
              CASE WHEN s.archived_at IS NOT NULL
                THEN s.archived_at + INTERVAL '30 days'
                ELSE NULL
              END AS archive_expires_at,
              COUNT(*) OVER()::int AS total_count
       FROM sales s
       JOIN users u ON u.id = s.created_by
       LEFT JOIN LATERAL (
         SELECT d.id, d.paid_amount, d.remaining_amount, d.due_date
         FROM debts d
         WHERE d.sale_id = s.id
         ORDER BY d.created_at DESC
         LIMIT 1
       ) debt ON TRUE
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

  async findById(id: string) {
    const saleResult = await query(
      `SELECT s.*, u.name AS seller_name,
              (SELECT d.due_date FROM debts d WHERE d.sale_id = s.id) AS due_date,
              (s.total_amount - s.returned_amount) AS net_total_amount,
              (s.profit - s.returned_profit) AS net_profit,
              CASE WHEN s.archived_at IS NOT NULL
                THEN s.archived_at + INTERVAL '30 days'
                ELSE NULL
              END AS archive_expires_at
       FROM sales s JOIN users u ON u.id = s.created_by
       WHERE s.id = $1`,
      [id]
    );
    const sale = saleResult.rows[0];
    if (!sale) return null;

    const itemsResult = await query(
      `SELECT si.*, p.name AS product_name, p.code AS product_code, p.unit AS base_unit,
              (si.quantity - si.returned_quantity) AS remaining_quantity,
              (si.sale_quantity - si.returned_sale_quantity) AS remaining_sale_quantity
       FROM sale_items si JOIN products p ON p.id = si.product_id
       WHERE si.sale_id = $1 ORDER BY p.name`,
      [id]
    );
    const returnsResult = await query(
      `SELECT sr.*, p.name AS product_name, p.code AS product_code,
              u.name AS created_by_name
       FROM sale_returns sr
       JOIN products p ON p.id = sr.product_id
       JOIN users u ON u.id = sr.created_by
       WHERE sr.sale_id = $1
       ORDER BY sr.returned_at DESC`,
      [id]
    );
    return {
      ...sale,
      items: itemsResult.rows,
      returns: returnsResult.rows
    } as unknown as SaleDetails;
  }

  create(input: CreateSaleInput) {
    return withTransaction(async (client) => {
      const duplicateProduct = new Set(input.items.map((item) => item.productId)).size !== input.items.length;
      if (duplicateProduct) {
        throw new AppError(422, "Each product can appear only once per sale", "DUPLICATE_SALE_ITEM");
      }

      const products = await this.lockProducts(client, input.items.map((item) => item.productId));
      const productMap = new Map(products.map((product) => [product.id, product]));
      const unitMap = await this.saleUnitMap(client, input.items);

      let subtotal = 0;
      for (const item of input.items) {
        const product = productMap.get(item.productId);
        if (!product) throw new AppError(404, "Product not found", "PRODUCT_NOT_FOUND");
        const unit = unitMap.get(item.unit.toLowerCase())!;
        const unitMultiplier = unit.toLowerCase() === product.unit.toLowerCase()
          ? 1
          : item.unitMultiplier;
        const stockQuantity = item.quantity * unitMultiplier;
        if (product.stock_quantity < stockQuantity) {
          throw new AppError(
            409,
            `Insufficient stock for ${product.name}. Available: ${product.stock_quantity}`,
            "INSUFFICIENT_STOCK",
            { productId: product.id, available: product.stock_quantity, requested: stockQuantity }
          );
        }
        subtotal += item.salePrice * item.quantity - item.discount;
      }

      const totalAmount = subtotal - input.discount;
      const customer = await this.resolveCustomer(client, input);
      const invoiceNumber = this.invoiceNumber();

      const saleResult = await client.query(
        `INSERT INTO sales (
           invoice_number, customer_id, customer_name, customer_phone,
           subtotal, discount, total_amount, payment_type, profit, fifo_cost,
           sold_at, note, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,0,COALESCE($9::timestamptz,NOW()),$10,$11)
         RETURNING *`,
        [
          invoiceNumber,
          customer.id,
          customer.name,
          customer.phone,
          subtotal,
          input.discount,
          totalAmount,
          input.paymentType,
          input.soldAt ?? null,
          input.note ?? null,
          input.createdBy
        ]
      );
      const sale = saleResult.rows[0]!;
      let fifoCost = 0;

      for (const item of input.items) {
        const product = productMap.get(item.productId)!;
        const unit = unitMap.get(item.unit.toLowerCase())!;
        const unitMultiplier = unit.toLowerCase() === product.unit.toLowerCase()
          ? 1
          : item.unitMultiplier;
        const stockQuantity = item.quantity * unitMultiplier;
        const itemTotal = item.salePrice * item.quantity - item.discount;

        const itemResult = await client.query<{ id: string }>(
          `INSERT INTO sale_items (
             sale_id, product_id, quantity, sale_quantity, unit, unit_multiplier,
             sale_price, purchase_price, discount, total_amount, profit, fifo_cost
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,0,$8,$9,0,0)
           RETURNING id`,
          [
            sale.id,
            item.productId,
            stockQuantity,
            item.quantity,
            unit,
            unitMultiplier,
            item.salePrice,
            item.discount,
            itemTotal
          ]
        );
        const allocation = await consumeFifo(
          client,
          item.productId,
          stockQuantity,
          itemResult.rows[0]!.id
        );
        const saleDiscountShare =
          subtotal > 0 ? input.discount * (itemTotal / subtotal) : 0;
        const itemProfit = itemTotal - saleDiscountShare - allocation.fifoCost;
        await client.query(
          `UPDATE sale_items
           SET purchase_price = $2, fifo_cost = $3, profit = $4
           WHERE id = $1`,
          [
            itemResult.rows[0]!.id,
            allocation.weightedUnitCost,
            allocation.fifoCost,
            itemProfit
          ]
        );
        fifoCost += allocation.fifoCost;
        await client.query(
          "UPDATE products SET stock_quantity = stock_quantity - $2 WHERE id = $1",
          [item.productId, stockQuantity]
        );
      }
      await client.query(
        "UPDATE sales SET fifo_cost = $2, profit = total_amount - $2 WHERE id = $1",
        [sale.id, fifoCost]
      );

      if (input.paymentType === "DEBT") {
        if (!customer.name) {
          throw new AppError(422, "Customer name is required for debt sales", "CUSTOMER_REQUIRED");
        }
        await client.query(
          `INSERT INTO debts (
             sale_id, customer_id, customer_name, phone, amount,
             paid_amount, remaining_amount, status, due_date, note
           ) VALUES ($1,$2,$3,$4,$5,0,$5,'UNPAID',$6,$7)`,
          [
            sale.id,
            customer.id,
            customer.name,
            customer.phone,
            totalAmount,
            input.dueDate ?? null,
            input.note ?? null
          ]
        );
      }

      return this.findByIdWithClient(client, sale.id);
    });
  }

  update(saleId: string, input: UpdateSaleInput) {
    return withTransaction(async (client) => {
      const saleResult = await client.query<{
        id: string;
        payment_type: "CASH" | "CARD" | "DEBT";
        archived_at: string | null;
      }>("SELECT id, payment_type, archived_at FROM sales WHERE id = $1 FOR UPDATE", [saleId]);
      const sale = saleResult.rows[0];
      if (!sale) throw new AppError(404, "Sale not found", "SALE_NOT_FOUND");
      if (sale.archived_at) {
        throw new AppError(409, "Archived sale cannot be edited", "SALE_ARCHIVED");
      }

      const oldItemsResult = await client.query<{
        id: string;
        product_id: string;
        quantity: number;
        returned_quantity: number;
      }>(
        `SELECT id, product_id, quantity, returned_quantity
         FROM sale_items WHERE sale_id = $1 FOR UPDATE`,
        [saleId]
      );
      if (oldItemsResult.rows.some((item) => item.returned_quantity > 0)) {
        throw new AppError(
          409,
          "A sale with returned products cannot be edited",
          "SALE_HAS_RETURNS"
        );
      }

      const duplicateProduct =
        new Set(input.items.map((item) => item.productId)).size !== input.items.length;
      if (duplicateProduct) {
        throw new AppError(422, "Each product can appear only once per sale", "DUPLICATE_SALE_ITEM");
      }

      const productIds = [
        ...new Set([
          ...oldItemsResult.rows.map((item) => item.product_id),
          ...input.items.map((item) => item.productId)
        ])
      ].sort();
      const productResult = await client.query<LockedProduct>(
        `SELECT id, code, name, unit, purchase_price, stock_quantity
         FROM products
         WHERE id = ANY($1::uuid[]) AND is_active = TRUE
         ORDER BY id FOR UPDATE`,
        [productIds]
      );
      const productMap = new Map(
        productResult.rows.map((product) => [
          product.id,
          {
            ...product,
            purchase_price: Number(product.purchase_price),
            stock_quantity: Number(product.stock_quantity)
          }
        ])
      );
      const unitMap = await this.saleUnitMap(client, input.items);
      const oldItemMap = new Map(
        oldItemsResult.rows.map((oldItem) => [oldItem.id, oldItem])
      );

      for (const item of input.items) {
        const product = productMap.get(item.productId);
        if (!product) throw new AppError(404, "Product not found", "PRODUCT_NOT_FOUND");
        const unit = unitMap.get(item.unit.toLowerCase())!;
        const unitMultiplier = unit.toLowerCase() === product.unit.toLowerCase()
          ? 1
          : item.unitMultiplier;
        const requestedBaseQuantity = item.quantity * unitMultiplier;
        const originalItem = item.saleItemId
          ? oldItemMap.get(item.saleItemId)
          : undefined;
        if (item.saleItemId && !originalItem) {
          throw new AppError(
            422,
            "Sale item does not belong to this invoice",
            "SALE_ITEM_MISMATCH"
          );
        }
        const originalCredit =
          originalItem?.product_id === item.productId
            ? Number(originalItem.quantity)
            : 0;
        if (!hasEnoughStockForSaleEdit(
          product.stock_quantity,
          originalCredit,
          requestedBaseQuantity
        )) {
          const available = availableForSaleEdit(
            product.stock_quantity,
            originalCredit
          );
          throw new AppError(
            409,
            `Insufficient stock for ${product.name}. Available for edit: ${available}`,
            "INSUFFICIENT_STOCK",
            {
              productId: product.id,
              available,
              currentStock: product.stock_quantity,
              originalQuantity: originalCredit,
              requested: requestedBaseQuantity
            }
          );
        }
      }

      for (const oldItem of oldItemsResult.rows) {
        await releaseActiveAllocations(client, oldItem.id, false);
        await client.query(
          "UPDATE products SET stock_quantity = stock_quantity + $2 WHERE id = $1",
          [oldItem.product_id, Number(oldItem.quantity)]
        );
        const product = productMap.get(oldItem.product_id);
        if (product) product.stock_quantity += Number(oldItem.quantity);
      }

      let subtotal = 0;
      for (const item of input.items) {
        const product = productMap.get(item.productId);
        if (!product) throw new AppError(404, "Product not found", "PRODUCT_NOT_FOUND");
        const unit = unitMap.get(item.unit.toLowerCase())!;
        const unitMultiplier = unit.toLowerCase() === product.unit.toLowerCase()
          ? 1
          : item.unitMultiplier;
        const stockQuantity = item.quantity * unitMultiplier;
        if (Number(product.stock_quantity) + 0.0001 < stockQuantity) {
          throw new AppError(
            409,
            `Insufficient stock for ${product.name}. Available: ${product.stock_quantity}`,
            "INSUFFICIENT_STOCK",
            { productId: product.id, available: product.stock_quantity, requested: stockQuantity }
          );
        }
        subtotal += item.salePrice * item.quantity - item.discount;
      }
      const totalAmount = subtotal - input.discount;
      const customer = await this.resolveCustomer(client, input);

      const debtResult = await client.query<{
        id: string;
        paid_amount: number;
        archived_at: string | null;
      }>("SELECT id, paid_amount, archived_at FROM debts WHERE sale_id = $1 FOR UPDATE", [saleId]);
      const debt = debtResult.rows[0];
      if (debt?.archived_at) {
        throw new AppError(409, "Archived debt must be restored first", "DEBT_ARCHIVED");
      }
      if (debt && debt.paid_amount > totalAmount) {
        throw new AppError(
          422,
          "Sale total cannot be less than already paid debt amount",
          "SALE_TOTAL_BELOW_PAID_DEBT",
          { paidAmount: debt.paid_amount }
        );
      }
      if (debt && input.paymentType !== "DEBT" && debt.paid_amount > 0) {
        throw new AppError(
          409,
          "Debt sale with payments cannot be changed to another payment type",
          "DEBT_HAS_PAYMENTS"
        );
      }

      await client.query("DELETE FROM sale_items WHERE sale_id = $1", [saleId]);
      await client.query(
        `UPDATE sales SET
           customer_id = $2, customer_name = $3, customer_phone = $4,
           subtotal = $5, discount = $6, total_amount = $7,
           payment_type = $8, profit = 0, fifo_cost = 0,
           sold_at = COALESCE($9::timestamptz, sold_at),
           note = $10, returned_amount = 0, returned_profit = 0,
           returned_fifo_cost = 0
         WHERE id = $1`,
        [
          saleId,
          customer.id,
          customer.name,
          customer.phone,
          subtotal,
          input.discount,
          totalAmount,
          input.paymentType,
          input.soldAt ?? null,
          input.note ?? null
        ]
      );

      let fifoCost = 0;
      for (const item of input.items) {
        const product = productMap.get(item.productId)!;
        const unit = unitMap.get(item.unit.toLowerCase())!;
        const unitMultiplier = unit.toLowerCase() === product.unit.toLowerCase()
          ? 1
          : item.unitMultiplier;
        const stockQuantity = item.quantity * unitMultiplier;
        const itemTotal = item.salePrice * item.quantity - item.discount;
        const itemResult = await client.query<{ id: string }>(
          `INSERT INTO sale_items (
             sale_id, product_id, quantity, sale_quantity, unit, unit_multiplier,
             sale_price, purchase_price, discount, total_amount, profit, fifo_cost
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,0,$8,$9,0,0)
           RETURNING id`,
          [
            saleId,
            item.productId,
            stockQuantity,
            item.quantity,
            unit,
            unitMultiplier,
            item.salePrice,
            item.discount,
            itemTotal
          ]
        );
        const allocation = await consumeFifo(
          client,
          item.productId,
          stockQuantity,
          itemResult.rows[0]!.id
        );
        const saleDiscountShare =
          subtotal > 0 ? input.discount * (itemTotal / subtotal) : 0;
        await client.query(
          `UPDATE sale_items
           SET purchase_price = $2, fifo_cost = $3, profit = total_amount - $3 - $4
           WHERE id = $1`,
          [
            itemResult.rows[0]!.id,
            allocation.weightedUnitCost,
            allocation.fifoCost,
            saleDiscountShare
          ]
        );
        fifoCost += allocation.fifoCost;
        await client.query(
          "UPDATE products SET stock_quantity = stock_quantity - $2 WHERE id = $1",
          [item.productId, stockQuantity]
        );
        product.stock_quantity -= stockQuantity;
      }
      await client.query(
        "UPDATE sales SET fifo_cost = $2, profit = total_amount - $2 WHERE id = $1",
        [saleId, fifoCost]
      );

      if (input.paymentType === "DEBT") {
        if (!customer.name) {
          throw new AppError(422, "Customer name is required for debt sales", "CUSTOMER_REQUIRED");
        }
        if (debt) {
          await client.query(
            `UPDATE debts SET
               customer_id = $2, customer_name = $3, phone = $4,
               amount = $5, remaining_amount = $5 - paid_amount,
               status = CASE
                 WHEN $5 - paid_amount = 0 THEN 'PAID'::debt_status
                 WHEN paid_amount > 0 THEN 'PARTIALLY_PAID'::debt_status
                 ELSE 'UNPAID'::debt_status
               END,
               due_date = $6, note = $7
             WHERE id = $1`,
            [
              debt.id,
              customer.id,
              customer.name,
              customer.phone,
              totalAmount,
              input.dueDate ?? null,
              input.note ?? null
            ]
          );
        } else {
          await client.query(
            `INSERT INTO debts (
               sale_id, customer_id, customer_name, phone, amount,
               paid_amount, remaining_amount, status, due_date, note
             ) VALUES ($1,$2,$3,$4,$5,0,$5,'UNPAID',$6,$7)`,
            [
              saleId,
              customer.id,
              customer.name,
              customer.phone,
              totalAmount,
              input.dueDate ?? null,
              input.note ?? null
            ]
          );
        }
      } else if (debt) {
        await client.query("DELETE FROM debts WHERE id = $1", [debt.id]);
      }

      return this.findByIdWithClient(client, saleId);
    });
  }

  returnItems(input: {
    saleId: string;
    items: Array<{ saleItemId: string; quantity: number }>;
    reason: string;
    createdBy: string;
  }) {
    return withTransaction(async (client) => {
      const saleResult = await client.query<{
        id: string;
        returned_amount: number;
        total_amount: number;
        subtotal: number;
        discount: number;
        archived_at: string | null;
      }>(
        `SELECT id, returned_amount, total_amount, subtotal, discount, archived_at
         FROM sales WHERE id = $1 FOR UPDATE`,
        [input.saleId]
      );
      const sale = saleResult.rows[0];
      if (!sale) throw new AppError(404, "Sale not found", "SALE_NOT_FOUND");
      if (sale.archived_at) {
        throw new AppError(409, "Archived sale cannot accept returns", "SALE_ARCHIVED");
      }

      const ids = input.items.map((item) => item.saleItemId);
      if (new Set(ids).size !== ids.length) {
        throw new AppError(422, "Return item is duplicated", "DUPLICATE_RETURN_ITEM");
      }
      const itemResult = await client.query<{
        id: string;
        product_id: string;
        quantity: number;
        returned_quantity: number;
        sale_quantity: number;
        returned_sale_quantity: number;
        unit: string;
        unit_multiplier: number;
        total_amount: number;
        fifo_cost: number;
      }>(
        `SELECT id, product_id, quantity, returned_quantity,
                sale_quantity, returned_sale_quantity, unit, unit_multiplier,
                total_amount, fifo_cost
         FROM sale_items
         WHERE sale_id = $1 AND id = ANY($2::uuid[])
         ORDER BY id FOR UPDATE`,
        [input.saleId, ids]
      );
      if (itemResult.rows.length !== input.items.length) {
        throw new AppError(404, "Sale item not found", "SALE_ITEM_NOT_FOUND");
      }

      const itemMap = new Map(itemResult.rows.map((item) => [item.id, item]));
      const productIds = [...new Set(itemResult.rows.map((item) => item.product_id))].sort();
      await client.query(
        "SELECT id FROM products WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE",
        [productIds]
      );

      let returnedAmount = 0;
      let returnedProfit = 0;
      for (const requestItem of input.items) {
        const item = itemMap.get(requestItem.saleItemId)!;
        const available = item.sale_quantity - item.returned_sale_quantity;
        if (requestItem.quantity > available) {
          throw new AppError(
            422,
            "Return quantity exceeds sold quantity",
            "RETURN_QUANTITY_EXCEEDED",
            { saleItemId: item.id, available }
          );
        }
        const stockQuantity = requestItem.quantity * item.unit_multiplier;
        const saleDiscountShare =
          sale.subtotal > 0 ? sale.discount * (item.total_amount / sale.subtotal) : 0;
        const netItemAmount = item.total_amount - saleDiscountShare;
        const amount = (netItemAmount / item.sale_quantity) * requestItem.quantity;
        const fifoCostReversal = await returnFifoToBatches(
          client,
          item.id,
          stockQuantity
        );
        const profitReversal = amount - fifoCostReversal;
        returnedAmount += amount;
        returnedProfit += profitReversal;

        await client.query(
          `UPDATE sale_items SET
             returned_quantity = returned_quantity + $2,
             returned_sale_quantity = returned_sale_quantity + $3,
             returned_amount = returned_amount + $4,
             returned_profit = returned_profit + $5,
             returned_fifo_cost = returned_fifo_cost + $6
           WHERE id = $1`,
          [
            item.id,
            stockQuantity,
            requestItem.quantity,
            amount,
            profitReversal,
            fifoCostReversal
          ]
        );
        await client.query(
          "UPDATE products SET stock_quantity = stock_quantity + $2 WHERE id = $1",
          [item.product_id, stockQuantity]
        );
        await client.query(
          `INSERT INTO sale_returns (
             sale_id, sale_item_id, product_id, quantity, sale_quantity,
             unit, unit_multiplier, amount, profit_reversal, fifo_cost_reversal,
             reason, created_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            input.saleId,
            item.id,
            item.product_id,
            stockQuantity,
            requestItem.quantity,
            item.unit,
            item.unit_multiplier,
            amount,
            profitReversal,
            fifoCostReversal,
            input.reason,
            input.createdBy
          ]
        );
      }

      const debtResult = await client.query<{
        id: string;
        amount: number;
        paid_amount: number;
        archived_at: string | null;
      }>("SELECT id, amount, paid_amount, archived_at FROM debts WHERE sale_id = $1 FOR UPDATE", [
        input.saleId
      ]);
      const debt = debtResult.rows[0];
      if (debt && !debt.archived_at) {
        const newAmount = debt.amount - returnedAmount;
        if (newAmount < debt.paid_amount) {
          throw new AppError(
            422,
            "Return would make debt smaller than already paid amount",
            "RETURN_BELOW_PAID_DEBT",
            { paidAmount: debt.paid_amount, newAmount }
          );
        }
        if (newAmount <= 0) {
          await client.query("DELETE FROM debts WHERE id = $1", [debt.id]);
        } else {
          await client.query(
            `UPDATE debts SET
               amount = $2,
               remaining_amount = $2 - paid_amount,
               status = CASE
                 WHEN $2 - paid_amount = 0 THEN 'PAID'::debt_status
                 WHEN paid_amount > 0 THEN 'PARTIALLY_PAID'::debt_status
                 ELSE 'UNPAID'::debt_status
               END
             WHERE id = $1`,
            [debt.id, newAmount]
          );
        }
      }

      await client.query(
        `UPDATE sales SET
           returned_amount = returned_amount + $2,
           returned_profit = returned_profit + $3,
           returned_fifo_cost = returned_fifo_cost + $4
         WHERE id = $1`,
        [
          input.saleId,
          returnedAmount,
          returnedProfit,
          returnedAmount - returnedProfit
        ]
      );
      return this.findByIdWithClient(client, input.saleId);
    });
  }

  archive(saleId: string, reason: string, userId: string) {
    return withTransaction(async (client) => {
      await this.archiveWithClient(client, saleId, reason, userId);
      return this.findByIdWithClient(client, saleId);
    });
  }

  restore(saleId: string) {
    return withTransaction(async (client) => {
      const saleResult = await client.query<{ archived_at: string | null }>(
        "SELECT archived_at FROM sales WHERE id = $1 FOR UPDATE",
        [saleId]
      );
      const sale = saleResult.rows[0];
      if (!sale) throw new AppError(404, "Sale not found", "SALE_NOT_FOUND");
      if (!sale.archived_at) throw new AppError(409, "Sale is not archived", "SALE_NOT_ARCHIVED");

      const itemsResult = await client.query<{
        id: string;
        product_id: string;
        quantity: number;
        returned_quantity: number;
        returned_fifo_cost: number;
        total_amount: number;
        name: string;
      }>(
        `SELECT si.id, si.product_id, si.quantity, si.returned_quantity,
                si.returned_fifo_cost, si.total_amount, p.name
         FROM sale_items si JOIN products p ON p.id = si.product_id
         WHERE si.sale_id = $1`,
        [saleId]
      );
      const productIds = [...new Set(itemsResult.rows.map((item) => item.product_id))].sort();
      const stocksResult = await client.query<{ id: string; stock_quantity: number }>(
        `SELECT id, stock_quantity FROM products
         WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
        [productIds]
      );
      const stocks = new Map(stocksResult.rows.map((row) => [row.id, row.stock_quantity]));
      for (const item of itemsResult.rows) {
        const quantity = item.quantity - item.returned_quantity;
        if ((stocks.get(item.product_id) ?? 0) < quantity) {
          throw new AppError(
            409,
            `Insufficient stock to restore sale for ${item.name}`,
            "INSUFFICIENT_STOCK_TO_RESTORE"
          );
        }
      }
      for (const item of itemsResult.rows) {
        const allocations = await client.query<{
          id: string;
          returned_quantity: number;
          unit_cost: number;
        }>(
          `SELECT id, returned_quantity, unit_cost
           FROM sale_item_batch_allocations
           WHERE sale_item_id = $1
           ORDER BY id
           FOR UPDATE`,
          [item.id]
        );
        for (const allocation of allocations.rows) {
          if (allocation.returned_quantity > 0) {
            await client.query(
              `UPDATE sale_item_batch_allocations SET
                 quantity = returned_quantity,
                 cost_amount = returned_quantity * unit_cost,
                 archived_released_quantity = 0
               WHERE id = $1`,
              [allocation.id]
            );
          } else {
            await client.query(
              "DELETE FROM sale_item_batch_allocations WHERE id = $1",
              [allocation.id]
            );
          }
        }
      }

      let saleFifoCost = 0;
      for (const item of itemsResult.rows) {
        const quantity = item.quantity - item.returned_quantity;
        let activeFifoCost = 0;
        if (quantity > 0) {
          const allocation = await consumeFifo(
            client,
            item.product_id,
            quantity,
            item.id
          );
          activeFifoCost = allocation.fifoCost;
          await client.query(
            "UPDATE products SET stock_quantity = stock_quantity - $2 WHERE id = $1",
            [item.product_id, quantity]
          );
        }
        const itemFifoCost = item.returned_fifo_cost + activeFifoCost;
        saleFifoCost += itemFifoCost;
        await client.query(
          `UPDATE sale_items SET
             fifo_cost = $2,
             purchase_price = CASE WHEN quantity > 0 THEN $2 / quantity ELSE 0 END,
             profit = total_amount - $2
           WHERE id = $1`,
          [item.id, itemFifoCost]
        );
      }
      await client.query(
        `UPDATE sales SET
           archived_at = NULL, archived_by = NULL, archive_reason = NULL,
           fifo_cost = $2, profit = total_amount - $2
         WHERE id = $1`,
        [saleId, saleFifoCost]
      );
      await client.query(
        `UPDATE debts SET archived_at = NULL, archived_by = NULL, archive_reason = NULL
         WHERE sale_id = $1 AND archive_reason LIKE 'SALE_ARCHIVE:%'`,
        [saleId]
      );
      return this.findByIdWithClient(client, saleId);
    });
  }

  purge(saleId: string) {
    return withTransaction(async (client) => {
      await this.purgeWithClient(client, saleId);
    });
  }

  bulkDelete(input: {
    ids: string[];
    mode: "archive" | "permanent";
    reason: string;
    userId: string;
  }) {
    return withTransaction(async (client) => {
      const ids = [...new Set(input.ids)];
      if (ids.length === 0) return { affected: 0 };

      if (input.mode === "archive") {
        for (const saleId of ids) {
          await this.archiveWithClient(client, saleId, input.reason, input.userId);
        }
      } else {
        for (const saleId of ids) {
          await this.purgeWithClient(client, saleId);
        }
      }
      return { affected: ids.length };
    });
  }

  private async archiveWithClient(
    client: PoolClient,
    saleId: string,
    reason: string,
    userId: string
  ) {
    const saleResult = await client.query<{ archived_at: string | null }>(
      "SELECT archived_at FROM sales WHERE id = $1 FOR UPDATE",
      [saleId]
    );
    const sale = saleResult.rows[0];
    if (!sale) throw new AppError(404, "Sale not found", "SALE_NOT_FOUND");
    if (sale.archived_at) throw new AppError(409, "Sale is already archived", "SALE_ARCHIVED");

    const itemsResult = await client.query<{
      id: string;
      product_id: string;
      quantity: number;
      returned_quantity: number;
    }>(
      "SELECT id, product_id, quantity, returned_quantity FROM sale_items WHERE sale_id = $1",
      [saleId]
    );
    const productIds = [...new Set(itemsResult.rows.map((item) => item.product_id))].sort();
    await client.query(
      "SELECT id FROM products WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE",
      [productIds]
    );
    for (const item of itemsResult.rows) {
      await releaseActiveAllocations(client, item.id, true);
      const quantity = item.quantity - item.returned_quantity;
      if (quantity > 0) {
        await client.query(
          "UPDATE products SET stock_quantity = stock_quantity + $2 WHERE id = $1",
          [item.product_id, quantity]
        );
      }
    }
    const archivedAt = new Date().toISOString();
    await client.query(
      `UPDATE sales SET archived_at = $2, archived_by = $3, archive_reason = $4
       WHERE id = $1`,
      [saleId, archivedAt, userId, reason]
    );
    await client.query(
      `UPDATE debts SET
         archived_at = $2, archived_by = $3,
         archive_reason = $4
       WHERE sale_id = $1 AND archived_at IS NULL`,
      [saleId, archivedAt, userId, `SALE_ARCHIVE: ${reason}`]
    );
  }

  private async purgeWithClient(client: PoolClient, saleId: string) {
    const saleResult = await client.query<{ archived_at: string | null }>(
      "SELECT archived_at FROM sales WHERE id = $1 FOR UPDATE",
      [saleId]
    );
    const sale = saleResult.rows[0];
    if (!sale) throw new AppError(404, "Sale not found", "SALE_NOT_FOUND");
    if (!sale.archived_at) {
      throw new AppError(409, "Only archived sales can be permanently deleted", "SALE_NOT_ARCHIVED");
    }
    await client.query(
      "DELETE FROM debt_payments WHERE debt_id IN (SELECT id FROM debts WHERE sale_id = $1)",
      [saleId]
    );
    await client.query("DELETE FROM debts WHERE sale_id = $1", [saleId]);
    await client.query("DELETE FROM sales WHERE id = $1", [saleId]);
  }

  private async lockProducts(client: PoolClient, productIds: string[]) {
    const sortedIds = [...productIds].sort();
    const result = await client.query<LockedProduct>(
      `SELECT id, code, name, unit, purchase_price, stock_quantity
       FROM products
       WHERE id = ANY($1::uuid[]) AND is_active = TRUE
       ORDER BY id
       FOR UPDATE`,
      [sortedIds]
    );
    return result.rows;
  }

  private async saleUnitMap(client: PoolClient, items: SaleItemInput[]) {
    const requested = [...new Set(items.map((item) => item.unit.toLowerCase()))];
    const result = await client.query<{ name: string }>(
      "SELECT name FROM measurement_units WHERE LOWER(name) = ANY($1::text[])",
      [requested]
    );
    const unitMap = new Map(result.rows.map((unit) => [unit.name.toLowerCase(), unit.name]));
    const missing = requested.filter((unit) => !unitMap.has(unit));
    if (missing.length > 0) {
      throw new AppError(
        422,
        "Sotuv birligi topilmadi. Avval Sozlamalar bo‘limida birlikni qo‘shing.",
        "UNIT_NOT_FOUND",
        missing
      );
    }
    return unitMap;
  }

  private async resolveCustomer(client: PoolClient, input: CreateSaleInput) {
    if (!input.customerId) {
      return {
        id: null,
        name: input.customerName ?? null,
        phone: input.customerPhone ?? null
      };
    }
    const result = await client.query<{ id: string; name: string; phone: string | null }>(
      "SELECT id, name, phone FROM customers WHERE id = $1",
      [input.customerId]
    );
    const customer = result.rows[0];
    if (!customer) throw new AppError(404, "Customer not found", "CUSTOMER_NOT_FOUND");
    return customer;
  }

  private async findByIdWithClient(client: PoolClient, id: string): Promise<SaleDetails> {
    const saleResult = await client.query(
      `SELECT *,
              (SELECT d.due_date FROM debts d WHERE d.sale_id = sales.id) AS due_date,
              (total_amount - returned_amount) AS net_total_amount,
              (profit - returned_profit) AS net_profit,
              CASE WHEN archived_at IS NOT NULL
                THEN archived_at + INTERVAL '30 days'
                ELSE NULL
              END AS archive_expires_at
       FROM sales WHERE id = $1`,
      [id]
    );
    const itemsResult = await client.query(
      `SELECT si.*, p.name AS product_name, p.code AS product_code, p.unit AS base_unit,
              (si.quantity - si.returned_quantity) AS remaining_quantity,
              (si.sale_quantity - si.returned_sale_quantity) AS remaining_sale_quantity
       FROM sale_items si JOIN products p ON p.id = si.product_id
       WHERE si.sale_id = $1 ORDER BY p.name`,
      [id]
    );
    const returnsResult = await client.query(
      `SELECT sr.*, p.name AS product_name, p.code AS product_code,
              u.name AS created_by_name
       FROM sale_returns sr
       JOIN products p ON p.id = sr.product_id
       JOIN users u ON u.id = sr.created_by
       WHERE sr.sale_id = $1 ORDER BY sr.returned_at DESC`,
      [id]
    );
    return {
      ...saleResult.rows[0],
      items: itemsResult.rows,
      returns: returnsResult.rows
    } as unknown as SaleDetails;
  }

  private invoiceNumber() {
    const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    return `INV-${date}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }
}

export const saleRepository = new SaleRepository();
