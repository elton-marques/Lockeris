import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { id, keyLoanInput, keyLoanReturnInput } from '@armarios/contracts';
import { authenticate, branchAccess } from './auth.js';
import { pool, transaction, one, fail } from './db.js';
import { idempotent, event } from './operations.js';

const route = z.object({ branchId: id });
const routeItem = z.object({ branchId: id, itemId: id });
const listQuery = z.object({ status: z.enum(['abertos', 'todos']).default('abertos') });

type KeyLoanRow = {
  id: string; branch_id: string; locker_id: string; person_id: string | null;
  person_name: string; person_registration: string | null; notes: string | null;
  taken_at: string; returned_at: string | null; locker_number?: string;
};

export async function keyLoanRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/branches/:branchId/key-loans', async request => {
    const actor = await authenticate(request);
    const { branchId } = route.parse(request.params);
    branchAccess(actor, branchId);
    const { status } = listQuery.parse(request.query ?? {});
    return (await pool.query<KeyLoanRow>(`SELECT k.*,l.number locker_number FROM key_loans k JOIN lockers l ON l.id=k.locker_id
      WHERE k.branch_id=$1 AND ($2='todos' OR k.returned_at IS NULL)
      ORDER BY k.returned_at IS NULL DESC,k.taken_at DESC LIMIT 500`, [branchId, status])).rows;
  });

  app.post('/api/branches/:branchId/lockers/:itemId/key-loans', async request => {
    const actor = await authenticate(request);
    const { branchId, itemId } = routeItem.parse(request.params);
    branchAccess(actor, branchId, true);
    const body = keyLoanInput.parse(request.body);
    return transaction(client => idempotent(client, body.operationId, branchId, actor.id, body, async () => {
      const locker = await one<{ id: string; number: string }>(client, 'SELECT id,number FROM lockers WHERE id=$1 AND branch_id=$2 FOR UPDATE', [itemId, branchId]);
      const person = (await client.query<{ id: string; name: string; registration: string | null }>(
        `SELECT p.id,p.name,m.registration FROM people p JOIN memberships m ON m.person_id=p.id
         WHERE p.id=$1 AND m.branch_id=$2 AND m.status='ativo'`, [body.personId, branchId])).rows[0];
      if (!person) fail(404, 'PESSOA', 'Pessoa ativa não encontrada nesta filial');
      const open = await client.query('SELECT 1 FROM key_loans WHERE locker_id=$1 AND returned_at IS NULL', [itemId]);
      if (open.rowCount) fail(409, 'CHAVE', 'Esta chave já está emprestada; registre a devolução antes de um novo empréstimo');
      const loan = (await client.query(`INSERT INTO key_loans(branch_id,locker_id,person_id,person_name,person_registration,notes,taken_by)
        VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [branchId, itemId, person.id, person.name, person.registration, body.notes ?? null, actor.id])).rows[0]!;
      await event(client, branchId, actor.id, 'chave_emprestada', 'key_loan', loan.id,
        { lockerId: itemId, personId: person.id },
        { lockerNumber: locker.number, personName: person.name, personRegistration: person.registration, description: 'Chave emprestada' });
      return loan;
    }));
  });

  app.post('/api/branches/:branchId/key-loans/:itemId/return', async request => {
    const actor = await authenticate(request);
    const { branchId, itemId } = routeItem.parse(request.params);
    branchAccess(actor, branchId, true);
    const body = keyLoanReturnInput.parse(request.body);
    return transaction(client => idempotent(client, body.operationId, branchId, actor.id, body, async () => {
      const loan = await one<KeyLoanRow>(client, 'SELECT * FROM key_loans WHERE id=$1 AND branch_id=$2 FOR UPDATE', [itemId, branchId]);
      if (loan.returned_at) fail(409, 'CHAVE', 'Este empréstimo já foi devolvido');
      const locker = await one<{ number: string }>(client, 'SELECT number FROM lockers WHERE id=$1', [loan.locker_id]);
      const updated = (await client.query('UPDATE key_loans SET returned_at=now(),returned_by=$2,notes=COALESCE($3,notes) WHERE id=$1 RETURNING *',
        [itemId, actor.id, body.notes ?? null])).rows[0]!;
      await event(client, branchId, actor.id, 'chave_devolvida', 'key_loan', itemId,
        { lockerId: loan.locker_id, personId: loan.person_id },
        { lockerNumber: locker.number, personName: loan.person_name, personRegistration: loan.person_registration, description: 'Chave devolvida' });
      return updated;
    }));
  });
}
