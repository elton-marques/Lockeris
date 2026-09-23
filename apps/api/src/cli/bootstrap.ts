import argon2 from 'argon2';
import { pool } from '../db.js';

const username = process.env.BOOTSTRAP_USERNAME;
const password = process.env.BOOTSTRAP_PASSWORD;
if (!username || !/^[a-zA-Z0-9._-]{3,80}$/.test(username) || !password || password.length < 12) throw new Error('Defina BOOTSTRAP_USERNAME (3 a 80 caracteres) e BOOTSTRAP_PASSWORD (12 ou mais caracteres)');
const count = await pool.query<{ count: string }>('SELECT count(*) FROM users');
if (Number(count.rows[0].count) !== 0) throw new Error('Bootstrap permitido somente quando não há usuários');
await pool.query("INSERT INTO users(username,password_hash,role,must_change_password) VALUES($1,$2,'geral',true)", [username, await argon2.hash(password, { type: argon2.argon2id })]);
process.stdout.write('Administrador inicial criado; troca de senha obrigatória no primeiro acesso.\n');
await pool.end();
