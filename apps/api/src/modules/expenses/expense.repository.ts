import { query } from "../../config/database.js";

type ExpenseInput = {
  expenseType?: string;
  amount?: number;
  spentAt?: string;
  note?: string | null;
};

export class ExpenseRepository {
  async list(input: {
    page: number;
    limit: number;
    search?: string;
    expenseType?: string;
    from?: string;
    to?: string;
    sortBy: string;
    sortOrder: "asc" | "desc";
  }) {
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (input.search) {
      values.push(`%${input.search}%`);
      conditions.push(`(e.expense_type ILIKE $${values.length} OR e.note ILIKE $${values.length})`);
    }
    if (input.expenseType) {
      values.push(input.expenseType);
      conditions.push(`e.expense_type = $${values.length}`);
    }
    if (input.from) {
      values.push(input.from);
      conditions.push(`e.spent_at >= $${values.length}`);
    }
    if (input.to) {
      values.push(input.to);
      conditions.push(`e.spent_at <= $${values.length}`);
    }
    const sortColumns: Record<string, string> = {
      spent_at: "e.spent_at",
      amount: "e.amount",
      expense_type: "e.expense_type"
    };
    const orderBy = sortColumns[input.sortBy] ?? "e.spent_at";
    const direction = input.sortOrder === "asc" ? "ASC" : "DESC";
    values.push(input.limit, (input.page - 1) * input.limit);

    const result = await query(
      `SELECT e.*, u.name AS created_by_name, COUNT(*) OVER()::int AS total_count
       FROM expenses e JOIN users u ON u.id = e.created_by
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

  async create(input: Required<Pick<ExpenseInput, "expenseType" | "amount">> & ExpenseInput & {
    createdBy: string;
  }) {
    const result = await query(
      `INSERT INTO expenses (expense_type, amount, spent_at, note, created_by)
       VALUES ($1,$2,COALESCE($3::timestamptz,NOW()),$4,$5)
       RETURNING *`,
      [input.expenseType, input.amount, input.spentAt ?? null, input.note ?? null, input.createdBy]
    );
    return result.rows[0];
  }

  async update(id: string, input: ExpenseInput) {
    const mapping: Record<keyof ExpenseInput, string> = {
      expenseType: "expense_type",
      amount: "amount",
      spentAt: "spent_at",
      note: "note"
    };
    const entries = Object.entries(input) as [keyof ExpenseInput, unknown][];
    if (entries.length === 0) {
      const existing = await query("SELECT * FROM expenses WHERE id = $1", [id]);
      return existing.rows[0] ?? null;
    }
    const values: unknown[] = [id];
    const set = entries.map(([key, value]) => {
      values.push(value ?? null);
      return `${mapping[key]} = $${values.length}`;
    });
    const result = await query(
      `UPDATE expenses SET ${set.join(", ")} WHERE id = $1 RETURNING *`,
      values
    );
    return result.rows[0] ?? null;
  }

  async delete(id: string) {
    const result = await query("DELETE FROM expenses WHERE id = $1 RETURNING id", [id]);
    return result.rows[0] ?? null;
  }
}

export const expenseRepository = new ExpenseRepository();

