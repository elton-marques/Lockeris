import argon2 from 'argon2';
import { pool } from '../db.js';

const email = process.env.BOOTSTRAP_EMAIL;
const password = process.env.BOOTSTRAP_PASSWORD;
if (!email || !password || password.length < 12) throw new Error('Defina BOOTSTRAP_EMAIL e BOOTSTRAP_PASSWORD com pelo menos 12 caracteres');
const count = await pool.query<{ count: string }>('SELECT count(*) FROM users');
if (Number(count.rows[0].count) !== 0) throw new Error('Bootstrap permitido somente quando não há usuários');
await pool.query("INSERT INTO users(email,password_hash,role,must_change_password) VALUES($1,$2,'geral',true)", [email, await argon2.hash(password, { type: argon2.argon2id })]);
process.stdout.write('Administrador inicial criado; troca de senha obrigatória no primeiro acesso.\n');
await pool.end();
