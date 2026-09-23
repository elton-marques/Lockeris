import type { FastifyInstance } from 'fastify';
import { createHmac } from 'node:crypto';
import argon2 from 'argon2';
import Papa from 'papaparse';
import { z } from 'zod';
import { id, operation, role } from '@armarios/contracts';
import { authenticate, branchAccess, adminAccess } from './auth.js';
import { hash, pool, transaction, one, fail } from './db.js';
import { idempotent, event } from './operations.js';
import { refreshPending } from './pending.js';

const route=z.object({branchId:id}),routeItem=z.object({branchId:id,itemId:id});
export async function managementRoutes(app:FastifyInstance):Promise<void> {
  app.get('/api/branches/:branchId/dashboard',async request=>{
    const actor=await authenticate(request),{branchId}=route.parse(request.params);branchAccess(actor,branchId);
    const [lockers,people,pending]=await Promise.all([
      pool.query<{total:string;occupied:string;blocked:string}>(`SELECT count(*) total,count(*) FILTER (WHERE EXISTS(SELECT 1 FROM allocations a WHERE a.locker_id=l.id AND a.ended_at IS NULL)) occupied,
        count(*) FILTER (WHERE l.condition<>'disponivel' OR l.migration_status='inconclusivo') blocked FROM lockers l WHERE l.branch_id=$1`,[branchId]),
      pool.query<{total:string}>('SELECT count(*) total FROM memberships WHERE branch_id=$1 AND status=$2',[branchId,'ativo']),
      pool.query<{total:string}>('SELECT count(*) total FROM pending_items WHERE branch_id=$1 AND state=$2',[branchId,'aberta'])
    ]);
    return {lockers:lockers.rows[0],people:people.rows[0],pending:pending.rows[0]};
  });
  app.get('/api/branches/:branchId/pending',async request=>{
    const actor=await authenticate(request),{branchId}=route.parse(request.params);branchAccess(actor,branchId);
    return (await pool.query(`SELECT p.*,pe.name person_name,m.registration,m.version membership_version,l.number locker_number,l.version locker_version,lo.name location_name,
      a.id allocation_id,a.version allocation_version,a.locker_id allocation_locker_id,al.number allocation_locker_number,alo.name allocation_location_name,
      s.version sharing_version,s.due_at sharing_due_at,season.version seasonal_version,season.due_at seasonal_due_at
      FROM pending_items p
      LEFT JOIN memberships m ON p.subject_type='membership' AND m.id=p.subject_id LEFT JOIN people pe ON pe.id=m.person_id
      LEFT JOIN lockers l ON p.subject_type='locker' AND l.id=p.subject_id LEFT JOIN locations lo ON lo.id=l.location_id
      LEFT JOIN allocations a ON a.person_id=m.person_id AND a.ended_at IS NULL LEFT JOIN lockers al ON al.id=a.locker_id LEFT JOIN locations alo ON alo.id=al.location_id
      LEFT JOIN sharings s ON p.subject_type='sharing' AND s.id=p.subject_id
      LEFT JOIN allocations season ON p.subject_type='allocation' AND season.id=p.subject_id
      WHERE p.branch_id=$1 ORDER BY p.state,p.updated_at DESC LIMIT 1000`,[branchId])).rows;
  });
  app.post('/api/branches/:branchId/pending/:itemId/resolve',async request=>{
    const actor=await authenticate(request),{branchId,itemId}=routeItem.parse(request.params);branchAccess(actor,branchId,true);
    const body=operation.extend({expectedVersion:z.number().int().positive(),resolution:z.string().min(3).max(1000)}).parse(request.body);
    return transaction(client=>idempotent(client,body.operationId,branchId,actor.id,body,async()=>{
      const pending=await one<{kind:string;state:string;version:number}>(client,'SELECT * FROM pending_items WHERE id=$1 AND branch_id=$2 FOR UPDATE',[itemId,branchId]);
      if(pending.version!==body.expectedVersion||pending.state!=='aberta')fail(409,'VERSAO','Pendência alterada; recarregue');
      if(['ausente_ti','atuacao_encerrada','sazonal_vencida','compartilhamento_vencido','migracao_inconclusiva'].includes(pending.kind)) fail(409,'CONDICAO','Regularize a condição antes de resolver');
      const {rows}=await client.query("UPDATE pending_items SET state='resolvida',resolution=$2,resolved_by=$3,updated_at=now(),version=version+1 WHERE id=$1 RETURNING *",[itemId,body.resolution,actor.id]);
      await event(client,branchId,actor.id,'pendencia_resolvida','pending',itemId,{resolution:body.resolution});return rows[0];
    }));
  });
  app.post('/api/branches/:branchId/pending/:itemId/wait',async request=>{
    const actor=await authenticate(request),{branchId,itemId}=routeItem.parse(request.params);branchAccess(actor,branchId,true);
    const body=operation.extend({expectedVersion:z.number().int().positive(),reason:z.string().min(3).max(1000)}).parse(request.body);
    return transaction(client=>idempotent(client,body.operationId,branchId,actor.id,body,async()=>{
      const pending=await one<{kind:string;state:string;version:number}>(client,'SELECT kind,state,version FROM pending_items WHERE id=$1 AND branch_id=$2 FOR UPDATE',[itemId,branchId]);
      if(pending.version!==body.expectedVersion)fail(409,'VERSAO','Pendência alterada; recarregue');
      if(pending.kind!=='sem_armario'||pending.state!=='aberta')fail(409,'PENDENCIA','Espera válida apenas para necessidade de armário aberta');
      const {rows}=await client.query('UPDATE pending_items SET reason=$2,updated_at=now(),version=version+1 WHERE id=$1 RETURNING *',[itemId,body.reason]);
      await event(client,branchId,actor.id,'aguardando_vaga','pending',itemId,{reason:body.reason});return rows[0];
    }));
  });
  app.post('/api/branches/:branchId/people/:itemId/exception',async request=>{
    const actor=await authenticate(request),{branchId,itemId}=routeItem.parse(request.params);branchAccess(actor,branchId,true);
    const body=operation.extend({expectedVersion:z.number().int().positive(),reason:z.string().min(3).max(1000)}).parse(request.body);
    return transaction(client=>idempotent(client,body.operationId,branchId,actor.id,body,async()=>{
      const member=await one<{version:number}>(client,'SELECT version FROM memberships WHERE id=$1 AND branch_id=$2 FOR UPDATE',[itemId,branchId]);
      if(member.version!==body.expectedVersion)fail(409,'VERSAO','Pessoa alterada; recarregue');
      await client.query('INSERT INTO need_exceptions(membership_id,reason,author_id) VALUES($1,$2,$3) ON CONFLICT(membership_id) DO UPDATE SET reason=$2,author_id=$3,created_at=now()',[itemId,body.reason,actor.id]);
      await client.query('UPDATE memberships SET version=version+1,updated_at=now() WHERE id=$1',[itemId]);
      await event(client,branchId,actor.id,'excecao_armario','membership',itemId,{reason:body.reason});await refreshPending(client,branchId);return {ok:true};
    }));
  });
  app.get('/api/branches/:branchId/history',async request=>{
    const actor=await authenticate(request),{branchId}=route.parse(request.params);branchAccess(actor,branchId);
    const query=z.object({limit:z.coerce.number().int().min(1).max(1000).default(100)}).parse(request.query);
    return (await pool.query('SELECT id,kind,entity_type,entity_id,details,happened_at FROM events WHERE branch_id=$1 ORDER BY id DESC LIMIT $2',[branchId,query.limit])).rows;
  });
  app.get('/api/branches/:branchId/history/export',async (request,reply)=>{
    const actor=await authenticate(request),{branchId}=route.parse(request.params);branchAccess(actor,branchId);
    if(actor.role==='consulta') fail(403,'PERMISSAO','Exportação não permitida');
    const {rows}=await pool.query('SELECT id,kind,entity_type,entity_id,happened_at FROM events WHERE branch_id=$1 ORDER BY id DESC LIMIT 10000',[branchId]);
    reply.header('Content-Type','text/csv; charset=utf-8').header('Content-Disposition','attachment; filename="historico.csv"');
    return Papa.unparse(rows,{escapeFormulae:true});
  });
  app.get('/api/branches/:branchId/users',async request=>{
    const actor=await authenticate(request),{branchId}=route.parse(request.params);adminAccess(actor,branchId);
    return (await pool.query('SELECT id,email,role,branch_id,active,must_change_password,version FROM users WHERE branch_id=$1 ORDER BY email',[branchId])).rows;
  });
  app.post('/api/branches/:branchId/users',async request=>{
    const actor=await authenticate(request),{branchId}=route.parse(request.params);adminAccess(actor,branchId);
    const body=operation.extend({email:z.email(),role:role.exclude(['geral']),temporaryPassword:z.string().min(12)}).parse(request.body);
    return transaction(client=>idempotent(client,body.operationId,branchId,actor.id,{...body,temporaryPasswordHash:hash(body.temporaryPassword),temporaryPassword:undefined},async()=>{
      const {rows}=await client.query("INSERT INTO users(email,password_hash,role,branch_id,must_change_password) VALUES($1,$2,$3,$4,true) RETURNING id,email,role,branch_id",[body.email,await argon2.hash(body.temporaryPassword,{type:argon2.argon2id}),body.role,branchId]);
      await event(client,branchId,actor.id,'usuario_criado','user',rows[0].id);return rows[0];
    }));
  });
  app.post('/api/branches/:branchId/users/:itemId/reset',async request=>{
    const actor=await authenticate(request),{branchId,itemId}=routeItem.parse(request.params);adminAccess(actor,branchId);
    const body=operation.extend({expectedVersion:z.number().int().positive(),temporaryPassword:z.string().min(12)}).parse(request.body);
    return transaction(client=>idempotent(client,body.operationId,branchId,actor.id,{...body,temporaryPasswordHash:hash(body.temporaryPassword),temporaryPassword:undefined},async()=>{
      const user=await one<{id:string;version:number}>(client,'SELECT id,version FROM users WHERE id=$1 AND branch_id=$2 FOR UPDATE',[itemId,branchId]);
      if(user.version!==body.expectedVersion)fail(409,'VERSAO','Usuário alterado; recarregue');
      await client.query('UPDATE users SET password_hash=$2,must_change_password=true,version=version+1 WHERE id=$1',[user.id,await argon2.hash(body.temporaryPassword,{type:argon2.argon2id})]);
      await client.query('DELETE FROM sessions WHERE user_id=$1',[user.id]);
      await event(client,branchId,actor.id,'senha_redefinida','user',user.id);return {ok:true};
    }));
  });
  app.patch('/api/branches/:branchId/users/:itemId',async request=>{
    const actor=await authenticate(request),{branchId,itemId}=routeItem.parse(request.params);adminAccess(actor,branchId);
    const body=operation.extend({expectedVersion:z.number().int().positive(),role:role.exclude(['geral']).optional(),active:z.boolean().optional()}).parse(request.body);
    return transaction(client=>idempotent(client,body.operationId,branchId,actor.id,body,async()=>{
      const old=await one<{version:number;role:string;active:boolean}>(client,'SELECT version,role,active FROM users WHERE id=$1 AND branch_id=$2 FOR UPDATE',[itemId,branchId]);
      if(old.version!==body.expectedVersion)fail(409,'VERSAO','Usuário alterado');
      if(itemId===actor.id&&body.active===false)fail(409,'USUARIO','Não é possível desativar a própria conta');
      const {rows}=await client.query('UPDATE users SET role=COALESCE($2,role),active=COALESCE($3,active),version=version+1 WHERE id=$1 RETURNING id,email,role,active,version',[itemId,body.role,body.active]);
      if(body.active===false)await client.query('DELETE FROM sessions WHERE user_id=$1',[itemId]);
      await event(client,branchId,actor.id,'usuario_alterado','user',itemId,{before:old,after:rows[0]});return rows[0];
    }));
  });
  app.get('/api/branches/:branchId/devices',async request=>{
    const actor=await authenticate(request),{branchId}=route.parse(request.params);adminAccess(actor,branchId);
    return (await pool.query('SELECT id,label,revoked_at,version,created_at FROM authorized_devices WHERE branch_id=$1 ORDER BY created_at DESC',[branchId])).rows;
  });
  app.post('/api/branches/:branchId/devices',async request=>{
    const actor=await authenticate(request),{branchId}=route.parse(request.params);adminAccess(actor,branchId);
    const body=operation.extend({label:z.string().min(2).max(120)}).parse(request.body);
    const key=process.env.DEVICE_SECRET_KEY;
    if(!key||key.length<32)fail(503,'CONFIGURACAO','Chave de dispositivos não configurada');
    const secret=createHmac('sha256',key).update(`${body.operationId}:${branchId}:${actor.id}`).digest('base64url');
    const result=await transaction(client=>idempotent(client,body.operationId,branchId,actor.id,body,async()=>{
      const {rows}=await client.query('INSERT INTO authorized_devices(branch_id,label,secret_hash,authorized_by) VALUES($1,$2,$3,$4) RETURNING id,label',[branchId,body.label,hash(secret),actor.id]);
      await event(client,branchId,actor.id,'dispositivo_autorizado','device',rows[0].id);return rows[0] as {id:string;label:string};
    }));
    return {...result,secret};
  });
  app.post('/api/branches/:branchId/devices/:itemId/revoke',async request=>{
    const actor=await authenticate(request),{branchId,itemId}=routeItem.parse(request.params);adminAccess(actor,branchId);
    const body=operation.extend({expectedVersion:z.number().int().positive()}).parse(request.body);
    return transaction(client=>idempotent(client,body.operationId,branchId,actor.id,body,async()=>{
      const device=await one<{version:number;revoked_at:string|null}>(client,'SELECT version,revoked_at FROM authorized_devices WHERE id=$1 AND branch_id=$2 FOR UPDATE',[itemId,branchId]);
      if(device.version!==body.expectedVersion||device.revoked_at)fail(409,'VERSAO','Dispositivo alterado ou já revogado');
      await client.query('UPDATE authorized_devices SET revoked_at=now(),version=version+1 WHERE id=$1',[itemId]);
      await event(client,branchId,actor.id,'dispositivo_revogado','device',itemId);return {ok:true};
    }));
  });
  app.get('/api/branches/:branchId/offline',async request=>{
    const actor=await authenticate(request),{branchId}=route.parse(request.params);branchAccess(actor,branchId);
    const secret=request.headers['x-device-secret'];if(typeof secret!=='string') fail(403,'DISPOSITIVO','Navegador não autorizado');
    const device=await pool.query('SELECT id FROM authorized_devices WHERE branch_id=$1 AND secret_hash=$2 AND revoked_at IS NULL',[branchId,hash(secret)]);
    if(!device.rows[0]) fail(403,'DISPOSITIVO','Navegador não autorizado ou revogado');
    return transaction(async client=>{
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const lockers=await client.query(`SELECT l.id,l.number,l.size,l.capacity,l.modality,l.destination,l.condition,l.migration_status,lo.name location_name,
          coalesce(json_agg(json_build_object('name',p.name,'registration',m.registration,'category',m.category)) FILTER (WHERE a.id IS NOT NULL),'[]') occupants
          FROM lockers l JOIN locations lo ON lo.id=l.location_id LEFT JOIN allocations a ON a.locker_id=l.id AND a.ended_at IS NULL
          LEFT JOIN people p ON p.id=a.person_id LEFT JOIN memberships m ON m.person_id=p.id AND m.branch_id=l.branch_id WHERE l.branch_id=$1 GROUP BY l.id,lo.name ORDER BY lo.name,l.number`,[branchId]);
      const people=await client.query(`SELECT m.id,m.person_id,p.name,m.registration,m.category,m.company,m.department,m.function_name,m.status,m.needs_fixed,
        a.locker_id,l.number,lo.name location_name FROM memberships m JOIN people p ON p.id=m.person_id
        LEFT JOIN allocations a ON a.person_id=p.id AND a.ended_at IS NULL LEFT JOIN lockers l ON l.id=a.locker_id
        LEFT JOIN locations lo ON lo.id=l.location_id WHERE m.branch_id=$1 AND (a.id IS NOT NULL OR EXISTS(SELECT 1 FROM pending_items pend WHERE pend.branch_id=$1 AND pend.subject_type='membership' AND pend.subject_id=m.id AND pend.state='aberta'))`,[branchId]);
      const pending=await client.query(`SELECT p.id,p.kind,p.subject_type,p.subject_id,p.state,p.reason,pe.name person_name,m.registration,
        l.number locker_number,lo.name location_name,al.number allocation_locker_number,alo.name allocation_location_name
        FROM pending_items p LEFT JOIN memberships m ON p.subject_type='membership' AND m.id=p.subject_id
        LEFT JOIN people pe ON pe.id=m.person_id LEFT JOIN lockers l ON p.subject_type='locker' AND l.id=p.subject_id
        LEFT JOIN locations lo ON lo.id=l.location_id LEFT JOIN allocations a ON a.person_id=m.person_id AND a.ended_at IS NULL
        LEFT JOIN lockers al ON al.id=a.locker_id LEFT JOIN locations alo ON alo.id=al.location_id WHERE p.branch_id=$1 AND p.state=$2`,[branchId,'aberta']);
      const branch=await client.query<{name:string}>('SELECT name FROM branches WHERE id=$1',[branchId]);
      const session=await client.query<{expires_at:Date}>('SELECT expires_at FROM sessions WHERE id_hash=$1',[hash(request.cookies.armarios_session??'')]);
      const issuedAt=new Date();return {issuedAt:issuedAt.toISOString(),expiresAt:session.rows[0].expires_at,branchId,branchName:branch.rows[0].name,userId:actor.id,deviceId:device.rows[0].id,lockers:lockers.rows,people:people.rows,pending:pending.rows};
    });
  });
}
