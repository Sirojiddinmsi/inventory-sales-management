import type { Request, Response } from "express";
import { AppError } from "../../shared/errors/AppError.js";
import { productImageStorage } from "./product-image.storage.js";

export class ProductImageController {
  async show(req: Request, res: Response) {
    const image = await productImageStorage.find(String(req.params.id));
    if (!image) throw new AppError(404, "Image not found", "IMAGE_NOT_FOUND");

    res
      .setHeader("Content-Type", image.content_type)
      .setHeader("Content-Length", String(image.byte_size))
      .setHeader("Cache-Control", "public, max-age=31536000, immutable")
      .setHeader("Cross-Origin-Resource-Policy", "cross-origin")
      .send(image.data);
  }
}

export const productImageController = new ProductImageController();
