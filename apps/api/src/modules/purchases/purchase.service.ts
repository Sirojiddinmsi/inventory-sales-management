import { paginationMeta } from "../../shared/pagination.js";
import { purchaseRepository } from "./purchase.repository.js";
import writeXlsxFile from "write-excel-file/node";

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
}

export const purchaseService = new PurchaseService();
