import type { Request, Response } from "express";
import { categoryService } from "./category.service.js";

export class CategoryController {
  async list(req: Request, res: Response) {
    res.json(await categoryService.list(req.query as never));
  }

  async get(req: Request, res: Response) {
    res.json(await categoryService.get(String(req.params.id)));
  }

  async create(req: Request, res: Response) {
    res.status(201).json(await categoryService.create(req.body));
  }

  async update(req: Request, res: Response) {
    res.json(await categoryService.update(String(req.params.id), req.body));
  }

  async delete(req: Request, res: Response) {
    await categoryService.delete(String(req.params.id));
    res.status(204).send();
  }
}

export const categoryController = new CategoryController();
