import type { Client } from './db.js';
import { registrationKey } from './registration.js';

type ReconciliationRow={pending_id:string;membership_id:string;person_id:string;registration:string;name:string;department:string|null;function_name:string|null;allocation_id:string};
type OfficialRow={membership_id:string;person_id:string;registration:string;name:string;department:string|null;function_name:string|null};

const textKey=(value:string)=>value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleUpperCase('pt-BR');
function editDistance(left:string,right:string):number{
  const previous=Array.from({length:right.length+1},(_,index)=>index);
  for(let row=1;row<=left.length;row++){
    const current=[row];
    for(let column=1;column<=right.length;column++) current[column]=Math.min(current[column-1]+1,previous[column]+1,previous[column-1]+(left[row-1]===right[column-1]?0:1));
    for(let column=0;column<=right.length;column++) previous[column]=current[column];
  }
  return previous[right.length];
}
function strongNameMatch(source:string,target:string):boolean{
  const sourceTokens=textKey(source).split(/[^A-Z0-9]+/).filter(Boolean);
  const targetTokens=textKey(target).split(/[^A-Z0-9]+/).filter(Boolean);
  return sourceTokens.length>=2&&sourceTokens.every(token=>targetTokens.some(candidate=>candidate===token||
    Math.abs(candidate.length-token.length)<=1&&editDistance(token,candidate)<=1));
}

async function reconcileRolePlaceholders(client:Client,branchId:string):Promise<void>{
  const rows=await client.query<{pending_id:string;locker_id:string;function_name:string}>(`SELECT DISTINCT ON (p.id) p.id pending_id,l.id locker_id,src.raw->>'functionName' function_name
    FROM pending_items p JOIN lockers l ON l.id=p.subject_id
    JOIN import_sources src ON src.entity_type='locker' AND src.entity_id=l.id
    JOIN imports imp ON imp.id=src.import_id AND imp.state='applied'
    WHERE p.branch_id=$1 AND p.kind='migracao_inconclusiva' AND p.state='aberta'
      AND l.migration_status='inconclusivo'
      AND coalesce(trim(src.raw->>'name'),'')=''
      AND coalesce(trim(src.raw->>'registration'),'')=''
      AND upper(trim(src.raw->>'status'))='OCUPADO'
      AND coalesce(trim(src.raw->>'functionName'),'')<>''
      AND upper(trim(src.raw->>'functionName')) NOT LIKE '%PROMOTOR%'
      AND NOT EXISTS(SELECT 1 FROM allocations a WHERE a.locker_id=l.id AND a.ended_at IS NULL)
    ORDER BY p.id,src.row_number`,[branchId]);
  for(const row of rows.rows){
    const person=(await client.query<{id:string}>('INSERT INTO people(name) VALUES($1) RETURNING id',[row.function_name])).rows[0];
    await client.query(`INSERT INTO memberships(person_id,branch_id,category,origin,needs_fixed,ti_present,status)
      VALUES($1,$2,'colaborador','migracao',true,NULL,'ativo')`,[person.id,branchId]);
    await client.query(`INSERT INTO allocations(branch_id,locker_id,person_id,modality,started_at,original_start_unknown,migrated_at,reason)
      VALUES($1,$2,$3,'fixo',NULL,true,now(),'Carga inicial; função provisória')`,[branchId,row.locker_id,person.id]);
    await client.query("UPDATE lockers SET migration_status='conferido',version=version+1 WHERE id=$1",[row.locker_id]);
    await client.query("UPDATE pending_items SET state='resolvida',resolution=$2,updated_at=now(),version=version+1 WHERE id=$1",[row.pending_id,`Ocupação provisória reconhecida pela função ${row.function_name}.`]);
    await client.query('INSERT INTO events(branch_id,actor_id,kind,entity_type,entity_id,details) VALUES($1,NULL,$2,$3,$4,$5)',[branchId,'ocupacao_provisoria_reconhecida','locker',row.locker_id,JSON.stringify({functionName:row.function_name})]);
  }
}

async function retireRoteiristaPlaceholders(client:Client,branchId:string):Promise<void>{
  const rows=await client.query<{allocation_id:string;membership_id:string;locker_id:string;name:string}>(`SELECT a.id allocation_id,m.id membership_id,l.id locker_id,p.name
    FROM memberships m JOIN people p ON p.id=m.person_id
    JOIN allocations a ON a.person_id=p.id AND a.ended_at IS NULL
    JOIN lockers l ON l.id=a.locker_id
    WHERE m.branch_id=$1 AND m.origin='migracao' AND m.category='roteirista'
      AND (upper(p.name) LIKE '%PROMOTOR%' OR upper(coalesce(m.function_name,'')) LIKE '%PROMOTOR%')`,[branchId]);
  for(const row of rows.rows){
    await client.query('UPDATE allocations SET ended_at=now(),version=version+1 WHERE id=$1',[row.allocation_id]);
    await client.query("UPDATE memberships SET status='encerrado',version=version+1,updated_at=now() WHERE id=$1",[row.membership_id]);
    await client.query("UPDATE lockers SET sector_occupant=COALESCE(NULLIF(trim(sector_occupant),''),$2),version=version+1 WHERE id=$1",[row.locker_id,row.name]);
    await client.query('INSERT INTO events(branch_id,actor_id,kind,entity_type,entity_id,details) VALUES($1,NULL,$2,$3,$4,$5)',[branchId,'promotor_roteirista_retirado','locker',row.locker_id,JSON.stringify({name:row.name})]);
  }
}

async function reconcileNamePlaceholders(client:Client,branchId:string):Promise<void>{
  const rows=await client.query<{pending_id:string;locker_id:string;membership_id:string;allocation_id:string;source_name:string}>(`SELECT DISTINCT ON (p.id) p.id pending_id,l.id locker_id,m.id membership_id,a.id allocation_id,src.raw->>'name' source_name
    FROM pending_items p JOIN lockers l ON l.id=p.subject_id
    JOIN import_sources src ON src.entity_type='locker' AND src.entity_id=l.id
    JOIN imports imp ON imp.id=src.import_id AND imp.state='applied'
    JOIN allocations a ON a.locker_id=l.id AND a.ended_at IS NULL
    JOIN memberships m ON m.person_id=a.person_id AND m.branch_id=l.branch_id
    WHERE p.branch_id=$1 AND p.kind='migracao_inconclusiva' AND p.state='aberta'
      AND l.migration_status='inconclusivo' AND m.origin='migracao' AND m.registration IS NULL
      AND coalesce(trim(src.raw->>'name'),'')<>''
      AND coalesce(trim(src.raw->>'registration'),'')=''
      AND coalesce(trim(src.raw->>'sectorOccupant'),'')=''
      AND coalesce(trim(src.raw->>'functionName'),'')=''
      AND upper(trim(src.raw->>'status'))='OCUPADO'
    ORDER BY p.id,src.row_number`,[branchId]);
  if(!rows.rowCount)return;
  const officials=await client.query<OfficialRow>(`SELECT m.id membership_id,m.person_id,m.registration,p.name,m.department,m.function_name
    FROM memberships m JOIN people p ON p.id=m.person_id
    WHERE m.branch_id=$1 AND m.origin='ti' AND m.category='colaborador' AND m.status='ativo' AND m.ti_present=true
      AND NOT EXISTS(SELECT 1 FROM allocations a WHERE a.person_id=m.person_id AND a.ended_at IS NULL)`,[branchId]);
  const claimed=new Set<string>();
  for(const row of rows.rows){
    const candidates=officials.rows.filter(candidate=>!claimed.has(candidate.person_id)&&strongNameMatch(row.source_name,candidate.name));
    if(candidates.length!==1)continue;
    const official=candidates[0];
    claimed.add(official.person_id);
    await client.query('UPDATE allocations SET person_id=$2,version=version+1 WHERE id=$1',[row.allocation_id,official.person_id]);
    await client.query("UPDATE memberships SET status='encerrado',version=version+1,updated_at=now() WHERE id=$1",[row.membership_id]);
    await client.query("UPDATE lockers SET migration_status='conferido',version=version+1 WHERE id=$1",[row.locker_id]);
    await client.query("UPDATE pending_items SET state='resolvida',resolution=$2,updated_at=now(),version=version+1 WHERE id=$1",[row.pending_id,`Nome associado automaticamente à matrícula ${official.registration} (${official.name}).`]);
    await client.query('INSERT INTO events(branch_id,actor_id,kind,entity_type,entity_id,details) VALUES($1,NULL,$2,$3,$4,$5)',[branchId,'ocupante_associado_por_nome','pending',row.pending_id,JSON.stringify({sourceName:row.source_name,registration:official.registration,name:official.name})]);
  }
}

async function autoReconcile(client:Client,branchId:string):Promise<void>{
  const pending=await client.query<ReconciliationRow>(`SELECT p.id pending_id,m.id membership_id,m.person_id,m.registration,pn.name,m.department,m.function_name,a.id allocation_id
    FROM pending_items p JOIN memberships m ON m.id=p.subject_id JOIN people pn ON pn.id=m.person_id
    JOIN allocations a ON a.person_id=m.person_id AND a.ended_at IS NULL
    WHERE p.branch_id=$1 AND p.kind='ausente_ti' AND p.state='aberta' AND m.origin='migracao' AND m.registration IS NOT NULL`,[branchId]);
  if(!pending.rowCount)return;
  const officials=await client.query<OfficialRow>(`SELECT m.id membership_id,m.person_id,m.registration,p.name,m.department,m.function_name
    FROM memberships m JOIN people p ON p.id=m.person_id
    WHERE m.branch_id=$1 AND m.origin='ti' AND m.category='colaborador' AND m.status='ativo' AND m.ti_present=true
      AND NOT EXISTS(SELECT 1 FROM allocations a WHERE a.person_id=m.person_id AND a.ended_at IS NULL)`,[branchId]);
  for(const item of pending.rows){
    const sourceRegistration=registrationKey(item.registration);
    if(!/^\d+$/.test(sourceRegistration))continue;
    const candidates=officials.rows.filter(candidate=>{
      const officialRegistration=registrationKey(candidate.registration);
      return /^\d+$/.test(officialRegistration)&&officialRegistration.length===sourceRegistration.length&&
        editDistance(sourceRegistration,officialRegistration)<=2&&strongNameMatch(item.name,candidate.name);
    });
    if(candidates.length!==1)continue;
    const official=candidates[0];
    await client.query('UPDATE allocations SET person_id=$2,version=version+1 WHERE id=$1',[item.allocation_id,official.person_id]);
    await client.query("UPDATE memberships SET status='encerrado',ti_present=false,version=version+1,updated_at=now() WHERE id=$1",[item.membership_id]);
    await client.query("UPDATE pending_items SET state='resolvida',resolution=$2,updated_at=now(),version=version+1 WHERE id=$1",[item.pending_id,`Matrícula reconciliada automaticamente com ${official.registration} (${official.name}).`]);
    await client.query('INSERT INTO events(branch_id,actor_id,kind,entity_type,entity_id,details) VALUES($1,NULL,$2,$3,$4,$5)',[branchId,'pendencia_auto_reconciliada','pending',item.pending_id,JSON.stringify({from:item.registration,to:official.registration,name:official.name})]);
  }
}

export async function refreshPending(client: Client, branchId: string): Promise<void> {
  await retireRoteiristaPlaceholders(client,branchId);
  await reconcileRolePlaceholders(client,branchId);
  await reconcileNamePlaceholders(client,branchId);
  await autoReconcile(client,branchId);
  const desired = await client.query<{ kind: string; subject_type: string; subject_id: string }>(`
    SELECT 'ausente_ti' kind,'membership' subject_type,m.id subject_id FROM memberships m
      JOIN allocations a ON a.person_id=m.person_id AND a.ended_at IS NULL
      WHERE m.branch_id=$1 AND m.category='colaborador' AND m.ti_present=false
      AND NOT EXISTS(
        SELECT 1 FROM memberships current_ti
        WHERE current_ti.branch_id=m.branch_id AND current_ti.category='colaborador'
          AND current_ti.origin='ti' AND current_ti.status='ativo' AND current_ti.ti_present=true
          AND regexp_replace(upper(trim(current_ti.registration)), '[[:space:]./-]', '', 'g')=
              regexp_replace(upper(trim(m.registration)), '[[:space:]./-]', '', 'g')
      )
    UNION ALL
    SELECT 'sem_armario','membership',m.id FROM memberships m
      WHERE m.branch_id=$1 AND m.status='ativo' AND m.needs_fixed AND m.category<>'promotor_fixo'
      AND NOT EXISTS(SELECT 1 FROM allocations a WHERE a.person_id=m.person_id AND a.ended_at IS NULL)
      AND NOT EXISTS(SELECT 1 FROM need_exceptions e WHERE e.membership_id=m.id)
    UNION ALL
    SELECT 'atuacao_encerrada','membership',m.id FROM memberships m
      JOIN allocations a ON a.person_id=m.person_id AND a.ended_at IS NULL
      WHERE m.branch_id=$1 AND m.status='encerrado' AND NOT (m.category='colaborador' AND m.ti_present=false)
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
