import { query } from "../../config/database.js";

export type ReportFilter = {
  from?: string;
  to?: string;
  productId?: string;
  categoryId?: string;
  paymentType?: "CASH" | "CARD" | "DEBT";
};

function saleWhere(filter: ReportFilter, alias = "s") {
  const conditions: string[] = [`${alias}.archived_at IS NULL`];
  const values: unknown[] = [];
  if (filter.from) {
    values.push(filter.from);
    conditions.push(`${alias}.sold_at >= $${values.length}`);
  }
  if (filter.to) {
    values.push(filter.to);
    conditions.push(`${alias}.sold_at <= $${values.length}`);
  }
  if (filter.paymentType) {
    values.push(filter.paymentType);
    conditions.push(`${alias}.payment_type = $${values.length}`);
  }
  if (filter.productId) {
    values.push(filter.productId);
    conditions.push(`EXISTS (
      SELECT 1 FROM sale_items fsi
      WHERE fsi.sale_id = ${alias}.id AND fsi.product_id = $${values.length}
    )`);
  }
  if (filter.categoryId) {
    values.push(filter.categoryId);
    conditions.push(`EXISTS (
      SELECT 1 FROM sale_items fsi
      JOIN products fp ON fp.id = fsi.product_id
      WHERE fsi.sale_id = ${alias}.id AND fp.category_id = $${values.length}
    )`);
  }
  return {
    sql: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    values
  };
}

export class ReportRepository {
  async get(filter: ReportFilter) {
    const where = saleWhere(filter);
    const expenseConditions: string[] = [];
    const expenseValues: unknown[] = [];
    if (filter.from) {
      expenseValues.push(filter.from);
      expenseConditions.push(`spent_at >= $${expenseValues.length}`);
    }
    if (filter.to) {
      expenseValues.push(filter.to);
      expenseConditions.push(`spent_at <= $${expenseValues.length}`);
    }

    const [summary, soldProducts, daily, byProduct, byCategory, byPayment, expenses] = await Promise.all([
      query(
        `SELECT COUNT(*)::int AS sale_count,
                COALESCE(SUM(total_amount - returned_amount), 0) AS total_sales,
                COALESCE(SUM(fifo_cost - returned_fifo_cost), 0) AS total_fifo_cost,
                COALESCE(SUM(profit - returned_profit), 0) AS total_profit,
                COALESCE(AVG(total_amount - returned_amount), 0) AS average_sale
         FROM sales s ${where.sql}`,
        where.values
      ),
      query(
        `SELECT COUNT(DISTINCT si.product_id)::int AS products_sold_count,
                COALESCE(SUM(si.quantity - si.returned_quantity), 0) AS units_sold
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         ${where.sql}`,
        where.values
      ),
      query(
        `SELECT s.sold_at::date AS date, COUNT(*)::int AS sale_count,
                SUM(s.total_amount - s.returned_amount) AS total_sales,
                SUM(s.fifo_cost - s.returned_fifo_cost) AS fifo_cost,
                SUM(s.profit - s.returned_profit) AS profit
         FROM sales s ${where.sql}
         GROUP BY s.sold_at::date ORDER BY date`,
        where.values
      ),
      query(
        `SELECT p.id AS product_id, p.code, p.name,
                SUM(si.quantity - si.returned_quantity) AS quantity,
                SUM(
                  si.total_amount
                  - CASE WHEN s.subtotal > 0
                      THEN s.discount * (si.total_amount / s.subtotal)
                      ELSE 0
                    END
                  - si.returned_amount
                ) AS total_sales,
                SUM(si.fifo_cost - si.returned_fifo_cost) AS fifo_cost,
                SUM(
                  si.total_amount
                  - CASE WHEN s.subtotal > 0
                      THEN s.discount * (si.total_amount / s.subtotal)
                      ELSE 0
                    END
                  - si.returned_amount
                  - (si.fifo_cost - si.returned_fifo_cost)
                ) AS profit
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         JOIN products p ON p.id = si.product_id
         ${where.sql}
         GROUP BY p.id, p.code, p.name
         ORDER BY total_sales DESC`,
        where.values
      ),
      query(
        `SELECT c.id AS category_id, c.name,
                SUM(si.quantity - si.returned_quantity) AS quantity,
                SUM(
                  si.total_amount
                  - CASE WHEN s.subtotal > 0
                      THEN s.discount * (si.total_amount / s.subtotal)
                      ELSE 0
                    END
                  - si.returned_amount
                ) AS total_sales,
                SUM(si.fifo_cost - si.returned_fifo_cost) AS fifo_cost,
                SUM(
                  si.total_amount
                  - CASE WHEN s.subtotal > 0
                      THEN s.discount * (si.total_amount / s.subtotal)
                      ELSE 0
                    END
                  - si.returned_amount
                  - (si.fifo_cost - si.returned_fifo_cost)
                ) AS profit
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         JOIN products p ON p.id = si.product_id
         JOIN categories c ON c.id = p.category_id
         ${where.sql}
         GROUP BY c.id, c.name
         ORDER BY total_sales DESC`,
        where.values
      ),
      query(
        `SELECT s.payment_type, COUNT(*)::int AS sale_count,
                SUM(s.total_amount - s.returned_amount) AS total_sales,
                SUM(s.profit - s.returned_profit) AS profit
         FROM sales s ${where.sql}
         GROUP BY s.payment_type ORDER BY s.payment_type`,
        where.values
      ),
      query(
        `SELECT expense_type, COUNT(*)::int AS expense_count, SUM(amount) AS amount
         FROM expenses
         ${expenseConditions.length ? `WHERE ${expenseConditions.join(" AND ")}` : ""}
         GROUP BY expense_type ORDER BY amount DESC`,
        expenseValues
      )
    ]);

    const totalExpenses = expenses.rows.reduce((sum, item) => sum + Number(item.amount), 0);
    const totals = summary.rows[0]!;
    return {
      summary: {
        ...totals,
        ...soldProducts.rows[0],
        amount_to_submit: Number(totals.total_fifo_cost),
        total_expenses: totalExpenses,
        net_profit: Number(totals.total_profit) - totalExpenses
      },
      daily: daily.rows,
      by_product: byProduct.rows,
      by_category: byCategory.rows,
      by_payment_type: byPayment.rows,
      expenses: expenses.rows
    };
  }
}

export const reportRepository = new ReportRepository();
