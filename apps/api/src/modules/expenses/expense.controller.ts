import type { Request, Response } from "express";
import { expenseService } from "./expense.service.js";

export class ExpenseController {
  async list(req: Request, res: Response) {
    res.json(await expenseService.list(req.query as never));
  }

  async create(req: Request, res: Response) {
    res.status(201).json(await expenseService.create(req.body, req.user!.id));
  }

  async update(req: Request, res: Response) {
    res.json(await expenseService.update(String(req.params.id), req.body));
  }

  async delete(req: Request, res: Response) {
    await expenseService.delete(String(req.params.id));
    res.status(204).send();
  }
}

export const expenseController = new ExpenseController();
