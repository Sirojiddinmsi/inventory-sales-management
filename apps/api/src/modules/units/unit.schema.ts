import { z } from "zod";

export const unitCreateSchema = z.object({
  name: z.string().trim().min(1).max(40)
});

export const unitIdSchema = z.object({
  id: z.uuid()
});
