import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { hash, pool, fail } from './db.js';

export type Actor = { id: string; role: 'geral' | 'filial_admin' | 'operador' | 'consulta'; branch_id: string | null; must_change_password: boolean };
declare module 'fastify' { interface FastifyRequest { actor?: Actor } }
const loginInput = z.object({ username: z.string().trim().min(1), password: z.string().min(1) });
const cookieName = 'armarios_session';
const secure = process.env.COOKIE_SECURE !== 'false';

export async function authenticate(request: FastifyRequest): Promise<Actor> {
  const token = request.cookies[cookieName];
  if (!token) fail(401, 'AUTENTICACAO', 'Faça login');
  const { rows } = await pool.query<Actor>(`SELECT u.id,u.role,u.branch_id,u.must_change_password FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id_hash=$1 AND s.expires_at>now() AND u.active`, [hash(token)]);
  if (!rows[0]) fail(401, 'AUTENTICACAO', 'Sessão expirada');
  request.actor = rows[0];
  const branchId = /^\/api\/branches\/([0-9a-f-]{36})(?:\/|$)/i.exec(request.url)?.[1];
  if (branchId) {
    const branch = await pool.query<{status:string}>('SELECT status FROM branches WHERE id=$1',[branchId]);
    if (branch.rows[0]?.status !== 'active') fail(403,'FILIAL_INATIVA','Filial arquivada ou indisponível');
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const csrf = request.headers['x-csrf-token'];
    const { rows: sessions } = await pool.query<{ csrf_hash: string }>('SELECT csrf_hash FROM sessions WHERE id_hash=$1', [hash(token)]);
    if (typeof csrf !== 'string' || hash(csrf) !== sessions[0]?.csrf_hash) fail(403, 'CSRF', 'Recarregue a página e tente novamente');
  }
  if (rows[0].must_change_password && !request.url.endsWith('/password') && !request.url.endsWith('/logout') && !request.url.endsWith('/me')) fail(403, 'TROCA_SENHA', 'Troque a senha temporária');
  return rows[0];
}
export function branchAccess(actor: Actor, branchId: string, write = false): void {
  if (actor.role !== 'geral' && actor.branch_id !== branchId) fail(403, 'FILIAL', 'Acesso negado a esta filial');
  if (write && actor.role === 'consulta') fail(403, 'PERMISSAO', 'Perfil sem permissão para alterar');
}
export function adminAccess(actor: Actor, branchId: string): void {
  branchAccess(actor, branchId, true);
  if (!['geral','filial_admin'].includes(actor.role)) fail(403, 'PERMISSAO', 'Acesso administrativo necessário');
}
export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/login', { config: { rateLimit: { max: 5, timeWindow: '15 minutes', keyGenerator: request => { const body=request.body as {username?:unknown}|undefined; return typeof body?.username==='string'?body.username.trim().toLowerCase():request.ip; } } } }, async (request, reply) => {
    const input = loginInput.parse(request.body);
    const { rows } = await pool.query<{ id: string; password_hash: string; active: boolean; role: Actor['role']; branch_id: string | null; must_change_password: boolean }>('SELECT * FROM users WHERE lower(username)=lower($1)', [input.username]);
    const user = rows[0];
    if (!user?.active || !(await argon2.verify(user.password_hash, input.password))) fail(401, 'CREDENCIAIS', 'Credenciais inválidas');
    const token = randomBytes(32).toString('base64url');
    const csrf = randomBytes(32).toString('base64url');
    await pool.query("INSERT INTO sessions(id_hash,user_id,csrf_hash,expires_at) VALUES($1,$2,$3,now()+interval '24 hours')", [hash(token), user.id, hash(csrf)]);
    reply.setCookie(cookieName, token, { path: '/', httpOnly: true, secure, sameSite: 'strict', maxAge: 86400 });
    reply.setCookie('armarios_csrf', csrf, { path: '/', httpOnly: false, secure, sameSite: 'strict', maxAge: 86400 });
    return { user: { id: user.id, role: user.role, branchId: user.branch_id, mustChangePassword: user.must_change_password }, csrf };
  });
  app.get('/api/auth/me', async request => {
    const actor = await authenticate(request);
    return { user: { id: actor.id, role: actor.role, branchId: actor.branch_id, mustChangePassword: actor.must_change_password }, authenticated: true };
  });
  app.post('/api/auth/logout', async (request, reply) => {
    await authenticate(request);
    await pool.query('DELETE FROM sessions WHERE id_hash=$1', [hash(request.cookies[cookieName] ?? '')]);
    reply.clearCookie(cookieName, { path: '/' });
    reply.clearCookie('armarios_csrf', { path: '/' });
    return { ok: true };
  });
  app.post('/api/auth/password', async request => {
    const actor = await authenticate(request);
    const body = z.object({ oldPassword: z.string(), newPassword: z.string().min(12) }).parse(request.body);
    const { rows } = await pool.query<{ password_hash: string }>('SELECT password_hash FROM users WHERE id=$1', [actor.id]);
    if (!await argon2.verify(rows[0].password_hash, body.oldPassword)) fail(401, 'CREDENCIAIS', 'Senha atual inválida');
    await pool.query('UPDATE users SET password_hash=$2,must_change_password=false WHERE id=$1', [actor.id, await argon2.hash(body.newPassword, { type: argon2.argon2id })]);
    await pool.query('DELETE FROM sessions WHERE user_id=$1 AND id_hash<>$2', [actor.id, hash(request.cookies[cookieName] ?? '')]);
    return { ok: true };
  });
}
