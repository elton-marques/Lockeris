import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { id } from '@armarios/contracts';
import { authenticate, branchAccess } from './auth.js';
import { pool } from './db.js';

const route = z.object({ branchId: id });
const previewLimit = 8;
const listLimit = 5000;
export const cadastralPendingKinds = ['sem_matricula', 'ausente_ti', 'dados_alterados', 'identificacao_conflitante'] as const;
const pendingLabels: Record<string, string> = {
  sem_matricula: 'Sem matrícula validada',
  ausente_ti: 'Matrícula fora da base atual',
  dados_alterados: 'Dados cadastrais alterados',
  identificacao_conflitante: 'Identificação conflitante'
};
/** Setores que têm direito a um armário duplo com um único ocupante (espelha o critério do painel). */
const exclusiveDoubleKeywords = ['transporte pesado', 'conservacao', 'limpeza', 'manutencao'];
const normalized = (value: string | null | undefined) => value ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR') : '';

export type NotificationKey = 'withoutLocker' | 'registrationPending' | 'underusedDoubles';
export type NotificationItem = { id: string; label: string; detail: string | null };
export type NotificationAlert = { key: NotificationKey; label: string; description: string; count: number; items: NotificationItem[] };
export type NotificationSummary = { total: number; alerts: NotificationAlert[]; checkedAt: string };

type PersonRow = { membership_id: string; name: string; registration: string | null; department: string | null };
type PendingRow = { membership_id: string; kind: string; name: string | null; registration: string | null };
type DoubleRow = { id: string; number: string; occupants: { name: string; registration: string | null; department: string | null }[] };

async function withoutLockerAlert(branchId: string): Promise<NotificationAlert> {
  const { rows } = await pool.query<PersonRow>(`SELECT m.id membership_id,p.name,m.registration,m.department
    FROM memberships m JOIN people p ON p.id=m.person_id
    WHERE m.branch_id=$1 AND m.status='ativo'
      AND NOT EXISTS(SELECT 1 FROM allocations a WHERE a.person_id=p.id AND a.ended_at IS NULL)
    ORDER BY p.name LIMIT ${listLimit}`, [branchId]);
  return {
    key: 'withoutLocker',
    label: 'Colaboradores sem armário',
    description: 'Colaboradores ativos aguardando a definição de um armário.',
    count: rows.length,
    items: rows.slice(0, previewLimit).map(row => ({
      id: row.membership_id,
      label: row.name,
      detail: row.registration ? `Matrícula ${row.registration}` : row.department || null
    }))
  };
}

async function registrationPendingAlert(branchId: string): Promise<NotificationAlert> {
  const { rows } = await pool.query<PendingRow>(`SELECT pi.id pending_id,pi.kind,p.name,m.registration
    FROM pending_items pi
    JOIN memberships m ON pi.subject_type='membership' AND m.id=pi.subject_id
    LEFT JOIN people p ON p.id=m.person_id
    WHERE pi.branch_id=$1 AND pi.state='aberta' AND pi.kind=ANY($2::text[])
    ORDER BY p.name NULLS LAST,pi.kind LIMIT ${listLimit}`, [branchId, [...cadastralPendingKinds]]);
  return {
    key: 'registrationPending',
    label: 'Pendências cadastrais',
    description: 'Cadastros com informações incompletas ou divergentes.',
    count: rows.length,
    items: rows.slice(0, previewLimit).map(row => ({
      id: row.membership_id,
      label: row.name ?? 'Cadastro sem nome',
      detail: row.registration ? `Matrícula ${row.registration} · ${pendingLabels[row.kind] ?? 'Conferência cadastral'}` : pendingLabels[row.kind] ?? 'Conferência cadastral'
    }))
  };
}

async function underusedDoublesAlert(branchId: string): Promise<NotificationAlert> {
  const { rows } = await pool.query<DoubleRow>(`SELECT l.id,l.number,
      coalesce(json_agg(json_build_object('name',p.name,'registration',m.registration,'department',m.department)
        ORDER BY p.name) FILTER (WHERE a.id IS NOT NULL),'[]') occupants
    FROM lockers l
    LEFT JOIN allocations a ON a.locker_id=l.id AND a.ended_at IS NULL
    LEFT JOIN people p ON p.id=a.person_id
    LEFT JOIN memberships m ON m.person_id=a.person_id AND m.branch_id=l.branch_id
    WHERE l.branch_id=$1 AND l.is_double AND l.sector_occupant IS NULL
    GROUP BY l.id
    HAVING count(a.id)=1`, [branchId]);
  const partial = rows.filter(row => !row.occupants.some(person => exclusiveDoubleKeywords.some(keyword => normalized(person.department).includes(keyword))));
  return {
    key: 'underusedDoubles',
    label: 'Duplos subutilizados',
    description: 'Armários duplos ocupados por apenas uma pessoa.',
    count: partial.length,
    items: partial.slice(0, previewLimit).map(row => ({
      id: row.id,
      label: `Armário ${row.number}`,
      detail: row.occupants[0]?.name ?? null
    }))
  };
}

export function notificationSummary(alerts: NotificationAlert[], checkedAt = new Date().toISOString()): NotificationSummary {
  return { total: alerts.reduce((sum, alert) => sum + alert.count, 0), alerts, checkedAt };
}

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/branches/:branchId/notifications', async request => {
    const actor = await authenticate(request);
    const { branchId } = route.parse(request.params);
    branchAccess(actor, branchId);
    const alerts = await Promise.all([withoutLockerAlert(branchId), registrationPendingAlert(branchId), underusedDoublesAlert(branchId)]);
    return notificationSummary(alerts);
  });
}
