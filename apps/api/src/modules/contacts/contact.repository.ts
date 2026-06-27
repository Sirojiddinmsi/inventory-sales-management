import { query } from "../../config/database.js";

export type ContactKind = "suppliers" | "customers";
export type ContactInput = {
  name?: string;
  phone?: string | null;
  address?: string | null;
  note?: string | null;
};

export class ContactRepository {
  async findByPhone(kind: ContactKind, phone: string, excludeId?: string) {
    const result = await query(
      `SELECT * FROM ${kind}
       WHERE REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]+', '', 'g') =
             REGEXP_REPLACE($1, '[^0-9]+', '', 'g')
         AND ($2::uuid IS NULL OR id <> $2)
       LIMIT 1`,
      [phone, excludeId ?? null]
    );
    return result.rows[0] ?? null;
  }

  async list(
    kind: ContactKind,
    input: {
      page: number;
      limit: number;
      search?: string;
      sortBy: "name" | "created_at";
      sortOrder: "asc" | "desc";
    }
  ) {
    const values: unknown[] = [];
    const where = input.search
      ? (values.push(`%${input.search}%`),
        `WHERE (name ILIKE $${values.length} OR phone ILIKE $${values.length})`)
      : "";
    const direction = input.sortOrder === "desc" ? "DESC" : "ASC";
    values.push(input.limit, (input.page - 1) * input.limit);

    const result = await query(
      `SELECT *, COUNT(*) OVER()::int AS total_count
       FROM ${kind}
       ${where}
       ORDER BY ${input.sortBy} ${direction}
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );
    return {
      rows: result.rows.map(({ total_count: _total, ...row }) => row),
      total: Number(result.rows[0]?.total_count ?? 0)
    };
  }

  async create(kind: ContactKind, input: Required<Pick<ContactInput, "name">> & ContactInput) {
    const result = await query(
      `INSERT INTO ${kind} (name, phone, address, note)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [input.name, input.phone ?? null, input.address ?? null, input.note ?? null]
    );
    return result.rows[0];
  }

  async update(kind: ContactKind, id: string, input: ContactInput) {
    const mapping: Record<keyof ContactInput, string> = {
      name: "name",
      phone: "phone",
      address: "address",
      note: "note"
    };
    const entries = Object.entries(input) as [keyof ContactInput, unknown][];
    if (entries.length === 0) {
      const result = await query(`SELECT * FROM ${kind} WHERE id = $1`, [id]);
      return result.rows[0] ?? null;
    }
    const values: unknown[] = [id];
    const set = entries.map(([key, value]) => {
      values.push(value ?? null);
      return `${mapping[key]} = $${values.length}`;
    });
    const result = await query(
      `UPDATE ${kind} SET ${set.join(", ")} WHERE id = $1 RETURNING *`,
      values
    );
    return result.rows[0] ?? null;
  }

  async delete(kind: ContactKind, id: string) {
    const result = await query(`DELETE FROM ${kind} WHERE id = $1 RETURNING id`, [id]);
    return result.rows[0] ?? null;
  }
}

export const contactRepository = new ContactRepository();
