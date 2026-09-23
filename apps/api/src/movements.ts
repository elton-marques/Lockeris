import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { id, occupyInput, releaseInput, transferInput, operation } from '@armarios/contracts';
import { authenticate, branchAccess } from './auth.js';
import { pool, transaction, one, fail, type Client } from './db.js';
import { idempotent, event } from './operations.js';
import { refreshPending } from './pending.js';

type Locker = { id: string; version: number; capacity: number; is_double: boolean; condition: string; migration_status: string; modality: string; sector_occupant: string | null };
type Allocation = { id: string; person_id: string; locker_id: string; version: number; ended_at: string | null };
const route = z.object({ branchId: id });
const routeItem = z.object({ branchId: id, itemId: id });

async function lockedLockers(client: Client, branchId: string, ids: string[]): Promise<Map<string,Locker>> {
  const { rows } = await client.query<Locker>('SELECT * FROM lockers WHERE branch_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE',[branchId,ids.sort()]);
  if (rows.length !== new Set(ids).size) fail(404,'ARMARIO','Armário não encontrado nesta filial');
  return new Map(rows.map(row => [row.id,row]));
}
async function checkDestination(client: Client, branchId: string, locker: Locker, expectedVersion: number, sharingReason?: string | null, sharingDueAt?: string | null): Promise<void> {
  if (locker.version !== expectedVersion) fail(409,'VERSAO','Armário alterado; recarregue');
  if (locker.sector_occupant) fail(409,'OCUPACAO','Armário ocupado por um setor');
  if (locker.condition !== 'disponivel' || locker.migration_status !== 'conferido') fail(409,'INDISPONIVEL','Armário indisponível para novas entradas');
  const active = await client.query<{ id: string }>('SELECT id FROM allocations WHERE locker_id=$1 AND ended_at IS NULL',[locker.id]);
  if (active.rows.length >= locker.capacity) fail(409,'CAPACIDADE','Limite de ocupantes atingido');
  if (active.rows.length === 0 || locker.is_double) return;
  const sharing = await client.query<{ id: string; expired: boolean }>(`SELECT s.id,(s.due_at AT TIME ZONE b.timezone)::date < (now() AT TIME ZONE b.timezone)::date expired
    FROM sharings s JOIN lockers l ON l.id=s.locker_id JOIN branches b ON b.id=l.branch_id
    WHERE s.locker_id=$1 AND s.ended_at IS NULL FOR UPDATE OF s`,[locker.id]);
  if (sharing.rows[0]) {
    if (sharing.rows[0].expired) fail(409,'COMPARTILHAMENTO_VENCIDO','Renove o compartilhamento antes de nova entrada');
    return;
  }
  if (!sharingReason?.trim() || !sharingDueAt || new Date(sharingDueAt).getTime() <= Date.now()) fail(422,'COMPARTILHAMENTO','Motivo e previsão futura são obrigatórios para compartilhar');
  await client.query('INSERT INTO sharings(locker_id,reason,due_at,authorized_by) VALUES($1,$2,$3,$4)',[locker.id,sharingReason,sharingDueAt,(client as Client & { actorId?: string }).actorId]);
  await event(client,branchId,(client as Client & { actorId?: string }).actorId ?? null,'compartilhamento_autorizado','locker',locker.id,{ reason: sharingReason, dueAt: sharingDueAt });
}
async function endSharingIfSolo(client: Client, branchId: string, lockerId: string, actorId: string): Promise<void> {
  const count = await client.query<{ count: string }>('SELECT count(*) FROM allocations WHERE locker_id=$1 AND ended_at IS NULL',[lockerId]);
  if (Number(count.rows[0].count) <= 1) {
    const { rows } = await client.query<{ id: string }>('UPDATE sharings SET ended_at=now(),ended_by=$2,version=version+1 WHERE locker_id=$1 AND ended_at IS NULL RETURNING id',[lockerId,actorId]);
    if (rows[0]) await event(client,branchId,actorId,'compartilhamento_encerrado','sharing',rows[0].id);
  }
}
export async function movementRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/branches/:branchId/allocations', async request => {
    const actor = await authenticate(request); const { branchId } = route.parse(request.params); branchAccess(actor,branchId);
    return (await pool.query(`SELECT a.*,p.name,l.number FROM allocations a JOIN people p ON p.id=a.person_id JOIN lockers l ON l.id=a.locker_id WHERE a.branch_id=$1 ORDER BY coalesce(a.started_at,a.migrated_at) DESC LIMIT 1000`,[branchId])).rows;
  });
  app.post('/api/branches/:branchId/allocations/occupy', async request => {
    const actor = await authenticate(request); const { branchId } = route.parse(request.params); branchAccess(actor,branchId,true);
    const body = occupyInput.parse(request.body);
    return transaction(client => idempotent(client,body.operationId,branchId,actor.id,body, async () => {
      (client as Client & { actorId?: string }).actorId = actor.id;
      const locker = (await lockedLockers(client,branchId,[body.lockerId])).get(body.lockerId)!;
      const member = await one<{ status: string; person_id: string }>(client,'SELECT status,person_id FROM memberships WHERE person_id=$1 AND branch_id=$2 FOR UPDATE',[body.personId,branchId]);
      if (member.status !== 'ativo') fail(409,'ATUACAO','Pessoa com atuação encerrada');
      if (locker.modality !== body.modality) fail(409,'MODALIDADE','Modalidade incompatível com o armário');
      await checkDestination(client,branchId,locker,body.expectedVersion,body.sharingReason,body.sharingDueAt);
      const { rows } = await client.query(`INSERT INTO allocations(branch_id,locker_id,person_id,modality,seasonal,started_at,due_at,reason,note,started_by)
        VALUES($1,$2,$3,$4,$5,now(),$6,$7,$8,$9) RETURNING *`,[branchId,body.lockerId,body.personId,body.modality,body.seasonal,body.dueAt,body.reason,body.note,actor.id]);
      await client.query('UPDATE lockers SET version=version+1,key_copy_available=COALESCE($2,key_copy_available) WHERE id=$1',[body.lockerId,body.keyCopyAvailable??null]);
      await event(client,branchId,actor.id,'ocupacao_iniciada','allocation',rows[0].id,{ lockerId: body.lockerId, personId: body.personId });
      await refreshPending(client,branchId); return rows[0];
    }));
  });
  app.post('/api/branches/:branchId/allocations/release', async request => {
    const actor = await authenticate(request); const { branchId } = route.parse(request.params); branchAccess(actor,branchId,true);
    const body = releaseInput.parse(request.body);
    return transaction(client => idempotent(client,body.operationId,branchId,actor.id,body, async () => {
      const initial = await one<Allocation>(client,'SELECT * FROM allocations WHERE id=$1 AND branch_id=$2',[body.allocationId,branchId]);
      await lockedLockers(client,branchId,[initial.locker_id]);
      const allocation = await one<Allocation>(client,'SELECT * FROM allocations WHERE id=$1 AND branch_id=$2 FOR UPDATE',[body.allocationId,branchId]);
      if (allocation.ended_at || allocation.version !== body.expectedVersion) fail(409,'ALOCACAO','Alocação alterada ou já encerrada');
      const { rows } = await client.query('UPDATE allocations SET ended_at=now(),ended_by=$2,note=COALESCE($3,note),version=version+1 WHERE id=$1 RETURNING *',[body.allocationId,actor.id,body.note]);
      await client.query('UPDATE lockers SET version=version+1 WHERE id=$1',[allocation.locker_id]);
      await endSharingIfSolo(client,branchId,allocation.locker_id,actor.id);
      await event(client,branchId,actor.id,'ocupacao_encerrada','allocation',allocation.id,{ lockerId: allocation.locker_id, personId: allocation.person_id });
      await refreshPending(client,branchId); return rows[0];
    }));
  });
  app.post('/api/branches/:branchId/allocations/transfer', async request => {
    const actor = await authenticate(request); const { branchId } = route.parse(request.params); branchAccess(actor,branchId,true);
    const body = transferInput.parse(request.body);
    return transaction(client => idempotent(client,body.operationId,branchId,actor.id,body, async () => {
      (client as Client & { actorId?: string }).actorId = actor.id;
      const initial = await one<Allocation>(client,'SELECT * FROM allocations WHERE id=$1 AND branch_id=$2',[body.allocationId,branchId]);
      if (initial.locker_id === body.destinationLockerId) fail(422,'DESTINO','Escolha outro armário');
      const lockers = await lockedLockers(client,branchId,[initial.locker_id,body.destinationLockerId]);
      const source = lockers.get(initial.locker_id)!; const destination = lockers.get(body.destinationLockerId)!;
      if (source.version !== body.sourceVersion) fail(409,'VERSAO','Armário de origem alterado');
      const allocation = await one<Allocation & { modality: string; seasonal: boolean; due_at: string | null }>(client,'SELECT * FROM allocations WHERE id=$1 FOR UPDATE',[body.allocationId]);
      if (allocation.ended_at || allocation.version !== body.expectedAllocationVersion) fail(409,'ALOCACAO','Alocação alterada ou já encerrada');
      const member = await one<{ status: string }>(client,'SELECT status FROM memberships WHERE branch_id=$1 AND person_id=$2',[branchId,allocation.person_id]);
      if (member.status !== 'ativo') fail(409,'ATUACAO','Pessoa com atuação encerrada');
      if (destination.modality !== allocation.modality) fail(409,'MODALIDADE','Modalidade incompatível');
      await checkDestination(client,branchId,destination,body.destinationVersion,body.sharingReason,body.sharingDueAt);
      await client.query('UPDATE allocations SET ended_at=now(),ended_by=$2,version=version+1 WHERE id=$1',[allocation.id,actor.id]);
      const { rows } = await client.query(`INSERT INTO allocations(branch_id,locker_id,person_id,modality,seasonal,started_at,due_at,reason,note,started_by)
        VALUES($1,$2,$3,$4,$5,now(),$6,$7,$8,$9) RETURNING *`,[branchId,destination.id,allocation.person_id,allocation.modality,allocation.seasonal,allocation.due_at,body.reason,body.note,actor.id]);
      await client.query('UPDATE lockers SET version=version+1 WHERE id=ANY($1::uuid[])',[[source.id,destination.id]]);
      if(body.keyCopyAvailable!==undefined)await client.query('UPDATE lockers SET key_copy_available=$2 WHERE id=$1',[destination.id,body.keyCopyAvailable]);
      await endSharingIfSolo(client,branchId,source.id,actor.id);
      await event(client,branchId,actor.id,'ocupacao_transferida','allocation',rows[0].id,{ previousAllocationId: allocation.id, sourceLockerId: source.id, destinationLockerId: destination.id, reason: body.reason });
      await refreshPending(client,branchId); return rows[0];
    }));
  });
  app.post('/api/branches/:branchId/allocations/:itemId/due', async request => {
    const actor = await authenticate(request); const { branchId,itemId } = routeItem.parse(request.params); branchAccess(actor,branchId,true);
    const body = operation.extend({ expectedVersion: z.number().int().positive(), dueAt: z.iso.datetime(), reason: z.string().min(3) }).parse(request.body);
    return transaction(client => idempotent(client,body.operationId,branchId,actor.id,body, async () => {
      const old = await one<{ version: number; due_at: string | null; seasonal:boolean }>(client,'SELECT version,due_at,seasonal FROM allocations WHERE id=$1 AND branch_id=$2 AND ended_at IS NULL FOR UPDATE',[itemId,branchId]);
      if (old.version !== body.expectedVersion) fail(409,'VERSAO','Alocação alterada');
      if (!old.seasonal) fail(409,'MODALIDADE','A previsão pertence a uma alocação sazonal');
      if (new Date(body.dueAt).getTime() <= Date.now()) fail(422,'PRAZO','Informe uma data futura');
      const { rows } = await client.query('UPDATE allocations SET due_at=$2,version=version+1 WHERE id=$1 RETURNING *',[itemId,body.dueAt]);
      await event(client,branchId,actor.id,'previsao_alterada','allocation',itemId,{ before: old.due_at, after: body.dueAt, reason: body.reason });
      await refreshPending(client,branchId); return rows[0];
    }));
  });
  app.post('/api/branches/:branchId/allocations/:itemId/effective', async request => {
    const actor = await authenticate(request); const { branchId,itemId } = routeItem.parse(request.params); branchAccess(actor,branchId,true);
    const body = operation.extend({ expectedVersion: z.number().int().positive(), reason: z.string().min(3) }).parse(request.body);
    return transaction(client => idempotent(client,body.operationId,branchId,actor.id,body, async () => {
      const old = await one<{ version:number; seasonal:boolean; due_at:string|null }>(client,'SELECT version,seasonal,due_at FROM allocations WHERE id=$1 AND branch_id=$2 AND ended_at IS NULL FOR UPDATE',[itemId,branchId]);
      if(old.version!==body.expectedVersion) fail(409,'VERSAO','Alocação alterada');
      if(!old.seasonal) fail(409,'MODALIDADE','Alocação não é sazonal');
      const {rows}=await client.query('UPDATE allocations SET seasonal=false,due_at=NULL,version=version+1 WHERE id=$1 RETURNING *',[itemId]);
      await event(client,branchId,actor.id,'sazonal_efetivada','allocation',itemId,{previousDueAt:old.due_at,reason:body.reason});
      await refreshPending(client,branchId);return rows[0];
    }));
  });
  app.post('/api/branches/:branchId/sharings/:itemId/renew', async request => {
    const actor = await authenticate(request); const { branchId,itemId } = routeItem.parse(request.params); branchAccess(actor,branchId,true);
    const body = operation.extend({ expectedVersion: z.number().int().positive(), dueAt: z.iso.datetime(), reason: z.string().min(3) }).parse(request.body);
    if (new Date(body.dueAt).getTime() <= Date.now()) fail(422,'PRAZO','Informe uma data futura');
    return transaction(client => idempotent(client,body.operationId,branchId,actor.id,body, async () => {
      const old = await one<{ version: number; due_at: string }>(client,'SELECT s.version,s.due_at FROM sharings s JOIN lockers l ON l.id=s.locker_id WHERE s.id=$1 AND l.branch_id=$2 AND s.ended_at IS NULL FOR UPDATE',[itemId,branchId]);
      if (old.version !== body.expectedVersion) fail(409,'VERSAO','Compartilhamento alterado');
      const { rows } = await client.query('UPDATE sharings SET due_at=$2,reason=$3,version=version+1 WHERE id=$1 RETURNING *',[itemId,body.dueAt,body.reason]);
      await event(client,branchId,actor.id,'compartilhamento_renovado','sharing',itemId,{ before: old.due_at, after: body.dueAt, reason: body.reason });
      await refreshPending(client,branchId); return rows[0];
    }));
  });
}
