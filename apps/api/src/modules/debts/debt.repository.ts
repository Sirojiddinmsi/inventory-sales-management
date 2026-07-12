import { query, withTransaction } from "../../config/database.js";
import { AppError } from "../../shared/errors/AppError.js";

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
                LOWER(TRIM(d.customer_name)) AS customer_key,
                COALESCE(NULLIF(TRIM(d.phone), ''), '') AS phone_key
         FROM debts d
         JOIN sales s ON s.id = d.sale_id
         ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
       ),
       grouped AS (
         SELECT
           customer_key,
           phone_key,
           MAX(customer_name) AS customer_name,
           NULLIF(MAX(phone_key), '') AS phone,
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
             ORDER BY created_at DESC, id DESC
           ) AS debts
         FROM filtered
         GROUP BY customer_key, phone_key
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
    paymentMethod: "CASH" | "CARD" | "TRANSFER" | "MIXED";
    cashAmount?: number;
    cardAmount?: number;
    transferAmount?: number;
    paidAt?: string;
    note?: string | null;
    receivedBy: string;
  }) {
    return withTransaction(async (client) => {
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
      if (input.amount > debt.remaining_amount) {
        throw new AppError(
          422,
          "Payment cannot exceed remaining debt",
          "PAYMENT_EXCEEDS_DEBT",
          { remainingAmount: debt.remaining_amount }
        );
      }

      const cashAmount =
        input.paymentMethod === "CASH"
          ? input.amount
          : Number(input.cashAmount ?? 0);
      const cardAmount =
        input.paymentMethod === "CARD"
          ? input.amount
          : Number(input.cardAmount ?? 0);
      const transferAmount =
        input.paymentMethod === "TRANSFER"
          ? input.amount
          : Number(input.transferAmount ?? 0);
      const splitTotal = cashAmount + cardAmount + transferAmount;
      if (Math.abs(splitTotal - input.amount) > 0.009) {
        throw new AppError(
          422,
          "Debt payment split must equal total amount",
          "DEBT_PAYMENT_SPLIT_INVALID",
          { amount: input.amount, cashAmount, cardAmount, transferAmount }
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
          input.amount,
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
        [input.debtId, input.amount]
      );
      return result.rows[0];
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
}

export const debtRepository = new DebtRepository();
