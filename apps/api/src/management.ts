import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createHmac } from 'node:crypto';
import argon2 from 'argon2';
import Papa from 'papaparse';
import { z } from 'zod';
import { id, operation, role } from '@armarios/contracts';
import { authenticate, branchAccess, adminAccess } from './auth.js';
import { hash, pool, transaction, one, fail } from './db.js';
import { idempotent, event } from './operations.js';
import { refreshPending } from './pending.js';
import {registrationKey} from './registration.js';

const route=z.object({branchId:id}),routeItem=z.object({branchId:id,itemId:id});
const pendingDetailsSql=(openOnly:boolean)=>`SELECT p.*,pe.name person_name,m.person_id,m.registration,m.department,m.function_name,m.origin,m.ti_present,
  m.version membership_version,COALESCE(l.id,al.id,sl.id,season_l.id) pending_locker_id,
  COALESCE(l.number,al.number,sl.number,season_l.number) locker_number,
  COALESCE(l.version,al.version,sl.version,season_l.version) locker_version,
  COALESCE(l.sector_occupant,al.sector_occupant,sl.sector_occupant,season_l.sector_occupant) sector_occupant,
  COALESCE(l.is_double,al.is_double,sl.is_double,season_l.is_double) is_double,
  COALESCE(l.condition,al.condition,sl.condition,season_l.condition) condition,
  COALESCE(l.key_copy_available,al.key_copy_available,sl.key_copy_available,season_l.key_copy_available) key_copy_available,
  COALESCE(l.migration_status,al.migration_status,sl.migration_status,season_l.migration_status) migration_status,
  a.id allocation_id,a.version allocation_version,al.number allocation_locker_number,
  s.version sharing_version,s.due_at sharing_due_at,season.version seasonal_version,season.due_at seasonal_due_at,
  occupants.data occupants,source.data source_rows
  FROM pending_items p
  LEFT JOIN memberships m ON p.subject_type='membership' AND m.id=p.subject_id
  LEFT JOIN people pe ON pe.id=m.person_id
  LEFT JOIN lockers l ON p.subject_type='locker' AND l.id=p.subject_id
  LEFT JOIN allocations a ON a.person_id=m.person_id AND a.ended_at IS NULL
  LEFT JOIN lockers al ON al.id=a.locker_id
  LEFT JOIN sharings s ON p.subject_type='sharing' AND s.id=p.subject_id
  LEFT JOIN lockers sl ON sl.id=s.locker_id
  LEFT JOIN allocations season ON p.subject_type='allocation' AND season.id=p.subject_id
  LEFT JOIN lockers season_l ON season_l.id=season.locker_id
  LEFT JOIN LATERAL (SELECT coalesce(json_agg(json_build_object('allocationId',oa.id,'allocationVersion',oa.version,
    'membershipId',om.id,'membershipVersion',om.version,'personId',op.id,'name',op.name,'registration',om.registration,
    'department',om.department,'functionName',om.function_name,'origin',om.origin) ORDER BY op.name),'[]') data
    FROM allocations oa JOIN people op ON op.id=oa.person_id
    LEFT JOIN memberships om ON om.person_id=op.id AND om.branch_id=p.branch_id
    WHERE oa.locker_id=COALESCE(l.id,al.id,sl.id,season_l.id) AND oa.ended_at IS NULL) occupants ON true
  LEFT JOIN LATERAL (SELECT coalesce(json_agg(src.raw ORDER BY src.row_number),'[]') data
    FROM import_sources src JOIN imports imp ON imp.id=src.import_id AND imp.state='applied'
    WHERE src.entity_type='locker' AND src.entity_id=COALESCE(l.id,al.id,sl.id,season_l.id)) source ON true
  WHERE p.branch_id=$1 ${openOnly?"AND p.state='aberta'":''} ORDER BY p.state,p.updated_at DESC LIMIT 1000`;
export async function managementRoutes(app:FastifyInstance):Promise<void> {
  app.get('/api/branches/:branchId/dashboard',async request=>{
    const actor=await authenticate(request),{branchId}=route.parse(request.params);branchAccess(actor,branchId);
    const [lockers,people,pending]=await Promise.all([
      pool.query<{total:string;occupied:string;blocked:string}>(`SELECT count(*) total,count(*) FILTER (WHERE l.sector_occupant IS NOT NULL OR EXISTS(SELECT 1 FROM allocations a WHERE a.locker_id=l.id AND a.ended_at IS NULL)) occupied,
        count(*) FILTER (WHERE l.condition<>'disponivel' OR l.migration_status='inconclusivo') blocked FROM lockers l WHERE l.branch_id=$1`,[branchId]),
      pool.query<{total:string}>('SELECT count(*) total FROM memberships WHERE branch_id=$1 AND status=$2',[branchId,'ativo']),
      pool.query<{total:string}>('SELECT count(*) total FROM pending_items WHERE branch_id=$1 AND state=$2',[branchId,'aberta'])
    ]);
    return {lockers:lockers.rows[0],people:people.rows[0],pending:pending.rows[0]};
  });
  app.get('/api/branches/:branchId/pending',async request=>{
    const actor=await authenticate(request),{branchId}=route.parse(request.params);branchAccess(actor,branchId);
    return (await pool.query(pendingDetailsSql(false),[branchId])).rows;
  });
  async function reviseLocker(request:FastifyRequest,direct:boolean){
    const actor=await authenticate(request),{branchId,itemId}=routeItem.parse(request.params);adminAccess(actor,branchId);
    const body=operation.extend({expectedVersion:z.number().int().positive().optional(),expectedLockerVersion:z.number().int().positive(),
      number:z.never().optional(),isDouble:z.boolean(),sectorOccupant:z.string().trim().max(120).nullable(),
      condition:z.enum(['disponivel','manutencao','bloqueado']).optional(),keyCopyAvailable:z.boolean().optional(),
      finalize:z.boolean().default(false),occupant:z.object({allocationId:id.optional(),membershipId:id.optional(),expectedMembershipVersion:z.number().int().positive().optional(),
        name:z.string().trim().max(200),registration:z.string().trim().max(80).nullable(),
        department:z.string().trim().max(200).nullable(),functionName:z.string().trim().max(200).nullable()}).nullable()}).parse(request.body);
    return transaction(client=>idempotent(client,body.operationId,branchId,actor.id,body,async()=>{
      const pending=direct?null:await one<{version:number;state:string;kind:string;subject_type:string;subject_id:string}>(client,
        'SELECT * FROM pending_items WHERE id=$1 AND branch_id=$2 FOR UPDATE',[itemId,branchId]);
      if(pending&&(pending.version!==body.expectedVersion||pending.state!=='aberta'))fail(409,'VERSAO','Pendência alterada; recarregue');
      const lockerId=direct?itemId:pending!.subject_type==='locker'?pending!.subject_id:(await client.query<{locker_id:string}>(`SELECT a.locker_id FROM memberships m
        JOIN allocations a ON a.person_id=m.person_id AND a.ended_at IS NULL WHERE m.id=$1 AND m.branch_id=$2`,[pending!.subject_id,branchId])).rows[0]?.locker_id;
      if(!lockerId)fail(409,'ARMARIO','Esta pendência não possui armário para revisar');
      const locker=await one<{id:string;version:number;number:string;modality:string;capacity:number;is_double:boolean;sector_occupant:string|null}>(client,
        'SELECT * FROM lockers WHERE id=$1 AND branch_id=$2 FOR UPDATE',[lockerId,branchId]);
      if(locker.version!==body.expectedLockerVersion)fail(409,'VERSAO','Armário alterado; recarregue');
      const count=Number((await client.query<{count:string}>('SELECT count(*) FROM allocations WHERE locker_id=$1 AND ended_at IS NULL',[lockerId])).rows[0].count);
      if(count>(body.isDouble?2:1))fail(409,'OCUPACAO','Armário com duas pessoas deve continuar duplo');
      if(body.sectorOccupant&&(count||body.occupant))fail(409,'OCUPACAO','Um armário com pessoa não pode ser ocupado por setor');
      let officialName:string|null=null;
      if(body.occupant){
        const allocation=body.occupant.allocationId?await one<{person_id:string}>(client,'SELECT person_id FROM allocations WHERE id=$1 AND locker_id=$2 AND ended_at IS NULL FOR UPDATE',
          [body.occupant.allocationId,lockerId]):null;
        const member=allocation?await one<{id:string;person_id:string;origin:string;version:number;registration:string|null;department:string|null;function_name:string|null;name:string}>(client,
          `SELECT m.*,p.name FROM memberships m JOIN people p ON p.id=m.person_id WHERE m.id=$1 AND m.branch_id=$2 FOR UPDATE OF m`,
          [body.occupant.membershipId,branchId]):null;
        if(allocation&&(member?.person_id!==allocation.person_id||member.version!==body.occupant.expectedMembershipVersion))fail(409,'VERSAO','Ocupante alterado; recarregue');
        if(!allocation&&count>=(body.isDouble?2:1))fail(409,'CAPACIDADE','Armário sem vaga para outra pessoa');
        const candidates=body.occupant.registration?(await client.query<{id:string;person_id:string;registration:string;name:string}>(`SELECT m.id,m.person_id,m.registration,p.name
          FROM memberships m JOIN people p ON p.id=m.person_id WHERE m.branch_id=$1 AND m.origin='ti' AND m.status='ativo' AND m.ti_present=true`,[branchId])).rows
          .filter(row=>registrationKey(row.registration)===registrationKey(body.occupant!.registration!)):[];
        if(candidates.length>1)fail(409,'MATRICULA_AMBIGUA','Mais de um colaborador corresponde à matrícula informada');
        const official=candidates[0];
        if(official){
          officialName=official.name;
          if(official.person_id!==member?.person_id){
            const occupied=await client.query<{number:string}>(`SELECT l.number FROM allocations a JOIN lockers l ON l.id=a.locker_id
              WHERE a.person_id=$1 AND a.ended_at IS NULL FOR UPDATE OF a`,[official.person_id]);
            if(occupied.rowCount)fail(409,'OCUPACAO',`A matrícula já ocupa o armário ${occupied.rows[0].number}; faça a transferência antes`);
            if(allocation&&member?.origin==='migracao'){
              await client.query('UPDATE allocations SET person_id=$2,version=version+1 WHERE id=$1',[body.occupant.allocationId,official.person_id]);
              await client.query("UPDATE memberships SET status='encerrado',ti_present=false,version=version+1,updated_at=now() WHERE id=$1",[member!.id]);
            }else{
              if(allocation)await client.query('UPDATE allocations SET ended_at=now(),ended_by=$2,version=version+1 WHERE id=$1',[body.occupant.allocationId,actor.id]);
              await client.query(`INSERT INTO allocations(branch_id,locker_id,person_id,modality,started_at,reason,started_by)
                VALUES($1,$2,$3,$4,now(),'Ocupante alterado no cadastro do armário',$5)`,[branchId,lockerId,official.person_id,locker.modality,actor.id]);
            }
          }
        }else{
          if(member?.origin==='ti'&&registrationKey(member.registration??'')===registrationKey(body.occupant.registration??'')){
            // The current roster member stays authoritative while other locker fields are reviewed.
          }else{
          if(!body.occupant.name)fail(422,'NOME','Informe o nome quando a matrícula não constar na base atual');
          const duplicate=body.occupant.registration?(await client.query<{registration:string}>(`SELECT registration FROM memberships
            WHERE branch_id=$1 AND ($2::uuid IS NULL OR id<>$2) AND registration IS NOT NULL`,[branchId,member?.id??null])).rows
            .some(row=>registrationKey(row.registration)===registrationKey(body.occupant!.registration!)):false;
          if(duplicate)fail(409,'MATRICULA_DUPLICADA','Matrícula já usada em outro cadastro');
          if(member&&member.origin!=='ti'){
            await client.query('UPDATE people SET name=$2 WHERE id=$1',[member.person_id,body.occupant.name]);
            await client.query(`UPDATE memberships SET registration=$2,department=$3,function_name=$4,version=version+1,updated_at=now()
              WHERE id=$1`,[member.id,body.occupant.registration||null,body.occupant.department||null,body.occupant.functionName||null]);
          }else{
            const person=(await client.query<{id:string}>('INSERT INTO people(name) VALUES($1) RETURNING id',[body.occupant.name])).rows[0];
            const collaborator=!!body.occupant.registration;
            await client.query(`INSERT INTO memberships(person_id,branch_id,category,origin,registration,department,function_name,needs_fixed,ti_present,status)
              VALUES($1,$2,$3,'migracao',$4,$5,$6,true,$7,$8)`,[person.id,branchId,collaborator?'colaborador':'terceirizado',
              body.occupant.registration||null,body.occupant.department||null,body.occupant.functionName||null,
              collaborator?false:null,collaborator?'encerrado':'ativo']);
            if(allocation)await client.query('UPDATE allocations SET ended_at=now(),ended_by=$2,version=version+1 WHERE id=$1',[body.occupant.allocationId,actor.id]);
            await client.query(`INSERT INTO allocations(branch_id,locker_id,person_id,modality,started_at,reason,started_by)
              VALUES($1,$2,$3,$4,now(),'Ocupante informado no cadastro do armário',$5)`,[branchId,lockerId,person.id,locker.modality,actor.id]);
          }
          }
        }
      }
      const updated=await client.query(`UPDATE lockers SET is_double=$2,capacity=$3,sector_occupant=$4,
        migration_status=CASE WHEN $5::boolean THEN 'conferido' ELSE migration_status END,condition=COALESCE($6,condition),
        key_copy_available=CASE WHEN $8::boolean THEN $7 ELSE key_copy_available END,
        version=version+1 WHERE id=$1 RETURNING *`,
        [lockerId,body.isDouble,body.isDouble?2:1,body.sectorOccupant,body.finalize&&pending?.kind==='migracao_inconclusiva',
          body.condition??null,body.keyCopyAvailable??null,body.keyCopyAvailable!==undefined]);
      await event(client,branchId,actor.id,direct?'armario_revisado':'pendencia_revisada',direct?'locker':'pending',itemId,{lockerNumber:locker.number,officialName});
      await refreshPending(client,branchId);
      return {locker:updated.rows[0],officialName};
    }));
  }
  app.post('/api/branches/:branchId/pending/:itemId/revise',request=>reviseLocker(request,false));
  app.post('/api/branches/:branchId/lockers/:itemId/revise',request=>reviseLocker(request,true));
  app.post('/api/branches/:branchId/pending/:itemId/resolve',async request=>{
    const actor=await authenticate(request),{branchId,itemId}=routeItem.parse(request.params);branchAccess(actor,branchId,true);
    const body=operation.extend({expectedVersion:z.number().int().positive(),resolution:z.string().min(3).max(1000)}).parse(request.body);
    return transaction(client=>idempotent(client,body.operationId,branchId,actor.id,body,async()=>{
      const pending=await one<{kind:string;state:string;version:number}>(client,'SELECT * FROM pending_items WHERE id=$1 AND branch_id=$2 FOR UPDATE',[itemId,branchId]);
      if(pending.version!==body.expectedVersion||pending.state!=='aberta')fail(409,'VERSAO','Pendência alterada; recarregue');
      if(['ausente_ti','sem_armario','atuacao_encerrada','sazonal_vencida','compartilhamento_vencido','migracao_inconclusiva'].includes(pending.kind)) fail(409,'CONDICAO','Regularize a condição antes de resolver');
      const {rows}=await client.query("UPDATE pending_items SET state='resolvida',resolution=$2,resolved_by=$3,updated_at=now(),version=version+1 WHERE id=$1 RETURNING *",[itemId,body.resolution,actor.id]);
      await event(client,branchId,actor.id,'pendencia_resolvida','pending',itemId,{resolution:body.resolution});return rows[0];
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
    const actor=await authenticate(request),{branchId}=route.parse(request.params);adminAccess(actor,branchId);
    const query=z.object({limit:z.coerce.number().int().min(1).max(1000).default(100)}).parse(request.query);
    return (await pool.query('SELECT id,kind,entity_type,entity_id,details,happened_at FROM events WHERE branch_id=$1 ORDER BY id DESC LIMIT $2',[branchId,query.limit])).rows;
  });
  app.get('/api/branches/:branchId/history/export',async (request,reply)=>{
    const actor=await authenticate(request),{branchId}=route.parse(request.params);adminAccess(actor,branchId);
    const {rows}=await pool.query('SELECT id,kind,entity_type,entity_id,happened_at FROM events WHERE branch_id=$1 ORDER BY id DESC LIMIT 10000',[branchId]);
    reply.header('Content-Type','text/csv; charset=utf-8').header('Content-Disposition','attachment; filename="historico.csv"');
    return Papa.unparse(rows,{escapeFormulae:true});
  });
  app.get('/api/branches/:branchId/transfers',async request=>{
    const actor=await authenticate(request),{branchId}=route.parse(request.params);branchAccess(actor,branchId);
    return (await pool.query(`SELECT e.id,e.happened_at,p.name,m.registration,source.number source_number,destination.number destination_number,
      COALESCE(e.details->>'reason',a.reason,a.note) reason
      FROM events e JOIN allocations a ON a.id=e.entity_id JOIN people p ON p.id=a.person_id
      JOIN lockers source ON source.id=(e.details->>'sourceLockerId')::uuid
      JOIN lockers destination ON destination.id=(e.details->>'destinationLockerId')::uuid
      LEFT JOIN memberships m ON m.person_id=p.id AND m.branch_id=e.branch_id
      WHERE e.branch_id=$1 AND e.kind='ocupacao_transferida' ORDER BY e.id DESC LIMIT 1000`,[branchId])).rows;
  });
  app.get('/api/branches/:branchId/users',async request=>{
    const actor=await authenticate(request),{branchId}=route.parse(request.params);adminAccess(actor,branchId);
    return (await pool.query('SELECT id,username,role,branch_id,active,must_change_password,version FROM users WHERE branch_id=$1 ORDER BY username',[branchId])).rows;
  });
  app.post('/api/branches/:branchId/users',async request=>{
    const actor=await authenticate(request),{branchId}=route.parse(request.params);adminAccess(actor,branchId);
    const body=operation.extend({username:z.string().trim().regex(/^[a-zA-Z0-9._-]{3,80}$/),role:role.exclude(['geral']),temporaryPassword:z.string().min(12)}).parse(request.body);
    return transaction(client=>idempotent(client,body.operationId,branchId,actor.id,{...body,temporaryPasswordHash:hash(body.temporaryPassword),temporaryPassword:undefined},async()=>{
      const {rows}=await client.query("INSERT INTO users(username,password_hash,role,branch_id,must_change_password) VALUES($1,$2,$3,$4,true) RETURNING id,username,role,branch_id",[body.username,await argon2.hash(body.temporaryPassword,{type:argon2.argon2id}),body.role,branchId]);
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
      const {rows}=await client.query('UPDATE users SET role=COALESCE($2,role),active=COALESCE($3,active),version=version+1 WHERE id=$1 RETURNING id,username,role,active,version',[itemId,body.role,body.active]);
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
      const lockers=await client.query(`SELECT l.id,l.number,l.size,l.capacity,l.is_double,l.key_copy_available,l.modality,l.destination,l.condition,l.migration_status,l.sector_occupant,
          coalesce(json_agg(json_build_object('name',p.name,'registration',m.registration,'department',m.department,'category',m.category)) FILTER (WHERE a.id IS NOT NULL),'[]') occupants
          FROM lockers l LEFT JOIN allocations a ON a.locker_id=l.id AND a.ended_at IS NULL
          LEFT JOIN people p ON p.id=a.person_id LEFT JOIN memberships m ON m.person_id=p.id AND m.branch_id=l.branch_id WHERE l.branch_id=$1 GROUP BY l.id ORDER BY CASE WHEN l.number ~ '^[0-9]+$' THEN l.number::numeric END NULLS LAST,l.number`,[branchId]);
      const people=await client.query(`SELECT m.id,m.person_id,p.name,m.registration,m.category,m.company,m.department,m.function_name,m.status,m.needs_fixed,
        a.locker_id,l.number FROM memberships m JOIN people p ON p.id=m.person_id
        LEFT JOIN allocations a ON a.person_id=p.id AND a.ended_at IS NULL LEFT JOIN lockers l ON l.id=a.locker_id
        WHERE m.branch_id=$1 AND (a.id IS NOT NULL OR EXISTS(SELECT 1 FROM pending_items pend WHERE pend.branch_id=$1 AND pend.subject_type='membership' AND pend.subject_id=m.id AND pend.state='aberta'))`,[branchId]);
      const pending=await client.query(pendingDetailsSql(true),[branchId]);
      const branch=await client.query<{name:string}>('SELECT name FROM branches WHERE id=$1',[branchId]);
      const session=await client.query<{expires_at:Date}>('SELECT expires_at FROM sessions WHERE id_hash=$1',[hash(request.cookies.armarios_session??'')]);
      const issuedAt=new Date();return {issuedAt:issuedAt.toISOString(),expiresAt:session.rows[0].expires_at,branchId,branchName:branch.rows[0].name,userId:actor.id,deviceId:device.rows[0].id,lockers:lockers.rows,people:people.rows,pending:pending.rows};
    });
  });
}
