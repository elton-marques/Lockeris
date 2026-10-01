import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { id, retainedItemInput } from '@armarios/contracts';
import { authenticate, branchAccess, adminAccess } from './auth.js';
import { pool, transaction, one, fail, type Client } from './db.js';

const branchParams=z.object({branchId:id});
const itemParams=z.object({id});
const optionalNotes=z.string().trim().max(2000).nullish();
const issue=z.enum(['cadeado_fora_padrao','sem_cadeado','itens_fora_armario','mecanismo_avariado','outro']);
const recommendations:Record<z.infer<typeof issue>,string>={
  cadeado_fora_padrao:'Substituir o cadeado pelo modelo autorizado.',
  sem_cadeado:'Providenciar cadeado e verificar a guarda dos pertences.',
  itens_fora_armario:'Recolher e identificar os itens fora do armário.',
  mecanismo_avariado:'Solicitar manutenção do mecanismo e restringir o uso até a correção.',
  outro:'Avaliar a ocorrência e registrar a providência adotada.'
};
const preventionDepartment=(department:string|null)=>{
  const normalized=(department??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  return /prevencao\s+de\s+perdas|(^|[^a-z])pp([^a-z]|$)/.test(normalized);
};
type FoundItem=z.infer<typeof retainedItemInput>;
const withMinuteFoundAt=<T extends {found_at:Date}>(row:T)=>({...row,found_at:row.found_at.toISOString().slice(0,16)+'Z'});
export async function insertRetainedItem(client:Client,branchId:string,lockerId:string|null,personId:string|null,item:FoundItem){
  const foundAt=item.foundAt?new Date(item.foundAt):new Date();
  if(foundAt.getTime()>Date.now()+60_000)fail(422,'DATA','A data do achado não pode estar no futuro');
  if(lockerId)await one(client,'SELECT id FROM lockers WHERE id=$1 AND branch_id=$2',[lockerId,branchId]);
  if(personId)await one(client,'SELECT id FROM people WHERE id=$1 AND EXISTS(SELECT 1 FROM memberships WHERE person_id=$1 AND branch_id=$2)',[personId,branchId]);
  let finderName=item.finderName;
  if(item.finderId){const finder=await one<{name:string}>(client,`SELECT p.name FROM people p JOIN memberships m ON m.person_id=p.id
    WHERE p.id=$1 AND m.branch_id=$2 AND m.status='ativo'`,[item.finderId,branchId]);finderName=finder.name;}
  return withMinuteFoundAt((await client.query<{found_at:Date}>(`INSERT INTO retained_items(branch_id,locker_id,person_id,category,custom_category,found_at,expires_at,
    finder_id,finder_name,found_location,description)
    VALUES($1,$2,$3,$4,$5,$6,$6::timestamptz + interval '30 days',$7,$8,$9,$10) RETURNING *`,
  [branchId,lockerId,personId,item.category,item.category==='outro'?item.customCategory:null,foundAt.toISOString(),item.finderId??null,
    finderName,item.foundLocation,item.description])).rows[0]);
}

async function auditRecords(auditId:string){return (await pool.query(`SELECT r.*,l.number locker_number FROM audit_records r
  JOIN lockers l ON l.id=r.locker_id WHERE r.audit_id=$1 ORDER BY l.number,r.issue_type`,[auditId])).rows;}

export async function custodyRoutes(app:FastifyInstance):Promise<void>{
  app.get('/api/branches/:branchId/daily-summary',async request=>{
    const actor=await authenticate(request);const {branchId}=branchParams.parse(request.params);branchAccess(actor,branchId);
    const [overdue,expiring,loans,pending]=await Promise.all([
      pool.query<{id:string;description:string;locker_number:string|null;days_overdue:number}>(`SELECT r.id,r.description,r.locker_number,
        GREATEST(1,extract(day FROM now()-r.expires_at)::int) days_overdue
        FROM retained_items r WHERE r.branch_id=$1 AND r.status='retido' AND r.expires_at<now()
        ORDER BY r.expires_at LIMIT 50`,[branchId]),
      pool.query<{id:string;description:string;locker_number:string|null;days_left:number}>(`SELECT r.id,r.description,r.locker_number,
        extract(day FROM r.expires_at-now())::int days_left
        FROM retained_items r WHERE r.branch_id=$1 AND r.status='retido' AND r.expires_at>=now() AND r.expires_at<now()+interval '5 days'
        ORDER BY r.expires_at LIMIT 50`,[branchId]),
      pool.query<{id:string;locker_number:string;person_name:string;days_out:number}>(`SELECT k.id,l.number locker_number,k.person_name,
        extract(day FROM now()-k.taken_at)::int days_out
        FROM key_loans k JOIN lockers l ON l.id=k.locker_id
        WHERE k.branch_id=$1 AND k.returned_at IS NULL AND k.taken_at<now()-interval '7 days'
        ORDER BY k.taken_at LIMIT 50`,[branchId]),
      pool.query<{kind:string;count:number}>('SELECT kind,count(*)::int count FROM pending_items WHERE branch_id=$1 AND state=$2 GROUP BY kind ORDER BY count DESC',[branchId,'aberta'])
    ]);
    return {overdue:overdue.rows,expiring:expiring.rows,keyLoans:loans.rows,pending:pending.rows};
  });
  app.get('/api/branches/:branchId/retained-items',async request=>{
    const actor=await authenticate(request);const {branchId}=branchParams.parse(request.params);branchAccess(actor,branchId);
    return (await pool.query<{found_at:Date}>(`SELECT r.*,l.number locker_number,p.name person_name FROM retained_items r
      LEFT JOIN lockers l ON l.id=r.locker_id LEFT JOIN people p ON p.id=r.person_id
      WHERE r.branch_id=$1 ORDER BY (r.status='retido') DESC,r.expires_at ASC`,[branchId])).rows.map(withMinuteFoundAt);
  });
  app.post('/api/retained-items',async request=>{
    const actor=await authenticate(request);
    const body=z.object({branchId:id,lockerId:id.nullish(),personId:id.nullish()}).passthrough().parse(request.body);
    const item=retainedItemInput.parse(body.item??body);
    branchAccess(actor,body.branchId,true);
    return transaction(async client=>{
      return insertRetainedItem(client,body.branchId,body.lockerId??null,body.personId??null,item);
    });
  });
  app.patch('/api/retained-items/:id/status',async request=>{
    const actor=await authenticate(request);const {id:itemId}=itemParams.parse(request.params);
    const body=z.object({status:z.enum(['devolvido','destinado']),notes:optionalNotes}).parse(request.body);
    return transaction(async client=>{
      const row=await one<{branch_id:string;status:string;expires_at:string}>(client,'SELECT branch_id,status,expires_at FROM retained_items WHERE id=$1 FOR UPDATE',[itemId]);
      branchAccess(actor,row.branch_id,true);
      if(row.status!=='retido')fail(409,'SITUACAO','Este pertence já recebeu baixa');
      if(body.status==='destinado'&&new Date(row.expires_at).getTime()>Date.now())fail(409,'PRAZO','Aguarde o fim dos 30 dias de guarda antes de dar destinação');
      return withMinuteFoundAt((await client.query<{found_at:Date}>(`UPDATE retained_items SET status=$2,resolved_at=now(),notes=COALESCE($3,notes) WHERE id=$1 RETURNING *`,[itemId,body.status,body.notes??null])).rows[0]);
    });
  });
  app.get('/api/branches/:branchId/audits',async request=>{
    const actor=await authenticate(request);const {branchId}=branchParams.parse(request.params);branchAccess(actor,branchId);
    return (await pool.query(`SELECT a.*,count(DISTINCT r.locker_id)::integer affected_lockers FROM audits a
      LEFT JOIN audit_records r ON r.audit_id=a.id WHERE a.branch_id=$1 GROUP BY a.id ORDER BY a.started_at DESC`,[branchId])).rows;
  });
  app.get('/api/branches/:branchId/auditors',async request=>{
    const actor=await authenticate(request);const {branchId}=branchParams.parse(request.params);branchAccess(actor,branchId);
    const {rows}=await pool.query<{id:string;name:string;registration:string|null;department:string|null}>(`SELECT p.id,p.name,m.registration,m.department FROM memberships m
      JOIN people p ON p.id=m.person_id WHERE m.branch_id=$1 AND m.status='ativo' ORDER BY p.name`,[branchId]);
    return rows.filter(row=>preventionDepartment(row.department));
  });
  app.post('/api/branches/:branchId/audits',async request=>{
    const actor=await authenticate(request);const {branchId}=branchParams.parse(request.params);branchAccess(actor,branchId,true);
    const body=z.object({auditorId:id}).parse(request.body);
    return transaction(async client=>{
      const auditor=await one<{name:string;department:string|null}>(client,`SELECT p.name,m.department FROM people p
        JOIN memberships m ON m.person_id=p.id WHERE p.id=$1 AND m.branch_id=$2 AND m.status='ativo' FOR SHARE OF m`,[body.auditorId,branchId]);
      if(!preventionDepartment(auditor.department))fail(422,'AUDITOR','Selecione um colaborador ativo da Prevenção de Perdas');
      return (await client.query(`INSERT INTO audits(branch_id,title,auditor_id,auditor_name,total_lockers)
        SELECT b.id,'Auditoria - ' || to_char(now() AT TIME ZONE b.timezone,'DD/MM/YYYY') || ' às ' ||
          to_char(now() AT TIME ZONE b.timezone,'HH24:MI'),$2,$3,
          (SELECT count(*)::integer FROM lockers WHERE branch_id=b.id) FROM branches b WHERE b.id=$1 RETURNING *`,
        [branchId,body.auditorId,auditor.name])).rows[0];
    });
  });
  app.delete('/api/audits/:id',async request=>{
    const actor=await authenticate(request);const {id:auditId}=itemParams.parse(request.params);
    return transaction(async client=>{
      const audit=await one<{branch_id:string}>(client,'SELECT branch_id FROM audits WHERE id=$1 FOR UPDATE',[auditId]);
      adminAccess(actor,audit.branch_id);
      await client.query('DELETE FROM audits WHERE id=$1',[auditId]);
      return {deleted:true,id:auditId};
    });
  });
  app.get('/api/audits/:id',async request=>{
    const actor=await authenticate(request);const {id:auditId}=itemParams.parse(request.params);
    const audit=(await pool.query<{branch_id:string}>('SELECT * FROM audits WHERE id=$1',[auditId])).rows[0];
    if(!audit)fail(404,'NAO_ENCONTRADO','Auditoria não encontrada');branchAccess(actor,audit.branch_id);
    const records=await auditRecords(auditId);
    return {audit,records};
  });
  app.post('/api/audits/:id/records',async request=>{
    const actor=await authenticate(request);const {id:auditId}=itemParams.parse(request.params);
    const body=z.object({lockerId:id,issueType:issue,notes:optionalNotes}).parse(request.body);
    return transaction(async client=>{
      const audit=await one<{branch_id:string;status:string}>(client,'SELECT branch_id,status FROM audits WHERE id=$1 FOR UPDATE',[auditId]);branchAccess(actor,audit.branch_id,true);
      if(audit.status!=='em_andamento')fail(409,'AUDITORIA','A auditoria já foi concluída');
      const locker=await one<{sector_occupant:string|null}>(client,'SELECT sector_occupant FROM lockers WHERE id=$1 AND branch_id=$2 FOR UPDATE',[body.lockerId,audit.branch_id]);
      const occupants=(await client.query<{name:string;registration:string|null;department:string|null}>(`SELECT p.name,m.registration,m.department FROM allocations a
        JOIN people p ON p.id=a.person_id LEFT JOIN memberships m ON m.person_id=p.id AND m.branch_id=a.branch_id
        WHERE a.locker_id=$1 AND a.ended_at IS NULL ORDER BY p.name`,[body.lockerId])).rows;
      return (await client.query(`INSERT INTO audit_records(audit_id,locker_id,issue_type,notes,occupants,sector_occupant)
        VALUES($1,$2,$3,$4,$5::jsonb,$6) RETURNING *`,
        [auditId,body.lockerId,body.issueType,body.notes??null,JSON.stringify(occupants),locker.sector_occupant])).rows[0];
    });
  });
  app.patch('/api/audits/:id/complete',async request=>{
    const actor=await authenticate(request);const {id:auditId}=itemParams.parse(request.params);
    const body=z.object({summaryNotes:optionalNotes}).parse(request.body);
    return transaction(async client=>{
      const audit=await one<{branch_id:string;status:string}>(client,'SELECT branch_id,status FROM audits WHERE id=$1 FOR UPDATE',[auditId]);branchAccess(actor,audit.branch_id,true);
      if(audit.status!=='em_andamento')fail(409,'AUDITORIA','A auditoria já foi concluída');
      return (await client.query(`UPDATE audits SET status='concluida',completed_at=now(),summary_notes=$2 WHERE id=$1 RETURNING *`,[auditId,body.summaryNotes??null])).rows[0];
    });
  });
  app.get('/api/audits/:id/report',async request=>{
    const actor=await authenticate(request);const {id:auditId}=itemParams.parse(request.params);
    const audit=(await pool.query<{branch_id:string;status:string;total_lockers:number}>(
      `SELECT a.*,b.name branch_name FROM audits a JOIN branches b ON b.id=a.branch_id WHERE a.id=$1`,[auditId])).rows[0];
    if(!audit)fail(404,'NAO_ENCONTRADO','Auditoria não encontrada');
    branchAccess(actor,audit.branch_id);
    if(audit.status!=='concluida')fail(409,'AUDITORIA','Conclua a auditoria antes de gerar o relatório');
    const records=await auditRecords(auditId) as {issue_type:z.infer<typeof issue>;locker_id:string}[];
    const affected=new Set(records.map(row=>row.locker_id)).size;
    return {audit,records:records.map(row=>({...row,recommendation:recommendations[row.issue_type]})),affectedLockers:affected,
      complianceIndex:audit.total_lockers?Math.max(0,Math.round(100*(audit.total_lockers-affected)/audit.total_lockers)):100};
  });
}
