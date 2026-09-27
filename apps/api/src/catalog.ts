import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { branchInput, lockerInput, operation, personInput, personUpdateInput, id } from '@armarios/contracts';
import { authenticate, branchAccess, adminAccess } from './auth.js';
import { pool, transaction, one, fail } from './db.js';
import { idempotent, event, changedFields, lockerFieldLabels, personFieldLabels, auditContext } from './operations.js';
import { refreshPending } from './pending.js';
import {registrationKey} from './registration.js';

const routeBranch = z.object({ branchId: id });
const routeItem = z.object({ branchId: id, itemId: id });

export async function catalogRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/branches', async request => {
    const actor = await authenticate(request);
    const { rows } = await pool.query("SELECT id,name,timezone,status,version FROM branches WHERE status='active' AND ($1::text=$2 OR id=$3) ORDER BY name", [actor.role,'geral',actor.branch_id]);
    return rows;
  });
  app.post('/api/branches', async request => {
    const actor = await authenticate(request);
    if (actor.role !== 'geral') fail(403,'PERMISSAO','Acesso negado');
    const body = branchInput.and(operation).parse(request.body);
    return transaction(client => idempotent(client,body.operationId,null,actor.id,body, async () => {
      const { rows } = await client.query('INSERT INTO branches(name) VALUES($1) RETURNING *',[body.name]);
      await event(client,rows[0].id,actor.id,'filial_criada','branch',rows[0].id,{name:rows[0].name},{description:`Filial criada: ${rows[0].name}`});
      return rows[0];
    }));
  });
  app.delete('/api/branches/:branchId', async request => {
    const actor=await authenticate(request);const {branchId}=routeBranch.parse(request.params);
    if(actor.role!=='geral')fail(403,'PERMISSAO','Acesso administrativo geral necessário');
    const body=operation.extend({expectedVersion:z.number().int().positive()}).parse(request.body);
    return transaction(client=>idempotent(client,body.operationId,branchId,actor.id,body,async()=>{
      const branch=await one<{version:number;name:string}>(client,'SELECT version,name FROM branches WHERE id=$1 FOR UPDATE',[branchId]);
      if(branch.version!==body.expectedVersion)fail(409,'VERSAO','Filial alterada; recarregue');
      const branchUsers='SELECT id FROM users WHERE branch_id=$1';
      await client.query('DELETE FROM pending_items WHERE branch_id=$1',[branchId]);
      await client.query(`DELETE FROM events WHERE branch_id=$1 OR actor_id IN (${branchUsers})`,[branchId]);
      await client.query('DELETE FROM legacy_history WHERE import_id IN (SELECT id FROM imports WHERE branch_id=$1)',[branchId]);
      await client.query('DELETE FROM import_sources WHERE import_id IN (SELECT id FROM imports WHERE branch_id=$1)',[branchId]);
      await client.query('DELETE FROM imports WHERE branch_id=$1',[branchId]);
      await client.query('DELETE FROM authorized_devices WHERE branch_id=$1',[branchId]);
      await client.query('DELETE FROM sharings WHERE locker_id IN (SELECT id FROM lockers WHERE branch_id=$1)',[branchId]);
      await client.query('DELETE FROM allocations WHERE branch_id=$1',[branchId]);
      await client.query('DELETE FROM lockers WHERE branch_id=$1',[branchId]);
      await client.query('DELETE FROM need_exceptions WHERE membership_id IN (SELECT id FROM memberships WHERE branch_id=$1)',[branchId]);
      await client.query('DELETE FROM memberships WHERE branch_id=$1',[branchId]);
      await client.query('UPDATE operations SET branch_id=NULL WHERE branch_id=$1 AND id=$2',[branchId,body.operationId]);
      await client.query(`DELETE FROM operations WHERE (branch_id=$1 OR actor_id IN (${branchUsers})) AND id<>$2`,[branchId,body.operationId]);
      await client.query(`DELETE FROM users WHERE branch_id=$1`,[branchId]);
      await client.query('DELETE FROM locations WHERE branch_id=$1',[branchId]);
      await client.query(`DELETE FROM people p WHERE NOT EXISTS(SELECT 1 FROM memberships m WHERE m.person_id=p.id)
        AND NOT EXISTS(SELECT 1 FROM allocations a WHERE a.person_id=p.id)`);
      await client.query('DELETE FROM branches WHERE id=$1',[branchId]);
      return {id:branchId,name:branch.name,deleted:true};
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
  app.get('/api/branches/:branchId/people/registrations', async request => {
    const actor = await authenticate(request); const { branchId } = routeBranch.parse(request.params); branchAccess(actor,branchId);
    return (await pool.query(`SELECT m.registration,p.name,m.department,m.function_name "functionName",l.number "lockerNumber"
      FROM memberships m JOIN people p ON p.id=m.person_id
      LEFT JOIN allocations a ON a.person_id=m.person_id AND a.ended_at IS NULL
      LEFT JOIN lockers l ON l.id=a.locker_id
      WHERE m.branch_id=$1 AND m.category='colaborador' AND m.origin='ti' AND m.status='ativo'
        AND m.ti_present=true AND m.registration IS NOT NULL
      ORDER BY m.registration,p.name`,[branchId])).rows;
  });
  app.get('/api/branches/:branchId/people/registration/:registration', async request => {
    const actor = await authenticate(request); const { branchId } = routeBranch.parse(request.params); branchAccess(actor,branchId);
    const { registration } = z.object({ registration: z.string().trim().min(1) }).parse(request.params);
    const { rows } = await pool.query<{registration:string;origin:string}>(`SELECT m.id,m.person_id,m.registration,m.origin,p.name,m.department,m.function_name,a.locker_id
      FROM memberships m JOIN people p ON p.id=m.person_id LEFT JOIN allocations a ON a.person_id=p.id AND a.ended_at IS NULL
      WHERE m.branch_id=$1 AND m.registration IS NOT NULL AND m.category='colaborador' AND m.status='ativo'`,[branchId]);
    const matches=rows.filter(row=>registrationKey(row.registration)===registrationKey(registration))
      .sort((a,b)=>Number(b.origin==='ti')-Number(a.origin==='ti'));
    if(matches.length>1&&matches[0].origin===matches[1].origin)fail(409,'MATRICULA_AMBIGUA','Mais de um cadastro usa esta matrícula; confira a base');
    return matches[0]??fail(404,'MATRICULA','Matrícula não encontrada na base ativa de colaboradores');
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
      await event(client,branchId,actor.id,'colaboradores_removidos_da_base','membership',null,{count:selected.length,ids:selected},{description:'Colaboradores removidos da base ativa'});
      return {removed:selected.length};
    }));
  });
  app.post('/api/branches/:branchId/people', async request => {
    const actor = await authenticate(request); const { branchId } = routeBranch.parse(request.params); branchAccess(actor,branchId,true);
    const body = personInput.safeExtend({ operationId: id, personId: id.optional() }).parse(request.body);
    if (body.category === 'roteirista') fail(422,'CATEGORIA','Promotor roteirista não é cadastrado como pessoa no sistema');
    if (!body.registration && !body.company && body.category === 'terceirizado') body.category='vinculo_nao_identificado';
    if (body.origin !== 'manual') fail(403,'ORIGEM','Cadastro manual deve ter origem manual');
    if (body.personId && actor.role !== 'geral') fail(403,'VINCULO','Somente administrador geral pode vincular uma pessoa existente de outra filial');
    return transaction(client => idempotent(client,body.operationId,branchId,actor.id,body, async () => {
      const personId = body.personId ?? (await client.query<{ id: string }>('INSERT INTO people(name) VALUES($1) RETURNING id',[body.name])).rows[0].id;
      if (body.personId) await one(client,'SELECT id FROM people WHERE id=$1',[body.personId]);
      const { rows } = await client.query(`INSERT INTO memberships(person_id,branch_id,category,origin,registration,company,department,function_name,needs_fixed)
        VALUES($1,$2,$3,'manual',$4,$5,$6,$7,$8) RETURNING *`,[personId,branchId,body.category,body.registration || null,body.company || null,body.department || null,body.functionName || null,body.needsFixed]);
      await event(client,branchId,actor.id,'pessoa_cadastrada','membership',rows[0].id,{ category: body.category },
        {personName:body.name,personRegistration:body.registration??null,description:'Pessoa cadastrada'});
      await refreshPending(client,branchId); return { ...rows[0], name: body.name };
    }));
  });
  app.patch('/api/branches/:branchId/people/:itemId', async request => {
    const actor = await authenticate(request); const { branchId,itemId } = routeItem.parse(request.params); branchAccess(actor,branchId,true);
    const body = personUpdateInput.parse(request.body);
    return transaction(client => idempotent(client,body.operationId,branchId,actor.id,body, async () => {
      const old = await one<{ person_id: string; version: number; category: string; name:string; registration:string|null; company:string|null; department:string|null; function_name:string|null; needs_fixed:boolean; origin:'manual'|'ti'|'migracao'; locker_number:string|null }>(client,
        `SELECT m.*,p.name,l.number locker_number FROM memberships m JOIN people p ON p.id=m.person_id
         LEFT JOIN allocations a ON a.person_id=p.id AND a.ended_at IS NULL
         LEFT JOIN lockers l ON l.id=a.locker_id
         WHERE m.id=$1 AND m.branch_id=$2 FOR UPDATE OF m`,[itemId,branchId]);
      if (old.version !== body.expectedVersion) fail(409,'VERSAO','Registro alterado; recarregue');
      const checked=personInput.parse({name:body.name??old.name,category:body.category??old.category,registration:body.registration===undefined?old.registration:body.registration,company:body.company===undefined?old.company:body.company,department:body.department===undefined?old.department:body.department,functionName:body.functionName===undefined?old.function_name:body.functionName,needsFixed:body.needsFixed??old.needs_fixed,origin:old.origin});
      if(!checked.registration && !checked.company && checked.category==='terceirizado') checked.category='vinculo_nao_identificado';
      const { rows } = await client.query(`UPDATE memberships SET category=$2,registration=$3,company=$4,
        department=$5,function_name=$6,needs_fixed=$7,version=version+1,updated_at=now() WHERE id=$1 RETURNING *`,
        [itemId,checked.category,checked.registration,checked.company,checked.department,checked.functionName,checked.needsFixed]);
      if (checked.name!==old.name) await client.query('UPDATE people SET name=$2 WHERE id=$1',[old.person_id,checked.name]);
      const after=rows[0] as unknown as Record<string,unknown>;
      const afterValues:Record<string,unknown>={...after,name:checked.name,registration:checked.registration,company:checked.company,department:checked.department,function_name:checked.functionName,category:checked.category,needs_fixed:checked.needsFixed};
      const changed=changedFields(old as unknown as Record<string,unknown>,afterValues,personFieldLabels);
      await event(client,branchId,actor.id,'pessoa_alterada','membership',itemId,{ before: old, after: rows[0], ...(changed.length?{changed}:{}) },
        {lockerNumber:old.locker_number,personName:checked.name,personRegistration:checked.registration??null,
          description:changed.length?`Cadastro de pessoa atualizado: ${changed.join(', ')}`:'Cadastro de pessoa atualizado'});
      await refreshPending(client,branchId); return rows[0];
    }));
  });
  app.post('/api/branches/:branchId/people/:itemId/status', async request => {
    const actor = await authenticate(request); const { branchId,itemId } = routeItem.parse(request.params); branchAccess(actor,branchId,true);
    const body = operation.extend({ expectedVersion: z.number().int().positive(), status: z.enum(['ativo','encerrado']) }).parse(request.body);
    return transaction(client => idempotent(client,body.operationId,branchId,actor.id,body, async () => {
      const old = await one<{ version: number; category: string; ti_present: boolean | null; person_name: string; registration: string|null; locker_number: string|null }>(client,
        `SELECT m.version,m.category,m.ti_present,p.name person_name,m.registration,l.number locker_number
         FROM memberships m JOIN people p ON p.id=m.person_id
         LEFT JOIN allocations a ON a.person_id=p.id AND a.ended_at IS NULL
         LEFT JOIN lockers l ON l.id=a.locker_id
         WHERE m.id=$1 AND m.branch_id=$2 FOR UPDATE OF m`,[itemId,branchId]);
      if (old.version !== body.expectedVersion) fail(409,'VERSAO','Registro alterado; recarregue');
      if (body.status==='ativo' && old.category==='colaborador' && old.ti_present===false) fail(409,'BASE_COLABORADORES','Colaborador ausente da base atual; importe uma nova lista para reativá-lo');
      const { rows } = await client.query('UPDATE memberships SET status=$2,version=version+1,updated_at=now() WHERE id=$1 RETURNING *',[itemId,body.status]);
      await event(client,branchId,actor.id,body.status==='encerrado'?'atuacao_encerrada':'atuacao_reativada','membership',itemId,{},
        {lockerNumber:old.locker_number,personName:old.person_name,personRegistration:old.registration,
          description:body.status==='encerrado'?'Atuação encerrada':'Atuação reativada'});
      await refreshPending(client,branchId); return rows[0];
    }));
  });
  app.get('/api/branches/:branchId/lockers', async request => {
    const actor = await authenticate(request); const { branchId } = routeBranch.parse(request.params); branchAccess(actor,branchId);
    const query = z.object({ q: z.string().optional(), condition: z.string().optional() }).parse(request.query);
    return (await pool.query(`SELECT l.*,coalesce(json_agg(json_build_object('allocationId',a.id,'allocationVersion',a.version,'personId',a.person_id,'membershipId',m.id,'membershipVersion',m.version,'origin',m.origin,'name',p.name,'registration',m.registration,'department',m.department,'functionName',m.function_name,'category',m.category,'dueAt',a.due_at)) FILTER (WHERE a.id IS NOT NULL),'[]') occupants
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
      await event(client,branchId,actor.id,'armario_criado','locker',rows[0].id,{number:rows[0].number},
        auditContext({locker_number:rows[0].number,sector_occupant:rows[0].sector_occupant},'Armário cadastrado')); return rows[0];
    }));
  });
  app.post('/api/branches/:branchId/lockers/:itemId/key-copy', async request => {
    const actor=await authenticate(request);const {branchId,itemId}=routeItem.parse(request.params);branchAccess(actor,branchId,true);
    const body=operation.extend({expectedVersion:z.number().int().positive(),available:z.boolean()}).parse(request.body);
    return transaction(client=>idempotent(client,body.operationId,branchId,actor.id,body,async()=>{
      const old=await one<{version:number;number:string;sector_occupant:string|null;key_copy_available:boolean|null}>(client,'SELECT version,number,sector_occupant,key_copy_available FROM lockers WHERE id=$1 AND branch_id=$2 FOR UPDATE',[itemId,branchId]);
      if(old.version!==body.expectedVersion)fail(409,'VERSAO','Armário alterado; recarregue');
      const {rows}=await client.query('UPDATE lockers SET key_copy_available=$2,version=version+1 WHERE id=$1 RETURNING *',[itemId,body.available]);
      await event(client,branchId,actor.id,'copia_chave_atualizada','locker',itemId,{before:old.key_copy_available,after:body.available},
        {lockerNumber:old.number,sectorName:old.sector_occupant,description:'Cópia da chave atualizada'});
      return rows[0];
    }));
  });
  app.patch('/api/branches/:branchId/lockers/:itemId', async request => {
    const actor = await authenticate(request); const { branchId,itemId } = routeItem.parse(request.params); adminAccess(actor,branchId);
    const body = lockerInput.partial().extend({ operationId: id, expectedVersion: z.number().int().positive(), migrationStatus: z.enum(['conferido','inconclusivo']).optional(), number:z.never().optional() }).parse(request.body);
    return transaction(client => idempotent(client,body.operationId,branchId,actor.id,body, async () => {
      const old = await one<{ version: number; capacity: number; is_double:boolean; size:string; modality:string; destination:string|null; condition:string; migration_status:string; sector_occupant:string|null; key_copy_available:boolean|null; number:string }>(client,'SELECT * FROM lockers WHERE id=$1 AND branch_id=$2 FOR UPDATE',[itemId,branchId]);
      if (old.version !== body.expectedVersion) fail(409,'VERSAO','Armário alterado; recarregue');
      const count = await client.query<{ count: string }>('SELECT count(*) FROM allocations WHERE locker_id=$1 AND ended_at IS NULL',[itemId]);
      if (body.capacity && body.capacity < Number(count.rows[0].count)) fail(409,'CAPACIDADE','Capacidade inferior à ocupação atual');
      if((body.isDouble??old.is_double)&&(body.capacity??old.capacity)<2)fail(422,'CAPACIDADE','Armário duplo precisa de capacidade para duas pessoas');
      if(body.isDouble===false&&Number(count.rows[0].count)>1)fail(409,'OCUPACAO','Armário com duas pessoas não pode deixar de ser duplo');
      if (body.sectorOccupant && Number(count.rows[0].count)) fail(409,'OCUPACAO','Libere a ocupação da pessoa antes de atribuir o armário a um setor');
      const { rows } = await client.query(`UPDATE lockers SET size=COALESCE($2,size),capacity=COALESCE($3,capacity),
        modality=COALESCE($4,modality),destination=COALESCE($5,destination),condition=COALESCE($6,condition),migration_status=COALESCE($7,migration_status),
        sector_occupant=CASE WHEN $9::boolean THEN $8 ELSE sector_occupant END,is_double=COALESCE($10,is_double),version=version+1 WHERE id=$1 RETURNING *`,
        [itemId,body.size,body.capacity,body.modality,body.destination,body.condition,body.migrationStatus,body.sectorOccupant??null,body.sectorOccupant!==undefined,body.isDouble]);
      const after = rows[0] as unknown as Record<string, unknown>;
      const changed = changedFields(old as unknown as Record<string, unknown>, after, lockerFieldLabels);
      const sectorChanged = String(old.sector_occupant ?? '') !== String(after.sector_occupant ?? '');
      const description = sectorChanged ? (after.sector_occupant ? 'Atribuição de setor' : 'Setor de ocupação removido')
        : changed.length ? `Dados do armário atualizados: ${changed.join(', ')}` : 'Dados do armário atualizados';
      await event(client,branchId,actor.id,'armario_alterado','locker',itemId,{ before: old, after: rows[0], ...(changed.length?{changed}:{}) },
        { lockerNumber: old.number, sectorName: typeof after.sector_occupant === 'string' ? after.sector_occupant : null, description });
      await refreshPending(client,branchId); return rows[0];
    }));
  });
  app.delete('/api/branches/:branchId/history/clear', async request => {
    const actor=await authenticate(request);const {branchId}=routeBranch.parse(request.params);adminAccess(actor,branchId);
    const body=operation.parse(request.body);
    return transaction(client=>idempotent(client,body.operationId,branchId,actor.id,body,async()=>{
      const {rowCount}=await client.query(`DELETE FROM events WHERE branch_id=$1 AND
        (happened_at < now() - interval '365 days'
          OR entity_type='import'
          OR (locker_number IS NULL AND person_name IS NULL AND sector_name IS NULL AND description IS NULL))`,[branchId]);
      const removed=Number(rowCount??0);
      await event(client,branchId,actor.id,'historico_limpo','branch',branchId,{removed},
        {description:'Limpeza de histórico legado'});
      return {removed};
    }));
  });
}
