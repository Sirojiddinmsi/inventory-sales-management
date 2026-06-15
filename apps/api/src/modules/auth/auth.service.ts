import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../../config/env.js";
import { AppError } from "../../shared/errors/AppError.js";
import { authRepository, type UserRecord } from "./auth.repository.js";
import type {
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  UpdateProfileInput,
  UserUpdateInput
} from "./auth.schema.js";

type PublicUser = Omit<UserRecord, "password_hash">;

export class AuthService {
  async login(input: LoginInput) {
    const user = await authRepository.findByEmail(input.email);

    if (!user || !user.is_active || !(await bcrypt.compare(input.password, user.password_hash))) {
      throw new AppError(401, "Email or password is incorrect", "INVALID_CREDENTIALS");
    }

    return {
      token: this.signToken(user),
      user: this.sanitizeUser(user)
    };
  }

  async bootstrapRegister(input: RegisterInput) {
    if ((await authRepository.countUsers()) > 0) {
      throw new AppError(
        403,
        "Public registration is disabled after the first user",
        "REGISTRATION_DISABLED"
      );
    }

    return this.createUser({ ...input, role: "ADMIN" });
  }

  async createUser(input: RegisterInput) {
    await this.ensureEmailAvailable(input.email);

    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await authRepository.create({
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role
    });
    return this.sanitizeUser(user);
  }

  async me(userId: string) {
    const user = await this.getRequiredUser(userId);
    if (!user.is_active) {
      throw new AppError(403, "This account is inactive", "ACCOUNT_INACTIVE");
    }
    return this.sanitizeUser(user);
  }

  async listUsers() {
    const users = await authRepository.listUsers();
    return users.map((user) => this.sanitizeUser(user));
  }

  async updateUser(actorId: string, targetId: string, input: UserUpdateInput) {
    const current = await this.getRequiredUser(targetId);

    if (actorId === targetId && (input.role !== undefined || input.isActive !== undefined)) {
      throw new AppError(
        400,
        "Use profile settings for your own account changes",
        "SELF_MANAGEMENT_RESTRICTED"
      );
    }

    if (input.email && input.email !== current.email) {
      await this.ensureEmailAvailable(input.email, targetId);
    }

    if (current.role === "ADMIN") {
      if (input.role === "SELLER" && current.is_active) {
        await this.ensureAnotherActiveAdminExists(targetId);
      }
      if (input.isActive === false) {
        await this.ensureAnotherActiveAdminExists(targetId);
      }
    }

    const updated = await authRepository.updateUser(targetId, input);
    if (!updated) {
      throw new AppError(404, "User not found", "USER_NOT_FOUND");
    }
    return this.sanitizeUser(updated);
  }

  async resetPassword(actorId: string, targetId: string, input: ResetPasswordInput) {
    if (actorId === targetId) {
      throw new AppError(
        400,
        "Use the change password form for your own account",
        "USE_SELF_PASSWORD_CHANGE"
      );
    }

    await this.getRequiredUser(targetId);
    const passwordHash = await bcrypt.hash(input.newPassword, 12);
    const updated = await authRepository.setPassword(targetId, passwordHash);

    if (!updated) {
      throw new AppError(404, "User not found", "USER_NOT_FOUND");
    }
    return this.sanitizeUser(updated);
  }

  async deleteUser(actorId: string, targetId: string) {
    if (actorId === targetId) {
      throw new AppError(400, "You cannot delete your own account", "SELF_DELETE_FORBIDDEN");
    }

    const current = await this.getRequiredUser(targetId);
    if (current.role === "ADMIN" && current.is_active) {
      await this.ensureAnotherActiveAdminExists(targetId);
    }

    try {
      const deleted = await authRepository.deleteUser(targetId);
      if (!deleted) {
        throw new AppError(404, "User not found", "USER_NOT_FOUND");
      }
      return deleted;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        409,
        "This user has related records and cannot be deleted. Deactivate the account instead.",
        "USER_DELETE_BLOCKED"
      );
    }
  }

  async updateProfile(userId: string, input: UpdateProfileInput) {
    const current = await this.getRequiredUser(userId);
    if (!current.is_active) {
      throw new AppError(403, "This account is inactive", "ACCOUNT_INACTIVE");
    }

    if (input.email !== current.email) {
      await this.ensureEmailAvailable(input.email, userId);
    }

    const updated = await authRepository.updateProfile(userId, input);
    if (!updated) {
      throw new AppError(404, "User not found", "USER_NOT_FOUND");
    }

    return {
      token: this.signToken(updated),
      user: this.sanitizeUser(updated)
    };
  }

  async changePassword(userId: string, input: ChangePasswordInput) {
    const current = await this.getRequiredUser(userId);

    if (!(await bcrypt.compare(input.currentPassword, current.password_hash))) {
      throw new AppError(400, "Current password is incorrect", "INVALID_CURRENT_PASSWORD");
    }

    if (input.currentPassword === input.newPassword) {
      throw new AppError(
        400,
        "New password must be different from the current password",
        "PASSWORD_UNCHANGED"
      );
    }

    const passwordHash = await bcrypt.hash(input.newPassword, 12);
    await authRepository.setPassword(userId, passwordHash);

    return { success: true };
  }

  private signToken(user: { id: string; email: string; role: "ADMIN" | "SELLER" }) {
    return jwt.sign(
      { email: user.email, role: user.role },
      env.JWT_SECRET,
      {
        subject: user.id,
        expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"]
      }
    );
  }

  private sanitizeUser(user: PublicUser | UserRecord) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      is_active: user.is_active,
      profile_image_url: user.profile_image_url,
      created_at: user.created_at,
      updated_at: user.updated_at
    };
  }

  private async ensureEmailAvailable(email: string, excludeId?: string) {
    const existing = await authRepository.findByEmail(email);
    if (existing && existing.id !== excludeId) {
      throw new AppError(409, "Email is already registered", "EMAIL_EXISTS");
    }
  }

  private async getRequiredUser(userId: string) {
    const user = await authRepository.findById(userId);
    if (!user) {
      throw new AppError(404, "User not found", "USER_NOT_FOUND");
    }
    return user;
  }

  private async ensureAnotherActiveAdminExists(excludedUserId: string) {
    const activeAdmins = await authRepository.countActiveAdmins(excludedUserId);
    if (activeAdmins < 1) {
      throw new AppError(
        400,
        "At least one active administrator must remain in the system",
        "LAST_ADMIN_FORBIDDEN"
      );
    }
  }
}

export const authService = new AuthService();
