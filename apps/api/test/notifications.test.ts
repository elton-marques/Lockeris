import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import argon2 from 'argon2';
import {randomUUID} from 'node:crypto';
import {app} from '../src/server.js';
import {pool,hash,transaction} from '../src/db.js';
import {refreshPending} from '../src/pending.js';

type Auth={cookie:string;csrf:string};
const uuid=()=>randomUUID();
async function send(auth:Auth,method:'POST'|'PATCH'|'DELETE',url:string,payload:Record<string,unknown>){return app.inject({method,url,payload,headers:{cookie:auth.cookie,'x-csrf-token':auth.csrf}});}
async function read(url:string,auth?:Auth){return app.inject({method:'GET',url,headers:auth?{cookie:auth.cookie}:undefined});}
async function sessionFor(username:string):Promise<Auth>{
  const user=(await pool.query<{id:string}>('SELECT id FROM users WHERE username=$1',[username])).rows[0];
  const token=uuid(),csrf=uuid();
  await pool.query("INSERT INTO sessions(id_hash,user_id,csrf_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[hash(token),user.id,hash(csrf)]);
  return {cookie:`armarios_session=${token}`,csrf};
}
async function login():Promise<Auth>{
  const response=await app.inject({method:'POST',url:'/api/auth/login',payload:{username:'test',password:'Testing-Password-123'}});
  expect(response.statusCode).toBe(200);
  return {cookie:response.headers['set-cookie']!.toString().split(';')[0],csrf:response.json().csrf};
}
async function setup():Promise<{auth:Auth;branch:{id:string}}>{
  const auth=await login();
  const branch=(await send(auth,'POST','/api/branches',{operationId:uuid(),name:'Filial de Teste',timezone:'America/Fortaleza'})).json();
  return {auth,branch};
}
async function person(auth:Auth,branchId:string,name:string,registration:string,extra:Record<string,unknown>={}){
  const response=await send(auth,'POST',`/api/branches/${branchId}/people`,{operationId:uuid(),name,category:'promotor_fixo',registration,needsFixed:true,origin:'manual',...extra});
  expect(response.statusCode).toBe(200);
  return response.json();
}
async function occupy(auth:Auth,branchId:string,personId:string,lockerId:string,expectedVersion:number,extra:Record<string,unknown>={}){
  const response=await send(auth,'POST',`/api/branches/${branchId}/allocations/occupy`,{operationId:uuid(),personId,lockerId,expectedVersion,modality:'fixo',seasonal:false,...extra});
  expect(response.statusCode).toBe(200);
  return response.json();
}
type Alert={key:string;label:string;description:string;count:number;items:{id:string;label:string;detail:string|null}[]};
type Summary={total:number;alerts:Alert[];checkedAt:string};
const alertOf=(summary:Summary,key:string)=>summary.alerts.find(alert=>alert.key===key)!;

beforeAll(async()=>{if(!process.env.DATABASE_URL?.includes('armarios_test'))throw new Error('Use o banco armarios_test');await app.ready();});
beforeEach(async()=>{
  await pool.query('TRUNCATE branches,people,users CASCADE');
  await pool.query("INSERT INTO users(username,password_hash,role,must_change_password) VALUES($1,$2,'geral',false)",['test',await argon2.hash('Testing-Password-123',{type:argon2.argon2id})]);
});
afterAll(async()=>{await app.close();});

describe('central de alertas da filial',()=>{
  it('conta colaboradores sem armário, pendências cadastrais e duplos subutilizados',async()=>{
    const {auth,branch}=await setup();
    const waiting=await person(auth,branch.id,'Aguardando Armário','1001');
    const pendingRegistration=await send(auth,'POST',`/api/branches/${branch.id}/people`,{operationId:uuid(),name:'Vínculo A Confirmar',category:'vinculo_nao_identificado',origin:'manual',needsFixed:false});
    expect(pendingRegistration.statusCode).toBe(200);
    const partial=await send(auth,'POST',`/api/branches/${branch.id}/lockers`,{operationId:uuid(),number:'D1',size:'padrao',capacity:2,isDouble:true,modality:'fixo',condition:'disponivel'});
    expect(partial.statusCode).toBe(200);
    const shared=await send(auth,'POST',`/api/branches/${branch.id}/lockers`,{operationId:uuid(),number:'D2',size:'padrao',capacity:2,isDouble:true,modality:'fixo',condition:'disponivel'});
    expect(shared.statusCode).toBe(200);
    const full=await person(auth,branch.id,'Primeira Ocupante','1002'),second=await person(auth,branch.id,'Segunda Ocupante','1003');
    await occupy(auth,branch.id,full.person_id,partial.json().id,1);
    await occupy(auth,branch.id,second.person_id,partial.json().id,2);
    const solo=await person(auth,branch.id,'Ocupante Sozinho no Duplo','1004');
    await occupy(auth,branch.id,solo.person_id,shared.json().id,1);
    await transaction(client=>refreshPending(client,branch.id));

    const response=await read(`/api/branches/${branch.id}/notifications`,auth);
    expect(response.statusCode).toBe(200);
    const summary=response.json() as Summary;
    expect(summary.alerts.map(alert=>alert.key)).toEqual(['withoutLocker','registrationPending','underusedDoubles','keyLoanOpen','custodyExpiring']);
    expect(summary.total).toBe(summary.alerts.reduce((sum,alert)=>sum+alert.count,0));

    const withoutLocker=alertOf(summary,'withoutLocker');
    expect(withoutLocker.label).toBe('Colaboradores sem armário');
    expect(withoutLocker.count).toBe(2);
    expect(withoutLocker.items.map(item=>item.label)).toEqual(['Aguardando Armário','Vínculo A Confirmar']);
    expect(withoutLocker.items[0].detail).toBe('Matrícula 1001');
    const waitingMembership=(await pool.query<{id:string}>("SELECT id FROM memberships WHERE person_id=$1",[waiting.person_id])).rows[0].id;
    expect(withoutLocker.items[0].id).toBe(waitingMembership);

    const cadastral=alertOf(summary,'registrationPending');
    expect(cadastral.label).toBe('Pendências cadastrais');
    expect(cadastral.count).toBe(1);
    expect(cadastral.items[0]).toMatchObject({label:'Vínculo A Confirmar'});
    expect(cadastral.description).toContain('incompletas');

    const doubles=alertOf(summary,'underusedDoubles');
    expect(doubles.label).toBe('Duplos subutilizados');
    expect(doubles.count).toBe(1);
    expect(doubles.items[0]).toMatchObject({label:'Armário D2',detail:'Ocupante Sozinho no Duplo'});
    expect(summary.total).toBe(withoutLocker.count+cadastral.count+doubles.count);
  });
  it('ignora duplo de setor exclusivo e respeita o acesso à filial',async()=>{
    const {auth,branch}=await setup();
    const other=(await send(auth,'POST','/api/branches',{operationId:uuid(),name:'Outra Filial',timezone:'America/Fortaleza'})).json();
    const exclusive=await send(auth,'POST',`/api/branches/${branch.id}/lockers`,{operationId:uuid(),number:'E1',size:'padrao',capacity:2,isDouble:true,modality:'fixo',condition:'disponivel'});
    expect(exclusive.statusCode).toBe(200);
    const keeper=await person(auth,branch.id,'Manutenção Regional','1001',{department:'Manutenção Infraestrutura'});
    await occupy(auth,branch.id,keeper.person_id,exclusive.json().id,1);
    const summary=(await read(`/api/branches/${branch.id}/notifications`,auth)).json() as Summary;
    expect(alertOf(summary,'underusedDoubles').count).toBe(0);
    expect(alertOf(summary,'withoutLocker').count).toBe(0);
    expect(summary.total).toBe(0);

    await pool.query("INSERT INTO users(username,password_hash,role,branch_id,must_change_password) VALUES($1,$2,'consulta',$3,false)",['consulta',await argon2.hash('Consult-Password-123',{type:argon2.argon2id}),branch.id]);
    const reader=await sessionFor('consulta');
    expect((await read(`/api/branches/${branch.id}/notifications`,reader)).statusCode).toBe(200);
    expect((await read(`/api/branches/${other.id}/notifications`,reader)).statusCode).toBe(403);
    expect((await read(`/api/branches/${branch.id}/notifications`)).statusCode).toBe(401);
  });
});

describe('higienização de base',()=>{
  it('lista apenas cadastros inativos e recusa a exclusão de quem ainda tem armário',async()=>{
    const {auth,branch}=await setup();
    const obsolete=await person(auth,branch.id,'Cadastro Antigo','2001');
    const recent=await person(auth,branch.id,'Cadastro Novo','2002');
    const occupied=await person(auth,branch.id,'Ocupante Ativo','2003');
    const locker=await send(auth,'POST',`/api/branches/${branch.id}/lockers`,{operationId:uuid(),number:'900',size:'padrao',capacity:1,modality:'fixo',condition:'disponivel'});
    expect(locker.statusCode).toBe(200);
    await occupy(auth,branch.id,occupied.person_id,locker.json().id,1);
    await pool.query("UPDATE memberships SET created_at=now()-interval '14 months' WHERE person_id=$1",[obsolete.person_id]);
    await transaction(client=>refreshPending(client,branch.id));

    const stale=await read(`/api/branches/${branch.id}/people/stale`,auth);
    expect(stale.statusCode).toBe(200);
    const rows=stale.json() as {membership_id:string;name:string;last_activity:string}[];
    expect(rows.map(row=>row.name)).toContain('Cadastro Antigo');
    expect(rows.map(row=>row.name)).not.toContain(recent.name);
    expect(Date.parse(rows[0].last_activity)).toBeLessThan(Date.now()-89*24*60*60*1000);

    const membershipId=(await pool.query<{id:string}>("SELECT id FROM memberships WHERE person_id=$1",[occupied.person_id])).rows[0].id;
    const blocked=await send(auth,'POST','/api/people/bulk-purge',{operationId:uuid(),branchId:branch.id,membershipIds:[membershipId]});
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.code).toBe('ARMARIO_VINCULADO');
    expect(blocked.json().error.message).toContain('Ocupante Ativo');
    expect(blocked.json().error.message).toContain('armário 900');
    expect((await pool.query('SELECT id FROM memberships WHERE id=$1',[membershipId])).rowCount).toBe(1);
    expect((await pool.query('SELECT id FROM allocations WHERE ended_at IS NULL')).rowCount).toBe(1);
  });
  it('expurga cadastros obsoletos com permissão administrativa',async()=>{
    const {auth,branch}=await setup();
    const obsolete=await person(auth,branch.id,'Cadastro Antigo','2001');
    await pool.query("UPDATE memberships SET created_at=now()-interval '14 months' WHERE person_id=$1",[obsolete.person_id]);
    await pool.query("INSERT INTO users(username,password_hash,role,branch_id,must_change_password) VALUES($1,$2,'operador',$3,false)",['operador',await argon2.hash('Operator-Password-123',{type:argon2.argon2id}),branch.id]);
    const operator=await sessionFor('operador');
    const personId=obsolete.person_id;
    const membershipId=(await pool.query<{id:string}>("SELECT id FROM memberships WHERE person_id=$1",[personId])).rows[0].id;

    const denied=await send(operator,'POST','/api/people/bulk-purge',{operationId:uuid(),branchId:branch.id,membershipIds:[membershipId]});
    expect(denied.statusCode).toBe(403);
    expect((await read(`/api/branches/${branch.id}/people/stale`,operator)).statusCode).toBe(403);

    const purged=await send(auth,'POST','/api/people/bulk-purge',{operationId:uuid(),branchId:branch.id,membershipIds:[membershipId]});
    expect(purged.statusCode).toBe(200);
    expect(purged.json()).toMatchObject({purged:1,people:1});
    expect((await pool.query('SELECT id FROM memberships WHERE id=$1',[membershipId])).rowCount).toBe(0);
    expect((await pool.query('SELECT id FROM people WHERE id=$1',[personId])).rowCount).toBe(0);
    expect((await read(`/api/branches/${branch.id}/people/stale`,auth)).json()).toEqual([]);
    const history=(await read(`/api/branches/${branch.id}/history`,auth)).json() as {kind:string;description:string|null}[];
    expect(history.find(item=>item.kind==='cadastros_purgados')?.description).toBe('1 cadastro(s) obsoleto(s) excluído(s) da base');

    const missing=await send(auth,'POST','/api/people/bulk-purge',{operationId:uuid(),branchId:branch.id,membershipIds:[membershipId]});
    expect(missing.statusCode).toBe(409);
    expect(missing.json().error.code).toBe('SELECAO');
    const foreign=await send(auth,'POST','/api/people/bulk-purge',{operationId:uuid(),branchId:branch.id,membershipIds:[]});
    expect(foreign.statusCode).toBe(422);
  });
});
