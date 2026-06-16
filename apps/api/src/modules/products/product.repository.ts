import { query, withTransaction } from "../../config/database.js";
import { AppError } from "../../shared/errors/AppError.js";
import type { ProductImportRow } from "./product.schema.js";
import { randomUUID } from "node:crypto";
import {
  consumeFifo,
  createInventoryBatch
} from "../inventory/fifo.repository.js";

type ProductInput = {
  code?: string;
  name?: string;
  categoryId?: string;
  brand?: string | null;
  unit?: string;
  purchasePrice?: number;
  salePrice?: number;
  stockQuantity?: number;
  minimumStock?: number;
  location?: string | null;
  imageUrl?: string | null;
  imageUrls?: string[];
  description?: string | null;
};

const productColumns = `
  p.id, p.code, p.name, p.category_id, c.name AS category_name,
  p.brand, p.unit, p.purchase_price, p.sale_price, p.stock_quantity,
  p.minimum_stock, p.location, p.image_url, p.description, p.is_active,
  COALESCE((
    SELECT json_agg(pi.image_url ORDER BY pi.position)
    FROM product_images pi
    WHERE pi.product_id = p.id
  ), '[]'::json) AS image_urls,
  (p.stock_quantity <= p.minimum_stock) AS is_low_stock,
  p.created_at, p.updated_at
`;

const productFrom = `
  FROM products p
  JOIN categories c ON c.id = p.category_id
`;

export class ProductRepository {
  async list(input: {
    page: number;
    limit: number;
    search?: string;
    categoryId?: string;
    location?: string;
    lowStock?: boolean;
    sortBy: string;
    sortOrder: "asc" | "desc";
  }) {
    const conditions = ["p.is_active = TRUE"];
    const values: unknown[] = [];

    if (input.search) {
      values.push(`%${input.search}%`);
      conditions.push(`(
        p.name ILIKE $${values.length}
        OR p.code ILIKE $${values.length}
        OR c.name ILIKE $${values.length}
        OR p.location ILIKE $${values.length}
      )`);
    }
    if (input.categoryId) {
      values.push(input.categoryId);
      conditions.push(`p.category_id = $${values.length}`);
    }
    if (input.location) {
      values.push(`%${input.location}%`);
      conditions.push(`p.location ILIKE $${values.length}`);
    }
    if (input.lowStock) conditions.push("p.stock_quantity <= p.minimum_stock");

    const allowedSort: Record<string, string> = {
      name: "p.name",
      code: "p.code",
      stock_quantity: "p.stock_quantity",
      sale_price: "p.sale_price",
      created_at: "p.created_at"
    };
    const orderBy = allowedSort[input.sortBy] ?? "p.created_at";
    const direction = input.sortOrder === "asc" ? "ASC" : "DESC";
    const secondaryDirection = input.sortBy === "created_at" ? direction : "ASC";
    values.push(input.limit, (input.page - 1) * input.limit);

    const result = await query(
      `SELECT ${productColumns},
         COUNT(*) OVER()::int AS total_count
       ${productFrom}
       WHERE ${conditions.join(" AND ")}
       ORDER BY ${orderBy} ${direction}, p.id ${secondaryDirection}
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );

    return {
      rows: result.rows.map(({ total_count: _total, ...row }) => row),
      total: Number(result.rows[0]?.total_count ?? 0)
    };
  }

  async findById(id: string) {
    const result = await query(
      `SELECT ${productColumns} ${productFrom}
       WHERE p.id = $1 AND p.is_active = TRUE`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  async findManyByIds(ids: string[]) {
    if (ids.length === 0) return [];
    const result = await query(
      `SELECT ${productColumns} ${productFrom}
       WHERE p.id = ANY($1::uuid[]) AND p.is_active = TRUE
       ORDER BY p.name ASC`,
      [ids]
    );
    return result.rows;
  }

  async history(
    id: string,
    filter: {
      from?: string;
      to?: string;
      movementType?: "arrival" | "sale" | "return" | "adjustment";
    }
  ) {
    const batchValues: unknown[] = [id];
    const batchConditions = ["ib.product_id = $1"];
    const arrivalValues: unknown[] = [id];
    const arrivalConditions = ["pu.product_id = $1"];
    const saleValues: unknown[] = [id];
    const saleConditions = ["si.product_id = $1", "s.archived_at IS NULL"];
    const returnValues: unknown[] = [id];
    const returnConditions = ["sr.product_id = $1"];

    if (filter.from) {
      batchValues.push(filter.from);
      batchConditions.push(`ib.received_at >= $${batchValues.length}`);
      arrivalValues.push(filter.from);
      arrivalConditions.push(`pu.purchased_at >= $${arrivalValues.length}`);
      saleValues.push(filter.from);
      saleConditions.push(`s.sold_at >= $${saleValues.length}`);
      returnValues.push(filter.from);
      returnConditions.push(`sr.returned_at >= $${returnValues.length}`);
    }
    if (filter.to) {
      batchValues.push(filter.to);
      batchConditions.push(`ib.received_at <= $${batchValues.length}`);
      arrivalValues.push(filter.to);
      arrivalConditions.push(`pu.purchased_at <= $${arrivalValues.length}`);
      saleValues.push(filter.to);
      saleConditions.push(`s.sold_at <= $${saleValues.length}`);
      returnValues.push(filter.to);
      returnConditions.push(`sr.returned_at <= $${returnValues.length}`);
    }

    const productResult = await query(
      `SELECT ${productColumns} ${productFrom}
       WHERE p.id = $1 AND p.is_active = TRUE`,
      [id]
    );
    const product = productResult.rows[0];
    if (!product) return null;

    const [summaryResult, batchesResult, arrivalsResult, salesResult, returnsResult, adjustmentsResult] =
      await Promise.all([
        query(
          `SELECT p.stock_quantity AS current_stock,
                  COALESCE(SUM(ib.remaining_quantity * ib.purchase_price), 0) AS remaining_stock_value
           FROM products p
           LEFT JOIN inventory_batches ib ON ib.product_id = p.id
           WHERE p.id = $1
           GROUP BY p.id`,
          [id]
        ),
        query(
          `SELECT ib.id, ib.source, ib.initial_quantity, ib.remaining_quantity,
                  ib.purchase_price, ib.received_at, pu.id AS purchase_id,
                  pu.note, s.name AS supplier_name, p.location
           FROM inventory_batches ib
           LEFT JOIN purchases pu ON pu.id = ib.purchase_id
           LEFT JOIN suppliers s ON s.id = pu.supplier_id
           LEFT JOIN products p ON p.id = ib.product_id
           WHERE ${batchConditions.join(" AND ")}
           ORDER BY ib.received_at DESC, ib.created_at DESC`,
          batchValues
        ),
        query(
          `SELECT pu.id, pu.purchased_at AS movement_at, pu.quantity,
                  pu.purchase_price, pu.total_cost, pu.note,
                  s.name AS supplier_name, p.location,
                  ib.remaining_quantity
           FROM purchases pu
           JOIN products p ON p.id = pu.product_id
           LEFT JOIN suppliers s ON s.id = pu.supplier_id
           LEFT JOIN inventory_batches ib ON ib.purchase_id = pu.id
           WHERE ${arrivalConditions.join(" AND ")}
           ORDER BY pu.purchased_at DESC, pu.created_at DESC`,
          arrivalValues
        ),
        query(
          `SELECT si.id, s.sold_at AS movement_at, si.sale_quantity,
                  si.sale_price, si.total_amount, si.fifo_cost, si.profit,
                  s.invoice_number, s.customer_name, s.note
           FROM sale_items si
           JOIN sales s ON s.id = si.sale_id
           WHERE ${saleConditions.join(" AND ")}
           ORDER BY s.sold_at DESC, si.id DESC`,
          saleValues
        ),
        query(
          `SELECT sr.id, sr.returned_at AS movement_at, sr.sale_quantity,
                  sr.amount, sr.fifo_cost_reversal, sr.profit_reversal,
                  s.invoice_number, s.customer_name, sr.reason
           FROM sale_returns sr
           JOIN sales s ON s.id = sr.sale_id
           WHERE ${returnConditions.join(" AND ")}
           ORDER BY sr.returned_at DESC, sr.id DESC`,
          returnValues
        ),
        query(
          `SELECT ib.id, ib.received_at AS movement_at, ib.initial_quantity,
                  ib.purchase_price, ib.remaining_quantity, p.location
           FROM inventory_batches ib
           JOIN products p ON p.id = ib.product_id
           WHERE ${batchConditions.join(" AND ")}
             AND ib.source = 'ADJUSTMENT'
           ORDER BY ib.received_at DESC, ib.created_at DESC`,
          batchValues
        )
      ]);

    const arrivals = arrivalsResult.rows.map((row) => ({
      movement_type: "arrival",
      movement_at: row.movement_at,
      quantity: row.quantity,
      purchase_price: row.purchase_price,
      total_amount: row.total_cost,
      partner_name: row.supplier_name,
      location: row.location,
      remaining_quantity: row.remaining_quantity,
      reference_number: row.id,
      note: row.note
    }));
    const sales = salesResult.rows.map((row) => ({
      movement_type: "sale",
      movement_at: row.movement_at,
      quantity: row.sale_quantity,
      sale_price: row.sale_price,
      total_amount: row.total_amount,
      fifo_cost: row.fifo_cost,
      profit: row.profit,
      reference_number: row.invoice_number,
      partner_name: row.customer_name,
      note: row.note
    }));
    const returns = returnsResult.rows.map((row) => ({
      movement_type: "return",
      movement_at: row.movement_at,
      quantity: row.sale_quantity,
      total_amount: row.amount,
      fifo_cost: row.fifo_cost_reversal,
      profit: row.profit_reversal * -1,
      reference_number: row.invoice_number,
      partner_name: row.customer_name,
      note: row.reason
    }));
    const adjustments = adjustmentsResult.rows.map((row) => ({
      movement_type: "adjustment",
      movement_at: row.movement_at,
      quantity: row.initial_quantity,
      purchase_price: row.purchase_price,
      total_amount: row.initial_quantity * row.purchase_price,
      location: row.location,
      remaining_quantity: row.remaining_quantity,
      reference_number: row.id,
      note: "Stock adjustment batch"
    }));

    const requestedType = filter.movementType;
    const movements = [...arrivals, ...sales, ...returns, ...adjustments]
      .filter((row) => !requestedType || row.movement_type === requestedType)
      .sort((a, b) => new Date(b.movement_at).getTime() - new Date(a.movement_at).getTime());

    return {
      product,
      summary: summaryResult.rows[0] ?? {
        current_stock: product.stock_quantity,
        remaining_stock_value: 0
      },
      batches: batchesResult.rows,
      arrivals,
      sales,
      returns,
      adjustments,
      movements
    };
  }

  async create(input: Required<
    Pick<
      ProductInput,
      | "name"
      | "categoryId"
      | "unit"
      | "purchasePrice"
      | "salePrice"
      | "stockQuantity"
      | "minimumStock"
    >
  > &
    ProductInput) {
    return withTransaction(async (client) => {
      const images = input.imageUrls ?? (input.imageUrl ? [input.imageUrl] : []);
      const unit = await this.canonicalUnit(client, input.unit);
      const code = input.code?.trim() || this.generateCode();
      const result = await client.query(
        `INSERT INTO products (
           code, name, category_id, brand, unit, purchase_price, sale_price,
           stock_quantity, minimum_stock, location, image_url, description
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *`,
        [
          code,
          input.name,
          input.categoryId,
          input.brand ?? null,
          unit,
          input.purchasePrice,
          input.salePrice,
          input.stockQuantity,
          input.minimumStock,
          input.location?.trim() || null,
          images[0] ?? null,
          input.description ?? null
        ]
      );
      const product = result.rows[0]!;
      await createInventoryBatch(client, {
        productId: product.id,
        quantity: input.stockQuantity,
        purchasePrice: input.purchasePrice,
        receivedAt: product.created_at,
        source: "OPENING"
      });
      await this.syncImages(client, product.id, images);
      return { ...product, image_urls: images };
    });
  }

  async update(id: string, input: ProductInput) {
    const mapping: Omit<Record<keyof ProductInput, string>, "imageUrls"> = {
      code: "code",
      name: "name",
      categoryId: "category_id",
      brand: "brand",
      unit: "unit",
      purchasePrice: "purchase_price",
      salePrice: "sale_price",
      stockQuantity: "stock_quantity",
      minimumStock: "minimum_stock",
      location: "location",
      imageUrl: "image_url",
      description: "description"
    };
    return withTransaction(async (client) => {
      const existingResult = await client.query<{
        stock_quantity: number;
        purchase_price: number;
      }>(
        `SELECT stock_quantity, purchase_price
         FROM products
         WHERE id = $1 AND is_active = TRUE
         FOR UPDATE`,
        [id]
      );
      const existing = existingResult.rows[0];
      if (!existing) return null;

      const { imageUrls, ...scalarInput } = input;
      if (scalarInput.unit) {
        scalarInput.unit = await this.canonicalUnit(client, scalarInput.unit);
      }
      const entries = Object.entries(scalarInput) as [
        keyof typeof scalarInput,
        unknown
      ][];

      let product;
      if (entries.length === 0) {
        const result = await client.query(
          "SELECT * FROM products WHERE id = $1 AND is_active = TRUE",
          [id]
        );
        product = result.rows[0] ?? null;
      } else {
        const values: unknown[] = [id];
        const set = entries.map(([key, value]) => {
          values.push(value ?? null);
          return `${mapping[key]} = $${values.length}`;
        });
        const result = await client.query(
          `UPDATE products SET ${set.join(", ")}
           WHERE id = $1 AND is_active = TRUE
           RETURNING *`,
          values
        );
        product = result.rows[0] ?? null;
      }

      if (!product) return null;
      if (input.stockQuantity !== undefined) {
        const difference = input.stockQuantity - existing.stock_quantity;
        if (difference > 0) {
          await createInventoryBatch(client, {
            productId: id,
            quantity: difference,
            purchasePrice: input.purchasePrice ?? existing.purchase_price,
            source: "ADJUSTMENT"
          });
        } else if (difference < 0) {
          await consumeFifo(client, id, Math.abs(difference));
        }
      }
      let savedImages = imageUrls;
      if (savedImages) {
        await this.syncImages(client, id, savedImages);
        await client.query("UPDATE products SET image_url = $2 WHERE id = $1", [
          id,
          savedImages[0] ?? null
        ]);
      } else {
        const imageResult = await client.query<{ image_url: string }>(
          "SELECT image_url FROM product_images WHERE product_id = $1 ORDER BY position",
          [id]
        );
        savedImages = imageResult.rows.map((row) => row.image_url);
      }
      return { ...product, image_url: savedImages[0] ?? null, image_urls: savedImages };
    });
  }

  async permanentDelete(id: string) {
    return withTransaction(async (client) => {
      const productResult = await client.query<{ id: string; name: string }>(
        "SELECT id, name FROM products WHERE id = $1 AND is_active = TRUE FOR UPDATE",
        [id]
      );
      const product = productResult.rows[0];
      if (!product) return null;

      const saleItemResult = await client.query<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM sale_items WHERE product_id = $1",
        [id]
      );
      if (Number(saleItemResult.rows[0]?.count ?? 0) > 0) {
        throw new AppError(
          409,
          "Bu mahsulot sotuv nakladnoylarida mavjud. Avval unga bog‘liq sotuv nakladnoylarini arxivdan ham butunlay o‘chiring.",
          "PRODUCT_HAS_SALES"
        );
      }

      // Kirim yozuvlari mahsulotsiz mazmunini yo‘qotadi, shuning uchun birga o‘chiriladi.
      await client.query("DELETE FROM purchases WHERE product_id = $1", [id]);
      await client.query("DELETE FROM products WHERE id = $1", [id]);
      return product;
    });
  }

  async bulkPermanentDelete(ids: string[]) {
    return withTransaction(async (client) => {
      const productsResult = await client.query<{ id: string; name: string }>(
        `SELECT id, name
         FROM products
         WHERE id = ANY($1::uuid[]) AND is_active = TRUE
         FOR UPDATE`,
        [ids]
      );
      this.ensureAllProductsFound(ids, productsResult.rows);

      const saleItemsResult = await client.query<{
        product_id: string;
        product_name: string;
      }>(
        `SELECT DISTINCT si.product_id, p.name AS product_name
         FROM sale_items si
         JOIN products p ON p.id = si.product_id
         WHERE si.product_id = ANY($1::uuid[])`,
        [ids]
      );

      if (saleItemsResult.rows.length > 0) {
        throw new AppError(
          409,
          "Tanlangan mahsulotlardan ayrimlari sotuv nakladnoylarida mavjud. Avval bog'liq sotuvlarni butunlay o'chiring.",
          "PRODUCTS_HAVE_SALES",
          saleItemsResult.rows
        );
      }

      await client.query("DELETE FROM purchases WHERE product_id = ANY($1::uuid[])", [ids]);
      await client.query("DELETE FROM products WHERE id = ANY($1::uuid[])", [ids]);

      return {
        deleted: productsResult.rows.length,
        products: productsResult.rows
      };
    });
  }

  async bulkUpdateLocation(ids: string[], location: string) {
    return withTransaction(async (client) => {
      const productsResult = await client.query<{ id: string }>(
        `SELECT id
         FROM products
         WHERE id = ANY($1::uuid[]) AND is_active = TRUE
         FOR UPDATE`,
        [ids]
      );
      this.ensureAllProductsFound(ids, productsResult.rows);

      const result = await client.query<{ id: string }>(
        `UPDATE products
         SET location = $2
         WHERE id = ANY($1::uuid[]) AND is_active = TRUE
         RETURNING id`,
        [ids, location]
      );
      return { updated: result.rows.length };
    });
  }

  async bulkUpdateCategory(ids: string[], categoryId: string) {
    return withTransaction(async (client) => {
      const categoryResult = await client.query<{ id: string }>(
        "SELECT id FROM categories WHERE id = $1",
        [categoryId]
      );
      if (!categoryResult.rows[0]) {
        throw new AppError(404, "Category not found", "CATEGORY_NOT_FOUND");
      }

      const productsResult = await client.query<{ id: string }>(
        `SELECT id
         FROM products
         WHERE id = ANY($1::uuid[]) AND is_active = TRUE
         FOR UPDATE`,
        [ids]
      );
      this.ensureAllProductsFound(ids, productsResult.rows);

      const result = await client.query<{ id: string }>(
        `UPDATE products
         SET category_id = $2
         WHERE id = ANY($1::uuid[]) AND is_active = TRUE
         RETURNING id`,
        [ids, categoryId]
      );
      return { updated: result.rows.length };
    });
  }

  async importRows(rows: ProductImportRow[], createdBy: string) {
    return withTransaction(async (client) => {
      const duplicateCodes = rows
        .map((row) => row.code?.toLowerCase())
        .filter((code): code is string => Boolean(code))
        .filter((code, index, all) => all.indexOf(code) !== index);

      if (duplicateCodes.length > 0) {
        throw new AppError(
          422,
          "Excel faylda bir xil mahsulot kodi takrorlangan",
          "DUPLICATE_IMPORT_CODES",
          [...new Set(duplicateCodes)]
        );
      }

      const categoryResult = await client.query<{
        id: string;
        name: string;
        slug: string;
      }>("SELECT id, name, slug FROM categories");
      const unitResult = await client.query<{ name: string }>(
        "SELECT name FROM measurement_units"
      );
      const categoryMap = new Map<string, string>();
      for (const category of categoryResult.rows) {
        categoryMap.set(category.name.toLowerCase(), category.id);
        categoryMap.set(category.slug.toLowerCase(), category.id);
      }

      const invalidCategories = rows
        .filter((row) => !categoryMap.has(row.category.toLowerCase()))
        .map((row) => ({ rowNumber: row.rowNumber, category: row.category }));

      if (invalidCategories.length > 0) {
        throw new AppError(
          422,
          "Excel faylda mavjud bo‘lmagan kategoriyalar bor",
          "IMPORT_CATEGORY_NOT_FOUND",
          invalidCategories
        );
      }

      const unitMap = new Map(
        unitResult.rows.map((unit) => [unit.name.toLowerCase(), unit.name])
      );
      const invalidUnits = rows
        .filter((row) => !unitMap.has(row.unit.toLowerCase()))
        .map((row) => ({ rowNumber: row.rowNumber, unit: row.unit }));

      if (invalidUnits.length > 0) {
        throw new AppError(
          422,
          "Excel faylda tizimda mavjud bo‘lmagan birliklar bor",
          "IMPORT_UNIT_NOT_FOUND",
          invalidUnits
        );
      }

      const importCodes = rows
        .map((row) => row.code?.toLowerCase())
        .filter((code): code is string => Boolean(code));
      const existingResult = importCodes.length
        ? await client.query<{ id: string; code: string }>(
            `SELECT id, code FROM products
             WHERE is_active = TRUE AND LOWER(code) = ANY($1::text[])`,
            [importCodes]
          )
        : { rows: [] };
      const existingProducts = new Map(
        existingResult.rows.map((row) => [row.code.toLowerCase(), row])
      );

      let created = 0;
      let updated = 0;
      let importedQuantity = 0;

      for (const row of rows) {
        const categoryId = categoryMap.get(row.category.toLowerCase())!;
        const unit = unitMap.get(row.unit.toLowerCase())!;
        const existing = row.code
          ? existingProducts.get(row.code.toLowerCase())
          : undefined;
        const code = row.code || this.generateCode();
        let productId: string;

        if (existing) {
          const productResult = await client.query<{ id: string }>(
            `UPDATE products SET
               code = $2,
               name = $3,
               category_id = $4,
               brand = $5,
               unit = $6,
               purchase_price = $7,
               sale_price = $8,
               stock_quantity = stock_quantity + $9,
              minimum_stock = $10,
               location = COALESCE($11, location),
               image_url = COALESCE($12, image_url),
               description = COALESCE($13, description),
               is_active = TRUE
             WHERE id = $1
             RETURNING id`,
            [
              existing.id,
              code,
              row.name,
              categoryId,
              null,
              unit,
              row.purchasePrice,
              row.salePrice,
              row.quantity,
              row.minimumStock,
              row.location ?? null,
              row.imageUrl ?? null,
              row.description ?? null
            ]
          );
          productId = productResult.rows[0]!.id;
          updated += 1;
        } else {
          const productResult = await client.query<{ id: string }>(
            `INSERT INTO products (
               code, name, category_id, brand, unit, purchase_price, sale_price,
               stock_quantity, minimum_stock, location, image_url, description, is_active
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,TRUE)
             RETURNING id`,
            [
              code,
              row.name,
              categoryId,
              null,
              unit,
              row.purchasePrice,
              row.salePrice,
              row.quantity,
              row.minimumStock,
              row.location ?? null,
              row.imageUrl ?? null,
              row.description ?? null
            ]
          );
          productId = productResult.rows[0]!.id;
          created += 1;
        }

        if (row.quantity > 0) {
          const purchaseResult = await client.query<{
            id: string;
            purchased_at: string;
          }>(
            `INSERT INTO purchases (
               supplier_id, product_id, quantity, purchase_price, total_cost,
               purchased_at, note, created_by
             ) VALUES (NULL,$1,$2,$3,$4,NOW(),$5,$6)
             RETURNING id, purchased_at`,
            [
              productId,
              row.quantity,
              row.purchasePrice,
              row.quantity * row.purchasePrice,
              `Excel import, qator ${row.rowNumber}`,
              createdBy
            ]
          );
          const purchase = purchaseResult.rows[0]!;
          await createInventoryBatch(client, {
            productId,
            purchaseId: purchase.id,
            quantity: row.quantity,
            purchasePrice: row.purchasePrice,
            receivedAt: purchase.purchased_at,
            source: "IMPORT"
          });
          importedQuantity += row.quantity;
        }

        if (row.imageUrl) {
          await this.syncImages(client, productId, [row.imageUrl]);
        }
      }

      return {
        totalRows: rows.length,
        created,
        updated,
        importedQuantity
      };
    });
  }

  private async syncImages(
    client: import("pg").PoolClient,
    productId: string,
    imageUrls: string[]
  ) {
    await client.query("DELETE FROM product_images WHERE product_id = $1", [productId]);
    for (const [index, imageUrl] of imageUrls.slice(0, 4).entries()) {
      await client.query(
        `INSERT INTO product_images (product_id, image_url, position)
         VALUES ($1, $2, $3)`,
        [productId, imageUrl, index + 1]
      );
    }
  }

  private async canonicalUnit(client: import("pg").PoolClient, unit: string) {
    const result = await client.query<{ name: string }>(
      "SELECT name FROM measurement_units WHERE LOWER(name) = LOWER($1)",
      [unit.trim()]
    );
    const found = result.rows[0];
    if (!found) {
      throw new AppError(
        422,
        "Mahsulot birligi topilmadi. Avval Sozlamalar bo‘limida birlikni qo‘shing.",
        "UNIT_NOT_FOUND"
      );
    }
    return found.name;
  }

  private ensureAllProductsFound(
    requestedIds: string[],
    products: Array<{ id: string }>
  ) {
    if (products.length !== requestedIds.length) {
      throw new AppError(
        404,
        "Tanlangan mahsulotlardan ayrimlari topilmadi",
        "PRODUCTS_NOT_FOUND"
      );
    }
  }

  private generateCode() {
    return `PRD-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
  }
}

export const productRepository = new ProductRepository();
