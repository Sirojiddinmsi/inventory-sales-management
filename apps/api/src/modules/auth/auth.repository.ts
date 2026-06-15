import { query } from "../../config/database.js";

export type UserRecord = {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: "ADMIN" | "SELLER";
  is_active: boolean;
  profile_image_url: string | null;
  created_at: string;
  updated_at: string;
};

export class AuthRepository {
  async findByEmail(email: string) {
    const result = await query<UserRecord>(
      `SELECT id, name, email, password_hash, role, is_active, profile_image_url, created_at, updated_at
       FROM users WHERE email = $1`,
      [email]
    );
    return result.rows[0] ?? null;
  }

  async findById(id: string) {
    const result = await query<UserRecord>(
      `SELECT id, name, email, password_hash, role, is_active, profile_image_url, created_at, updated_at
       FROM users WHERE id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  async listUsers() {
    const result = await query<UserRecord>(
      `SELECT id, name, email, password_hash, role, is_active, profile_image_url, created_at, updated_at
       FROM users
       ORDER BY created_at DESC`
    );
    return result.rows;
  }

  async countUsers() {
    const result = await query<{ count: number }>("SELECT COUNT(*)::int AS count FROM users");
    return result.rows[0]?.count ?? 0;
  }

  async countActiveAdmins(excludeId?: string) {
    const params: string[] = [];
    const conditions = [`role = 'ADMIN'`, "is_active = TRUE"];

    if (excludeId) {
      params.push(excludeId);
      conditions.push(`id <> $${params.length}`);
    }

    const result = await query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM users
       WHERE ${conditions.join(" AND ")}`,
      params
    );
    return result.rows[0]?.count ?? 0;
  }

  async create(input: {
    name: string;
    email: string;
    passwordHash: string;
    role: "ADMIN" | "SELLER";
  }) {
    const result = await query<Omit<UserRecord, "password_hash">>(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role, is_active, profile_image_url, created_at, updated_at`,
      [input.name, input.email, input.passwordHash, input.role]
    );
    return result.rows[0]!;
  }

  async updateUser(
    id: string,
    input: {
      name?: string;
      email?: string;
      role?: "ADMIN" | "SELLER";
      isActive?: boolean;
    }
  ) {
    const fields: string[] = [];
    const params: Array<string | boolean> = [];

    if (input.name !== undefined) {
      params.push(input.name);
      fields.push(`name = $${params.length}`);
    }
    if (input.email !== undefined) {
      params.push(input.email);
      fields.push(`email = $${params.length}`);
    }
    if (input.role !== undefined) {
      params.push(input.role);
      fields.push(`role = $${params.length}`);
    }
    if (input.isActive !== undefined) {
      params.push(input.isActive);
      fields.push(`is_active = $${params.length}`);
    }

    params.push(id);

    const result = await query<Omit<UserRecord, "password_hash">>(
      `UPDATE users
       SET ${fields.join(", ")}
       WHERE id = $${params.length}
       RETURNING id, name, email, role, is_active, profile_image_url, created_at, updated_at`,
      params
    );
    return result.rows[0] ?? null;
  }

  async updateProfile(
    id: string,
    input: {
      name: string;
      email: string;
      profileImageUrl: string | null;
    }
  ) {
    const result = await query<Omit<UserRecord, "password_hash">>(
      `UPDATE users
       SET name = $1,
           email = $2,
           profile_image_url = $3
       WHERE id = $4
       RETURNING id, name, email, role, is_active, profile_image_url, created_at, updated_at`,
      [input.name, input.email, input.profileImageUrl, id]
    );
    return result.rows[0] ?? null;
  }

  async setPassword(id: string, passwordHash: string) {
    const result = await query<Omit<UserRecord, "password_hash">>(
      `UPDATE users
       SET password_hash = $1
       WHERE id = $2
       RETURNING id, name, email, role, is_active, profile_image_url, created_at, updated_at`,
      [passwordHash, id]
    );
    return result.rows[0] ?? null;
  }

  async deleteUser(id: string) {
    const result = await query<{ id: string }>(
      `DELETE FROM users
       WHERE id = $1
       RETURNING id`,
      [id]
    );
    return result.rows[0] ?? null;
  }
}

export const authRepository = new AuthRepository();
