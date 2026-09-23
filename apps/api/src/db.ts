import pg from 'pg';
import { createHash } from 'node:crypto';

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 20 });
export type Client = pg.PoolClient;
export async function transaction<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
export function hash(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex'); }
export function fail(statusCode: number, code: string, message: string): never {
  throw Object.assign(new Error(message), { statusCode, code });
}
export async function one<T = Record<string, unknown>>(client: Client, sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await client.query(sql, params);
  if (!rows[0]) fail(404, 'NAO_ENCONTRADO', 'Registro não encontrado');
  return rows[0] as T;
}
