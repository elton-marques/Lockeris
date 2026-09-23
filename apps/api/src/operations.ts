import type { Client } from './db.js';
import { hash, fail } from './db.js';

export async function idempotent<T>(client: Client, operationId: string, branchId: string | null, actorId: string, payload: unknown, action: () => Promise<T>): Promise<T> {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [operationId]);
  const payloadHash = hash(JSON.stringify({branchId,actorId,payload}));
  const existing = await client.query<{ payload_hash: string; result: T | null }>('SELECT payload_hash,result FROM operations WHERE id=$1 FOR UPDATE', [operationId]);
  if (existing.rows[0]) {
    if (existing.rows[0].payload_hash !== payloadHash) fail(409, 'OPERACAO_REUTILIZADA', 'Identificador de operação já usado com outro conteúdo');
    return existing.rows[0].result as T;
  }
  await client.query('INSERT INTO operations(id,branch_id,actor_id,payload_hash) VALUES($1,$2,$3,$4)', [operationId, branchId, actorId, payloadHash]);
  const result = await action();
  await client.query('UPDATE operations SET result=$2 WHERE id=$1', [operationId, JSON.stringify(result)]);
  return result;
}
export async function event(client: Client, branchId: string, actorId: string | null, kind: string, entityType: string, entityId: string | null, details: unknown = {}): Promise<void> {
  await client.query('INSERT INTO events(branch_id,actor_id,kind,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5,$6)', [branchId, actorId, kind, entityType, entityId, JSON.stringify(details)]);
}
