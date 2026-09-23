import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { branchInput, lockerInput, operation, personInput, personUpdateInput, id } from '@armarios/contracts';
import { authenticate, branchAccess, adminAccess } from './auth.js';
import { pool, transaction, one, fail } from './db.js';
import { idempotent, event } from './operations.js';
import { refreshPending } from './pending.js';

const routeBranch = z.object({ branchId: id });
const routeItem = z.object({ branchId: id, itemId: id });

export async function catalogRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/branches', async request => {
    const actor = await authenticate(request);
    const { rows } = await pool.query('SELECT id,name,timezone,version FROM branches WHERE $1::text=$2 OR id=$3 ORDER BY name', [actor.role,'geral',actor.branch_id]);
    return rows;
  });
  app.post('/api/branches', async request => {
    const actor = await authenticate(request);
    if (actor.role !== 'geral') fail(403,'PERMISSAO','Acesso negado');
    const body = branchInput.and(operation).parse(request.body);
    return transaction(client => idempotent(client,body.operationId,null,actor.id,body, async () => {
      const { rows } = await client.query('INSERT INTO branches(name,timezone) VALUES($1,$2) RETURNING *',[body.name,body.timezone]);
      await event(client,rows[0].id,actor.id,'filial_criada','branch',rows[0].id);
      return rows[0];
    }));
  });
  app.get('/api/branches/:branchId/people', async request => {
    const actor = await authenticate(request); const { branchId } = routeBranch.parse(request.params); branchAccess(actor,branchId);
    const query = z.object({ q: z.string().optional(), category: z.string().optional() }).parse(request.query);
    return (await pool.query(`SELECT m.*,p.name,a.locker_id,l.number FROM memberships m JOIN people p ON p.id=m.person_id
      LEFT JOIN allocations a ON a.person_id=p.id AND a.ended_at IS NULL LEFT JOIN lockers l ON l.id=a.locker_id
      WHERE m.branch_id=$1 AND m.status='ativo' AND ($2::text IS NULL OR p.name ILIKE '%'||$2||'%' OR m.registration ILIKE '%'||$2||'%') AND ($3::text IS NULL OR m.category=$3)
      ORDER BY p.name LIMIT 1000`,[branchId,query.q ?? null,query.category ?? null])).rows;
  });
  app.get('/api/branches/:branchId/people/registration/:registration', async request => {
    const actor = await authenticate(request); const { branchId } = routeBranch.parse(request.params); branchAccess(actor,branchId);
    const { registration } = z.object({ registration: z.string().trim().min(1) }).parse(request.params);
    const { rows } = await pool.query(`SELECT m.id,m.person_id,m.registration,p.name,m.department,m.function_name,a.locker_id
      FROM memberships m JOIN people p ON p.id=m.person_id LEFT JOIN allocations a ON a.person_id=p.id AND a.ended_at IS NULL
      WHERE m.branch_id=$1 AND m.registration=$2 AND m.category='colaborador' AND m.status='ativo'`,[branchId,registration]);
    return rows[0]??fail(404,'MATRICULA','Matrícula não encontrada na base ativa de colaboradores');
  });
  app.post('/api/branches/:branchId/people/archive', async request => {
    const actor = await authenticate(request); const { branchId } = routeBranch.parse(request.params); adminAccess(actor,branchId);
    const body = z.object({operationId:id,all:z.boolean(),membershipIds:z.array(id).max(5000).default([])}).parse(request.body);
    if (body.all && body.membershipIds.length || !body.all && !body.membershipIds.length) fail(422,'SELECAO','Selecione colaboradores ou escolha todos');
    return transaction(client => idempotent(client,body.operationId,branchId,actor.id,body, async () => {
      const ids = [...new Set(body.membershipIds)];
      const { rows } = await client.query<{id:string}>(`SELECT id FROM memberships WHERE branch_id=$1 AND category='colaborador' AND status='ativo'
        AND ($2::boolean OR id=ANY($3::uuid[])) ORDER BY id FOR UPDATE`,[branchId,body.all,ids]);
      if (!body.all && rows.length!==ids.length) fail(409,'SELECAO','A seleção mudou; recarregue os colaboradores');
      const selected=rows.map(row=>row.id);
      if (selected.length) await client.query(`UPDATE memberships SET status='encerrado',ti_present=false,version=version+1,updated_at=now()
        WHERE id=ANY($1::uuid[])`,[selected]);
      if (selected.length) await client.query('UPDATE branches SET ti_revision=ti_revision+1,version=version+1 WHERE id=$1',[branchId]);
      await refreshPending(client,branchId);
      await event(client,branchId,actor.id,'colaboradores_removidos_da_base','membership',null,{count:selected.length,ids:selected});
      return {removed:selected.length};
    }));
  });
  app.post('/api/branches/:branchId/people', async request => {
    const actor = await authenticate(request); const { branchId } = routeBranch.parse(request.params); branchAccess(actor,branchId,true);
    const body = personInput.safeExtend({ operationId: id, personId: id.optional() }).parse(request.body);
    if (body.origin !== 'manual') fail(403,'ORIGEM','Cadastro manual deve ter origem manual');
    if (body.personId && actor.role !== 'geral') fail(403,'VINCULO','Somente administrador geral pode vincular uma pessoa existente de outra filial');
    return transaction(client => idempotent(client,body.operationId,branchId,actor.id,body, async () => {
      const personId = body.personId ?? (await client.query<{ id: string }>('INSERT INTO people(name) VALUES($1) RETURNING id',[body.name])).rows[0].id;
      if (body.personId) await one(client,'SELECT id FROM people WHERE id=$1',[body.personId]);
      const { rows } = await client.query(`INSERT INTO memberships(person_id,branch_id,category,origin,registration,company,department,function_name,needs_fixed)
        VALUES($1,$2,$3,'manual',$4,$5,$6,$7,$8) RETURNING *`,[personId,branchId,body.category,body.registration || null,body.company || null,body.department || null,body.functionName || null,body.needsFixed]);
      await event(client,branchId,actor.id,'pessoa_cadastrada','membership',rows[0].id,{ category: body.category });
      await refreshPending(client,branchId); return { ...rows[0], name: body.name };
    }));
  });
  app.patch('/api/branches/:branchId/people/:itemId', async request => {
    const actor = await authenticate(request); const { branchId,itemId } = routeItem.parse(request.params); branchAccess(actor,branchId,true);
    const body = personUpdateInput.parse(request.body);
    return transaction(client => idempotent(client,body.operationId,branchId,actor.id,body, async () => {
      const old = await one<{ person_id: string; version: number; category: string; name:string; registration:string|null; company:string|null; department:string|null; function_name:string|null; needs_fixed:boolean; origin:'manual'|'ti'|'migracao' }>(client,'SELECT m.*,p.name FROM memberships m JOIN people p ON p.id=m.person_id WHERE m.id=$1 AND m.branch_id=$2 FOR UPDATE OF m',[itemId,branchId]);
      if (old.version !== body.expectedVersion) fail(409,'VERSAO','Registro alterado; recarregue');
      const checked=personInput.parse({name:body.name??old.name,category:body.category??old.category,registration:body.registration===undefined?old.registration:body.registration,company:body.company===undefined?old.company:body.company,department:body.department===undefined?old.department:body.department,functionName:body.functionName===undefined?old.function_name:body.functionName,needsFixed:body.needsFixed??old.needs_fixed,origin:old.origin});
      const { rows } = await client.query(`UPDATE memberships SET category=$2,registration=$3,company=$4,
        department=$5,function_name=$6,needs_fixed=$7,version=version+1,updated_at=now() WHERE id=$1 RETURNING *`,
        [itemId,checked.category,checked.registration,checked.company,checked.department,checked.functionName,checked.needsFixed]);
      if (checked.name!==old.name) await client.query('UPDATE people SET name=$2 WHERE id=$1',[old.person_id,checked.name]);
      await event(client,branchId,actor.id,'pessoa_alterada','membership',itemId,{ before: old, after: rows[0] });
      await refreshPending(client,branchId); return rows[0];
    }));
  });
  app.post('/api/branches/:branchId/people/:itemId/status', async request => {
    const actor = await authenticate(request); const { branchId,itemId } = routeItem.parse(request.params); branchAccess(actor,branchId,true);
    const body = operation.extend({ expectedVersion: z.number().int().positive(), status: z.enum(['ativo','encerrado']) }).parse(request.body);
    return transaction(client => idempotent(client,body.operationId,branchId,actor.id,body, async () => {
      const old = await one<{ version: number; category: string; ti_present: boolean | null }>(client,'SELECT version,category,ti_present FROM memberships WHERE id=$1 AND branch_id=$2 FOR UPDATE',[itemId,branchId]);
      if (old.version !== body.expectedVersion) fail(409,'VERSAO','Registro alterado; recarregue');
      if (body.status==='ativo' && old.category==='colaborador' && old.ti_present===false) fail(409,'BASE_COLABORADORES','Colaborador ausente da base atual; importe uma nova lista para reativá-lo');
      const { rows } = await client.query('UPDATE memberships SET status=$2,version=version+1,updated_at=now() WHERE id=$1 RETURNING *',[itemId,body.status]);
      await event(client,branchId,actor.id,body.status==='encerrado'?'atuacao_encerrada':'atuacao_reativada','membership',itemId);
      await refreshPending(client,branchId); return rows[0];
    }));
  });
  app.get('/api/branches/:branchId/lockers', async request => {
    const actor = await authenticate(request); const { branchId } = routeBranch.parse(request.params); branchAccess(actor,branchId);
    const query = z.object({ q: z.string().optional(), condition: z.string().optional() }).parse(request.query);
    return (await pool.query(`SELECT l.*,coalesce(json_agg(json_build_object('allocationId',a.id,'allocationVersion',a.version,'personId',a.person_id,'name',p.name,'registration',m.registration,'department',m.department,'dueAt',a.due_at)) FILTER (WHERE a.id IS NOT NULL),'[]') occupants
      FROM lockers l LEFT JOIN allocations a ON a.locker_id=l.id AND a.ended_at IS NULL
      LEFT JOIN people p ON p.id=a.person_id LEFT JOIN memberships m ON m.person_id=p.id AND m.branch_id=l.branch_id
      WHERE l.branch_id=$1 AND ($2::text IS NULL OR l.number ILIKE '%'||$2||'%') AND ($3::text IS NULL OR l.condition=$3)
      GROUP BY l.id ORDER BY CASE WHEN l.number ~ '^[0-9]+$' THEN l.number::numeric END NULLS LAST,l.number LIMIT 1000`,[branchId,query.q ?? null,query.condition ?? null])).rows;
  });
  app.post('/api/branches/:branchId/lockers', async request => {
    const actor = await authenticate(request); const { branchId } = routeBranch.parse(request.params); adminAccess(actor,branchId);
    const body = lockerInput.and(operation).parse(request.body);
    return transaction(client => idempotent(client,body.operationId,branchId,actor.id,body, async () => {
      if(body.isDouble&&body.capacity<2)fail(422,'CAPACIDADE','Armário duplo precisa de capacidade para duas pessoas');
      const { rows } = await client.query(`INSERT INTO lockers(branch_id,number,size,capacity,is_double,modality,destination,condition,sector_occupant)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[branchId,body.number,body.size,body.capacity,body.isDouble??false,body.modality,body.destination,body.condition,body.sectorOccupant??null]);
      await event(client,branchId,actor.id,'armario_criado','locker',rows[0].id); return rows[0];
    }));
  });
  app.post('/api/branches/:branchId/lockers/:itemId/key-copy', async request => {
    const actor=await authenticate(request);const {branchId,itemId}=routeItem.parse(request.params);branchAccess(actor,branchId,true);
    const body=operation.extend({expectedVersion:z.number().int().positive(),available:z.boolean()}).parse(request.body);
    return transaction(client=>idempotent(client,body.operationId,branchId,actor.id,body,async()=>{
      const old=await one<{version:number;key_copy_available:boolean|null}>(client,'SELECT version,key_copy_available FROM lockers WHERE id=$1 AND branch_id=$2 FOR UPDATE',[itemId,branchId]);
      if(old.version!==body.expectedVersion)fail(409,'VERSAO','Armário alterado; recarregue');
      const {rows}=await client.query('UPDATE lockers SET key_copy_available=$2,version=version+1 WHERE id=$1 RETURNING *',[itemId,body.available]);
      await event(client,branchId,actor.id,'copia_chave_atualizada','locker',itemId,{before:old.key_copy_available,after:body.available});
      return rows[0];
    }));
  });
  app.patch('/api/branches/:branchId/lockers/:itemId', async request => {
    const actor = await authenticate(request); const { branchId,itemId } = routeItem.parse(request.params); adminAccess(actor,branchId);
    const body = lockerInput.partial().extend({ operationId: id, expectedVersion: z.number().int().positive(), migrationStatus: z.enum(['conferido','inconclusivo']).optional() }).parse(request.body);
    return transaction(client => idempotent(client,body.operationId,branchId,actor.id,body, async () => {
      const old = await one<{ version: number; capacity: number; is_double:boolean }>(client,'SELECT * FROM lockers WHERE id=$1 AND branch_id=$2 FOR UPDATE',[itemId,branchId]);
      if (old.version !== body.expectedVersion) fail(409,'VERSAO','Armário alterado; recarregue');
      const count = await client.query<{ count: string }>('SELECT count(*) FROM allocations WHERE locker_id=$1 AND ended_at IS NULL',[itemId]);
      if (body.capacity && body.capacity < Number(count.rows[0].count)) fail(409,'CAPACIDADE','Capacidade inferior à ocupação atual');
      if((body.isDouble??old.is_double)&&(body.capacity??old.capacity)<2)fail(422,'CAPACIDADE','Armário duplo precisa de capacidade para duas pessoas');
      if(body.isDouble===false&&Number(count.rows[0].count)>1)fail(409,'OCUPACAO','Armário com duas pessoas não pode deixar de ser duplo');
      if (body.sectorOccupant && Number(count.rows[0].count)) fail(409,'OCUPACAO','Libere a ocupação da pessoa antes de atribuir o armário a um setor');
      const { rows } = await client.query(`UPDATE lockers SET number=COALESCE($2,number),size=COALESCE($3,size),capacity=COALESCE($4,capacity),
        modality=COALESCE($5,modality),destination=COALESCE($6,destination),condition=COALESCE($7,condition),migration_status=COALESCE($8,migration_status),
        sector_occupant=CASE WHEN $10::boolean THEN $9 ELSE sector_occupant END,is_double=COALESCE($11,is_double),version=version+1 WHERE id=$1 RETURNING *`,
        [itemId,body.number,body.size,body.capacity,body.modality,body.destination,body.condition,body.migrationStatus,body.sectorOccupant??null,body.sectorOccupant!==undefined,body.isDouble]);
      await event(client,branchId,actor.id,'armario_alterado','locker',itemId,{ before: old, after: rows[0] });
      await refreshPending(client,branchId); return rows[0];
    }));
  });
}
