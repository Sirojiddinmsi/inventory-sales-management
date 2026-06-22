import writeXlsxFile from "write-excel-file/node";
import { reportRepository, type ReportFilter } from "./report.repository.js";

export class ReportService {
  get(filter: ReportFilter) {
    return reportRepository.get(filter);
  }

  async excel(filter: ReportFilter) {
    const report = await this.get(filter);
    const header = (value: string) => ({
      value,
      fontWeight: "bold" as const,
      backgroundColor: "#E2E8F0"
    });
    const rows = [
      [header("Inventory & Sales Management Report")],
      [],
      [header("Metric"), header("Value")],
      ...Object.entries(report.summary).map(([metric, value]) => [metric, Number(value)]),
      [],
      [header("Supplier returns")],
      [
        header("Date"),
        header("Product"),
        header("Quantity"),
        header("FIFO cost"),
        header("Agreed return price"),
        header("Supplier return profit")
      ],
      ...report.supplier_returns.map((row) => [
        String(row.returned_at),
        String(row.name),
        Number(row.quantity),
        Number(row.fifo_cost),
        Number(row.agreed_return_price),
        Number(row.supplier_return_profit)
      ]),
      [],
      [header("Daily sales")],
      [
        header("Date"),
        header("Sales count"),
        header("Total sales"),
        header("FIFO cost"),
        header("Profit")
      ],
      ...report.daily.map((row) => [
        String(row.date),
        Number(row.sale_count),
        Number(row.total_sales),
        Number(row.fifo_cost),
        Number(row.profit)
      ]),
      [],
      [header("Product sales")],
      [
        header("Code"),
        header("Product"),
        header("Quantity"),
        header("Total sales"),
        header("FIFO cost"),
        header("Profit")
      ],
      ...report.by_product.map((row) => [
        String(row.code),
        String(row.name),
        Number(row.quantity),
        Number(row.total_sales),
        Number(row.fifo_cost),
        Number(row.profit)
      ]),
      [],
      [header("Debt payments")],
      [
        header("Payment method"),
        header("Payment count"),
        header("Total amount")
      ],
      ...report.debt_payments.map((row) => [
        String(row.payment_method),
        Number(row.payment_count),
        Number(row.total_amount)
      ])
    ];

    return writeXlsxFile(rows, {
      columns: [
        { width: 24 },
        { width: 34 },
        { width: 18 },
        { width: 20 },
        { width: 20 },
        { width: 20 }
      ]
    }).toBuffer();
  }
}

export const reportService = new ReportService();
