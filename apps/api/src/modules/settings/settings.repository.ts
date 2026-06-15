import { query } from "../../config/database.js";

type SettingsInput = {
  shopName?: string;
  logoUrl?: string | null;
  phone?: string | null;
  address?: string | null;
  currency?: string;
};

export class SettingsRepository {
  async get() {
    const result = await query(
      `SELECT id, shop_name, logo_url, phone, address, currency, updated_at
       FROM settings WHERE id = 1`
    );
    return result.rows[0];
  }

  async update(input: SettingsInput) {
    const mapping: Record<keyof SettingsInput, string> = {
      shopName: "shop_name",
      logoUrl: "logo_url",
      phone: "phone",
      address: "address",
      currency: "currency"
    };
    const entries = Object.entries(input) as [keyof SettingsInput, unknown][];
    if (entries.length === 0) return this.get();

    const values: unknown[] = [];
    const set = entries.map(([key, value]) => {
      values.push(value ?? null);
      return `${mapping[key]} = $${values.length}`;
    });
    const result = await query(
      `UPDATE settings SET ${set.join(", ")} WHERE id = 1 RETURNING *`,
      values
    );
    return result.rows[0];
  }
}

export const settingsRepository = new SettingsRepository();

