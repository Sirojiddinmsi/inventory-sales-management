import type { Request, Response } from "express";
import { unitService } from "./unit.service.js";

export class UnitController {
  async list(_req: Request, res: Response) {
    res.json(await unitService.list());
  }

  async create(req: Request, res: Response) {
    res.status(201).json(await unitService.create(req.body.name));
  }

  async delete(req: Request, res: Response) {
    await unitService.delete(String(req.params.id));
    res.status(204).send();
  }
}

export const unitController = new UnitController();
