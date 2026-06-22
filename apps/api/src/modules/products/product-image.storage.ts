import { query } from "../../config/database.js";
import { AppError } from "../../shared/errors/AppError.js";
import { processProductImage } from "./product-image.processing.js";

type StoredImage = {
  id: string;
  content_type: string;
  data: Buffer;
  byte_size: number;
};

export class ProductImageStorage {
  async save(files: Express.Multer.File[], createdBy: string, publicApiUrl: string) {
    if (!files.length) {
      throw new AppError(422, "At least one image is required", "IMAGE_REQUIRED");
    }

    const urls: string[] = [];
    for (const file of files) {
      const output = await processProductImage(file.buffer);

      const result = await query<{ id: string }>(
        `INSERT INTO product_image_files (
           content_type, data, byte_size, width, height, original_name, created_by
         ) VALUES ('image/webp',$1,$2,$3,$4,$5,$6)
         RETURNING id`,
        [
          output.data,
          output.data.length,
          output.info.width,
          output.info.height,
          file.originalname.slice(0, 255),
          createdBy
        ]
      );
      urls.push(`${publicApiUrl}/media/product-images/${result.rows[0]!.id}`);
    }
    return urls;
  }

  async find(id: string) {
    const result = await query<StoredImage>(
      `SELECT id, content_type, data, byte_size
       FROM product_image_files
       WHERE id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  async purgeOrphans() {
    const result = await query(
      `DELETE FROM product_image_files image_file
       WHERE image_file.created_at < NOW() - INTERVAL '24 hours'
         AND NOT EXISTS (
           SELECT 1
           FROM product_images pi
           WHERE pi.image_url LIKE '%/media/product-images/' || image_file.id::text
         )
         AND NOT EXISTS (
           SELECT 1
           FROM products p
           WHERE p.image_url LIKE '%/media/product-images/' || image_file.id::text
         )
       RETURNING id`
    );
    return result.rowCount ?? 0;
  }
}

export const productImageStorage = new ProductImageStorage();
