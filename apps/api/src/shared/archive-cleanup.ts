import { withTransaction } from "../config/database.js";

const RETENTION_DAYS = 30;

export async function purgeExpiredArchives() {
  return withTransaction(async (client) => {
    const expiredDebts = await client.query<{ id: string }>(
      `SELECT id
       FROM debts
       WHERE archived_at < NOW() - ($1 * INTERVAL '1 day')
       FOR UPDATE`,
      [RETENTION_DAYS]
    );

    if (expiredDebts.rows.length > 0) {
      const debtIds = expiredDebts.rows.map((row) => row.id);
      await client.query("DELETE FROM debt_payments WHERE debt_id = ANY($1::uuid[])", [debtIds]);
      await client.query("DELETE FROM debts WHERE id = ANY($1::uuid[])", [debtIds]);
    }

    const expiredSales = await client.query<{ id: string }>(
      `SELECT id
       FROM sales
       WHERE archived_at < NOW() - ($1 * INTERVAL '1 day')
       FOR UPDATE`,
      [RETENTION_DAYS]
    );

    if (expiredSales.rows.length > 0) {
      const saleIds = expiredSales.rows.map((row) => row.id);
      await client.query(
        `DELETE FROM debt_payments
         WHERE debt_id IN (SELECT id FROM debts WHERE sale_id = ANY($1::uuid[]))`,
        [saleIds]
      );
      await client.query("DELETE FROM debts WHERE sale_id = ANY($1::uuid[])", [saleIds]);
      await client.query("DELETE FROM sales WHERE id = ANY($1::uuid[])", [saleIds]);
    }

    return {
      debts: expiredDebts.rows.length,
      sales: expiredSales.rows.length
    };
  });
}
