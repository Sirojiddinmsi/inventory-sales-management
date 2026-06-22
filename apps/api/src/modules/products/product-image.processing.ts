import sharp from "sharp";
import { AppError } from "../../shared/errors/AppError.js";

const MAX_STORED_IMAGE_SIZE = 2 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1600;

export async function processProductImage(buffer: Buffer) {
  try {
    const output = await sharp(buffer, {
      failOn: "error",
      limitInputPixels: 40_000_000
    })
      .rotate()
      .resize({
        width: MAX_IMAGE_DIMENSION,
        height: MAX_IMAGE_DIMENSION,
        fit: "inside",
        withoutEnlargement: true
      })
      .webp({ quality: 82, alphaQuality: 90, effort: 4 })
      .toBuffer({ resolveWithObject: true });

    if (!output.info.width || !output.info.height || output.data.length > MAX_STORED_IMAGE_SIZE) {
      throw new AppError(
        422,
        "Siqilgandan keyin rasm hajmi 2 MB dan oshmasligi kerak",
        "IMAGE_TOO_LARGE_AFTER_PROCESSING"
      );
    }
    return output;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      422,
      "Rasm fayli buzilgan yoki formati qo‘llab-quvvatlanmaydi",
      "INVALID_IMAGE_CONTENT"
    );
  }
}
