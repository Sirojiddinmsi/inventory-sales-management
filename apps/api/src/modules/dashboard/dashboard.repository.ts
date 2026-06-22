import { query } from "../../config/database.js";

export class DashboardRepository {
  async summary() {
    const [summary, paymentStats, lowStock] = await Promise.all([
      query(
        `SELECT
           COALESCE((SELECT SUM(total_amount - returned_amount) FROM sales
                     WHERE archived_at IS NULL AND sold_at::date = CURRENT_DATE), 0) AS today_sales,
           COALESCE((SELECT SUM(profit - returned_profit) FROM sales
                     WHERE archived_at IS NULL AND sold_at::date = CURRENT_DATE), 0) AS today_profit,
           COALESCE((SELECT SUM(total_amount - returned_amount) FROM sales
                     WHERE archived_at IS NULL
                       AND sold_at >= date_trunc('week', CURRENT_DATE)), 0) AS week_sales,
           COALESCE((SELECT SUM(fifo_cost - returned_fifo_cost) FROM sales
                     WHERE archived_at IS NULL
                       AND sold_at >= date_trunc('week', CURRENT_DATE)), 0) AS week_fifo_cost,
           COALESCE((SELECT SUM(profit - returned_profit) FROM sales
                     WHERE archived_at IS NULL
                       AND sold_at >= date_trunc('week', CURRENT_DATE)), 0) AS week_profit,
           COALESCE((SELECT SUM(supplier_return_profit) FROM supplier_returns
                     WHERE returned_at >= date_trunc('week', CURRENT_DATE)), 0) AS week_supplier_return_profit,
           COALESCE((SELECT SUM(stock_quantity) FROM products WHERE is_active = TRUE), 0) AS total_stock_quantity,
           COALESCE((SELECT COUNT(*) FROM products
                     WHERE is_active = TRUE AND stock_quantity <= minimum_stock), 0)::int AS low_stock_count,
           COALESCE((SELECT SUM(remaining_amount) FROM debts
                     WHERE archived_at IS NULL AND status <> 'PAID'), 0) AS outstanding_debt,
           COALESCE((SELECT SUM(amount) FROM expenses WHERE spent_at::date = CURRENT_DATE), 0) AS today_expenses`
      ),
      query(
        `WITH finance_rows AS (
           SELECT
             payment_type::text AS payment_type,
             COALESCE(SUM(total_amount - returned_amount), 0) AS amount,
             COUNT(*)::int AS sale_count
           FROM sales
           WHERE archived_at IS NULL AND sold_at::date = CURRENT_DATE
           GROUP BY payment_type

           UNION ALL

           SELECT
             payment_method::text AS payment_type,
             COALESCE(SUM(amount), 0) AS amount,
             COUNT(*)::int AS sale_count
           FROM debt_payments
           WHERE paid_at::date = CURRENT_DATE
           GROUP BY payment_method
         )
         SELECT
           payment_type,
           SUM(amount) AS amount,
           SUM(sale_count)::int AS sale_count
         FROM finance_rows
         GROUP BY payment_type
         ORDER BY payment_type`
      ),
      query(
        `SELECT p.id, p.code, p.name, p.stock_quantity, p.minimum_stock, p.unit,
                c.name AS category_name
         FROM products p
         JOIN categories c ON c.id = p.category_id
         WHERE p.is_active = TRUE AND p.stock_quantity <= p.minimum_stock
         ORDER BY p.stock_quantity ASC, p.name ASC
         LIMIT 10`
      )
    ]);

    const totals = summary.rows[0]!;
    return {
      ...totals,
      amount_to_submit:
        Number(totals.week_fifo_cost) - Number(totals.week_supplier_return_profit),
      payment_stats: paymentStats.rows,
      low_stock_products: lowStock.rows
    };
  }
}

export const dashboardRepository = new DashboardRepository();
