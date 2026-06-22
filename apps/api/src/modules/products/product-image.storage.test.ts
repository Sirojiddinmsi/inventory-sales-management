import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { AppError } from "../../shared/errors/AppError.js";
import { processProductImage } from "./product-image.processing.js";

describe("processProductImage", () => {
  it("normalizes and resizes uploaded images to webp", async () => {
    const input = await sharp({
      create: {
        width: 2400,
        height: 1200,
        channels: 4,
        background: { r: 40, g: 100, b: 220, alpha: 0.8 }
      }
    }).png().toBuffer();

    const output = await processProductImage(input);

    expect(output.info.format).toBe("webp");
    expect(output.info.width).toBe(1600);
    expect(output.info.height).toBe(800);
    expect(output.data.length).toBeLessThan(2 * 1024 * 1024);
  });

  it("rejects invalid image content", async () => {
    await expect(processProductImage(Buffer.from("not-an-image"))).rejects.toMatchObject<
      Partial<AppError>
    >({ code: "INVALID_IMAGE_CONTENT", statusCode: 422 });
  });
});
