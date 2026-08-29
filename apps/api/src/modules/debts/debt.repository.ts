import { query, withTransaction } from "../../config/database.js";
import { AppError } from "../../shared/errors/AppError.js";
import type { PoolClient } from "pg";
import {
  allocateDebtPaymentOldestFirst,
  normalizePaymentSplit,
  toMoneyCents,
  type DebtPaymentMethod,
  type PaymentSplitInput
} from "./debt-allocation.js";

type CustomerDebtIdentity = {
  identityType: "CUSTOMER_ID" | "LEGACY";
  customerId?: string;
  customerName?: string;
  phone?: string | null;
};

const normalizedNameSql = (expression: string) =>
  `LOWER(REGEXP_REPLACE(TRIM(${expression}), '\\s+', ' ', 'g'))`;

const normalizedPhoneSql = (expression: string) =>
  `REGEXP_REPLACE(COALESCE(${expression}, ''), '[^0-9]+', '', 'g')`;

const normalizeLegacyName = (value: string) =>
  value.trim().replace(/\s+/gu, " ").toLocaleLowerCase();

const normalizeLegacyPhone = (value?: string | null) =>
  (value ?? "").replace(/[^0-9]+/gu, "");

export class DebtRepository {
  async list(input: {
    page: number;
    limit: number;
    search?: string;
    status?: "UNPAID" | "PARTIALLY_PAID" | "PAID";
    filter: "active" | "paid" | "archive" | "overdue" | "partial" | "all";
    dueFrom?: string;
    dueTo?: string;
    archived: boolean;
    sortBy: string;
    sortOrder: "asc" | "desc";
  }) {
    const showArchive = input.archived || input.filter === "archive";
    const conditions: string[] = [
      showArchive ? "d.archived_at IS NOT NULL" : "d.archived_at IS NULL"
    ];
    const values: unknown[] = [];
    if (input.search) {
      values.push(`%${input.search}%`);
      conditions.push(`(d.customer_name ILIKE $${values.length} OR d.phone ILIKE $${values.length})`);
    }
    if (input.status) {
      values.push(input.status);
      conditions.push(`d.status = $${values.length}`);
    }
    if (!showArchive) {
      if (input.filter === "active") {
        conditions.push("d.remaining_amount > 0");
      } else if (input.filter === "paid") {
        conditions.push("d.remaining_amount = 0");
      } else if (input.filter === "overdue") {
        conditions.push("d.remaining_amount > 0 AND d.due_date IS NOT NULL AND d.due_date < CURRENT_DATE");
      } else if (input.filter === "partial") {
        conditions.push("d.remaining_amount > 0 AND d.paid_amount > 0");
      }
    }
    if (input.dueFrom) {
      values.push(input.dueFrom);
      conditions.push(`d.due_date >= $${values.length}`);
    }
    if (input.dueTo) {
      values.push(input.dueTo);
      conditions.push(`d.due_date <= $${values.length}`);
    }
    const sortColumns: Record<string, string> = {
      created_at: "d.created_at",
      due_date: "d.due_date",
      remaining_amount: "d.remaining_amount"
    };
    const orderBy = sortColumns[input.sortBy] ?? "d.created_at";
    const direction = input.sortOrder === "asc" ? "ASC" : "DESC";
    values.push(input.limit, (input.page - 1) * input.limit);

    const result = await query(
      `SELECT d.*, s.invoice_number,
              CASE
                WHEN d.remaining_amount = 0 THEN 'PAID'
                WHEN d.remaining_amount > 0 AND d.due_date IS NOT NULL AND d.due_date < CURRENT_DATE THEN 'OVERDUE'
                WHEN d.paid_amount > 0 AND d.remaining_amount > 0 THEN 'PARTIALLY_PAID'
                ELSE 'UNPAID'
              END AS computed_status,
              CASE WHEN d.archived_at IS NOT NULL
                THEN d.archived_at + INTERVAL '30 days'
                ELSE NULL
              END AS archive_expires_at,
              COUNT(*) OVER()::int AS total_count
       FROM debts d JOIN sales s ON s.id = d.sale_id
       ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
       ORDER BY ${orderBy} ${direction} NULLS LAST
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );
    return {
      rows: result.rows.map(({ total_count: _total, computed_status, ...row }) => ({
        ...row,
        status: computed_status
      })),
      total: Number(result.rows[0]?.total_count ?? 0)
    };
  }

  async summary() {
    const result = await query(
      `SELECT
         COALESCE(SUM(d.remaining_amount) FILTER (
           WHERE d.archived_at IS NULL AND d.remaining_amount > 0
         ), 0) AS total_active_debt,
         COALESCE(SUM(d.paid_amount) FILTER (
           WHERE d.remaining_amount = 0
         ), 0) AS paid_debts,
         COALESCE(SUM(d.remaining_amount) FILTER (
           WHERE d.archived_at IS NULL
             AND d.remaining_amount > 0
             AND d.due_date IS NOT NULL
             AND d.due_date < CURRENT_DATE
         ), 0) AS overdue_debts,
         COALESCE(SUM(d.remaining_amount) FILTER (
           WHERE d.archived_at IS NULL
             AND d.remaining_amount > 0
             AND d.paid_amount > 0
         ), 0) AS partially_paid_debts
       FROM debts d`
    );
    return result.rows[0];
  }

  async customers(input: {
    page: number;
    limit: number;
    search?: string;
    status?: "UNPAID" | "PARTIALLY_PAID" | "PAID";
    filter: "active" | "paid" | "archive" | "overdue" | "partial" | "all";
    dueFrom?: string;
    dueTo?: string;
    archived: boolean;
    sortBy: string;
    sortOrder: "asc" | "desc";
  }) {
    const showArchive = input.archived || input.filter === "archive";
    const conditions: string[] = [
      showArchive ? "d.archived_at IS NOT NULL" : "d.archived_at IS NULL"
    ];
    const values: unknown[] = [];
    if (input.search) {
      values.push(`%${input.search}%`);
      conditions.push(`(d.customer_name ILIKE $${values.length} OR d.phone ILIKE $${values.length})`);
    }
    if (input.status) {
      values.push(input.status);
      conditions.push(`d.status = $${values.length}`);
    }
    if (!showArchive) {
      if (input.filter === "active") {
        conditions.push("d.remaining_amount > 0");
      } else if (input.filter === "paid") {
        conditions.push("d.remaining_amount = 0");
      } else if (input.filter === "overdue") {
        conditions.push("d.remaining_amount > 0 AND d.due_date IS NOT NULL AND d.due_date < CURRENT_DATE");
      } else if (input.filter === "partial") {
        conditions.push("d.remaining_amount > 0 AND d.paid_amount > 0");
      }
    }
    if (input.dueFrom) {
      values.push(input.dueFrom);
      conditions.push(`d.due_date >= $${values.length}`);
    }
    if (input.dueTo) {
      values.push(input.dueTo);
      conditions.push(`d.due_date <= $${values.length}`);
    }

    const sortColumns: Record<string, string> = {
      created_at: "latest_created_at",
      due_date: "nearest_due_date",
      remaining_amount: "total_remaining_amount"
    };
    const orderBy = sortColumns[input.sortBy] ?? "latest_created_at";
    const direction = input.sortOrder === "asc" ? "ASC" : "DESC";
    values.push(input.limit, (input.page - 1) * input.limit);

    const result = await query(
      `WITH filtered AS (
         SELECT d.*, s.invoice_number,
                CASE
                  WHEN d.remaining_amount = 0 THEN 'PAID'
                  WHEN d.remaining_amount > 0 AND d.due_date IS NOT NULL AND d.due_date < CURRENT_DATE THEN 'OVERDUE'
                  WHEN d.paid_amount > 0 AND d.remaining_amount > 0 THEN 'PARTIALLY_PAID'
                  ELSE 'UNPAID'
                END AS computed_status,
                CASE WHEN d.archived_at IS NOT NULL
                  THEN d.archived_at + INTERVAL '30 days'
                  ELSE NULL
                END AS archive_expires_at,
                CASE WHEN d.customer_id IS NOT NULL THEN 'CUSTOMER_ID' ELSE 'LEGACY' END AS identity_type,
                CASE
                  WHEN d.customer_id IS NOT NULL THEN d.customer_id::text
                  ELSE ${normalizedNameSql("d.customer_name")}
                END AS customer_key,
                NULLIF(TRIM(d.phone), '') AS display_phone,
                CASE
                  WHEN d.customer_id IS NOT NULL THEN ''
                  ELSE ${normalizedPhoneSql("d.phone")}
                END AS phone_key
         FROM debts d
         JOIN sales s ON s.id = d.sale_id
         ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
       ),
       grouped AS (
         SELECT
           identity_type,
           CASE WHEN identity_type = 'CUSTOMER_ID' THEN customer_key::uuid ELSE NULL END AS customer_id,
           customer_key,
           phone_key,
           (ARRAY_AGG(customer_name ORDER BY created_at DESC, id DESC))[1] AS customer_name,
           (ARRAY_AGG(display_phone ORDER BY created_at DESC, id DESC))[1] AS phone,
           COUNT(*)::int AS debt_count,
           SUM(amount) AS total_amount,
           SUM(paid_amount) AS total_paid_amount,
           SUM(remaining_amount) AS total_remaining_amount,
           MIN(due_date) FILTER (WHERE remaining_amount > 0) AS nearest_due_date,
           MAX(created_at) AS latest_created_at,
           BOOL_OR(remaining_amount > 0 AND due_date IS NOT NULL AND due_date < CURRENT_DATE) AS has_overdue,
           JSON_AGG(
             JSON_BUILD_OBJECT(
               'id', id,
               'sale_id', sale_id,
               'customer_id', customer_id,
               'invoice_number', invoice_number,
               'customer_name', customer_name,
               'phone', phone,
               'amount', amount,
               'paid_amount', paid_amount,
               'remaining_amount', remaining_amount,
               'status', computed_status,
               'due_date', due_date,
               'note', note,
               'created_at', created_at,
               'archived_at', archived_at,
               'archive_reason', archive_reason,
               'archive_expires_at', archive_expires_at
             )
             ORDER BY created_at ASC, id ASC
           ) AS debts
         FROM filtered
         GROUP BY identity_type, customer_key, phone_key
       )
       SELECT *,
              CASE
                WHEN total_remaining_amount = 0 THEN 'PAID'
                WHEN has_overdue THEN 'OVERDUE'
                WHEN total_paid_amount > 0 AND total_remaining_amount > 0 THEN 'PARTIALLY_PAID'
                ELSE 'UNPAID'
              END AS status,
              COUNT(*) OVER()::int AS total_count
       FROM grouped
       ORDER BY ${orderBy} ${direction} NULLS LAST
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );

    return {
      rows: result.rows.map(({ total_count: _total, ...row }) => row),
      total: Number(result.rows[0]?.total_count ?? 0)
    };
  }

  async customerDetails(input: CustomerDebtIdentity & {
    scope: "active" | "paid" | "all" | "archive";
  }) {
    const values: unknown[] = [];
    let identityCondition: string;

    if (input.identityType === "CUSTOMER_ID") {
      values.push(input.customerId);
      identityCondition = `d.customer_id = $${values.length}`;
    } else {
      values.push(input.customerName, input.phone ?? "");
      identityCondition = `d.customer_id IS NULL
        AND ${normalizedNameSql("d.customer_name")} = ${normalizedNameSql(`$${values.length - 1}`)}
        AND ${normalizedPhoneSql("d.phone")} = ${normalizedPhoneSql(`$${values.length}`)}`;
    }

    const scopeCondition = {
      active: "d.archived_at IS NULL AND d.remaining_amount > 0",
      paid: "d.archived_at IS NULL AND d.remaining_amount = 0",
      all: "d.archived_at IS NULL",
      archive: "d.archived_at IS NOT NULL"
    }[input.scope];

    const result = await query(
      `WITH matching AS (
         SELECT d.*, s.invoice_number,
                CASE
                  WHEN d.remaining_amount = 0 THEN 'PAID'
                  WHEN d.due_date IS NOT NULL AND d.due_date < CURRENT_DATE THEN 'OVERDUE'
                  WHEN d.paid_amount > 0 THEN 'PARTIALLY_PAID'
                  ELSE 'UNPAID'
                END AS computed_status,
                CASE WHEN d.archived_at IS NOT NULL
                  THEN d.archived_at + INTERVAL '30 days'
                  ELSE NULL
                END AS archive_expires_at
         FROM debts d
         JOIN sales s ON s.id = d.sale_id
         WHERE ${identityCondition}
           AND ${scopeCondition}
       )
       SELECT
         $${values.length + 1}::text AS identity_type,
         CASE WHEN $${values.length + 1}::text = 'CUSTOMER_ID'
           THEN $${values.length + 2}::uuid
           ELSE NULL
         END AS customer_id,
         CASE WHEN $${values.length + 1}::text = 'CUSTOMER_ID'
           THEN $${values.length + 2}::text
           ELSE ${normalizedNameSql("(ARRAY_AGG(customer_name ORDER BY created_at DESC, id DESC))[1]")}
         END AS customer_key,
         CASE WHEN $${values.length + 1}::text = 'CUSTOMER_ID'
           THEN ''
           ELSE ${normalizedPhoneSql("(ARRAY_AGG(phone ORDER BY created_at DESC, id DESC))[1]")}
         END AS phone_key,
         (ARRAY_AGG(customer_name ORDER BY created_at DESC, id DESC))[1] AS customer_name,
         (ARRAY_AGG(NULLIF(TRIM(phone), '') ORDER BY created_at DESC, id DESC))[1] AS phone,
         COUNT(*)::int AS debt_count,
         SUM(amount) AS total_amount,
         SUM(paid_amount) AS total_paid_amount,
         SUM(remaining_amount) AS total_remaining_amount,
         MIN(due_date) FILTER (WHERE remaining_amount > 0) AS nearest_due_date,
         MAX(created_at) AS latest_created_at,
         BOOL_OR(remaining_amount > 0 AND due_date IS NOT NULL AND due_date < CURRENT_DATE) AS has_overdue,
         CASE
           WHEN SUM(remaining_amount) = 0 THEN 'PAID'
           WHEN BOOL_OR(remaining_amount > 0 AND due_date IS NOT NULL AND due_date < CURRENT_DATE) THEN 'OVERDUE'
           WHEN SUM(paid_amount) > 0 THEN 'PARTIALLY_PAID'
           ELSE 'UNPAID'
         END AS status,
         JSON_AGG(
           JSON_BUILD_OBJECT(
             'id', id,
             'sale_id', sale_id,
             'customer_id', customer_id,
             'invoice_number', invoice_number,
             'customer_name', customer_name,
             'phone', phone,
             'amount', amount,
             'paid_amount', paid_amount,
             'remaining_amount', remaining_amount,
             'status', computed_status,
             'due_date', due_date,
             'note', note,
             'created_at', created_at,
             'archived_at', archived_at,
             'archive_reason', archive_reason,
             'archive_expires_at', archive_expires_at
           )
           ORDER BY created_at ASC, id ASC
         ) AS debts
       FROM matching
       HAVING COUNT(*) > 0`,
      [
        ...values,
        input.identityType,
        input.identityType === "CUSTOMER_ID" ? input.customerId : null
      ]
    );

    return result.rows[0] ?? null;
  }

  async get(id: string) {
    const debtResult = await query(
      `SELECT d.*, s.invoice_number,
              CASE
                WHEN d.remaining_amount = 0 THEN 'PAID'
                WHEN d.remaining_amount > 0 AND d.due_date IS NOT NULL AND d.due_date < CURRENT_DATE THEN 'OVERDUE'
                WHEN d.paid_amount > 0 AND d.remaining_amount > 0 THEN 'PARTIALLY_PAID'
                ELSE 'UNPAID'
              END AS computed_status,
              CASE WHEN d.archived_at IS NOT NULL
                THEN d.archived_at + INTERVAL '30 days'
                ELSE NULL
              END AS archive_expires_at
       FROM debts d JOIN sales s ON s.id = d.sale_id WHERE d.id = $1`,
      [id]
    );
    if (!debtResult.rows[0]) return null;
    const items = await query(
      `SELECT si.id, si.product_id, p.name AS product_name, p.code AS product_code,
              si.unit, si.sale_quantity AS quantity, si.sale_price, si.discount,
              si.total_amount
       FROM sale_items si
       JOIN products p ON p.id = si.product_id
       JOIN debts d ON d.sale_id = si.sale_id
       WHERE d.id = $1
       ORDER BY p.name`,
      [id]
    );
    const payments = await query(
      `SELECT dp.*, u.name AS received_by_name
       FROM debt_payments dp JOIN users u ON u.id = dp.received_by
       WHERE dp.debt_id = $1 ORDER BY dp.paid_at DESC`,
      [id]
    );
    const { computed_status, ...debt } = debtResult.rows[0];
    return { ...debt, status: computed_status, items: items.rows, payments: payments.rows };
  }

  pay(input: {
    debtId: string;
    amount: number;
    paymentMethod: DebtPaymentMethod;
    cashAmount?: number;
    cardAmount?: number;
    transferAmount?: number;
    paidAt?: string;
    note?: string | null;
    receivedBy: string;
  }) {
    return withTransaction(async (client) => {
      const { amount, cashAmount, cardAmount, transferAmount } = normalizePaymentSplit(input);
      const debtResult = await client.query<{
        id: string;
        remaining_amount: number;
        archived_at: string | null;
      }>("SELECT id, remaining_amount, archived_at FROM debts WHERE id = $1 FOR UPDATE", [input.debtId]);
      const debt = debtResult.rows[0];
      if (!debt) throw new AppError(404, "Debt not found", "DEBT_NOT_FOUND");
      if (debt.archived_at) {
        throw new AppError(409, "Archived debt cannot accept payments", "DEBT_ARCHIVED");
      }
      if (toMoneyCents(amount) > toMoneyCents(Number(debt.remaining_amount), "remainingAmount")) {
        throw new AppError(
          422,
          "Payment cannot exceed remaining debt",
          "PAYMENT_EXCEEDS_DEBT",
          { remainingAmount: debt.remaining_amount }
        );
      }

      await client.query(
        `INSERT INTO debt_payments (
           debt_id, amount, payment_method, cash_amount, card_amount,
           transfer_amount, paid_at, note, received_by
         )
         VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz,NOW()),$8,$9)`,
        [
          input.debtId,
          amount,
          input.paymentMethod,
          cashAmount,
          cardAmount,
          transferAmount,
          input.paidAt ?? null,
          input.note ?? null,
          input.receivedBy
        ]
      );
      const result = await client.query(
        `UPDATE debts
         SET paid_amount = paid_amount + $2,
             remaining_amount = remaining_amount - $2,
             status = CASE
               WHEN remaining_amount - $2 = 0 THEN 'PAID'::debt_status
               ELSE 'PARTIALLY_PAID'::debt_status
             END
         WHERE id = $1
         RETURNING *`,
        [input.debtId, amount]
      );
      return result.rows[0];
    });
  }

  payCustomer(input: CustomerDebtIdentity & PaymentSplitInput & {
    requestId: string;
    paidAt?: string;
    note?: string | null;
    receivedBy: string;
  }) {
    return withTransaction(async (client) => {
      const split = normalizePaymentSplit(input);
      const normalizedIdentity = input.identityType === "CUSTOMER_ID"
        ? { customerId: input.customerId!, customerName: null, phone: null }
        : {
            customerId: null,
            customerName: normalizeLegacyName(input.customerName!),
            phone: normalizeLegacyPhone(input.phone) || null
          };

      const insertedBatch = await client.query(
        `INSERT INTO debt_payment_batches (
           request_id, identity_type, customer_id, customer_name, phone,
           amount, payment_method, cash_amount, card_amount, transfer_amount,
           paid_at, requested_paid_at, note, received_by
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE($11::timestamptz,NOW()),$11,$12,$13)
         ON CONFLICT (request_id) DO NOTHING
         RETURNING *`,
        [
          input.requestId,
          input.identityType,
          normalizedIdentity.customerId,
          normalizedIdentity.customerName,
          normalizedIdentity.phone,
          split.amount,
          input.paymentMethod,
          split.cashAmount,
          split.cardAmount,
          split.transferAmount,
          input.paidAt ?? null,
          input.note ?? null,
          input.receivedBy
        ]
      );

      if (!insertedBatch.rows[0]) {
        return this.findPaymentBatchByRequestId(input, split, normalizedIdentity, client);
      }

      const batch = insertedBatch.rows[0];
      const debtsResult = input.identityType === "CUSTOMER_ID"
        ? await client.query<{
            id: string;
            invoice_number: string;
            remaining_amount: number;
          }>(
            `SELECT d.id, s.invoice_number, d.remaining_amount
             FROM debts d
             JOIN sales s ON s.id = d.sale_id
             WHERE d.customer_id = $1
               AND d.archived_at IS NULL
               AND d.remaining_amount > 0
             ORDER BY d.created_at ASC, d.id ASC
             FOR UPDATE OF d`,
            [input.customerId]
          )
        : await client.query<{
            id: string;
            invoice_number: string;
            remaining_amount: number;
          }>(
            `SELECT d.id, s.invoice_number, d.remaining_amount
             FROM debts d
             JOIN sales s ON s.id = d.sale_id
             WHERE d.customer_id IS NULL
               AND ${normalizedNameSql("d.customer_name")} = $1
               AND ${normalizedPhoneSql("d.phone")} = $2
               AND d.archived_at IS NULL
               AND d.remaining_amount > 0
             ORDER BY d.created_at ASC, d.id ASC
             FOR UPDATE OF d`,
            [normalizedIdentity.customerName, normalizedIdentity.phone ?? ""]
          );

      const allocationResult = allocateDebtPaymentOldestFirst(debtsResult.rows, input);
      const responseAllocations: Array<{
        paymentId: string;
        debtId: string;
        invoiceNumber: string;
        amount: number;
        cashAmount: number;
        cardAmount: number;
        transferAmount: number;
        debtAmount: number;
        paidAmount: number;
        remainingAmount: number;
        status: "UNPAID" | "PARTIALLY_PAID" | "PAID";
      }> = [];

      for (const allocation of allocationResult.allocations) {
        const paymentResult = await client.query<{ id: string }>(
          `INSERT INTO debt_payments (
             debt_id, batch_id, amount, payment_method, cash_amount, card_amount,
             transfer_amount, paid_at, note, received_by
           )
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           RETURNING id`,
          [
            allocation.debtId,
            batch.id,
            allocation.amount,
            input.paymentMethod,
            allocation.cashAmount,
            allocation.cardAmount,
            allocation.transferAmount,
            batch.paid_at,
            input.note ?? null,
            input.receivedBy
          ]
        );

        const debtResult = await client.query<{
          amount: number;
          paid_amount: number;
          remaining_amount: number;
          status: "UNPAID" | "PARTIALLY_PAID" | "PAID";
        }>(
          `WITH payment_total AS (
             SELECT COALESCE(SUM(amount), 0)::numeric(18, 2) AS paid_amount
             FROM debt_payments
             WHERE debt_id = $1
           )
           UPDATE debts d
           SET paid_amount = payment_total.paid_amount,
               remaining_amount = d.amount - payment_total.paid_amount,
               status = CASE
                 WHEN payment_total.paid_amount = 0 THEN 'UNPAID'::debt_status
                 WHEN d.amount - payment_total.paid_amount = 0 THEN 'PAID'::debt_status
                 ELSE 'PARTIALLY_PAID'::debt_status
               END
           FROM payment_total
           WHERE d.id = $1
           RETURNING d.amount, d.paid_amount, d.remaining_amount, d.status`,
          [allocation.debtId]
        );
        const debt = debtResult.rows[0]!;

        responseAllocations.push({
          paymentId: paymentResult.rows[0]!.id,
          ...allocation,
          debtAmount: Number(debt.amount),
          paidAmount: Number(debt.paid_amount),
          remainingAmount: Number(debt.remaining_amount),
          status: debt.status
        });
      }

      await client.query(
        "UPDATE debt_payment_batches SET allocations_json = $2::jsonb WHERE id = $1",
        [batch.id, JSON.stringify(responseAllocations)]
      );

      return {
        batchId: batch.id,
        requestId: batch.request_id,
        amount: split.amount,
        paymentMethod: input.paymentMethod,
        cashAmount: split.cashAmount,
        cardAmount: split.cardAmount,
        transferAmount: split.transferAmount,
        paidAt: batch.paid_at,
        allocations: responseAllocations
      };
    });
  }

  updatePayment(input: {
    debtId: string;
    paymentId: string;
    amount: number;
    paymentMethod: DebtPaymentMethod;
    cashAmount?: number;
    cardAmount?: number;
    transferAmount?: number;
    paidAt: string;
    note?: string | null;
    editedBy: string;
  }) {
    return withTransaction(async (client) => {
      const debtResult = await client.query<{
        id: string;
        amount: number;
        archived_at: string | null;
      }>("SELECT id, amount, archived_at FROM debts WHERE id = $1 FOR UPDATE", [input.debtId]);
      const debt = debtResult.rows[0];
      if (!debt) throw new AppError(404, "Debt not found", "DEBT_NOT_FOUND");
      if (debt.archived_at) {
        throw new AppError(409, "Archived debt payments cannot be edited", "DEBT_ARCHIVED");
      }

      const paymentResult = await client.query(
        `SELECT dp.*, u.name AS received_by_name
         FROM debt_payments dp
         JOIN users u ON u.id = dp.received_by
         WHERE dp.id = $1 AND dp.debt_id = $2
         FOR UPDATE OF dp`,
        [input.paymentId, input.debtId]
      );
      const oldPayment = paymentResult.rows[0];
      if (!oldPayment) {
        throw new AppError(404, "Debt payment not found", "DEBT_PAYMENT_NOT_FOUND");
      }

      const { amount, cashAmount, cardAmount, transferAmount } = normalizePaymentSplit(input);
      const otherPaymentsResult = await client.query<{ total: string }>(
        `SELECT COALESCE(SUM(amount), 0) AS total
         FROM debt_payments
         WHERE debt_id = $1 AND id <> $2`,
        [input.debtId, input.paymentId]
      );
      const paidByOtherPayments = Number(otherPaymentsResult.rows[0]?.total ?? 0);
      const newPaidAmount = paidByOtherPayments + amount;
      const debtAmount = Number(debt.amount);
      if (newPaidAmount - debtAmount > 0.009) {
        throw new AppError(
          422,
          "Payment cannot exceed remaining debt",
          "PAYMENT_EXCEEDS_DEBT",
          { debtAmount, paidByOtherPayments, amount }
        );
      }
      const newRemainingAmount = Math.max(0, debtAmount - newPaidAmount);

      const updatedPaymentResult = await client.query(
        `UPDATE debt_payments
         SET amount = $3,
             payment_method = $4,
             cash_amount = $5,
             card_amount = $6,
             transfer_amount = $7,
             paid_at = $8,
             note = $9
         WHERE id = $1 AND debt_id = $2
         RETURNING *`,
        [
          input.paymentId,
          input.debtId,
          amount,
          input.paymentMethod,
          cashAmount,
          cardAmount,
          transferAmount,
          input.paidAt,
          input.note ?? null
        ]
      );
      const updatedPayment = updatedPaymentResult.rows[0];

      const updatedDebtResult = await client.query(
        `UPDATE debts
         SET paid_amount = $2::numeric,
             remaining_amount = $3::numeric,
             status = CASE
               WHEN $3::numeric = 0::numeric THEN 'PAID'::debt_status
               WHEN $2::numeric > 0::numeric AND $3::numeric > 0::numeric THEN 'PARTIALLY_PAID'::debt_status
               ELSE 'UNPAID'::debt_status
             END
         WHERE id = $1
         RETURNING *`,
        [input.debtId, newPaidAmount, newRemainingAmount]
      );

      await client.query(
        `INSERT INTO debt_payment_audit_logs (
           debt_payment_id, debt_id, action, before_data, after_data, edited_by
         )
         VALUES ($1, $2, 'UPDATE', $3, $4, $5)`,
        [
          input.paymentId,
          input.debtId,
          JSON.stringify(oldPayment),
          JSON.stringify(updatedPayment),
          input.editedBy
        ]
      );

      return updatedDebtResult.rows[0];
    });
  }

  archive(id: string, reason: string, userId: string) {
    return withTransaction(async (client) => {
      const result = await client.query(
        `UPDATE debts SET
           archived_at = NOW(), archived_by = $2, archive_reason = $3
         WHERE id = $1 AND archived_at IS NULL
         RETURNING *`,
        [id, userId, reason]
      );
      if (!result.rows[0]) {
        const exists = await client.query("SELECT id FROM debts WHERE id = $1", [id]);
        if (!exists.rows[0]) throw new AppError(404, "Debt not found", "DEBT_NOT_FOUND");
        throw new AppError(409, "Debt is already archived", "DEBT_ARCHIVED");
      }
      return result.rows[0];
    });
  }

  restore(id: string) {
    return withTransaction(async (client) => {
      const debtResult = await client.query<{
        id: string;
        sale_archived_at: string | null;
      }>(
        `SELECT d.id, s.archived_at AS sale_archived_at
         FROM debts d JOIN sales s ON s.id = d.sale_id
         WHERE d.id = $1 AND d.archived_at IS NOT NULL
         FOR UPDATE OF d`,
        [id]
      );
      const debt = debtResult.rows[0];
      if (!debt) throw new AppError(404, "Archived debt not found", "DEBT_NOT_FOUND");
      if (debt.sale_archived_at) {
        throw new AppError(
          409,
          "Restore the linked sale before restoring this debt",
          "SALE_ARCHIVED"
        );
      }
      const result = await client.query(
        `UPDATE debts SET archived_at = NULL, archived_by = NULL, archive_reason = NULL
         WHERE id = $1 RETURNING *`,
        [id]
      );
      return result.rows[0];
    });
  }

  purge(id: string) {
    return withTransaction(async (client) => {
      const debtResult = await client.query<{ archived_at: string | null }>(
        "SELECT archived_at FROM debts WHERE id = $1 FOR UPDATE",
        [id]
      );
      const debt = debtResult.rows[0];
      if (!debt) throw new AppError(404, "Debt not found", "DEBT_NOT_FOUND");
      if (!debt.archived_at) {
        throw new AppError(409, "Only archived debts can be permanently deleted", "DEBT_NOT_ARCHIVED");
      }
      await client.query("DELETE FROM debt_payments WHERE debt_id = $1", [id]);
      await client.query("DELETE FROM debts WHERE id = $1", [id]);
    });
  }

  private async findPaymentBatchByRequestId(
    input: CustomerDebtIdentity & PaymentSplitInput & {
      requestId: string;
      paidAt?: string;
      note?: string | null;
      receivedBy: string;
    },
    split: ReturnType<typeof normalizePaymentSplit>,
    normalizedIdentity: {
      customerId: string | null;
      customerName: string | null;
      phone: string | null;
    },
    client: PoolClient
  ) {
    const batchResult = await client.query<{
      id: string;
      request_id: string;
      identity_type: "CUSTOMER_ID" | "LEGACY";
      customer_id: string | null;
      customer_name: string | null;
      phone: string | null;
      amount: number;
      payment_method: DebtPaymentMethod;
      cash_amount: number;
      card_amount: number;
      transfer_amount: number;
      paid_at: Date | string;
      requested_paid_at: Date | string | null;
      note: string | null;
      received_by: string;
      allocations_json: unknown;
    }>(
      "SELECT * FROM debt_payment_batches WHERE request_id = $1",
      [input.requestId]
    );
    const batch = batchResult.rows[0];
    if (!batch) {
      throw new AppError(404, "Debt payment batch not found", "DEBT_PAYMENT_BATCH_NOT_FOUND");
    }

    const samePaidAt = input.paidAt === undefined
      ? batch.requested_paid_at === null
      : batch.requested_paid_at !== null &&
        new Date(batch.requested_paid_at).getTime() === new Date(input.paidAt).getTime();
    const sameRequest =
      batch.identity_type === input.identityType &&
      batch.customer_id === normalizedIdentity.customerId &&
      batch.customer_name === normalizedIdentity.customerName &&
      batch.phone === normalizedIdentity.phone &&
      toMoneyCents(Number(batch.amount)) === split.amountCents &&
      batch.payment_method === input.paymentMethod &&
      toMoneyCents(Number(batch.cash_amount)) === split.cashCents &&
      toMoneyCents(Number(batch.card_amount)) === split.cardCents &&
      toMoneyCents(Number(batch.transfer_amount)) === split.transferCents &&
      (batch.note ?? null) === (input.note ?? null) &&
      batch.received_by === input.receivedBy &&
      samePaidAt;

    if (!sameRequest) {
      throw new AppError(
        409,
        "requestId was already used for a different customer payment",
        "PAYMENT_REQUEST_ID_REUSED"
      );
    }

    const allocations = Array.isArray(batch.allocations_json)
      ? batch.allocations_json
      : [];

    return {
      batchId: batch.id,
      requestId: batch.request_id,
      amount: Number(batch.amount),
      paymentMethod: batch.payment_method,
      cashAmount: Number(batch.cash_amount),
      cardAmount: Number(batch.card_amount),
      transferAmount: Number(batch.transfer_amount),
      paidAt: batch.paid_at,
      allocations
    };
  }
}

export const debtRepository = new DebtRepository();
