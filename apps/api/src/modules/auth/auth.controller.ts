import type { Request, Response } from "express";
import { authService } from "./auth.service.js";

export class AuthController {
  async login(req: Request, res: Response) {
    res.json(await authService.login(req.body));
  }

  async register(req: Request, res: Response) {
    res.status(201).json(await authService.bootstrapRegister(req.body));
  }

  async createUser(req: Request, res: Response) {
    res.status(201).json(await authService.createUser(req.body));
  }

  async me(req: Request, res: Response) {
    res.json({ user: await authService.me(req.user!.id) });
  }

  async listUsers(_req: Request, res: Response) {
    res.json(await authService.listUsers());
  }

  async updateUser(req: Request, res: Response) {
    res.json(await authService.updateUser(req.user!.id, req.params.id as string, req.body));
  }

  async resetPassword(req: Request, res: Response) {
    res.json(await authService.resetPassword(req.user!.id, req.params.id as string, req.body));
  }

  async deleteUser(req: Request, res: Response) {
    res.json(await authService.deleteUser(req.user!.id, req.params.id as string));
  }

  async updateProfile(req: Request, res: Response) {
    res.json(await authService.updateProfile(req.user!.id, req.body));
  }

  async changePassword(req: Request, res: Response) {
    res.json(await authService.changePassword(req.user!.id, req.body));
  }
}

export const authController = new AuthController();
