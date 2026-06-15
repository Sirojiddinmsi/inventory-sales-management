import type { Request, Response } from "express";
import { dashboardRepository } from "./dashboard.repository.js";

export class DashboardController {
  async summary(_req: Request, res: Response) {
    res.json(await dashboardRepository.summary());
  }
}

export const dashboardController = new DashboardController();

