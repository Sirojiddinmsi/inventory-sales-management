import type { Request, Response } from "express";
import { reportService } from "./report.service.js";

export class ReportController {
  async get(req: Request, res: Response) {
    res.json(await reportService.get(req.query));
  }

  async excel(req: Request, res: Response) {
    const buffer = await reportService.excel(req.query);
    res
      .setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      )
      .setHeader("Content-Disposition", 'attachment; filename="sales-report.xlsx"')
      .send(buffer);
  }
}

export const reportController = new ReportController();

