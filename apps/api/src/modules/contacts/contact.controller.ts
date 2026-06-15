import type { Request, Response } from "express";
import { contactService } from "./contact.service.js";

const kind = (req: Request) => req.baseUrl.endsWith("/suppliers") ? "suppliers" : "customers";

export class ContactController {
  async list(req: Request, res: Response) {
    res.json(await contactService.list(kind(req), req.query as never));
  }

  async create(req: Request, res: Response) {
    res.status(201).json(await contactService.create(kind(req), req.body));
  }

  async update(req: Request, res: Response) {
    res.json(await contactService.update(kind(req), String(req.params.id), req.body));
  }

  async delete(req: Request, res: Response) {
    await contactService.delete(kind(req), String(req.params.id));
    res.status(204).send();
  }
}

export const contactController = new ContactController();
