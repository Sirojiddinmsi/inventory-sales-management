import { query, withTransaction } from "../../config/database.js";
import { AppError } from "../../shared/errors/AppError.js";

export class UnitRepository {
  async list() {
    const result = await query(
      `SELECT id, name, created_at
       FROM measurement_units
       ORDER BY CASE WHEN name = 'dona' THEN 0 ELSE 1 END, name`
    );
    return result.rows;
  }

  async create(name: string) {
    const result = await query(
      `INSERT INTO measurement_units (name)
       VALUES ($1)
       RETURNING id, name, created_at`,
      [name.toLowerCase()]
    );
    return result.rows[0];
  }

  delete(id: string) {
    return withTransaction(async (client) => {
      const unitResult = await client.query<{ name: string }>(
        "SELECT name FROM measurement_units WHERE id = $1 FOR UPDATE",
        [id]
      );
      const unit = unitResult.rows[0];
      if (!unit) return null;

      const usageResult = await client.query<{ product_count: number; sale_count: number }>(
        `SELECT
           (SELECT COUNT(*)::int FROM products
            WHERE is_active = TRUE AND LOWER(unit) = LOWER($1)) AS product_count,
           (SELECT COUNT(*)::int
            FROM sale_items si
            JOIN sales s ON s.id = si.sale_id
            WHERE s.archived_at IS NULL AND LOWER(si.unit) = LOWER($1)) AS sale_count`,
        [unit.name]
      );
      const usage = usageResult.rows[0]!;
      if (usage.product_count > 0 || usage.sale_count > 0) {
        throw new AppError(
          409,
          "Bu birlik faol mahsulot yoki sotuvda ishlatilmoqda. Avval ulardagi birlikni o‘zgartiring.",
          "UNIT_IN_USE",
          usage
        );
      }

      await client.query("DELETE FROM measurement_units WHERE id = $1", [id]);
      return unit;
    });
  }
}

export const unitRepository = new UnitRepository();
