import type { Request, Response } from "express";
import { debtService } from "./debt.service.js";

export class DebtController {
  async list(req: Request, res: Response) {
    res.json(await debtService.list(req.query as never));
  }

  async get(req: Request, res: Response) {
    res.json(await debtService.get(String(req.params.id)));
  }

  async pay(req: Request, res: Response) {
    res.status(201).json(await debtService.pay(String(req.params.id), req.body, req.user!.id));
  }

  async archive(req: Request, res: Response) {
    res.json(
      await debtService.archive(
        String(req.params.id),
        req.body.reason,
        req.user!.id
      )
    );
  }

  async restore(req: Request, res: Response) {
    res.json(await debtService.restore(String(req.params.id)));
  }

  async purge(req: Request, res: Response) {
    await debtService.purge(String(req.params.id));
    res.status(204).send();
  }
}

export const debtController = new DebtController();
