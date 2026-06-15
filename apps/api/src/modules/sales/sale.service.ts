import PDFDocument from "pdfkit";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { AppError } from "../../shared/errors/AppError.js";
import { paginationMeta } from "../../shared/pagination.js";
import { saleRepository } from "./sale.repository.js";

const pdfFonts = (() => {
  const regularCandidates = [
    resolve(process.cwd(), "assets", "fonts", "DejaVuSans.ttf"),
    "C:\\Windows\\Fonts\\arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/TTF/DejaVuSans.ttf"
  ];
  const boldCandidates = [
    resolve(process.cwd(), "assets", "fonts", "DejaVuSans-Bold.ttf"),
    "C:\\Windows\\Fonts\\arialbd.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf"
  ];

  const pick = (candidates: string[], fallback: string) =>
    candidates.find((candidate) => existsSync(candidate)) ?? fallback;

  return {
    regular: pick(regularCandidates, "Helvetica"),
    bold: pick(boldCandidates, "Helvetica-Bold")
  };
})();

export class SaleService {
  async list(input: Parameters<typeof saleRepository.list>[0]) {
    const result = await saleRepository.list(input);
    return { data: result.rows, meta: paginationMeta(result.total, input.page, input.limit) };
  }

  async get(id: string) {
    const sale = await saleRepository.findById(id);
    if (!sale) throw new AppError(404, "Sale not found", "SALE_NOT_FOUND");
    return sale;
  }

  create(input: Omit<Parameters<typeof saleRepository.create>[0], "createdBy">, userId: string) {
    return saleRepository.create({ ...input, createdBy: userId });
  }

  update(
    id: string,
    input: Omit<Parameters<typeof saleRepository.update>[1], "updatedBy">,
    userId: string
  ) {
    return saleRepository.update(id, { ...input, updatedBy: userId });
  }

  returnItems(
    saleId: string,
    input: Omit<Parameters<typeof saleRepository.returnItems>[0], "saleId" | "createdBy">,
    userId: string
  ) {
    return saleRepository.returnItems({ ...input, saleId, createdBy: userId });
  }

  archive(id: string, reason: string, userId: string) {
    return saleRepository.archive(id, reason, userId);
  }

  restore(id: string) {
    return saleRepository.restore(id);
  }

  purge(id: string) {
    return saleRepository.purge(id);
  }

  bulkDelete(
    input: Parameters<typeof saleRepository.bulkDelete>[0],
    userId: string
  ) {
    return saleRepository.bulkDelete({
      ...input,
      reason: input.reason ?? "BULK_DELETE",
      userId
    });
  }

  async receipt(id: string) {
    const sale = await this.get(id);
    const document = new PDFDocument({ size: "A4", margin: 48 });
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.registerFont("ReceiptRegular", pdfFonts.regular);
    document.registerFont("ReceiptBold", pdfFonts.bold);

    const money = (value: unknown) =>
      `${new Intl.NumberFormat("uz-UZ").format(Number(value ?? 0))} UZS`;
    const pageWidth = document.page.width - document.page.margins.left - document.page.margins.right;
    const columns = [
      { title: "Mahsulot", width: 220, align: "left" as const },
      { title: "Miqdor", width: 90, align: "center" as const },
      { title: "Narx", width: 105, align: "right" as const },
      { title: "Jami", width: pageWidth - 415, align: "right" as const }
    ];
    const rowHeight = 30;
    const drawInfoRow = (label: string, value: string, y: number) => {
      document
        .font("ReceiptBold")
        .fontSize(10)
        .fillColor("#475569")
        .text(label, document.page.margins.left, y, { continued: true });
      document
        .font("ReceiptRegular")
        .fillColor("#0F172A")
        .text(value, { continued: false });
      return document.y;
    };

    const drawRow = (
      values: string[],
      y: number,
      options: { header?: boolean; height?: number } = {}
    ) => {
      const height = options.height ?? rowHeight;
      let x = document.page.margins.left;
      if (options.header) {
        document.save().fillColor("#E2E8F0").rect(x, y, pageWidth, height).fill().restore();
      }
      columns.forEach((column, index) => {
        document.rect(x, y, column.width, height).strokeColor("#64748B").stroke();
        document
          .fillColor("#0F172A")
          .font(options.header ? "ReceiptBold" : "ReceiptRegular")
          .fontSize(options.header ? 9 : 8.5)
          .text(values[index] ?? "", x + 5, y + 9, {
            width: column.width - 10,
            align: column.align,
            lineBreak: false,
            ellipsis: true
          });
        x += column.width;
      });
      return y + height;
    };

    document
      .fillColor("#0F172A")
      .fontSize(22)
      .font("ReceiptBold")
      .text("NAKLADNOY", { align: "center" });
    document
      .moveDown(0.2)
      .font("ReceiptRegular")
      .fontSize(9)
      .fillColor("#64748B")
      .text("Inventory & Sales Management", { align: "center" });
    document.moveDown(1.2);

    document
      .save()
      .roundedRect(document.page.margins.left, document.y, pageWidth, 74, 10)
      .fillAndStroke("#F8FAFC", "#CBD5E1")
      .restore();
    let infoY = document.y + 12;
    infoY = drawInfoRow("Nakladnoy: ", sale.invoice_number, infoY);
    infoY = drawInfoRow("Sana: ", new Date(sale.sold_at).toLocaleString("uz-UZ"), infoY + 2);
    infoY = drawInfoRow("Mijoz: ", sale.customer_name ?? "-", infoY + 2);
    drawInfoRow(
      "To'lov: ",
      sale.payment_type === "CASH" ? "Naqd" : sale.payment_type === "CARD" ? "Plastik" : "Qarz",
      infoY + 2
    );
    document.y += 88;

    let y = document.y;
    y = drawRow(columns.map((column) => column.title), y, { header: true });
    for (const item of sale.items) {
      if (y + rowHeight > document.page.height - document.page.margins.bottom - 80) {
        document.addPage();
        y = drawRow(columns.map((column) => column.title), document.page.margins.top, {
          header: true
        });
      }
      const returned = Number(item.returned_sale_quantity ?? 0);
      const productName = returned > 0
        ? `${item.product_name} (qaytdi: ${item.returned_sale_quantity} ${item.unit})`
        : item.product_name;
      y = drawRow([
        productName,
        `${item.sale_quantity} ${item.unit}`,
        money(item.sale_price),
        money(item.total_amount)
      ], y);
    }
    document.y = y + 16;
    const totalsX = document.page.width - document.page.margins.right - 210;
    document
      .save()
      .roundedRect(totalsX, document.y, 210, Number(sale.returned_amount) > 0 ? 90 : 72, 10)
      .fillAndStroke("#F8FAFC", "#CBD5E1")
      .restore();
    document.x = totalsX + 14;
    document.y += 12;
    document.font("ReceiptRegular").fontSize(10).fillColor("#475569").text(`Oraliq jami: ${money(sale.subtotal)}`, totalsX + 14, document.y, { width: 182, align: "right" });
    document.text(`Chegirma: ${money(sale.discount)}`, totalsX + 14, document.y + 4, { width: 182, align: "right" });
    if (Number(sale.returned_amount) > 0) {
      document.text(`Qaytarilgan: ${money(sale.returned_amount)}`, totalsX + 14, document.y + 4, { width: 182, align: "right" });
    }
    document
      .font("ReceiptBold")
      .fontSize(15)
      .fillColor("#0F172A")
      .text(`Jami: ${money(sale.net_total_amount)}`, totalsX + 14, document.y + 10, { width: 182, align: "right" });
    document.end();

    await new Promise<void>((resolve, reject) => {
      document.on("end", resolve);
      document.on("error", reject);
    });
    return { filename: `${sale.invoice_number}.pdf`, buffer: Buffer.concat(chunks) };
  }
}

export const saleService = new SaleService();
