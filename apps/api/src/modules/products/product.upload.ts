import multer from "multer";
import { AppError } from "../../shared/errors/AppError.js";

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export const productImageUpload = multer({
  storage: multer.memoryStorage(),
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
