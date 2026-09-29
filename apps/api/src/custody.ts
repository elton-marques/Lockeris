import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { id } from '@armarios/contracts';
import { authenticate, branchAccess } from './auth.js';
import { pool, transaction, one, fail } from './db.js';

const branchParams=z.object({branchId:id});
const itemParams=z.object({id});
const text=z.string().trim().min(1).max(2000);
const optionalNotes=z.string().trim().max(2000).nullish();
const issue=z.enum(['cadeado_fora_padrao','sem_cadeado','itens_fora_armario','mecanismo_avariado','outro']);
const recommendations:Record<z.infer<typeof issue>,string>={
  cadeado_fora_padrao:'Substituir o cadeado pelo modelo autorizado.',
  sem_cadeado:'Providenciar cadeado e verificar a guarda dos pertences.',
  itens_fora_armario:'Recolher e identificar os itens fora do armário.',
  mecanismo_avariado:'Solicitar manutenção do mecanismo e restringir o uso até a correção.',
  outro:'Avaliar a ocorrência e registrar a providência adotada.'
};

export async function custodyRoutes(app:FastifyInstance):Promise<void>{
  app.get('/api/branches/:branchId/retained-items',async request=>{
    const actor=await authenticate(request);const {branchId}=branchParams.parse(request.params);branchAccess(actor,branchId);
    return (await pool.query(`SELECT r.*,l.number locker_number,p.name person_name FROM retained_items r
      JOIN lockers l ON l.id=r.locker_id LEFT JOIN people p ON p.id=r.person_id
      WHERE r.branch_id=$1 ORDER BY (r.status='retido') DESC,r.expires_at ASC`,[branchId])).rows;
  });
  app.post('/api/retained-items',async request=>{
    const actor=await authenticate(request);
    const body=z.object({branchId:id,lockerId:id,personId:id.nullish(),description:text,notes:optionalNotes}).parse(request.body);
    branchAccess(actor,body.branchId,true);
    return transaction(async client=>{
      await one(client,'SELECT id FROM lockers WHERE id=$1 AND branch_id=$2',[body.lockerId,body.branchId]);
      if(body.personId)await one(client,'SELECT id FROM people WHERE id=$1 AND EXISTS(SELECT 1 FROM memberships WHERE person_id=$1 AND branch_id=$2)',[body.personId,body.branchId]);
      return (await client.query(`INSERT INTO retained_items(branch_id,locker_id,person_id,description,notes)
        VALUES($1,$2,$3,$4,$5) RETURNING *`,[body.branchId,body.lockerId,body.personId??null,body.description,body.notes??null])).rows[0];
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
      return (await client.query(`UPDATE retained_items SET status=$2,resolved_at=now(),notes=COALESCE($3,notes) WHERE id=$1 RETURNING *`,[itemId,body.status,body.notes??null])).rows[0];
    });
  });
  app.get('/api/branches/:branchId/audits',async request=>{
    const actor=await authenticate(request);const {branchId}=branchParams.parse(request.params);branchAccess(actor,branchId);
    return (await pool.query(`SELECT a.*,count(DISTINCT r.locker_id)::integer affected_lockers FROM audits a
      LEFT JOIN audit_records r ON r.audit_id=a.id WHERE a.branch_id=$1 GROUP BY a.id ORDER BY a.started_at DESC`,[branchId])).rows;
  });
  app.post('/api/branches/:branchId/audits',async request=>{
    const actor=await authenticate(request);const {branchId}=branchParams.parse(request.params);branchAccess(actor,branchId,true);
    const body=z.object({title:text,auditorName:text}).parse(request.body);
    return (await pool.query(`INSERT INTO audits(branch_id,title,auditor_name,total_lockers)
      SELECT $1,$2,$3,count(*)::integer FROM lockers WHERE branch_id=$1 RETURNING *`,[branchId,body.title,body.auditorName])).rows[0];
  });
  app.get('/api/audits/:id',async request=>{
    const actor=await authenticate(request);const {id:auditId}=itemParams.parse(request.params);
    const audit=(await pool.query<{branch_id:string}>('SELECT * FROM audits WHERE id=$1',[auditId])).rows[0];
    if(!audit)fail(404,'NAO_ENCONTRADO','Auditoria não encontrada');branchAccess(actor,audit.branch_id);
    const records=(await pool.query(`SELECT r.*,l.number locker_number FROM audit_records r JOIN lockers l ON l.id=r.locker_id WHERE r.audit_id=$1 ORDER BY l.number,r.issue_type`,[auditId])).rows;
    return {audit,records};
  });
  app.post('/api/audits/:id/records',async request=>{
    const actor=await authenticate(request);const {id:auditId}=itemParams.parse(request.params);
    const body=z.object({lockerId:id,issueType:issue,notes:optionalNotes}).parse(request.body);
    return transaction(async client=>{
      const audit=await one<{branch_id:string;status:string}>(client,'SELECT branch_id,status FROM audits WHERE id=$1 FOR UPDATE',[auditId]);branchAccess(actor,audit.branch_id,true);
      if(audit.status!=='em_andamento')fail(409,'AUDITORIA','A auditoria já foi concluída');
      await one(client,'SELECT id FROM lockers WHERE id=$1 AND branch_id=$2',[body.lockerId,audit.branch_id]);
      return (await client.query(`INSERT INTO audit_records(audit_id,locker_id,issue_type,notes) VALUES($1,$2,$3,$4) RETURNING *`,
        [auditId,body.lockerId,body.issueType,body.notes??null])).rows[0];
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
    const records=(await pool.query<{issue_type:z.infer<typeof issue>;locker_id:string}>(`SELECT r.*,l.number locker_number FROM audit_records r
      JOIN lockers l ON l.id=r.locker_id WHERE r.audit_id=$1 ORDER BY l.number,r.issue_type`,[auditId])).rows;
    const affected=new Set(records.map(row=>row.locker_id)).size;
    return {audit,records:records.map(row=>({...row,recommendation:recommendations[row.issue_type]})),affectedLockers:affected,
      complianceIndex:audit.total_lockers?Math.max(0,Math.round(100*(audit.total_lockers-affected)/audit.total_lockers)):100};
  });
}
