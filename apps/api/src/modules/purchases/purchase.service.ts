import { paginationMeta } from "../../shared/pagination.js";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { AppError } from "../../shared/errors/AppError.js";
import { purchaseRepository } from "./purchase.repository.js";
import writeXlsxFile from "write-excel-file/node";

const pdfFonts = (() => {
  const pick = (candidates: string[], fallback: string) =>
    candidates.find((candidate) => existsSync(candidate)) ?? fallback;
  return {
    regular: pick([
      resolve(process.cwd(), "assets", "fonts", "DejaVuSans.ttf"),
      "/usr/share/fonts/dejavu/DejaVuSans.ttf",
      "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    ], "Helvetica"),
    bold: pick([
      resolve(process.cwd(), "assets", "fonts", "DejaVuSans-Bold.ttf"),
      "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
      "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    ], "Helvetica-Bold")
  };
})();

export class PurchaseService {
  async list(input: Parameters<typeof purchaseRepository.list>[0]) {
    const result = await purchaseRepository.list(input);
    return { data: result.rows, meta: paginationMeta(result.total, input.page, input.limit) };
  }

  create(input: Omit<Parameters<typeof purchaseRepository.create>[0], "createdBy">, userId: string) {
    return purchaseRepository.create({ ...input, createdBy: userId });
  }

  bulkCreate(
    rows: Array<Omit<Parameters<typeof purchaseRepository.create>[0], "createdBy">>,
    userId: string
  ) {
    return purchaseRepository.bulkCreate(
      rows.map((row) => ({ ...row, createdBy: userId })),
      userId
    );
  }

  importRows(
    rows: Parameters<typeof purchaseRepository.importRows>[0],
    userId: string
  ) {
    return purchaseRepository.importRows(rows, userId);
  }

  update(
    id: string,
    input: Omit<Parameters<typeof purchaseRepository.update>[1], "editedBy">,
    userId: string
  ) {
    return purchaseRepository.update(id, { ...input, editedBy: userId });
  }

  updateDocument(
    id: string,
    rows: Array<Omit<Parameters<typeof purchaseRepository.updateDocument>[1][number], "editedBy">>,
    userId: string
  ) {
    return purchaseRepository.updateDocument(
      id,
      rows.map((row) => ({ ...row, editedBy: userId })),
      userId
    );
  }

  remove(id: string, userId: string) {
    return purchaseRepository.remove(id, userId);
  }

  async exportPdf(id: string) {
    const purchase = await this.getExportDocument(id);
    const document = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 34,
      bufferPages: true
    });
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.registerFont("PurchaseRegular", pdfFonts.regular);
    document.registerFont("PurchaseBold", pdfFonts.bold);

    const money = (value: number) => `${new Intl.NumberFormat("ru-RU").format(value)} UZS`;
    const dateTime = (value: string) => new Date(value).toLocaleString("ru-RU");
    const contentWidth = document.page.width - document.page.margins.left - document.page.margins.right;
    const columns = [
      { title: "№", width: 24, align: "center" as const },
      { title: "Товар", width: 200, align: "left" as const },
      { title: "Код", width: 82, align: "left" as const },
      { title: "Ед.", width: 42, align: "center" as const },
      { title: "Количество", width: 64, align: "right" as const },
      { title: "Место", width: 72, align: "left" as const },
      { title: "Закупочная цена", width: 98, align: "right" as const },
      { title: "Сумма", width: contentWidth - 582, align: "right" as const }
    ];
    const drawHeader = (y: number) => {
      let x = document.page.margins.left;
      document.save().fillColor("#E2E8F0").rect(x, y, contentWidth, 26).fill().restore();
      for (const column of columns) {
        document.rect(x, y, column.width, 26).strokeColor("#94A3B8").stroke();
        document.font("PurchaseBold").fontSize(7.6).fillColor("#0F172A").text(column.title, x + 4, y + 9, {
          width: column.width - 8,
          align: column.align
        });
        x += column.width;
      }
      return y + 26;
    };
    const drawRow = (values: string[], y: number) => {
      const rowHeight = Math.max(
        28,
        document.heightOfString(values[1] ?? "", { width: columns[1]!.width - 8 }) + 12
      );
      let x = document.page.margins.left;
      for (const [index, column] of columns.entries()) {
        document.rect(x, y, column.width, rowHeight).strokeColor("#CBD5E1").stroke();
        document.font("PurchaseRegular").fontSize(7.8).fillColor("#1E293B").text(values[index] ?? "", x + 4, y + 7, {
          width: column.width - 8,
          align: column.align,
          height: rowHeight - 10,
          ellipsis: index !== 1
        });
        x += column.width;
      }
      return y + rowHeight;
    };

    document.font("PurchaseBold").fontSize(20).fillColor("#0F172A").text("ПРИХОД ТОВАРА", { align: "center" });
    document.font("PurchaseRegular").fontSize(9).fillColor("#64748B").text("Tikuv Market", { align: "center" });
    document.moveDown(1);
    const infoY = document.y;
    document.save().roundedRect(document.page.margins.left, infoY, contentWidth, 74, 8).fillAndStroke("#F8FAFC", "#CBD5E1").restore();
    const info = [
      ["Номер документа", purchase.document_number],
      ["Дата прихода", dateTime(purchase.purchased_at)],
      ["Поставщик", purchase.supplier_name ?? "—"],
      ["Добавил", purchase.created_by_name],
      ["Количество строк", String(purchase.items.length)],
      ["Общее количество", new Intl.NumberFormat("ru-RU").format(purchase.items.reduce((sum, item) => sum + Number(item.quantity), 0))]
    ];
    info.forEach(([label, value], index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = document.page.margins.left + 12 + column * (contentWidth / 2);
      const y = infoY + 12 + row * 18;
      document.font("PurchaseBold").fontSize(8.5).fillColor("#475569").text(`${label}: `, x, y, { continued: true });
      document.font("PurchaseRegular").fillColor("#0F172A").text(value ?? "");
    });
    let y = infoY + 92;
    y = drawHeader(y);
    for (const [index, item] of purchase.items.entries()) {
      const previewHeight = Math.max(28, document.heightOfString(item.product_name, { width: columns[1]!.width - 8 }) + 12);
      if (y + previewHeight > document.page.height - document.page.margins.bottom - 70) {
        document.addPage();
        y = drawHeader(document.page.margins.top + 24);
      }
      y = drawRow([
        String(index + 1),
        item.product_name,
        item.product_code || "—",
        item.unit,
        new Intl.NumberFormat("ru-RU").format(Number(item.quantity)),
        item.product_location ?? "—",
        money(Number(item.purchase_price)),
        money(Number(item.total_cost))
      ], y);
    }
    const totalQuantity = purchase.items.reduce((sum, item) => sum + Number(item.quantity), 0);
    document.y = y + 14;
    document.font("PurchaseBold").fontSize(12).fillColor("#0F172A").text(
      `Итого по документу: ${money(purchase.items.reduce((sum, item) => sum + Number(item.total_cost), 0))}`,
      { align: "right" }
    );
    document.font("PurchaseRegular").fontSize(9).fillColor("#475569").text(
      `Строк: ${purchase.items.length} · Количество: ${new Intl.NumberFormat("ru-RU").format(totalQuantity)}`,
      { align: "right" }
    );
    const pages = document.bufferedPageRange();
    for (let page = 0; page < pages.count; page += 1) {
      document.switchToPage(pages.start + page);
      document.font("PurchaseRegular").fontSize(7.5).fillColor("#64748B").text(
        `${purchase.document_number} · Страница ${page + 1} из ${pages.count}`,
        document.page.margins.left,
        document.page.height - 23,
        { width: contentWidth, align: "center" }
      );
    }
    document.end();
    await new Promise<void>((resolve, reject) => {
      document.on("end", resolve);
      document.on("error", reject);
    });
    return {
      filename: this.exportFilename(purchase.document_number, purchase.purchased_at, "pdf"),
      buffer: Buffer.concat(chunks)
    };
  }

  async exportExcel(id: string) {
    const purchase = await this.getExportDocument(id);
    const totalAmount = purchase.items.reduce((sum, item) => sum + Number(item.total_cost), 0);
    const totalQuantity = purchase.items.reduce((sum, item) => sum + Number(item.quantity), 0);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Tikuv Market";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("Приход", {
      views: [{ state: "frozen", ySplit: 1 }]
    });
    sheet.columns = [
      { header: "№", key: "number", width: 7 },
      { header: "Наименование товара", key: "name", width: 34 },
      { header: "Код товара", key: "code", width: 20 },
      { header: "Категория", key: "category", width: 20 },
      { header: "Единица", key: "unit", width: 12 },
      { header: "Количество", key: "quantity", width: 14 },
      { header: "Место", key: "location", width: 18 },
      { header: "Закупочная цена", key: "price", width: 18 },
      { header: "Сумма строки", key: "total", width: 18 },
      { header: "Дата", key: "date", width: 20 },
      { header: "Поставщик", key: "supplier", width: 26 },
      { header: "Примечание", key: "note", width: 34 }
    ];
    sheet.autoFilter = { from: "A1", to: "L1" };
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
    sheet.getRow(1).alignment = { vertical: "middle", wrapText: true };
    purchase.items.forEach((item, index) => {
      sheet.addRow({
        number: index + 1,
        name: item.product_name,
        code: item.product_code || "—",
        category: item.category_name || "—",
        unit: item.unit,
        quantity: Number(item.quantity),
        location: item.product_location ?? "—",
        price: Number(item.purchase_price),
        total: Number(item.total_cost),
        date: new Date(item.purchased_at),
        supplier: item.supplier_name ?? purchase.supplier_name ?? "—",
        note: item.note ?? ""
      });
    });
    const totalRow = sheet.addRow({ number: "Итого", quantity: totalQuantity, total: totalAmount });
    sheet.mergeCells(`A${totalRow.number}:E${totalRow.number}`);
    totalRow.font = { bold: true };
    totalRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
    sheet.getColumn("quantity").numFmt = "#,##0.###";
    sheet.getColumn("price").numFmt = '#,##0.00 "UZS"';
    sheet.getColumn("total").numFmt = '#,##0.00 "UZS"';
    sheet.getColumn("date").numFmt = "dd.mm.yyyy hh:mm";
    sheet.eachRow((row) => {
      row.alignment = { vertical: "top", wrapText: true };
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFE2E8F0" } },
          left: { style: "thin", color: { argb: "FFE2E8F0" } },
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } }
        };
      });
    });

    const info = workbook.addWorksheet("Информация", {
      views: [{ state: "frozen", ySplit: 1 }]
    });
    info.columns = [{ width: 28 }, { width: 48 }];
    info.addRow(["Параметр", "Значение"]);
    [
      ["Номер документа", purchase.document_number],
      ["Дата прихода", new Date(purchase.purchased_at)],
      ["Поставщик", purchase.supplier_name ?? "—"],
      ["Добавил", purchase.created_by_name],
      ["Количество строк", purchase.items.length],
      ["Общее количество", totalQuantity],
      ["Общая сумма", totalAmount],
      ["Валюта", "UZS"],
      ["Дата создания", new Date(purchase.created_at)]
    ].forEach((row) => info.addRow(row));
    info.getRow(1).font = { bold: true };
    info.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
    info.getCell("B3").numFmt = "dd.mm.yyyy hh:mm";
    info.getCell("B7").numFmt = "#,##0.###";
    info.getCell("B8").numFmt = '#,##0.00 "UZS"';
    info.getCell("B10").numFmt = "dd.mm.yyyy hh:mm";
    info.eachRow((row) => {
      row.alignment = { vertical: "top", wrapText: true };
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFE2E8F0" } },
          left: { style: "thin", color: { argb: "FFE2E8F0" } },
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } }
        };
      });
    });
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return {
      filename: this.exportFilename(purchase.document_number, purchase.purchased_at, "xlsx"),
      buffer
    };
  }

  async importTemplate() {
    const header = (value: string) => ({
      value,
      fontWeight: "bold" as const,
      backgroundColor: "#DBEAFE",
      wrap: true
    });
    const rows = [
      [
        header("Mahsulot kodi yoki nomi *"),
        header("Miqdor *"),
        header("Kirim narxi *"),
        header("Joylashuv"),
        header("Yetkazib beruvchi"),
        header("Sana"),
        header("Izoh")
      ],
      [
        "PRD-123456789ABC",
        12,
        22000,
        "Polka A1",
        "Textile Parts Supply",
        "2026-06-15 12:00",
        "Namuna qator"
      ]
    ];

    return writeXlsxFile(rows, {
      columns: [
        { width: 30 },
        { width: 14 },
        { width: 18 },
        { width: 18 },
        { width: 28 },
        { width: 20 },
        { width: 34 }
      ]
    }).toBuffer();
  }

  private async getExportDocument(id: string) {
    const purchase = await purchaseRepository.findDocumentForExport(id);
    if (!purchase) {
      throw new AppError(404, "Purchase document not found", "PURCHASE_DOCUMENT_NOT_FOUND");
    }
    return purchase;
  }

  private exportFilename(documentNumber: string, purchasedAt: string, extension: "pdf" | "xlsx") {
    const safeDocumentNumber = documentNumber.replace(/[^a-zA-Z0-9_-]/g, "_");
    const date = new Date(purchasedAt).toISOString().slice(0, 10);
    return `kirim-${safeDocumentNumber}-${date}.${extension}`;
  }
}

export const purchaseService = new PurchaseService();
