import type { Request, Response } from "express";
import { env } from "../../config/env.js";
import { productImageStorage } from "./product-image.storage.js";
import { productService } from "./product.service.js";

export class ProductController {
  async list(req: Request, res: Response) {
    const result = await productService.list(req.query as never);

    if (env.NODE_ENV !== "production") {
      req.log.info(
        {
          page: result.meta.page,
          limit: result.meta.limit,
          total: result.meta.total,
          totalPages: result.meta.totalPages,
          ids: result.data.map((product) => product.id),
          names: result.data.map((product) => product.name)
        },
        "Products list debug"
      );
    }

    res.json(result);
  }

  async get(req: Request, res: Response) {
    res.json(await productService.get(String(req.params.id)));
  }

  async create(req: Request, res: Response) {
    res.status(201).json(await productService.create(req.body));
  }

  async update(req: Request, res: Response) {
    res.json(
      await productService.update(
        String(req.params.id),
        req.body,
        req.user!.id
      )
    );
  }

  async correctFifoCost(req: Request, res: Response) {
    res.json(
      await productService.correctRemainingFifoCost(
        String(req.params.id),
        req.body.correctedUnitCost,
        req.user!.id,
        req.body.note
      )
    );
  }

  async delete(req: Request, res: Response) {
    await productService.delete(String(req.params.id));
    res.status(204).send();
  }

  async bulkDelete(req: Request, res: Response) {
    res.json(await productService.bulkDelete(req.body.ids));
  }

  async bulkMove(req: Request, res: Response) {
    res.json(await productService.bulkMove(req.body.ids, req.body.location));
  }

  async bulkChangeCategory(req: Request, res: Response) {
    res.json(await productService.bulkChangeCategory(req.body.ids, req.body.categoryId));
  }

  async exportSelected(req: Request, res: Response) {
    const buffer = await productService.exportSelected(req.body.ids);
    res
      .setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      )
      .setHeader("Content-Disposition", 'attachment; filename="selected-products.xlsx"')
      .send(buffer);
  }

  async importRows(req: Request, res: Response) {
    res.status(201).json(await productService.importRows(req.body.rows, req.user!.id));
  }

  async uploadImages(req: Request, res: Response) {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const baseUrl = (env.PUBLIC_API_URL ?? `${req.protocol}://${req.get("host")}`)
      .replace(/\/$/, "");
    const urls = await productImageStorage.save(files, req.user!.id, baseUrl);
    res.status(201).json({
      urls
    });
  }

  async importTemplate(_req: Request, res: Response) {
    const buffer = await productService.importTemplate();
    res
      .setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      )
      .setHeader("Content-Disposition", 'attachment; filename="mahsulot-import-shablon.xlsx"')
      .send(buffer);
  }

  async history(req: Request, res: Response) {
    res.json(await productService.history(String(req.params.id), req.query as never));
  }

  async historyExcel(req: Request, res: Response) {
    const buffer = await productService.historyExcel(String(req.params.id), req.query as never);
    res
      .setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      )
      .setHeader("Content-Disposition", 'attachment; filename="product-history.xlsx"')
      .send(buffer);
  }
}

export const productController = new ProductController();
