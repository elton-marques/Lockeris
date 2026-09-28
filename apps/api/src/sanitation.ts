import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { id, operation } from '@armarios/contracts';
import { authenticate, adminAccess } from './auth.js';
import { fail, one, transaction } from './db.js';
import { event, idempotent } from './operations.js';
import { refreshPending } from './pending.js';

const route = z.object({ branchId: id });
const query = z.object({ inactiveDays: z.coerce.number().int().min(30).max(3650).default(90) });
const purgeInput = operation.extend({ branchId: id, membershipIds: z.array(id).min(1).max(500) });
const maxRows = 500;

export type StaleRow = {
  membership_id: string;
  person_id: string;
  name: string;
  registration: string | null;
  department: string | null;
  function_name: string | null;
  category: string;
  last_activity: string;
};

/**
 * Cadastros obsoletos: ativos, sem armário e sem nenhuma movimentação
 * (criação ou ocupação) dentro da janela informada.
 */
export async function staleRows(branchId: string, inactiveDays: number): Promise<StaleRow[]> {
  const { rows } = await transaction(client => client.query<StaleRow>(`
    SELECT m.id membership_id,p.id person_id,p.name,m.registration,m.department,m.function_name,m.category,
      greatest(m.created_at,coalesce(movement.last,m.created_at)) last_activity
    FROM memberships m
    JOIN people p ON p.id=m.person_id
    LEFT JOIN LATERAL (
      SELECT max(coalesce(a.ended_at,a.started_at)) last FROM allocations a
      WHERE a.person_id=p.id AND a.branch_id=m.branch_id
    ) movement ON true
    WHERE m.branch_id=$1 AND m.status='ativo'
      AND NOT EXISTS(SELECT 1 FROM allocations a WHERE a.person_id=p.id AND a.ended_at IS NULL)
      AND greatest(m.created_at,coalesce(movement.last,m.created_at)) < now() - ($2::int * interval '1 day')
    ORDER BY last_activity,p.name LIMIT ${maxRows}`, [branchId, inactiveDays]));
  return rows;
}

export async function sanitationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/branches/:branchId/people/stale', async request => {
    const actor = await authenticate(request);
    const { branchId } = route.parse(request.params);
    adminAccess(actor, branchId);
    const { inactiveDays } = query.parse(request.query ?? {});
    return staleRows(branchId, inactiveDays);
  });
  app.post('/api/people/bulk-purge', async request => {
    const actor = await authenticate(request);
    const body = purgeInput.parse(request.body);
    adminAccess(actor, body.branchId);
    return transaction(client => idempotent(client, body.operationId, body.branchId, actor.id, body, async () => {
      const branch = await one<{ status: string }>(client, 'SELECT status FROM branches WHERE id=$1 FOR UPDATE', [body.branchId]);
      if (branch.status !== 'active') fail(403, 'FILIAL_INATIVA', 'Filial indisponível ou excluída');
      const membershipIds = [...new Set(body.membershipIds)];
      const selected = await client.query<{ id: string; person_id: string; name: string; registration: string | null; locker_number: string | null }>(
        `SELECT m.id,m.person_id,p.name,m.registration,l.number locker_number
         FROM memberships m JOIN people p ON p.id=m.person_id
         LEFT JOIN allocations a ON a.person_id=p.id AND a.ended_at IS NULL
         LEFT JOIN lockers l ON l.id=a.locker_id
         WHERE m.branch_id=$1 AND m.id=ANY($2::uuid[]) ORDER BY p.name FOR UPDATE OF m`,
        [body.branchId, membershipIds]);
      if (selected.rows.length !== membershipIds.length) fail(409, 'SELECAO', 'A seleção mudou; recarregue os cadastros');
      const linked = selected.rows.filter(row => row.locker_number);
      if (linked.length) {
        const preview = linked.slice(0, 5).map(row => `${row.name} (armário ${row.locker_number})`).join(', ');
        fail(409, 'ARMARIO_VINCULADO', `Desocupe os armários antes de excluir: ${preview}${linked.length > 5 ? ` e outros ${linked.length - 5}` : ''}`);
      }
      const personIds = [...new Set(selected.rows.map(row => row.person_id))];
      await client.query('DELETE FROM need_exceptions WHERE membership_id=ANY($1::uuid[])', [membershipIds]);
      await client.query('DELETE FROM pending_items WHERE branch_id=$1 AND subject_type=$2 AND subject_id=ANY($3::uuid[])', [body.branchId, 'membership', membershipIds]);
      await client.query('DELETE FROM allocations WHERE branch_id=$1 AND person_id=ANY($2::uuid[]) AND ended_at IS NOT NULL', [body.branchId, personIds]);
      await client.query('DELETE FROM memberships WHERE branch_id=$1 AND id=ANY($2::uuid[])', [body.branchId, membershipIds]);
      const removed = await client.query<{ id: string }>(`DELETE FROM people p WHERE p.id=ANY($1::uuid[])
        AND NOT EXISTS(SELECT 1 FROM memberships m WHERE m.person_id=p.id)
        AND NOT EXISTS(SELECT 1 FROM allocations a WHERE a.person_id=p.id)`, [personIds]);
      await refreshPending(client, body.branchId);
      await event(client, body.branchId, actor.id, 'cadastros_purgados', 'membership', null,
        { count: membershipIds.length, ids: membershipIds, people: removed.rowCount ?? 0 },
        { description: `${membershipIds.length} cadastro(s) obsoleto(s) excluído(s) da base` });
      return { purged: membershipIds.length, people: removed.rowCount ?? 0 };
    }));
  });
}
