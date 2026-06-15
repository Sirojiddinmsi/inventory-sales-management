import pg, { type PoolClient, type QueryResultRow } from "pg";
import { env } from "./env.js";

const { Pool, types } = pg;

// PostgreSQL NUMERIC values are returned as strings by default.
types.setTypeParser(1700, (value) => Number(value));
types.setTypeParser(20, (value) => Number(value));

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000
});

export async function query<T extends QueryResultRow>(
  text: string,
  values: unknown[] = []
) {
  return pool.query<T>(text, values);
}

export async function withTransaction<T>(
  operation: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

