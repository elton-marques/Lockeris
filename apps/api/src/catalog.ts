import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { branchInput, locationInput, lockerInput, operation, personInput, personUpdateInput, id } from '@armarios/contracts';
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
  app.get('/api/branches/:branchId/locations', async request => {
    const actor = await authenticate(request); const { branchId } = routeBranch.parse(request.params); branchAccess(actor,branchId);
    return (await pool.query('SELECT * FROM locations WHERE branch_id=$1 ORDER BY name',[branchId])).rows;
  });
  app.post('/api/branches/:branchId/locations', async request => {
    const actor = await authenticate(request); const { branchId } = routeBranch.parse(request.params); adminAccess(actor,branchId);
    const body = locationInput.and(operation).parse(request.body);
    return transaction(client => idempotent(client,body.operationId,branchId,actor.id,body, async () => {
      const { rows } = await client.query('INSERT INTO locations(branch_id,name) VALUES($1,$2) RETURNING *',[branchId,body.name]);
      await event(client,branchId,actor.id,'local_criado','location',rows[0].id); return rows[0];
    }));
  });
  app.patch('/api/branches/:branchId/locations/:itemId',async request=>{
    const actor=await authenticate(request);const {branchId,itemId}=routeItem.parse(request.params);adminAccess(actor,branchId);
    const body=operation.extend({expectedVersion:z.number().int().positive(),name:z.string().trim().min(2).max(120)}).parse(request.body);
    return transaction(client=>idempotent(client,body.operationId,branchId,actor.id,body,async()=>{
      const old=await one<{version:number;name:string}>(client,'SELECT version,name FROM locations WHERE id=$1 AND branch_id=$2 FOR UPDATE',[itemId,branchId]);
      if(old.version!==body.expectedVersion)fail(409,'VERSAO','Local alterado');
      const {rows}=await client.query('UPDATE locations SET name=$2,version=version+1 WHERE id=$1 RETURNING *',[itemId,body.name]);
      await event(client,branchId,actor.id,'local_alterado','location',itemId,{before:old.name,after:body.name});return rows[0];
    }));
  });
  app.get('/api/branches/:branchId/people', async request => {
    const actor = await authenticate(request); const { branchId } = routeBranch.parse(request.params); branchAccess(actor,branchId);
    const query = z.object({ q: z.string().optional(), category: z.string().optional() }).parse(request.query);
    return (await pool.query(`SELECT m.*,p.name,a.locker_id,l.number,lo.name location_name FROM memberships m JOIN people p ON p.id=m.person_id
      LEFT JOIN allocations a ON a.person_id=p.id AND a.ended_at IS NULL LEFT JOIN lockers l ON l.id=a.locker_id LEFT JOIN locations lo ON lo.id=l.location_id
      WHERE m.branch_id=$1 AND ($2::text IS NULL OR p.name ILIKE '%'||$2||'%' OR m.registration ILIKE '%'||$2||'%') AND ($3::text IS NULL OR m.category=$3)
      ORDER BY p.name LIMIT 1000`,[branchId,query.q ?? null,query.category ?? null])).rows;
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
      const old = await one<{ version: number }>(client,'SELECT version FROM memberships WHERE id=$1 AND branch_id=$2 FOR UPDATE',[itemId,branchId]);
      if (old.version !== body.expectedVersion) fail(409,'VERSAO','Registro alterado; recarregue');
      const { rows } = await client.query('UPDATE memberships SET status=$2,version=version+1,updated_at=now() WHERE id=$1 RETURNING *',[itemId,body.status]);
      await event(client,branchId,actor.id,body.status==='encerrado'?'atuacao_encerrada':'atuacao_reativada','membership',itemId);
      await refreshPending(client,branchId); return rows[0];
    }));
  });
  app.get('/api/branches/:branchId/lockers', async request => {
    const actor = await authenticate(request); const { branchId } = routeBranch.parse(request.params); branchAccess(actor,branchId);
    const query = z.object({ q: z.string().optional(), locationId: id.optional(), condition: z.string().optional() }).parse(request.query);
    return (await pool.query(`SELECT l.*,lo.name location_name,coalesce(json_agg(json_build_object('allocationId',a.id,'allocationVersion',a.version,'personId',a.person_id,'name',p.name,'registration',m.registration,'dueAt',a.due_at)) FILTER (WHERE a.id IS NOT NULL),'[]') occupants
      FROM lockers l JOIN locations lo ON lo.id=l.location_id LEFT JOIN allocations a ON a.locker_id=l.id AND a.ended_at IS NULL
      LEFT JOIN people p ON p.id=a.person_id LEFT JOIN memberships m ON m.person_id=p.id AND m.branch_id=l.branch_id
      WHERE l.branch_id=$1 AND ($2::text IS NULL OR l.number ILIKE '%'||$2||'%') AND ($3::uuid IS NULL OR l.location_id=$3) AND ($4::text IS NULL OR l.condition=$4)
      GROUP BY l.id,lo.name ORDER BY lo.name,l.number LIMIT 1000`,[branchId,query.q ?? null,query.locationId ?? null,query.condition ?? null])).rows;
  });
  app.post('/api/branches/:branchId/lockers', async request => {
    const actor = await authenticate(request); const { branchId } = routeBranch.parse(request.params); adminAccess(actor,branchId);
    const body = lockerInput.and(operation).parse(request.body);
    return transaction(client => idempotent(client,body.operationId,branchId,actor.id,body, async () => {
      await one(client,'SELECT id FROM locations WHERE id=$1 AND branch_id=$2',[body.locationId,branchId]);
      const { rows } = await client.query(`INSERT INTO lockers(branch_id,location_id,number,size,capacity,modality,destination,condition)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[branchId,body.locationId,body.number,body.size,body.capacity,body.modality,body.destination,body.condition]);
      await event(client,branchId,actor.id,'armario_criado','locker',rows[0].id); return rows[0];
    }));
  });
  app.patch('/api/branches/:branchId/lockers/:itemId', async request => {
    const actor = await authenticate(request); const { branchId,itemId } = routeItem.parse(request.params); adminAccess(actor,branchId);
    const body = lockerInput.partial().extend({ operationId: id, expectedVersion: z.number().int().positive(), migrationStatus: z.enum(['conferido','inconclusivo']).optional() }).parse(request.body);
    return transaction(client => idempotent(client,body.operationId,branchId,actor.id,body, async () => {
      const old = await one<{ version: number; capacity: number }>(client,'SELECT * FROM lockers WHERE id=$1 AND branch_id=$2 FOR UPDATE',[itemId,branchId]);
      if (old.version !== body.expectedVersion) fail(409,'VERSAO','Armário alterado; recarregue');
      const count = await client.query<{ count: string }>('SELECT count(*) FROM allocations WHERE locker_id=$1 AND ended_at IS NULL',[itemId]);
      if (body.capacity && body.capacity < Number(count.rows[0].count)) fail(409,'CAPACIDADE','Capacidade inferior à ocupação atual');
      if (body.locationId) await one(client,'SELECT id FROM locations WHERE id=$1 AND branch_id=$2',[body.locationId,branchId]);
      const { rows } = await client.query(`UPDATE lockers SET location_id=COALESCE($2,location_id),number=COALESCE($3,number),size=COALESCE($4,size),capacity=COALESCE($5,capacity),
        modality=COALESCE($6,modality),destination=COALESCE($7,destination),condition=COALESCE($8,condition),migration_status=COALESCE($9,migration_status),version=version+1 WHERE id=$1 RETURNING *`,
        [itemId,body.locationId,body.number,body.size,body.capacity,body.modality,body.destination,body.condition,body.migrationStatus]);
      await event(client,branchId,actor.id,'armario_alterado','locker',itemId,{ before: old, after: rows[0] });
      await refreshPending(client,branchId); return rows[0];
    }));
  });
}
