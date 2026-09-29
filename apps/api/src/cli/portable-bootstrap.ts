import argon2 from 'argon2';
import { pool } from '../db.js';

// Only the portable launcher calls this CLI, after the regular migrations.
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('LOCK TABLE users IN EXCLUSIVE MODE');
  const { rows } = await client.query<{ count: string }>('SELECT count(*) FROM users');
  if (Number(rows[0].count) === 0) {
    const username = process.env.BOOTSTRAP_USERNAME;
    const password = process.env.BOOTSTRAP_PASSWORD;
    if (!username || !/^[a-zA-Z0-9._-]{3,80}$/.test(username) || !password || password.length < 12) {
      throw new Error('Configure o usuário e uma senha inicial com pelo menos 12 caracteres.');
    }
    await client.query("INSERT INTO users(username,password_hash,role,must_change_password) VALUES($1,$2,'geral',true)",
      [username, await argon2.hash(password, { type: argon2.argon2id })]);
    process.stdout.write('Administrador inicial criado; troca de senha obrigatória no primeiro acesso.\n');
  }
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
