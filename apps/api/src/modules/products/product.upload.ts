import { mkdirSync } from "node:fs";
import { extname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import multer from "multer";
import { AppError } from "../../shared/errors/AppError.js";

const uploadDirectory = resolve(process.cwd(), "uploads", "products");
mkdirSync(uploadDirectory, { recursive: true });

const allowedMimeTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"]
]);

export const productImageUpload = multer({
  storage: multer.diskStorage({
    destination: uploadDirectory,
    filename: (_req, file, callback) => {
      const extension =
        allowedMimeTypes.get(file.mimetype) || extname(file.originalname).toLowerCase();
      callback(null, `${randomUUID()}${extension}`);
    }
  }),
  limits: {
    files: 4,
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (_req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      callback(
        new AppError(
          422,
          "Faqat JPG, PNG yoki WebP rasmlarini yuklash mumkin",
          "INVALID_IMAGE_TYPE"
        )
      );
      return;
    }
    callback(null, true);
  }
});
