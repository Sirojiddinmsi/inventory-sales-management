import { query } from "../../config/database.js";
import type { PaginationInput } from "../../shared/pagination.js";

type CategoryInput = { name?: string; slug?: string; description?: string | null };

export class CategoryRepository {
  async list(input: PaginationInput) {
    const values: unknown[] = [];
    const where = input.search
      ? (values.push(`%${input.search}%`), `WHERE name ILIKE $${values.length}`)
      : "";
    const sortBy = input.sortBy === "created_at" ? "created_at" : "name";
    const direction = input.sortOrder === "desc" ? "DESC" : "ASC";
    values.push(input.limit, (input.page - 1) * input.limit);

    const result = await query(
      `SELECT id, name, slug, description, created_at, updated_at,
              COUNT(*) OVER()::int AS total_count
       FROM categories
       ${where}
       ORDER BY ${sortBy} ${direction}
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );

    return {
      rows: result.rows.map(({ total_count: _total, ...row }) => row),
      total: Number(result.rows[0]?.total_count ?? 0)
    };
  }

  async findById(id: string) {
    const result = await query("SELECT * FROM categories WHERE id = $1", [id]);
    return result.rows[0] ?? null;
  }

  async findBySlug(slug: string, excludeId?: string) {
    const values: unknown[] = [slug];
    const excludeClause = excludeId ? (values.push(excludeId), `AND id <> $${values.length}`) : "";
    const result = await query(
      `SELECT id, slug FROM categories WHERE slug = $1 ${excludeClause} LIMIT 1`,
      values
    );
    return result.rows[0] ?? null;
  }

  async findByName(name: string, excludeId?: string) {
    const values: unknown[] = [name];
    const excludeClause = excludeId ? (values.push(excludeId), `AND id <> $${values.length}`) : "";
    const result = await query(
      `SELECT id, name FROM categories
       WHERE LOWER(name) = LOWER($1) ${excludeClause}
       LIMIT 1`,
      values
    );
    return result.rows[0] ?? null;
  }

  async create(input: Required<Pick<CategoryInput, "name" | "slug">> & CategoryInput) {
    const result = await query(
      `INSERT INTO categories (name, slug, description)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.name, input.slug, input.description ?? null]
    );
    return result.rows[0];
  }

  async update(id: string, input: CategoryInput) {
    const result = await query(
      `UPDATE categories
       SET name = COALESCE($2, name),
           slug = COALESCE($3, slug),
           description = CASE WHEN $4::boolean THEN $5 ELSE description END
       WHERE id = $1
       RETURNING *`,
      [
        id,
        input.name ?? null,
        input.slug ?? null,
        Object.prototype.hasOwnProperty.call(input, "description"),
        input.description ?? null
      ]
    );
    return result.rows[0] ?? null;
  }

  async delete(id: string) {
    const result = await query("DELETE FROM categories WHERE id = $1 RETURNING id", [id]);
    return result.rows[0] ?? null;
  }
}

export const categoryRepository = new CategoryRepository();
