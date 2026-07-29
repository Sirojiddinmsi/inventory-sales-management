import type { Request, Response } from "express";
import { purchaseService } from "./purchase.service.js";

export class PurchaseController {
  async list(req: Request, res: Response) {
    res.json(await purchaseService.list(req.query as never));
  }

  async create(req: Request, res: Response) {
    res.status(201).json(await purchaseService.create(req.body, req.user!.id));
  }

  async bulkCreate(req: Request, res: Response) {
    res.status(201).json(await purchaseService.bulkCreate(req.body.rows, req.user!.id));
  }

  async importRows(req: Request, res: Response) {
    res.status(201).json(await purchaseService.importRows(req.body.rows, req.user!.id));
  }

  async update(req: Request, res: Response) {
    res.json(await purchaseService.update(req.params.id as string, req.body, req.user!.id));
  }

  async updateDocument(req: Request, res: Response) {
    res.json(await purchaseService.updateDocument(
      req.params.id as string,
      req.body.rows,
      req.user!.id
    ));
  }

  async remove(req: Request, res: Response) {
    res.json(await purchaseService.remove(req.params.id as string, req.user!.id));
  }

  async importTemplate(_req: Request, res: Response) {
    const buffer = await purchaseService.importTemplate();
    res
      .setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      )
      .setHeader("Content-Disposition", 'attachment; filename="kirim-import-shablon.xlsx"')
      .send(buffer);
  }

  async exportPdf(req: Request, res: Response) {
    const file = await purchaseService.exportPdf(String(req.params.id));
    res
      .setHeader("Content-Type", "application/pdf")
      .setHeader("Content-Disposition", `attachment; filename="${file.filename}"`)
      .send(file.buffer);
  }

  async exportExcel(req: Request, res: Response) {
    const file = await purchaseService.exportExcel(String(req.params.id));
    res
      .setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      )
      .setHeader("Content-Disposition", `attachment; filename="${file.filename}"`)
      .send(file.buffer);
  }
}

export const purchaseController = new PurchaseController();
