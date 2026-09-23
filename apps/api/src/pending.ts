import type { Client } from './db.js';

export async function refreshPending(client: Client, branchId: string): Promise<void> {
  const desired = await client.query<{ kind: string; subject_type: string; subject_id: string }>(`
    SELECT 'ausente_ti' kind,'membership' subject_type,m.id subject_id FROM memberships m
      JOIN allocations a ON a.person_id=m.person_id AND a.ended_at IS NULL
      WHERE m.branch_id=$1 AND m.category='colaborador' AND m.ti_present=false
    UNION ALL
    SELECT 'sem_armario','membership',m.id FROM memberships m
      WHERE m.branch_id=$1 AND m.status='ativo' AND m.needs_fixed
      AND NOT EXISTS(SELECT 1 FROM allocations a WHERE a.person_id=m.person_id AND a.ended_at IS NULL)
      AND NOT EXISTS(SELECT 1 FROM need_exceptions e WHERE e.membership_id=m.id)
    UNION ALL
    SELECT 'atuacao_encerrada','membership',m.id FROM memberships m
      JOIN allocations a ON a.person_id=m.person_id AND a.ended_at IS NULL WHERE m.branch_id=$1 AND m.status='encerrado'
    UNION ALL
    SELECT 'sazonal_vencida','allocation',a.id FROM allocations a JOIN branches b ON b.id=a.branch_id
      WHERE a.branch_id=$1 AND a.ended_at IS NULL AND a.seasonal AND (a.due_at AT TIME ZONE b.timezone)::date < (now() AT TIME ZONE b.timezone)::date
    UNION ALL
    SELECT 'compartilhamento_vencido','sharing',s.id FROM sharings s JOIN lockers l ON l.id=s.locker_id JOIN branches b ON b.id=l.branch_id
      WHERE l.branch_id=$1 AND s.ended_at IS NULL AND (s.due_at AT TIME ZONE b.timezone)::date < (now() AT TIME ZONE b.timezone)::date
      AND (SELECT count(*) FROM allocations a WHERE a.locker_id=l.id AND a.ended_at IS NULL)>1
    UNION ALL
    SELECT 'migracao_inconclusiva','locker',l.id FROM lockers l WHERE l.branch_id=$1 AND l.migration_status='inconclusivo'
  `, [branchId]);
  const keys = new Set(desired.rows.map(x => `${x.kind}:${x.subject_type}:${x.subject_id}`));
  for (const row of desired.rows) {
    await client.query(`INSERT INTO pending_items(branch_id,kind,subject_type,subject_id) VALUES($1,$2,$3,$4)
      ON CONFLICT(branch_id,kind,subject_type,subject_id) DO UPDATE SET state='aberta',updated_at=now(),resolution=NULL,resolved_by=NULL,version=pending_items.version+1 WHERE pending_items.state<>'aberta'`,
    [branchId,row.kind,row.subject_type,row.subject_id]);
  }
  const open = await client.query<{ id: string; kind: string; subject_type: string; subject_id: string }>('SELECT * FROM pending_items WHERE branch_id=$1 AND state=$2', [branchId,'aberta']);
  for (const row of open.rows) if (!keys.has(`${row.kind}:${row.subject_type}:${row.subject_id}`) && ['ausente_ti','sem_armario','atuacao_encerrada','sazonal_vencida','compartilhamento_vencido','migracao_inconclusiva'].includes(row.kind)) {
    await client.query("UPDATE pending_items SET state='resolvida',resolution='Condição regularizada',updated_at=now(),version=version+1 WHERE id=$1", [row.id]);
  }
}
