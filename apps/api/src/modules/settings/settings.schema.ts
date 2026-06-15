import { z } from "zod";

export const settingsUpdateSchema = z.object({
  shopName: z.string().trim().min(2).max(255).optional(),
  logoUrl: z.url().nullish(),
  phone: z.string().trim().max(40).nullish(),
  address: z.string().trim().max(1000).nullish(),
  currency: z.string().trim().min(3).max(10).optional()
});

