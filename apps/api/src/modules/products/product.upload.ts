import { mkdirSync } from "node:fs";
import { extname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import multer from "multer";
import { env } from "../../config/env.js";
import { AppError } from "../../shared/errors/AppError.js";

const uploadDirectory = resolve(process.cwd(), "uploads", "products");
mkdirSync(uploadDirectory, { recursive: true });

const allowedMimeTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"]
]);

export const productImageUpload = multer({
  storage: env.IMAGEKIT_PRIVATE_KEY
    ? multer.memoryStorage()
    : multer.diskStorage({
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

type ImageKitUploadResponse = {
  url?: string;
};

async function uploadToImageKit(file: Express.Multer.File) {
  const form = new FormData();
  const extension =
    allowedMimeTypes.get(file.mimetype) || extname(file.originalname).toLowerCase();

  const fileBytes = Uint8Array.from(file.buffer);
  form.append("file", new Blob([fileBytes], { type: file.mimetype }), file.originalname);
  form.append("fileName", `${randomUUID()}${extension}`);
  form.append("folder", "/tikuv-market/products");
  form.append("useUniqueFileName", "true");

  const authorization = Buffer.from(`${env.IMAGEKIT_PRIVATE_KEY}:`).toString("base64");
  const response = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
    method: "POST",
    headers: {
      Authorization: `Basic ${authorization}`
    },
    body: form
  });
  const result = (await response.json().catch(() => ({}))) as ImageKitUploadResponse;

  if (!response.ok || !result.url) {
    throw new AppError(
      502,
      "Rasmni ImageKit xizmatiga yuklab bo'lmadi",
      "IMAGEKIT_UPLOAD_FAILED",
      result
    );
  }

  return result.url;
}

export async function saveProductImages(files: Express.Multer.File[], baseUrl: string) {
  if (env.IMAGEKIT_PRIVATE_KEY) {
    return Promise.all(files.map(uploadToImageKit));
  }

  return files.map((file) => `${baseUrl}/uploads/products/${file.filename}`);
}
