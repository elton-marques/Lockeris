import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from '../db.js';

const directory = join(dirname(fileURLToPath(import.meta.url)), '../../migrations');
const client = await pool.connect();
try {
  await client.query('SELECT pg_advisory_lock(881234)');
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  for (const filename of (await readdir(directory)).filter(x => x.endsWith('.sql')).sort()) {
    const { rowCount } = await client.query('SELECT 1 FROM schema_migrations WHERE name=$1', [filename]);
    if (rowCount) continue;
    await client.query('BEGIN');
    try {
      await client.query(await readFile(join(directory, filename), 'utf8'));
      await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [filename]);
      await client.query('COMMIT');
      process.stdout.write(`Aplicada ${filename}\n`);
    } catch (error) { await client.query('ROLLBACK'); throw error; }
  }
} finally { await client.query('SELECT pg_advisory_unlock(881234)'); client.release(); await pool.end(); }
