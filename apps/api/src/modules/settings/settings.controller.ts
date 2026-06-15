import type { Request, Response } from "express";
import { settingsRepository } from "./settings.repository.js";

export class SettingsController {
  async get(_req: Request, res: Response) {
    res.json(await settingsRepository.get());
  }

  async update(req: Request, res: Response) {
    res.json(await settingsRepository.update(req.body));
  }
}

export const settingsController = new SettingsController();

