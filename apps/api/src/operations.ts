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
export type EventContext = {
  lockerNumber?: string | null;
  personName?: string | null;
  personRegistration?: string | null;
  sectorName?: string | null;
  description?: string | null;
};
export async function event(client: Client, branchId: string, actorId: string | null, kind: string, entityType: string, entityId: string | null, details: unknown = {}, context: EventContext = {}): Promise<void> {
  await client.query(`INSERT INTO events(branch_id,actor_id,kind,entity_type,entity_id,details,locker_number,person_name,person_registration,sector_name,description)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [branchId, actorId, kind, entityType, entityId, JSON.stringify(details), context.lockerNumber ?? null, context.personName ?? null,
      context.personRegistration ?? null, context.sectorName ?? null, context.description ?? null]);
}
export type AuditSubject = { locker_number?: string | null; person_name?: string | null; person_registration?: string | null; sector_occupant?: string | null };
export function auditContext(subject: AuditSubject, description: string): EventContext {
  return {
    lockerNumber: subject.locker_number ?? null,
    personName: subject.person_name ?? null,
    personRegistration: subject.person_registration ?? null,
    sectorName: subject.sector_occupant ?? null,
    description
  };
}
export const personFieldLabels: Record<string, string> = { name: 'nome', registration: 'matrícula', company: 'empresa', department: 'setor', function_name: 'função', category: 'vínculo', needs_fixed: 'armário fixo' };
export const lockerFieldLabels: Record<string, string> = { size: 'tamanho', capacity: 'capacidade', modality: 'modalidade', destination: 'destinação', condition: 'situação', migration_status: 'conferência', sector_occupant: 'setor ocupante', is_double: 'tipo duplo', key_copy_available: 'cópia da chave' };
export function changedFields(before: Record<string, unknown>, after: Record<string, unknown>, labels: Record<string, string>): string[] {
  return Object.entries(labels).filter(([key]) => String(before[key] ?? '') !== String(after[key] ?? '')).map(([, label]) => label);
}
