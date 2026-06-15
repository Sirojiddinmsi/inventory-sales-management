import type { Request, Response } from "express";
import { saleService } from "./sale.service.js";

export class SaleController {
  async list(req: Request, res: Response) {
    res.json(await saleService.list(req.query as never));
  }

  async get(req: Request, res: Response) {
    res.json(await saleService.get(String(req.params.id)));
  }

  async create(req: Request, res: Response) {
    res.status(201).json(await saleService.create(req.body, req.user!.id));
  }

  async update(req: Request, res: Response) {
    res.json(await saleService.update(String(req.params.id), req.body, req.user!.id));
  }

  async returnItems(req: Request, res: Response) {
    res.status(201).json(
      await saleService.returnItems(String(req.params.id), req.body, req.user!.id)
    );
  }

  async archive(req: Request, res: Response) {
    res.json(
      await saleService.archive(
        String(req.params.id),
        req.body.reason,
        req.user!.id
      )
    );
  }

  async restore(req: Request, res: Response) {
    res.json(await saleService.restore(String(req.params.id)));
  }

  async purge(req: Request, res: Response) {
    await saleService.purge(String(req.params.id));
    res.status(204).send();
  }

  async bulkDelete(req: Request, res: Response) {
    res.json(await saleService.bulkDelete(req.body, req.user!.id));
  }

  async receipt(req: Request, res: Response) {
    const receipt = await saleService.receipt(String(req.params.id));
    res
      .setHeader("Content-Type", "application/pdf")
      .setHeader("Content-Disposition", `attachment; filename="${receipt.filename}"`)
      .send(receipt.buffer);
  }
}

export const saleController = new SaleController();
