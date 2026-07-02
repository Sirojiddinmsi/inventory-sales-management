import writeXlsxFile from "write-excel-file/node";
import { AppError } from "../../shared/errors/AppError.js";
import { paginationMeta } from "../../shared/pagination.js";
import { productRepository } from "./product.repository.js";

export class ProductService {
  async list(input: Parameters<typeof productRepository.list>[0]) {
    const result = await productRepository.list(input);
    return {
      data: result.rows,
      meta: paginationMeta(result.total, input.page, input.limit)
    };
  }

  async get(id: string) {
    const product = await productRepository.findById(id);
    if (!product) throw new AppError(404, "Product not found", "PRODUCT_NOT_FOUND");
    return product;
  }

  create(input: Parameters<typeof productRepository.create>[0]) {
    return productRepository.create(input);
  }

  async update(
    id: string,
    input: Parameters<typeof productRepository.update>[1] & {
      updateRemainingFifoCost?: boolean;
      costCorrectionNote?: string | null;
    },
    editedBy: string
  ) {
    const {
      updateRemainingFifoCost = false,
      costCorrectionNote,
      ...productInput
    } = input;
    const product = await productRepository.update(id, productInput, {
      updateRemainingFifoCost,
      costCorrectionNote,
      editedBy
    });
    if (!product) throw new AppError(404, "Product not found", "PRODUCT_NOT_FOUND");
    return product;
  }

  async correctRemainingFifoCost(
    id: string,
    correctedUnitCost: number,
    userId: string,
    note?: string | null
  ) {
    const correction = await productRepository.correctRemainingFifoCost(
      id,
      correctedUnitCost,
      userId,
      note
    );
    if (!correction) throw new AppError(404, "Product not found", "PRODUCT_NOT_FOUND");
    return correction;
  }

  async delete(id: string) {
    const product = await productRepository.permanentDelete(id);
    if (!product) throw new AppError(404, "Product not found", "PRODUCT_NOT_FOUND");
  }

  bulkDelete(ids: string[]) {
    return productRepository.bulkPermanentDelete(ids);
  }

  bulkMove(ids: string[], location: string) {
    return productRepository.bulkUpdateLocation(ids, location);
  }

  bulkChangeCategory(ids: string[], categoryId: string) {
    return productRepository.bulkUpdateCategory(ids, categoryId);
  }

  async exportSelected(ids: string[]) {
    const products = await productRepository.findManyByIds(ids);
    if (products.length !== ids.length) {
      throw new AppError(
        404,
        "Tanlangan mahsulotlardan ayrimlari topilmadi",
        "PRODUCTS_NOT_FOUND"
      );
    }

    const header = (value: string) => ({
      value,
      fontWeight: "bold" as const,
      backgroundColor: "#DBEAFE",
      wrap: true
    });
    const rows = [
      [
        header("Mahsulot"),
        header("Kategoriya"),
        header("Joylashuv"),
        header("Birlik"),
        header("Kirim narxi"),
        header("Tavsiya sotuv narxi"),
        header("Qoldiq"),
        header("Minimal qoldiq"),
        header("Tavsif")
      ],
      ...products.map((product) => [
        String(product.name),
        String(product.category_name),
        String(product.location ?? ""),
        String(product.unit),
        Number(product.purchase_price),
        Number(product.sale_price),
        Number(product.stock_quantity),
        Number(product.minimum_stock),
        String(product.description ?? "")
      ])
    ];

    return writeXlsxFile(rows, {
      columns: [
        { width: 32 },
        { width: 20 },
        { width: 20 },
        { width: 12 },
        { width: 18 },
        { width: 22 },
        { width: 14 },
        { width: 18 },
        { width: 40 }
      ]
    }).toBuffer();
  }

  importRows(
    rows: Parameters<typeof productRepository.importRows>[0],
    userId: string
  ) {
    return productRepository.importRows(rows, userId);
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
        header("Code"),
        header("Nomi *"),
        header("Kategoriya *"),
        header("Birlik *"),
        header("Kirim narxi *"),
        header("Tavsiya sotuv narxi"),
        header("Miqdor *"),
        header("Minimal qoldiq"),
        header("Joylashuv"),
        header("Tavsif")
      ],
      [
        "",
        "Tikuv mashinasi lapkasi",
        "Lapka",
        "dona",
        25000,
        35000,
        10,
        2,
        "Polka A1",
        "Namuna qator. Importdan oldin o'zgartiring yoki o'chiring."
      ]
    ];

    return writeXlsxFile(rows, {
      columns: [
        { width: 16 },
        { width: 32 },
        { width: 20 },
        { width: 12 },
        { width: 18 },
        { width: 22 },
        { width: 14 },
        { width: 18 },
        { width: 18 },
        { width: 40 }
      ]
    }).toBuffer();
  }

  async history(
    id: string,
    filter: Parameters<typeof productRepository.history>[1]
  ) {
    const product = await productRepository.findById(id);
    if (!product) throw new AppError(404, "Product not found", "PRODUCT_NOT_FOUND");
    return productRepository.history(id, filter);
  }

  async historyExcel(
    id: string,
    filter: Parameters<typeof productRepository.history>[1]
  ) {
    const history = (await this.history(id, filter))!;
    const movements = history.movements as Array<{
      movement_type: string;
      movement_at: string;
      quantity: number;
      purchase_price?: number;
      sale_price?: number;
      fifo_cost?: number;
      profit?: number;
      reference_number: string;
      partner_name?: string | null;
      location?: string | null;
      remaining_quantity?: number | null;
      note?: string | null;
    }>;
    const header = (value: string) => ({
      value,
      fontWeight: "bold" as const,
      backgroundColor: "#E2E8F0"
    });
    const rows = [
      [header("Product"), history.product.name],
      [header("Current stock"), Number(history.summary.current_stock)],
      [header("Remaining stock value"), Number(history.summary.remaining_stock_value)],
      [],
      [header("Movements")],
      [
        header("Type"),
        header("Date"),
        header("Quantity"),
        header("Purchase price"),
        header("Sale price"),
        header("FIFO cost"),
        header("Profit"),
        header("Reference"),
        header("Partner"),
        header("Location"),
        header("Remaining batch qty"),
        header("Note")
      ],
      ...movements.map((row) => [
        String(row.movement_type),
        String(row.movement_at),
        Number(row.quantity ?? 0),
        Number(row.purchase_price ?? 0),
        Number(row.sale_price ?? 0),
        Number(row.fifo_cost ?? 0),
        Number(row.profit ?? 0),
        String(row.reference_number ?? ""),
        String(row.partner_name ?? ""),
        String(row.location ?? ""),
        Number(row.remaining_quantity ?? 0),
        String(row.note ?? "")
      ])
    ];

    return writeXlsxFile(rows, {
      columns: [
        { width: 18 },
        { width: 22 },
        { width: 12 },
        { width: 16 },
        { width: 16 },
        { width: 16 },
        { width: 16 },
        { width: 22 },
        { width: 22 },
        { width: 18 },
        { width: 18 },
        { width: 30 }
      ]
    }).toBuffer();
  }
}

export const productService = new ProductService();
