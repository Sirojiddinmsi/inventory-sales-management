import { z } from "zod";

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters")
  .regex(/[a-z]/, "Password must include a lowercase letter")
  .regex(/[A-Z]/, "Password must include an uppercase letter")
  .regex(/\d/, "Password must include a number");

export const loginSchema = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(72)
});

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().transform((value) => value.toLowerCase()),
  password: passwordSchema,
  role: z.enum(["ADMIN", "SELLER"]).default("SELLER")
});

export const userIdParamSchema = z.object({
  id: z.uuid()
});

export const userUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    email: z.email().transform((value) => value.toLowerCase()).optional(),
    role: z.enum(["ADMIN", "SELLER"]).optional(),
    isActive: z.boolean().optional()
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: "At least one field is required"
  });

export const resetPasswordSchema = z.object({
  newPassword: passwordSchema
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().transform((value) => value.toLowerCase()),
  profileImageUrl: z
    .string()
    .trim()
    .url()
    .max(2048)
    .nullable()
    .or(z.literal(""))
    .transform((value) => (value ? value : null))
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(8).max(72),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(8).max(72)
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match"
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
