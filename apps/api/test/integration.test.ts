import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import argon2 from 'argon2';
import {randomUUID} from 'node:crypto';
import {app} from '../src/server.js';
import {pool} from '../src/db.js';
import {parseFile} from '../src/imports.js';
import {hash} from '../src/db.js';
import {transaction} from '../src/db.js';
import {refreshPending} from '../src/pending.js';
import ExcelJS from 'exceljs';

type Auth={cookie:string;csrf:string};
const uuid=()=>randomUUID();
async function send(auth:Auth,method:'POST'|'PATCH'|'DELETE',url:string,payload:Record<string,unknown>){return app.inject({method,url,payload,headers:{cookie:auth.cookie,'x-csrf-token':auth.csrf}});}
async function login():Promise<Auth>{const response=await app.inject({method:'POST',url:'/api/auth/login',payload:{username:'test',password:'Testing-Password-123'}});expect(response.statusCode).toBe(200);return {cookie:response.headers['set-cookie']!.toString().split(';')[0],csrf:response.json().csrf};}
async function sessionFor(username:string):Promise<Auth>{const user=(await pool.query<{id:string}>('SELECT id FROM users WHERE username=$1',[username])).rows[0],token=uuid(),csrf=uuid();await pool.query("INSERT INTO sessions(id_hash,user_id,csrf_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[hash(token),user.id,hash(csrf)]);return {cookie:`armarios_session=${token}`,csrf};}
async function session():Promise<Auth>{return sessionFor('test');}
async function setup(){const auth=await login();const branch=(await send(auth,'POST','/api/branches',{operationId:uuid(),name:'Filial de Teste',timezone:'America/Fortaleza'})).json();return {auth,branch};}
async function setupWithoutLogin(){const auth=await session();const branch=(await send(auth,'POST','/api/branches',{operationId:uuid(),name:'Filial de Teste',timezone:'America/Fortaleza'})).json();return {auth,branch};}
async function locker(auth:Auth,branchId:string,number:string,capacity=1,size='padrao',modality='fixo'){const response=await send(auth,'POST',`/api/branches/${branchId}/lockers`,{operationId:uuid(),number,size,capacity,modality,condition:'disponivel'});expect(response.statusCode).toBe(200);return response.json();}
async function person(auth:Auth,branchId:string,name:string,registration:string){const response=await send(auth,'POST',`/api/branches/${branchId}/people`,{operationId:uuid(),name,category:'promotor_fixo',registration,needsFixed:true,origin:'manual'});expect(response.statusCode).toBe(200);return response.json();}
function form(fields:Record<string,string>,filename:string,content:string){const boundary='armarios-test-boundary';const pieces:string[]=[];for(const [key,value] of Object.entries(fields))pieces.push(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`);pieces.push(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: text/csv\r\n\r\n${content}\r\n--${boundary}--\r\n`);return {payload:pieces.join(''),headers:{'content-type':`multipart/form-data; boundary=${boundary}`}};}
function binaryForm(fields:Record<string,string>,filename:string,content:Buffer){const boundary='armarios-binary-test';const parts:Buffer[]=[];for(const [key,value] of Object.entries(fields))parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`));parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`),content,Buffer.from(`\r\n--${boundary}--\r\n`));return {payload:Buffer.concat(parts),headers:{'content-type':`multipart/form-data; boundary=${boundary}`}};}

beforeAll(async()=>{if(!process.env.DATABASE_URL?.includes('armarios_test'))throw new Error('Use o banco armarios_test');await app.ready();});
beforeEach(async()=>{await pool.query('TRUNCATE branches,people,users CASCADE');await pool.query("INSERT INTO users(username,password_hash,role,must_change_password) VALUES($1,$2,'geral',false)",['test',await argon2.hash('Testing-Password-123',{type:argon2.argon2id})]);});
afterAll(async()=>{await app.close();});

describe('regras transacionais',()=>{
  it('aceita uma única disputa pela última capacidade e não duplica operação',async()=>{
    const {auth,branch}=await setup();const cabinet=await locker(auth,branch.id,'101');const a=await person(auth,branch.id,'Pessoa A','0001'),b=await person(auth,branch.id,'Pessoa B','0002');
    const payloadA={operationId:uuid(),personId:a.person_id,lockerId:cabinet.id,expectedVersion:cabinet.version,modality:'fixo',seasonal:false};
    const payloadB={operationId:uuid(),personId:b.person_id,lockerId:cabinet.id,expectedVersion:cabinet.version,modality:'fixo',seasonal:false};
    const [first,second]=await Promise.all([send(auth,'POST',`/api/branches/${branch.id}/allocations/occupy`,payloadA),send(auth,'POST',`/api/branches/${branch.id}/allocations/occupy`,payloadB)]);
    expect([first.statusCode,second.statusCode].sort()).toEqual([200,409]);
    const winner=first.statusCode===200?payloadA:payloadB;
    const retry=await send(auth,'POST',`/api/branches/${branch.id}/allocations/occupy`,winner);
    expect(retry.statusCode).toBe(200);
    expect((await pool.query('SELECT id FROM allocations WHERE ended_at IS NULL')).rowCount).toBe(1);
  });
  it('preserva outra pessoa ao liberar e impede liberação antiga',async()=>{
    const {auth,branch}=await setup();const cabinet=await locker(auth,branch.id,'360',2,'grande');const a=await person(auth,branch.id,'Pessoa A','0001'),b=await person(auth,branch.id,'Pessoa B','0002');
    const first=await send(auth,'POST',`/api/branches/${branch.id}/allocations/occupy`,{operationId:uuid(),personId:a.person_id,lockerId:cabinet.id,expectedVersion:1,modality:'fixo',seasonal:false});expect(first.statusCode).toBe(200);
    const second=await send(auth,'POST',`/api/branches/${branch.id}/allocations/occupy`,{operationId:uuid(),personId:b.person_id,lockerId:cabinet.id,expectedVersion:2,modality:'fixo',seasonal:false,sharingReason:'Cobertura temporária',sharingDueAt:new Date(Date.now()+86400000).toISOString()});expect(second.statusCode).toBe(200);
    const release=await send(auth,'POST',`/api/branches/${branch.id}/allocations/release`,{operationId:uuid(),allocationId:first.json().id,expectedVersion:1});expect(release.statusCode).toBe(200);
    expect((await pool.query('SELECT id FROM allocations WHERE ended_at IS NULL')).rowCount).toBe(1);
    expect((await pool.query('SELECT id FROM sharings WHERE ended_at IS NULL')).rowCount).toBe(0);
    const old=await send(auth,'POST',`/api/branches/${branch.id}/allocations/release`,{operationId:uuid(),allocationId:first.json().id,expectedVersion:1});expect(old.statusCode).toBe(409);
  });
  it('transfere integralmente e rejeita versão antiga da alocação',async()=>{
    const {auth,branch}=await setupWithoutLogin();
    const source=await locker(auth,branch.id,'A'),destination=await locker(auth,branch.id,'B');
    const member=await person(auth,branch.id,'Pessoa A','0001');
    const first=await send(auth,'POST',`/api/branches/${branch.id}/allocations/occupy`,{operationId:uuid(),personId:member.person_id,lockerId:source.id,expectedVersion:1,modality:'fixo',seasonal:false});expect(first.statusCode).toBe(200);
    const payload={operationId:uuid(),allocationId:first.json().id,expectedAllocationVersion:1,destinationLockerId:destination.id,sourceVersion:2,destinationVersion:1,reason:'Altura mais confortável',keyCopyAvailable:false};
    const transferred=await send(auth,'POST',`/api/branches/${branch.id}/allocations/transfer`,payload);expect(transferred.statusCode).toBe(200);
    expect((await pool.query<{locker_id:string}>('SELECT locker_id FROM allocations WHERE person_id=$1 AND ended_at IS NULL',[member.person_id])).rows).toEqual([{locker_id:destination.id}]);
    expect((await pool.query('SELECT key_copy_available FROM lockers WHERE id=$1',[destination.id])).rows[0].key_copy_available).toBe(false);
    expect((await send(auth,'POST',`/api/branches/${branch.id}/lockers/${source.id}/key-copy`,{operationId:uuid(),expectedVersion:3,available:true})).statusCode).toBe(200);
    expect((await pool.query('SELECT key_copy_available FROM lockers WHERE id=$1',[source.id])).rows[0].key_copy_available).toBe(true);
    expect((await send(auth,'POST',`/api/branches/${branch.id}/allocations/transfer`,{...payload,operationId:uuid()})).statusCode).toBe(409);
    const secondDestination=await locker(auth,branch.id,'C');
    const stale=await send(auth,'POST',`/api/branches/${branch.id}/allocations/transfer`,{operationId:uuid(),allocationId:transferred.json().id,expectedAllocationVersion:999,destinationLockerId:secondDestination.id,sourceVersion:2,destinationVersion:1,reason:'Altura mais confortável'});expect(stale.statusCode).toBe(409);
    expect((await pool.query<{locker_id:string}>('SELECT locker_id FROM allocations WHERE person_id=$1 AND ended_at IS NULL',[member.person_id])).rows[0].locker_id).toBe(destination.id);
  });
  it('preserva ocupação ao encerrar atuação e exige prazo e capacidade no compartilhamento',async()=>{
    const {auth,branch}=await setupWithoutLogin();
    const shared=await locker(auth,branch.id,'Grande',3,'grande'),other=await locker(auth,branch.id,'Outro');
    const a=await person(auth,branch.id,'Pessoa A','1001'),b=await person(auth,branch.id,'Pessoa B','1002'),c=await person(auth,branch.id,'Pessoa C','1003');
    const occupy=(personId:string,lockerId:string,expectedVersion:number,extra:Record<string,unknown>={})=>send(auth,'POST',`/api/branches/${branch.id}/allocations/occupy`,{operationId:uuid(),personId,lockerId,expectedVersion,modality:'fixo',seasonal:false,...extra});
    const first=await occupy(a.person_id,shared.id,1);expect(first.statusCode).toBe(200);
    expect((await occupy(a.person_id,other.id,1)).statusCode).toBe(409);
    expect((await occupy(b.person_id,shared.id,2)).statusCode).toBe(422);
    expect((await occupy(b.person_id,shared.id,2,{sharingReason:'Temporário',sharingDueAt:new Date(Date.now()-86400000).toISOString()})).statusCode).toBe(422);
    const second=await occupy(b.person_id,shared.id,2,{sharingReason:'Temporário',sharingDueAt:new Date(Date.now()+86400000).toISOString()});expect(second.statusCode).toBe(200);
    expect((await send(auth,'PATCH',`/api/branches/${branch.id}/lockers/${shared.id}`,{operationId:uuid(),expectedVersion:3,capacity:1})).statusCode).toBe(409);
    const ended=await send(auth,'POST',`/api/branches/${branch.id}/people/${a.id}/status`,{operationId:uuid(),expectedVersion:1,status:'encerrado'});expect(ended.statusCode).toBe(200);
    expect((await pool.query('SELECT id FROM allocations WHERE id=$1 AND ended_at IS NULL',[first.json().id])).rowCount).toBe(1);
    expect((await pool.query("SELECT id FROM pending_items WHERE kind='atuacao_encerrada' AND state='aberta'")).rowCount).toBe(1);
    const reactivated=await send(auth,'POST',`/api/branches/${branch.id}/people/${a.id}/status`,{operationId:uuid(),expectedVersion:2,status:'ativo'});expect(reactivated.statusCode).toBe(200);expect(reactivated.json().person_id).toBe(a.person_id);
    await pool.query("UPDATE sharings SET due_at=now()-interval '2 days' WHERE locker_id=$1 AND ended_at IS NULL",[shared.id]);
    await transaction(client=>refreshPending(client,branch.id));
    expect((await pool.query("SELECT id FROM pending_items WHERE kind='compartilhamento_vencido' AND state='aberta'")).rowCount).toBe(1);
    expect((await occupy(c.person_id,shared.id,3)).statusCode).toBe(409);
    expect((await pool.query('SELECT id FROM allocations WHERE locker_id=$1 AND ended_at IS NULL',[shared.id])).rowCount).toBe(2);
    const release=await send(auth,'POST',`/api/branches/${branch.id}/allocations/release`,{operationId:uuid(),allocationId:second.json().id,expectedVersion:1});expect(release.statusCode).toBe(200);
    expect((await pool.query('SELECT id FROM sharings WHERE locker_id=$1 AND ended_at IS NULL',[shared.id])).rowCount).toBe(0);
  });
  it('não cria pendência para promotor sem armário',async()=>{
    const {auth,branch}=await setupWithoutLogin();const member=await person(auth,branch.id,'Promotora','1001');
    const pending=(await pool.query<{id:string;version:number;state:string}>("SELECT id,version,state FROM pending_items WHERE branch_id=$1 AND kind='sem_armario'",[branch.id])).rows[0];
    expect(pending).toBeUndefined();
    await transaction(client=>refreshPending(client,branch.id));
    expect((await pool.query('SELECT id FROM pending_items WHERE branch_id=$1 AND kind=\'sem_armario\'',[branch.id])).rowCount).toBe(0);
    expect(member.id).toBeTruthy();
  });
  it('mantém matrícula manual e mostra conflito na TI',async()=>{
    const {auth,branch}=await setup();await person(auth,branch.id,'Promotora','0007');
    const fields={operationId:uuid(),sheet:'CSV',headerRow:'1',extractedOn:'2026-09-01',mapping:JSON.stringify({registration:'MATRICULA',name:'NOME',department:'SETOR',functionName:'FUNCAO'}),encoding:'utf8',delimiter:';'};
    const upload=form(fields,'ti.csv','MATRICULA;NOME;SETOR;FUNCAO\r\n0007;Nome da TI;Loja;Operação\r\n0008;Novo colaborador;Caixa;Operador\r\n');
    const preview=await app.inject({method:'POST',url:`/api/branches/${branch.id}/imports/ti/prepare`,...upload,headers:{...upload.headers,cookie:auth.cookie,'x-csrf-token':auth.csrf}});
    expect(preview.statusCode).toBe(200);expect(preview.json().conflicts).toHaveLength(1);expect(preview.json().inclusions).toHaveLength(1);
    const blocked=await send(auth,'POST',`/api/branches/${branch.id}/imports/${preview.json().importId}/confirm`,{operationId:uuid(),acknowledgeComplete:true});expect(blocked.statusCode).toBe(409);
    const confirmed=await send(auth,'POST',`/api/branches/${branch.id}/imports/${preview.json().importId}/confirm`,{operationId:uuid(),acknowledgeComplete:true,resolutions:{'0007':'converter_para_ti'}});expect(confirmed.statusCode).toBe(200);
    expect((await pool.query("SELECT count(*) FROM memberships WHERE registration='0007'")).rows[0].count).toBe('1');
  });
  it('retira ausentes da base ativa, mantém armário pendente e recusa lote antigo ou repetido',async()=>{
    const {auth,branch}=await setupWithoutLogin();
    const manual=await person(auth,branch.id,'Promotora','0099');
    const fields=(date:string)=>({operationId:uuid(),sheet:'CSV',headerRow:'1',extractedOn:date,mapping:JSON.stringify({registration:'MATRICULA',name:'NOME',department:'SETOR',functionName:'CARGO'}),encoding:'utf8',delimiter:';'});
    const prepare=async(date:string,content:string)=>{const upload=form(fields(date),'colaboradores.csv',`MATRICULA;NOME;SETOR;CARGO\r\n${content}`);return app.inject({method:'POST',url:`/api/branches/${branch.id}/imports/ti/prepare`,...upload,headers:{...upload.headers,cookie:auth.cookie,'x-csrf-token':auth.csrf}});};
    const first=await prepare('2026-09-01','0001;Colaborador A;Loja;Operador\r\n0002;Colaborador B;Loja;Operador\r\n');expect(first.statusCode).toBe(200);
    expect((await send(auth,'POST',`/api/branches/${branch.id}/imports/${first.json().importId}/confirm`,{operationId:uuid(),acknowledgeComplete:true})).statusCode).toBe(200);
    const member=(await pool.query<{person_id:string}>('SELECT person_id FROM memberships WHERE branch_id=$1 AND registration=$2',[branch.id,'0001'])).rows[0];
    const cabinet=await locker(auth,branch.id,'TI-1');
    const occupied=await send(auth,'POST',`/api/branches/${branch.id}/allocations/occupy`,{operationId:uuid(),personId:member.person_id,lockerId:cabinet.id,expectedVersion:cabinet.version,modality:'fixo',seasonal:false});expect(occupied.statusCode).toBe(200);
    const second=await prepare('2026-09-20','0002;Colaborador B alterado;Loja;Operador\r\n');expect(second.statusCode).toBe(200);expect(second.json().counts.absent).toBe(1);
    const third=await prepare('2026-09-21','0002;Colaborador B alterado;Loja;Operador\r\n');expect(third.statusCode).toBe(200);
    const confirmation={operationId:uuid(),acknowledgeComplete:true};
    expect((await send(auth,'POST',`/api/branches/${branch.id}/imports/${second.json().importId}/confirm`,confirmation)).statusCode).toBe(200);
    expect((await send(auth,'POST',`/api/branches/${branch.id}/imports/${second.json().importId}/confirm`,confirmation)).statusCode).toBe(200);
    expect((await pool.query("SELECT id FROM pending_items WHERE kind='ausente_ti' AND state='aberta'")).rowCount).toBe(1);
    expect((await pool.query('SELECT id FROM allocations WHERE id=$1 AND ended_at IS NULL',[occupied.json().id])).rowCount).toBe(1);
    expect((await pool.query("SELECT status FROM memberships WHERE registration='0001'")).rows[0].status).toBe('encerrado');
    expect((await app.inject({method:'GET',url:`/api/branches/${branch.id}/people`,headers:{cookie:auth.cookie}})).json().some((row:{registration:string})=>row.registration==='0001')).toBe(false);
    expect((await pool.query('SELECT status,origin FROM memberships WHERE person_id=$1',[manual.person_id])).rows[0]).toMatchObject({status:'ativo',origin:'manual'});
    expect((await send(auth,'POST',`/api/branches/${branch.id}/imports/${third.json().importId}/confirm`,{operationId:uuid(),acknowledgeComplete:true})).statusCode).toBe(409);
    expect((await send(auth,'POST',`/api/branches/${branch.id}/imports/${second.json().importId}/confirm`,{operationId:uuid(),acknowledgeComplete:true})).statusCode).toBe(409);
    const older=await prepare('2026-09-10','0002;Colaborador B;Loja;Operador\r\n');expect(older.statusCode).toBe(200);
    expect((await send(auth,'POST',`/api/branches/${branch.id}/imports/${older.json().importId}/confirm`,{operationId:uuid(),acknowledgeComplete:true})).statusCode).toBe(409);
    const empty=await prepare('2026-10-01','');expect(empty.statusCode).toBe(422);
    const returned=await prepare('2026-10-01','0001;Colaborador A;Loja;Operador\r\n0002;Colaborador B alterado;Loja;Operador\r\n');expect(returned.statusCode).toBe(200);
    expect((await send(auth,'POST',`/api/branches/${branch.id}/imports/${returned.json().importId}/confirm`,{operationId:uuid(),acknowledgeComplete:true})).statusCode).toBe(200);
    expect((await pool.query("SELECT id FROM pending_items WHERE kind='ausente_ti' AND state='aberta'")).rowCount).toBe(0);
    expect((await pool.query('SELECT id FROM people WHERE id=$1',[member.person_id])).rowCount).toBe(1);
    expect((await pool.query("SELECT status FROM memberships WHERE registration='0001'")).rows[0].status).toBe('ativo');
  });
  it('busca por matrícula, atribui armário, mostra troca ao operador e limpa selecionados',async()=>{
    const {auth,branch}=await setupWithoutLogin();
    const employee=(await pool.query<{id:string}>("INSERT INTO people(name) VALUES('Ana Exemplo') RETURNING id")).rows[0];
    const member=(await pool.query<{id:string}>(`INSERT INTO memberships(person_id,branch_id,category,origin,registration,department,function_name,needs_fixed,ti_present)
      VALUES($1,$2,'colaborador','ti','0001','Loja','Operadora',true,true) RETURNING id`,[employee.id,branch.id])).rows[0];
    const other=(await pool.query<{id:string}>("INSERT INTO people(name) VALUES('Bia Exemplo') RETURNING id")).rows[0];
    await pool.query(`INSERT INTO memberships(person_id,branch_id,category,origin,registration,needs_fixed,ti_present)
      VALUES($1,$2,'colaborador','ti','0002',true,true)`,[other.id,branch.id]);
    const lookup=await app.inject({method:'GET',url:`/api/branches/${branch.id}/people/registration/0001`,headers:{cookie:auth.cookie}});
    expect(lookup.statusCode).toBe(200);expect(lookup.json()).toMatchObject({name:'Ana Exemplo',department:'Loja',function_name:'Operadora'});
    const sector=await send(auth,'POST',`/api/branches/${branch.id}/lockers`,{operationId:uuid(),number:'10',size:'padrao',capacity:1,modality:'fixo',condition:'disponivel',sectorOccupant:'Restaurante FC'});
    expect(sector.statusCode).toBe(200);
    expect((await send(auth,'POST',`/api/branches/${branch.id}/allocations/occupy`,{operationId:uuid(),personId:employee.id,lockerId:sector.json().id,expectedVersion:1,modality:'fixo',seasonal:false})).statusCode).toBe(409);
    const first=await send(auth,'POST',`/api/branches/${branch.id}/lockers`,{operationId:uuid(),number:'11',size:'padrao',capacity:1,modality:'fixo',condition:'disponivel'});
    const second=await send(auth,'POST',`/api/branches/${branch.id}/lockers`,{operationId:uuid(),number:'12',size:'padrao',capacity:1,modality:'fixo',condition:'disponivel'});
    const occupied=await send(auth,'POST',`/api/branches/${branch.id}/allocations/occupy`,{operationId:uuid(),personId:lookup.json().person_id,lockerId:first.json().id,expectedVersion:1,modality:'fixo',seasonal:false});
    expect(occupied.statusCode).toBe(200);
    const moved=await send(auth,'POST',`/api/branches/${branch.id}/allocations/transfer`,{operationId:uuid(),allocationId:occupied.json().id,
      expectedAllocationVersion:1,destinationLockerId:second.json().id,sourceVersion:2,destinationVersion:1,reason:'Armário mais alto'});
    expect(moved.statusCode).toBe(200);
    const operator=(await pool.query<{id:string}>("INSERT INTO users(username,password_hash,role,branch_id,must_change_password) VALUES('operador','unused','operador',$1,false) RETURNING id",[branch.id])).rows[0];
    const token=uuid(),csrf=uuid();
    await pool.query("INSERT INTO sessions(id_hash,user_id,csrf_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[hash(token),operator.id,hash(csrf)]);
    const operatorCookie=`armarios_session=${token}`;
    const transfers=await app.inject({method:'GET',url:`/api/branches/${branch.id}/transfers`,headers:{cookie:operatorCookie}});
    expect(transfers.statusCode).toBe(200);expect(transfers.json()[0]).toMatchObject({source_number:'11',destination_number:'12',reason:'Armário mais alto'});
    expect((await app.inject({method:'GET',url:`/api/branches/${branch.id}/history`,headers:{cookie:operatorCookie}})).statusCode).toBe(403);
    const selected=await send(auth,'POST',`/api/branches/${branch.id}/people/archive`,{operationId:uuid(),all:false,membershipIds:[member.id]});
    expect(selected.json().removed).toBe(1);
    expect((await pool.query("SELECT id FROM pending_items WHERE kind='ausente_ti' AND state='aberta'")).rowCount).toBe(1);
    expect((await app.inject({method:'GET',url:`/api/branches/${branch.id}/people/registration/0001`,headers:{cookie:auth.cookie}})).statusCode).toBe(404);
    const all=await send(auth,'POST',`/api/branches/${branch.id}/people/archive`,{operationId:uuid(),all:true,membershipIds:[]});
    expect(all.json().removed).toBe(1);
    expect((await pool.query("SELECT count(*) FROM memberships WHERE branch_id=$1 AND category='colaborador' AND status='ativo'",[branch.id])).rows[0].count).toBe('0');
  });
  it('permite reimportar a mesma planilha após limpar a base ativa',async()=>{
    const {auth,branch}=await setupWithoutLogin();
    const fields=()=>({operationId:uuid(),sheet:'CSV',headerRow:'1',extractedOn:'2026-09-01',
      mapping:JSON.stringify({registration:'MATRICULA',name:'NOME',department:'SETOR',functionName:'CARGO'}),encoding:'utf8',delimiter:';'});
    const upload=async()=>{const file=form(fields(),'colaboradores.csv','MATRICULA;NOME;SETOR;CARGO\r\n0001;Ana Exemplo;Loja;Operadora\r\n');
      return app.inject({method:'POST',url:`/api/branches/${branch.id}/imports/ti/prepare`,...file,headers:{...file.headers,cookie:auth.cookie,'x-csrf-token':auth.csrf}});};
    const first=await upload();expect(first.statusCode).toBe(200);
    expect((await send(auth,'POST',`/api/branches/${branch.id}/imports/${first.json().importId}/confirm`,{operationId:uuid(),acknowledgeComplete:true})).statusCode).toBe(200);
    expect((await send(auth,'POST',`/api/branches/${branch.id}/people/archive`,{operationId:uuid(),all:true,membershipIds:[]})).json().removed).toBe(1);
    const again=await upload();expect(again.statusCode).toBe(200);
    expect((await send(auth,'POST',`/api/branches/${branch.id}/imports/${again.json().importId}/confirm`,
      {operationId:uuid(),acknowledgeComplete:true,sameDateCorrection:true})).statusCode).toBe(200);
    expect((await pool.query("SELECT status FROM memberships WHERE registration='0001'")).rows[0].status).toBe('ativo');
  });
  it('resiste a dez operadores simultâneos no último armário',async()=>{
    const {auth:admin,branch}=await setup();const cabinet=await locker(admin,branch.id,'Único');
    const actors:Auth[]=[],persons:string[]=[];
    for(let i=0;i<10;i++){
      const personId=(await person(admin,branch.id,`Pessoa ${i}`,`T${i.toString().padStart(3,'0')}`)).person_id;
      const token=uuid(),csrf=uuid();
      const user=(await pool.query<{id:string}>("INSERT INTO users(username,password_hash,role,branch_id,must_change_password) VALUES($1,'unused','operador',$2,false) RETURNING id",[`operador${i}`,branch.id])).rows[0];
      await pool.query("INSERT INTO sessions(id_hash,user_id,csrf_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[hash(token),user.id,hash(csrf)]);
      actors.push({cookie:`armarios_session=${token}`,csrf});persons.push(personId);
    }
    const results=await Promise.all(actors.map((auth,index)=>send(auth,'POST',`/api/branches/${branch.id}/allocations/occupy`,{operationId:uuid(),personId:persons[index],lockerId:cabinet.id,expectedVersion:cabinet.version,modality:'fixo',seasonal:false})));
    expect(results.filter(x=>x.statusCode===200)).toHaveLength(1);
    expect(results.filter(x=>x.statusCode===409)).toHaveLength(9);
    expect((await pool.query('SELECT id FROM allocations WHERE ended_at IS NULL')).rowCount).toBe(1);
  });
  it('bloqueia filial alheia, escrita de consulta e rotas da filial excluída',async()=>{
    const {auth,branch}=await setupWithoutLogin();
    const other=(await send(auth,'POST','/api/branches',{operationId:uuid(),name:'Outra Filial',timezone:'America/Fortaleza'})).json();
    const readUser=(await pool.query<{id:string}>("INSERT INTO users(username,password_hash,role,branch_id,must_change_password) VALUES($1,$2,'consulta',$3,false) RETURNING id",['consulta',await argon2.hash('Consult-Password-123',{type:argon2.argon2id}),branch.id])).rows[0];
    const token=uuid(),csrf=uuid(),consult={cookie:`armarios_session=${token}`,csrf};
    await pool.query("INSERT INTO sessions(id_hash,user_id,csrf_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[hash(token),readUser.id,hash(csrf)]);
    const denied=await app.inject({method:'GET',url:`/api/branches/${other.id}/lockers`,headers:{cookie:consult.cookie}});expect(denied.statusCode).toBe(403);
    const write=await send(consult,'POST',`/api/branches/${branch.id}/lockers`,{operationId:uuid(),number:'Sem permissão',size:'padrao',capacity:1,modality:'fixo'});expect(write.statusCode).toBe(403);
    const forbidden=await send(consult,'DELETE',`/api/branches/${other.id}`,{operationId:uuid(),expectedVersion:other.version});expect(forbidden.statusCode).toBe(403);
    const removed=await send(auth,'DELETE',`/api/branches/${other.id}`,{operationId:uuid(),expectedVersion:other.version});expect(removed.statusCode).toBe(200);
    const rejected=await app.inject({method:'GET',url:`/api/branches/${other.id}/lockers`,headers:{cookie:auth.cookie}});expect(rejected.statusCode).toBe(403);
    expect((await app.inject({method:'GET',url:'/api/branches',headers:{cookie:auth.cookie}})).json().map((row:{id:string})=>row.id)).not.toContain(other.id);
  });
  it('importa uma única aba, liga matrícula existente e registra setor sem pessoa',async()=>{
    const {auth,branch}=await setupWithoutLogin();
    const existing=await person(auth,branch.id,'Pessoa Exemplo','0001');
    const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('Armários');
    sheet.addRow(['NÚMERO','NOME','MATRÍCULA','SETOR OCUPANTE','STATUS','DUPLO']);
    sheet.addRow(['1','Nome incorreto na planilha','00-01','','OCUPADO',false]);
    sheet.addRow(['2','','','Jerinana','OCUPADO',false]);
    sheet.addRow(['3','','','','OCUPADO',false]);
    const file=binaryForm({operationId:uuid()},'Armarios.xlsx',Buffer.from(await workbook.xlsx.writeBuffer()));
    const prepared=await app.inject({method:'POST',url:`/api/branches/${branch.id}/imports/migration/prepare`,...file,headers:{...file.headers,cookie:auth.cookie,'x-csrf-token':auth.csrf}});
    expect(prepared.statusCode).toBe(200);expect(prepared.json()).toMatchObject({physicalCount:3,sectorCount:1,uncertainCount:1});
    const confirmed=await send(auth,'POST',`/api/branches/${branch.id}/imports/migration/${prepared.json().importId}/confirm`,{operationId:uuid(),acknowledgeReviewed:true});
    expect(confirmed.statusCode).toBe(200);
    expect((await pool.query('SELECT count(*) FROM people')).rows[0].count).toBe('1');
    expect((await pool.query('SELECT person_id FROM allocations')).rows[0].person_id).toBe(existing.person_id);
    expect((await pool.query('SELECT name FROM people WHERE id=$1',[existing.person_id])).rows[0].name).toBe('Pessoa Exemplo');
    expect((await pool.query("SELECT sector_occupant FROM lockers WHERE number='2'")).rows[0].sector_occupant).toBe('Jerinana');
    expect((await pool.query("SELECT id FROM pending_items WHERE kind='migracao_inconclusiva' AND state='aberta'")).rowCount).toBe(1);
    const pending=(await app.inject({method:'GET',url:`/api/branches/${branch.id}/pending`,headers:{cookie:auth.cookie}})).json();
    expect(pending.find((item:{locker_number:string})=>item.locker_number==='3')).toMatchObject({source_rows:[{number:'3'}],occupants:[]});
  });
  it('usa matrícula para corrigir a ocupação importada quando a base de colaboradores chega depois',async()=>{
    const {auth,branch}=await setupWithoutLogin();
    const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('Armários');
    sheet.addRow(['N°','NOME','MATRÍCULA','SETOR','FUNÇÃO','STATUS','DUPLO']);
    sheet.addRow(['232','Nome incorreto','29-968','Loja','Atendente','OCUPADO',false]);
    sheet.addRow(['233','','29-969','Loja','Atendente','OCUPADO',false]);
    const file=binaryForm({operationId:uuid()},'armarios.xlsx',Buffer.from(await workbook.xlsx.writeBuffer()));
    const prepared=await app.inject({method:'POST',url:`/api/branches/${branch.id}/imports/migration/prepare`,...file,headers:{...file.headers,cookie:auth.cookie,'x-csrf-token':auth.csrf}});
    expect(prepared.statusCode).toBe(200);
    expect((await send(auth,'POST',`/api/branches/${branch.id}/imports/migration/${prepared.json().importId}/confirm`,{operationId:uuid(),acknowledgeReviewed:true})).statusCode).toBe(200);
    const fields={operationId:uuid(),sheet:'CSV',headerRow:'1',extractedOn:'2026-09-23',mapping:JSON.stringify({registration:'MATRICULA',name:'NOME',department:'SETOR',functionName:'FUNCAO'}),encoding:'utf8',delimiter:';'};
    const upload=form(fields,'colaboradores.csv','MATRICULA;NOME;SETOR;FUNCAO\r\n29968;Stephanie Oficial;Caixa;Operadora\r\n29969;Marina Oficial;Loja;Atendente\r\n');
    const preview=await app.inject({method:'POST',url:`/api/branches/${branch.id}/imports/ti/prepare`,...upload,headers:{...upload.headers,cookie:auth.cookie,'x-csrf-token':auth.csrf}});
    expect(preview.statusCode).toBe(200);expect(preview.json().conflicts).toHaveLength(0);
    expect((await send(auth,'POST',`/api/branches/${branch.id}/imports/${preview.json().importId}/confirm`,{operationId:uuid(),acknowledgeComplete:true})).statusCode).toBe(200);
    const current=(await pool.query(`SELECT p.name,m.registration,m.department,m.function_name,m.origin,l.number FROM allocations a
      JOIN people p ON p.id=a.person_id JOIN memberships m ON m.person_id=p.id JOIN lockers l ON l.id=a.locker_id WHERE l.number='232'`)).rows[0];
    expect(current).toMatchObject({name:'Stephanie Oficial',registration:'29968',department:'Caixa',function_name:'Operadora',origin:'ti',number:'232'});
    expect((await pool.query(`SELECT p.name FROM allocations a JOIN people p ON p.id=a.person_id JOIN lockers l ON l.id=a.locker_id WHERE l.number='233'`)).rows[0].name).toBe('Marina Oficial');
    expect((await pool.query("SELECT count(*) FROM pending_items WHERE state='aberta' AND kind IN ('ausente_ti','dados_alterados','atuacao_encerrada')")).rows[0].count).toBe('0');
    const lookup=await app.inject({method:'GET',url:`/api/branches/${branch.id}/people/registration/29-968`,headers:{cookie:auth.cookie}});
    expect(lookup.statusCode).toBe(200);expect(lookup.json().name).toBe('Stephanie Oficial');
  });
  it('permite corrigir dados na pendência e vincular o ocupante pela matrícula oficial',async()=>{
    const {auth,branch}=await setupWithoutLogin();
    const official=(await pool.query<{id:string}>("INSERT INTO people(name) VALUES('Nome Oficial') RETURNING id")).rows[0];
    await pool.query(`INSERT INTO memberships(person_id,branch_id,category,origin,registration,department,function_name,needs_fixed,ti_present)
      VALUES($1,$2,'colaborador','ti','0001','Caixa','Operadora',true,true)`,[official.id,branch.id]);
    const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('Armários');
    sheet.addRow(['N°','NOME','MATRÍCULA','SETOR','FUNÇÃO','STATUS']);
    sheet.addRow(['11','Nome errado','','','', 'OCUPADO']);
    const file=binaryForm({operationId:uuid()},'armarios.xlsx',Buffer.from(await workbook.xlsx.writeBuffer()));
    const prepared=await app.inject({method:'POST',url:`/api/branches/${branch.id}/imports/migration/prepare`,...file,headers:{...file.headers,cookie:auth.cookie,'x-csrf-token':auth.csrf}});
    expect(prepared.statusCode).toBe(200);
    expect((await send(auth,'POST',`/api/branches/${branch.id}/imports/migration/${prepared.json().importId}/confirm`,{operationId:uuid(),acknowledgeReviewed:true})).statusCode).toBe(200);
    type ReviewItem={id:string;version:number;kind:string;locker_version:number;occupants:{allocationId:string;membershipId:string;membershipVersion:number}[]};
    const getReview=async()=>((await app.inject({method:'GET',url:`/api/branches/${branch.id}/pending`,headers:{cookie:auth.cookie}})).json() as ReviewItem[])
      .find(item=>item.kind==='migracao_inconclusiva')!;
    const first=await getReview();
    const corrected=await send(auth,'POST',`/api/branches/${branch.id}/pending/${first.id}/revise`,{operationId:uuid(),expectedVersion:first.version,
      expectedLockerVersion:first.locker_version,isDouble:true,sectorOccupant:null,finalize:false,
      occupant:{allocationId:first.occupants[0].allocationId,membershipId:first.occupants[0].membershipId,
        expectedMembershipVersion:first.occupants[0].membershipVersion,name:'Nome conferido',registration:null,department:'Loja',functionName:'Atendente'}});
    expect(corrected.statusCode).toBe(200);
    expect((await pool.query("SELECT p.name,m.department FROM allocations a JOIN people p ON p.id=a.person_id JOIN memberships m ON m.person_id=p.id JOIN lockers l ON l.id=a.locker_id WHERE l.number='11'")).rows[0])
      .toMatchObject({name:'Nome conferido',department:'Loja'});
    const second=await getReview();
    const linked=await send(auth,'POST',`/api/branches/${branch.id}/pending/${second.id}/revise`,{operationId:uuid(),expectedVersion:second.version,
      expectedLockerVersion:second.locker_version,isDouble:true,sectorOccupant:null,finalize:true,
      occupant:{allocationId:second.occupants[0].allocationId,membershipId:second.occupants[0].membershipId,
        expectedMembershipVersion:second.occupants[0].membershipVersion,name:'Nome ainda errado',registration:'00-01',department:'Outro',functionName:'Outra'}});
    expect(linked.statusCode).toBe(200);expect(linked.json().officialName).toBe('Nome Oficial');
    expect((await pool.query("SELECT p.name,m.department,m.function_name,l.is_double,l.capacity FROM allocations a JOIN people p ON p.id=a.person_id JOIN memberships m ON m.person_id=p.id JOIN lockers l ON l.id=a.locker_id WHERE l.number='11' AND a.ended_at IS NULL")).rows[0])
      .toMatchObject({name:'Nome Oficial',department:'Caixa',function_name:'Operadora',is_double:true,capacity:2});
    expect((await pool.query("SELECT count(*) FROM pending_items WHERE kind='migracao_inconclusiva' AND state='aberta'")).rows[0].count).toBe('0');
    const blank=await locker(auth,branch.id,'12');
    await pool.query("UPDATE lockers SET migration_status='inconclusivo' WHERE id=$1",[blank.id]);
    await transaction(client=>refreshPending(client,branch.id));
    const blankPending=await getReview();
    const filled=await send(auth,'POST',`/api/branches/${branch.id}/pending/${blankPending.id}/revise`,{operationId:uuid(),expectedVersion:blankPending.version,
      expectedLockerVersion:blankPending.locker_version,isDouble:false,sectorOccupant:null,finalize:true,
      occupant:{name:'Pessoa identificada',registration:null,department:'Loja',functionName:'Apoio'}});
    expect(filled.statusCode).toBe(200);
    expect((await pool.query("SELECT p.name,m.department FROM allocations a JOIN people p ON p.id=a.person_id JOIN memberships m ON m.person_id=p.id JOIN lockers l ON l.id=a.locker_id WHERE l.number='12'")).rows[0])
      .toMatchObject({name:'Pessoa identificada',department:'Loja'});
  });
  it('recusa armários duplicados e arquivo com várias abas',async()=>{
    const {auth,branch}=await setupWithoutLogin();
    const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('Armários');
    sheet.addRow(['N°','NOME','MATRÍCULA','STATUS','DUPLO']);sheet.addRow(['360','Pessoa Exemplo','0001','OCUPADO',false]);sheet.addRow(['360','Outra pessoa','0002','OCUPADO',false]);
    const upload=async(content:ExcelJS.Workbook)=>{const file=binaryForm({operationId:uuid()},'Armarios.xlsx',Buffer.from(await content.xlsx.writeBuffer()));
      return app.inject({method:'POST',url:`/api/branches/${branch.id}/imports/migration/prepare`,...file,headers:{...file.headers,cookie:auth.cookie,'x-csrf-token':auth.csrf}});};
    expect((await upload(workbook)).statusCode).toBe(422);
    workbook.addWorksheet('Outra aba');
    expect((await upload(workbook)).statusCode).toBe(422);
  });
  it('lê a planilha atual: armário duplo, setor, matrícula invisível e nomes pendentes',async()=>{
    const {auth,branch}=await setupWithoutLogin();
    const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('Página1');
    sheet.addRow(['N°','NOME','MATRÍCULA','SETOR','FUNÇÃO','STATUS','DUPLO']);
    sheet.addRow([360,'Ana Exemplo',101,'Loja','Operadora','OCUPADO','verdadeiro']);
    sheet.addRow([360,'Bia Exemplo',102,'Loja','Operadora','OCUPADO','true']);
    sheet.addRow([361,'Caio Vinicius','\u200b','','','OCUPADO','falso']);
    sheet.addRow([362,'Caio Vinícius','\u200b','','','OCUPADO','false']);
    sheet.addRow([363,'','\u200b','RESTAURANTE FC','','OCUPADO','false']);
    sheet.addRow([364,'','\u200b','','PROMOTOR(A)','OCUPADO','false']);
    sheet.addRow([366,'','\u200b','','JOVEM APRENDIZ','OCUPADO','false']);
    sheet.addRow([365,'','\u200b','','','DISPONÍVEL','true']);
    const file=binaryForm({operationId:uuid()},'armarios.xlsx',Buffer.from(await workbook.xlsx.writeBuffer()));
    const prepared=await app.inject({method:'POST',url:`/api/branches/${branch.id}/imports/migration/prepare`,...file,headers:{...file.headers,cookie:auth.cookie,'x-csrf-token':auth.csrf}});
    expect(prepared.statusCode).toBe(200);
    expect(prepared.json()).toMatchObject({sourceRows:8,physicalCount:7,occupiedCount:6,doubleCount:2,sectorCount:2,uncertainCount:2,repeatedNameCount:1});
    const confirmed=await send(auth,'POST',`/api/branches/${branch.id}/imports/migration/${prepared.json().importId}/confirm`,{operationId:uuid(),acknowledgeReviewed:true});
    expect(confirmed.statusCode).toBe(200);
    expect((await pool.query("SELECT count(*) FROM lockers WHERE branch_id=$1",[branch.id])).rows[0].count).toBe('7');
    expect((await pool.query("SELECT is_double,capacity FROM lockers WHERE branch_id=$1 AND number='360'",[branch.id])).rows[0]).toMatchObject({is_double:true,capacity:2});
    expect((await pool.query("SELECT count(*) FROM allocations a JOIN lockers l ON l.id=a.locker_id WHERE l.branch_id=$1 AND l.number='360' AND a.ended_at IS NULL",[branch.id])).rows[0].count).toBe('2');
    expect((await pool.query("SELECT sector_occupant FROM lockers WHERE branch_id=$1 AND number='363'",[branch.id])).rows[0].sector_occupant).toBe('RESTAURANTE FC');
    expect((await pool.query("SELECT count(*) FROM pending_items WHERE branch_id=$1 AND kind='migracao_inconclusiva' AND state='aberta'",[branch.id])).rows[0].count).toBe('2');
    expect((await pool.query("SELECT migration_status,sector_occupant FROM lockers WHERE branch_id=$1 AND number='364'",[branch.id])).rows[0]).toMatchObject({migration_status:'conferido',sector_occupant:'PROMOTOR(A)'});
    expect((await pool.query("SELECT m.category FROM memberships m JOIN people p ON p.id=m.person_id JOIN allocations a ON a.person_id=p.id JOIN lockers l ON l.id=a.locker_id WHERE l.branch_id=$1 AND l.number='366' AND a.ended_at IS NULL",[branch.id])).rows[0].category).toBe('vinculo_nao_identificado');
    const emptyDouble=(await pool.query<{id:string}>("SELECT id FROM lockers WHERE branch_id=$1 AND number='365'",[branch.id])).rows[0];
    const first=await person(auth,branch.id,'Dora Exemplo','0103'),second=await person(auth,branch.id,'Eva Exemplo','0104');
    expect((await send(auth,'POST',`/api/branches/${branch.id}/allocations/occupy`,{operationId:uuid(),personId:first.person_id,lockerId:emptyDouble.id,expectedVersion:1,modality:'fixo',seasonal:false})).statusCode).toBe(200);
    expect((await send(auth,'POST',`/api/branches/${branch.id}/allocations/occupy`,{operationId:uuid(),personId:second.person_id,lockerId:emptyDouble.id,expectedVersion:2,modality:'fixo',seasonal:false})).statusCode).toBe(200);
    expect((await pool.query('SELECT count(*) FROM sharings WHERE locker_id=$1',[emptyDouble.id])).rows[0].count).toBe('0');
  });
  it('inicia com cópia de chave e permite editar o armário diretamente pelo painel',async()=>{
    const {auth,branch}=await setupWithoutLogin();
    const cabinet=await locker(auth,branch.id,'20');
    expect(cabinet.key_copy_available).toBe(true);
    const changed=await send(auth,'POST',`/api/branches/${branch.id}/lockers/${cabinet.id}/revise`,{
      operationId:uuid(),expectedLockerVersion:cabinet.version,isDouble:true,condition:'manutencao',
      keyCopyAvailable:false,sectorOccupant:'Restaurante FC',occupant:null});
    expect(changed.statusCode).toBe(200);
    expect(changed.json().locker).toMatchObject({number:'20',is_double:true,capacity:2,condition:'manutencao',
      key_copy_available:false,sector_occupant:'Restaurante FC'});
    const listed=await app.inject({method:'GET',url:`/api/branches/${branch.id}/lockers`,headers:{cookie:auth.cookie}});
    expect(listed.json()[0]).toMatchObject({number:'20',key_copy_available:false,sector_occupant:'Restaurante FC'});
    expect((await send(auth,'PATCH',`/api/branches/${branch.id}/lockers/${cabinet.id}`,{
      operationId:uuid(),expectedVersion:changed.json().locker.version,number:'21'})).statusCode).toBe(422);
    expect((await send(auth,'POST',`/api/branches/${branch.id}/lockers/${cabinet.id}/revise`,{
      operationId:uuid(),expectedLockerVersion:changed.json().locker.version,number:'21',isDouble:true,
      condition:'manutencao',keyCopyAvailable:false,sectorOccupant:'Restaurante FC',occupant:null})).statusCode).toBe(422);
  });
  it('troca ocupante por matrícula, oferece toda a base ativa e adiciona a segunda pessoa ao duplo',async()=>{
    const {auth,branch}=await setupWithoutLogin();
    const cabinet=await locker(auth,branch.id,'30');
    const members:Record<string,string>={};
    for(const [registration,name] of [['0001','Ana Oficial'],['0002','Bia Oficial'],['0003','Caio Oficial']]){
      const p=(await pool.query<{id:string}>('INSERT INTO people(name) VALUES($1) RETURNING id',[name])).rows[0];
      await pool.query(`INSERT INTO memberships(person_id,branch_id,category,origin,registration,department,function_name,needs_fixed,ti_present)
        VALUES($1,$2,'colaborador','ti',$3,'Loja','Operação',true,true)`,[p.id,branch.id,registration]);
      members[registration]=p.id;
    }
    const roster=await app.inject({method:'GET',url:`/api/branches/${branch.id}/people/registrations`,headers:{cookie:auth.cookie}});
    expect(roster.statusCode).toBe(200);expect(roster.json().map((item:{registration:string})=>item.registration)).toEqual(['0001','0002','0003']);
    expect((await send(auth,'POST',`/api/branches/${branch.id}/allocations/occupy`,{operationId:uuid(),personId:members['0001'],
      lockerId:cabinet.id,expectedVersion:1,modality:'fixo',seasonal:false})).statusCode).toBe(200);
    type Entry={id:string;version:number;occupants:{allocationId:string;membershipId:string;membershipVersion:number;registration:string}[]};
    const current=async()=>((await app.inject({method:'GET',url:`/api/branches/${branch.id}/lockers`,headers:{cookie:auth.cookie}})).json() as Entry[])[0];
    const first=await current();
    const replaced=await send(auth,'POST',`/api/branches/${branch.id}/lockers/${cabinet.id}/revise`,{operationId:uuid(),
      expectedLockerVersion:first.version,isDouble:true,sectorOccupant:null,occupant:{allocationId:first.occupants[0].allocationId,
        membershipId:first.occupants[0].membershipId,expectedMembershipVersion:first.occupants[0].membershipVersion,
        name:'Nome errado',registration:'00-02',department:null,functionName:null}});
    expect(replaced.statusCode).toBe(200);expect(replaced.json().officialName).toBe('Bia Oficial');
    expect((await pool.query('SELECT count(*) FROM allocations WHERE person_id=$1 AND ended_at IS NOT NULL',[members['0001']])).rows[0].count).toBe('1');
    const second=await current();
    const added=await send(auth,'POST',`/api/branches/${branch.id}/lockers/${cabinet.id}/revise`,{operationId:uuid(),
      expectedLockerVersion:second.version,isDouble:true,sectorOccupant:null,occupant:{name:'Nome errado',registration:'0003',department:null,functionName:null}});
    expect(added.statusCode).toBe(200);expect(added.json().officialName).toBe('Caio Oficial');
    expect((await pool.query('SELECT count(*) FROM allocations WHERE locker_id=$1 AND ended_at IS NULL',[cabinet.id])).rows[0].count).toBe('2');
    const third=await current();
    const bia=third.occupants.find(item=>item.registration==='0002')!;
    const manual=await send(auth,'POST',`/api/branches/${branch.id}/lockers/${cabinet.id}/revise`,{operationId:uuid(),
      expectedLockerVersion:third.version,isDouble:true,sectorOccupant:null,occupant:{allocationId:bia.allocationId,
        membershipId:bia.membershipId,expectedMembershipVersion:bia.membershipVersion,
        name:'Pessoa conferida',registration:null,department:'Caixa',functionName:'Apoio'}});
    expect(manual.statusCode).toBe(200);
    expect((await pool.query("SELECT p.name,m.registration,m.category FROM allocations a JOIN people p ON p.id=a.person_id JOIN memberships m ON m.person_id=p.id WHERE a.locker_id=$1 AND a.ended_at IS NULL ORDER BY m.registration",[cabinet.id])).rows)
      .toEqual([{name:'Caio Oficial',registration:'0003',category:'colaborador'},{name:'Pessoa conferida',registration:null,category:'vinculo_nao_identificado'}]);
    expect((await pool.query("SELECT count(*) FROM pending_items WHERE kind='sem_matricula' AND state='aberta'")).rows[0].count).toBe('1');
  });
  it('exclui a filial em cascata com armários ocupados e recusa versão antiga',async()=>{
    const {auth,branch}=await setupWithoutLogin();
    const cabinet=await locker(auth,branch.id,'101');const member=await person(auth,branch.id,'Pessoa A','0001');
    expect((await send(auth,'POST',`/api/branches/${branch.id}/allocations/occupy`,{operationId:uuid(),personId:member.person_id,lockerId:cabinet.id,expectedVersion:1,modality:'fixo'})).statusCode).toBe(200);
    await pool.query("UPDATE lockers SET migration_status='inconclusivo' WHERE id=$1",[cabinet.id]);
    await pool.query(`INSERT INTO pending_items(branch_id,kind,subject_type,subject_id) VALUES($1,'migracao_inconclusiva','locker',$2)`,[branch.id,cabinet.id]);
    await pool.query("INSERT INTO allocations(branch_id,locker_id,person_id,modality,started_at,ended_at) VALUES($1,$2,$3,'rotativo',now(),now())",[branch.id,cabinet.id,member.person_id]);
    const history=await app.inject({method:'GET',url:`/api/branches/${branch.id}/allocations`,headers:{cookie:auth.cookie}});
    expect(history.statusCode).toBe(200);
    expect(JSON.stringify(history.json())).toContain('rotativo');
    expect((await pool.query('SELECT id FROM pending_items')).rowCount).toBe(1);
    const stale=await send(auth,'DELETE',`/api/branches/${branch.id}`,{operationId:uuid(),expectedVersion:branch.version+5});
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.message).toBe('Filial alterada; recarregue');
    const deleted=await send(auth,'DELETE',`/api/branches/${branch.id}`,{operationId:uuid(),expectedVersion:branch.version});
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toMatchObject({id:branch.id,deleted:true});
    for(const table of ['branches','lockers','allocations','pending_items','events','memberships','locations','imports','import_sources']){
      expect((await pool.query(`SELECT 1 FROM ${table}`)).rowCount,table).toBe(0);
    }
    expect((await pool.query('SELECT 1 FROM users WHERE branch_id IS NOT NULL')).rowCount).toBe(0);
    expect((await pool.query('SELECT 1 FROM operations WHERE branch_id IS NOT NULL')).rowCount).toBe(0);
    expect((await app.inject({method:'GET',url:`/api/branches/${branch.id}/lockers`,headers:{cookie:auth.cookie}})).statusCode).toBe(403);
    expect((await send(auth,'POST',`/api/branches/${branch.id}/lockers`,{operationId:uuid(),number:'102',size:'padrao',capacity:1,modality:'rotativo'})).statusCode).toBe(403);
  });
  it('reclassifica a pessoa editada sem matrícula e abre pendência cadastral',async()=>{
    const {auth,branch}=await setupWithoutLogin();
    const cabinet=await locker(auth,branch.id,'101');const member=await person(auth,branch.id,'Pessoa A','0001');
    expect((await send(auth,'POST',`/api/branches/${branch.id}/allocations/occupy`,{operationId:uuid(),personId:member.person_id,lockerId:cabinet.id,expectedVersion:1,modality:'fixo'})).statusCode).toBe(200);
    const current=(await app.inject({method:'GET',url:`/api/branches/${branch.id}/lockers`,headers:{cookie:auth.cookie}})).json()[0];
    const occupant=current.occupants[0];
    const revised=await send(auth,'POST',`/api/branches/${branch.id}/lockers/${cabinet.id}/revise`,{operationId:uuid(),expectedLockerVersion:current.version,
      isDouble:false,sectorOccupant:null,occupant:{allocationId:occupant.allocationId,membershipId:occupant.membershipId,
        expectedMembershipVersion:occupant.membershipVersion,name:'Pessoa A',registration:null,department:null,functionName:null}});
    expect(revised.statusCode).toBe(200);
    expect((await pool.query('SELECT category,registration FROM memberships WHERE id=$1',[member.id])).rows[0]).toMatchObject({category:'vinculo_nao_identificado',registration:null});
    expect((await pool.query("SELECT count(*) FROM pending_items WHERE branch_id=$1 AND kind='sem_matricula' AND state='aberta'",[branch.id])).rows[0].count).toBe('1');
  });
  it('histórico enriquece armário, pessoa e ação e a filial não tem cidade',async()=>{
    const {auth,branch}=await setup();
    expect((branch as {city?:string}).city).toBeUndefined();
    const cabinet=await locker(auth,branch.id,'102');const member=await person(auth,branch.id,'Carlos Souza','10452');
    const occupy=await send(auth,'POST',`/api/branches/${branch.id}/allocations/occupy`,{operationId:uuid(),personId:member.person_id,lockerId:cabinet.id,expectedVersion:1,modality:'fixo',seasonal:false});
    expect(occupy.statusCode).toBe(200);
    expect((await send(auth,'POST',`/api/branches/${branch.id}/allocations/release`,{operationId:uuid(),allocationId:occupy.json().id,expectedVersion:1})).statusCode).toBe(200);
    const history=await app.inject({method:'GET',url:`/api/branches/${branch.id}/history`,headers:{cookie:auth.cookie}});
    expect(history.statusCode).toBe(200);
    const ended=(history.json() as {kind:string;locker_number:string|null;person_name:string|null;person_registration:string|null;description:string|null}[])
      .find(item=>item.kind==='ocupacao_encerrada');
    expect(ended).toMatchObject({locker_number:'102',person_name:'Carlos Souza',person_registration:'10452',description:'Ocupação encerrada'});
    const branches=await app.inject({method:'GET',url:'/api/branches',headers:{cookie:auth.cookie}});
    expect(JSON.stringify(branches.json())).not.toContain('"city"');
  });
  it('limpa apenas eventos legados do histórico e preserva os operacionais recentes',async()=>{
    const {auth,branch}=await setupWithoutLogin();
    const cabinet=await locker(auth,branch.id,'101');const member=await person(auth,branch.id,'Pessoa A','0001');
    expect((await send(auth,'POST',`/api/branches/${branch.id}/allocations/occupy`,{operationId:uuid(),personId:member.person_id,lockerId:cabinet.id,expectedVersion:1,modality:'fixo',seasonal:false})).statusCode).toBe(200);
    await pool.query(`INSERT INTO events(branch_id,kind,entity_type,details,happened_at) VALUES
      ($1,'pessoa_cadastrada','membership','{}',now()-interval '400 days'),
      ($1,'armarios_importados','import','{"count":1}',now()),
      ($1,'pessoa_cadastrada','membership','{}',now())`,[branch.id]);
    const before=Number((await pool.query<{count:string}>('SELECT count(*) FROM events WHERE branch_id=$1',[branch.id])).rows[0].count);
    const cleared=await send(auth,'DELETE',`/api/branches/${branch.id}/history/clear`,{operationId:uuid()});
    expect(cleared.statusCode).toBe(200);
    expect(Number(cleared.json().removed)).toBe(3);
    const kinds=(await pool.query<{kind:string}>('SELECT kind FROM events WHERE branch_id=$1',[branch.id])).rows.map(row=>row.kind);
    expect(kinds).toContain('ocupacao_iniciada');
    expect(kinds).toContain('historico_limpo');
    expect(kinds).not.toContain('armarios_importados');
    expect(Number((await pool.query<{count:string}>('SELECT count(*) FROM events WHERE branch_id=$1',[branch.id])).rows[0].count)).toBe(before-2);
  });
  it('dashboard agrupa aprendizes em Colaborador, promotores por cargo em Promotor(a) e quem está sem setor, cargo e empresa em Pendência Cadastral',async()=>{
    const {auth,branch}=await setupWithoutLogin();
    const create=async(payload:Record<string,unknown>)=>{const created=await send(auth,'POST',`/api/branches/${branch.id}/people`,{operationId:uuid(),origin:'manual',needsFixed:false,...payload});expect(created.statusCode).toBe(200);};
    await create({name:'Colaboradora Loja',registration:'2001',category:'colaborador',department:'Loja',functionName:'Operador'});
    await create({name:'Colaborador Promotor',registration:'2002',category:'colaborador',department:'Loja',functionName:'PROMOTOR(A)'});
    await create({name:'Promotora Fixa',registration:'2003',category:'promotor_fixo',department:'Loja',functionName:'Promotora'});
    await create({name:'Terceirizada',registration:'2004',category:'terceirizado',company:'Delta Climatização',department:'Climatização'});
    await create({name:'Sem vínculo',registration:null,category:'vinculo_nao_identificado'});
    await create({name:'Jovem Aprendiz',registration:null,category:'vinculo_nao_identificado',department:'Loja',functionName:'JOVEM APRENDIZ'});
    const legacy=(await pool.query<{id:string}>("INSERT INTO people(name) VALUES('Roteirista Legado') RETURNING id")).rows[0].id;
    await pool.query("INSERT INTO memberships(person_id,branch_id,category,origin,registration,status) VALUES($1,$2,'roteirista','manual','2006','ativo')",[legacy,branch.id]);
    const withSector=(await pool.query<{id:string}>("INSERT INTO people(name) VALUES('Roteirista com setor') RETURNING id")).rows[0].id;
    await pool.query("INSERT INTO memberships(person_id,branch_id,category,origin,registration,department,status) VALUES($1,$2,'roteirista','manual','2007','Bastidores','ativo')",[withSector,branch.id]);
    const response=await app.inject({method:'GET',url:`/api/branches/${branch.id}/dashboard`,headers:{cookie:auth.cookie}});
    expect(response.statusCode).toBe(200);
    expect(response.json().links).toEqual({total:7,colaborador:2,promotor_fixo:2,terceirizado:1,vinculo_nao_identificado:2});
    expect(response.json().withoutLocker).toEqual({total:8});
  });
  it('exclui usuário da filial, preserva a trilha de auditoria e recusa a própria conta',async()=>{
    const {auth,branch}=await setupWithoutLogin();
    const created=await send(auth,'POST',`/api/branches/${branch.id}/users`,{operationId:uuid(),username:'operador.removivel',role:'operador',temporaryPassword:'Senha-Temporaria-123'});
    expect(created.statusCode).toBe(200);
    const target=(await pool.query<{id:string;version:number}>('SELECT id,version FROM users WHERE username=$1',['operador.removivel'])).rows[0];
    const ownId=(await pool.query<{id:string}>("SELECT id FROM users WHERE username='test'")).rows[0].id;
    const self=await send(auth,'DELETE',`/api/users/${ownId}`,{operationId:uuid()});
    expect(self.statusCode).toBe(409);
    expect(self.json().error.code).toBe('USUARIO');
    await pool.query('UPDATE users SET must_change_password=false WHERE id=$1',[target.id]);
    const operator=await sessionFor('operador.removivel');
    const createdPerson=await send(operator,'POST',`/api/branches/${branch.id}/people`,{operationId:uuid(),name:'Pessoa Auditada',category:'vinculo_nao_identificado',origin:'manual',needsFixed:false});
    expect(createdPerson.statusCode).toBe(200);
    const denied=await send(operator,'DELETE',`/api/users/${ownId}`,{operationId:uuid()});
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe('PERMISSAO');
    expect((await pool.query('SELECT id FROM operations WHERE actor_id=$1',[target.id])).rowCount).toBe(1);
    const removed=await send(auth,'DELETE',`/api/users/${target.id}`,{operationId:uuid(),expectedVersion:target.version});
    expect(removed.statusCode).toBe(200);
    expect(removed.json()).toMatchObject({id:target.id,username:'operador.removivel',deleted:true});
    expect((await pool.query('SELECT id FROM users WHERE id=$1',[target.id])).rowCount).toBe(0);
    expect((await pool.query('SELECT id FROM users WHERE id=$1',[ownId])).rowCount).toBe(1);
    expect((await pool.query('SELECT id_hash FROM sessions WHERE user_id=$1',[target.id])).rowCount).toBe(0);
    expect((await pool.query('SELECT id FROM operations WHERE actor_id=$1',[target.id])).rowCount).toBe(0);
    const audit=(await pool.query<{actor_id:string|null;description:string}>("SELECT actor_id,description FROM events WHERE kind='pessoa_cadastrada'")).rows;
    expect(audit).toHaveLength(1);
    expect(audit[0].actor_id).toBeNull();
    const history=await app.inject({method:'GET',url:`/api/branches/${branch.id}/history`,headers:{cookie:auth.cookie}});
    expect((history.json() as {kind:string;description:string|null}[]).find(item=>item.kind==='usuario_excluido')?.description).toBe('Usuário excluído: operador.removivel');
  });
  it('altera a própria senha confirmando a atual e encerra as demais sessões',async()=>{
    const auth=await session();
    const wrong=await send(auth,'POST','/api/auth/change-password',{currentPassword:'Senha-Errada-123',newPassword:'Nova-Senha-Forte-123'});
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json().error.code).toBe('CREDENCIAIS');
    const short=await send(auth,'POST','/api/auth/change-password',{currentPassword:'Testing-Password-123',newPassword:'curta123'});
    expect(short.statusCode).toBe(422);
    const same=await send(auth,'POST','/api/auth/change-password',{currentPassword:'Testing-Password-123',newPassword:'Testing-Password-123'});
    expect(same.statusCode).toBe(422);
    expect(same.json().error.message).toContain('diferente da atual');
    const stale=await session();
    const changed=await send(auth,'POST','/api/auth/change-password',{currentPassword:'Testing-Password-123',newPassword:'Nova-Senha-Forte-123'});
    expect(changed.statusCode).toBe(200);
    expect((await app.inject({method:'GET',url:'/api/auth/me',headers:{cookie:auth.cookie}})).statusCode).toBe(200);
    expect((await app.inject({method:'GET',url:'/api/auth/me',headers:{cookie:stale.cookie}})).statusCode).toBe(401);
    const {rows}=await pool.query<{password_hash:string}>("SELECT password_hash FROM users WHERE username='test'");
    expect(await argon2.verify(rows[0].password_hash,'Nova-Senha-Forte-123')).toBe(true);
    expect(await argon2.verify(rows[0].password_hash,'Testing-Password-123')).toBe(false);
  });
});

it('CSV mantém zeros à esquerda e campos entre aspas',async()=>{
  const sheets=await parseFile(Buffer.from('MATRICULA;NOME\r\n0009;"Nome; Composto"\r\n'),'ti.csv','utf8',';');
  expect(sheets[0].rows[1]).toEqual(['0009','Nome; Composto']);
});
it('OpenAPI publica contratos de operação',()=>{
  const document=app.swagger() as {paths:Record<string,Record<string,{requestBody?:unknown}>>};
  expect(document.paths['/api/branches/{branchId}/allocations/occupy'].post.requestBody).toBeDefined();
  expect(document.paths['/api/branches/{branchId}/history/clear'].delete.requestBody).toBeDefined();
});
