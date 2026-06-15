import { query, withTransaction } from "../../config/database.js";
import { AppError } from "../../shared/errors/AppError.js";

export class DebtRepository {
  async list(input: {
    page: number;
    limit: number;
    search?: string;
    status?: "UNPAID" | "PARTIALLY_PAID" | "PAID";
    dueFrom?: string;
    dueTo?: string;
    archived: boolean;
    sortBy: string;
    sortOrder: "asc" | "desc";
  }) {
    const conditions: string[] = [
      input.archived ? "d.archived_at IS NOT NULL" : "d.archived_at IS NULL"
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
      rows: result.rows.map(({ total_count: _total, ...row }) => row),
      total: Number(result.rows[0]?.total_count ?? 0)
    };
  }

  async get(id: string) {
    const debtResult = await query(
      `SELECT d.*, s.invoice_number,
              CASE WHEN d.archived_at IS NOT NULL
                THEN d.archived_at + INTERVAL '30 days'
                ELSE NULL
              END AS archive_expires_at
       FROM debts d JOIN sales s ON s.id = d.sale_id WHERE d.id = $1`,
      [id]
    );
    if (!debtResult.rows[0]) return null;
    const payments = await query(
      `SELECT dp.*, u.name AS received_by_name
       FROM debt_payments dp JOIN users u ON u.id = dp.received_by
       WHERE dp.debt_id = $1 ORDER BY dp.paid_at DESC`,
      [id]
    );
    return { ...debtResult.rows[0], payments: payments.rows };
  }

  pay(input: {
    debtId: string;
    amount: number;
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

      await client.query(
        `INSERT INTO debt_payments (debt_id, amount, paid_at, note, received_by)
         VALUES ($1,$2,COALESCE($3::timestamptz,NOW()),$4,$5)`,
        [
          input.debtId,
          input.amount,
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
