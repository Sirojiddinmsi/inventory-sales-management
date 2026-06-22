import type { Request, Response } from "express";
import { supplierReturnService } from "./supplier-return.service.js";

export class SupplierReturnController {
  async list(req: Request, res: Response) {
    res.json(await supplierReturnService.list(req.query as never));
  }

  async create(req: Request, res: Response) {
    res.status(201).json(await supplierReturnService.create(req.body, req.user!.id));
  }
}

export const supplierReturnController = new SupplierReturnController();
