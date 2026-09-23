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
async function send(auth:Auth,method:'POST'|'PATCH',url:string,payload:Record<string,unknown>){return app.inject({method,url,payload,headers:{cookie:auth.cookie,'x-csrf-token':auth.csrf}});}
async function login():Promise<Auth>{const response=await app.inject({method:'POST',url:'/api/auth/login',payload:{email:'test@example.invalid',password:'Testing-Password-123'}});expect(response.statusCode).toBe(200);return {cookie:response.headers['set-cookie']!.toString().split(';')[0],csrf:response.json().csrf};}
async function session():Promise<Auth>{const user=(await pool.query<{id:string}>('SELECT id FROM users WHERE email=$1',['test@example.invalid'])).rows[0],token=uuid(),csrf=uuid();await pool.query("INSERT INTO sessions(id_hash,user_id,csrf_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[hash(token),user.id,hash(csrf)]);return {cookie:`armarios_session=${token}`,csrf};}
async function setup(){const auth=await login();const branch=(await send(auth,'POST','/api/branches',{operationId:uuid(),name:'Filial de Teste',timezone:'America/Fortaleza'})).json();const location=(await send(auth,'POST',`/api/branches/${branch.id}/locations`,{operationId:uuid(),name:'Principal'})).json();return {auth,branch,location};}
async function setupWithoutLogin(){const auth=await session();const branch=(await send(auth,'POST','/api/branches',{operationId:uuid(),name:'Filial de Teste',timezone:'America/Fortaleza'})).json();const location=(await send(auth,'POST',`/api/branches/${branch.id}/locations`,{operationId:uuid(),name:'Principal'})).json();return {auth,branch,location};}
async function locker(auth:Auth,branchId:string,locationId:string,number:string,capacity=1,size='padrao',modality='fixo'){const response=await send(auth,'POST',`/api/branches/${branchId}/lockers`,{operationId:uuid(),locationId,number,size,capacity,modality,condition:'disponivel'});expect(response.statusCode).toBe(200);return response.json();}
async function person(auth:Auth,branchId:string,name:string,registration:string){const response=await send(auth,'POST',`/api/branches/${branchId}/people`,{operationId:uuid(),name,category:'promotor_fixo',registration,needsFixed:true,origin:'manual'});expect(response.statusCode).toBe(200);return response.json();}
function form(fields:Record<string,string>,filename:string,content:string){const boundary='armarios-test-boundary';const pieces:string[]=[];for(const [key,value] of Object.entries(fields))pieces.push(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`);pieces.push(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: text/csv\r\n\r\n${content}\r\n--${boundary}--\r\n`);return {payload:pieces.join(''),headers:{'content-type':`multipart/form-data; boundary=${boundary}`}};}
function binaryForm(fields:Record<string,string>,filename:string,content:Buffer){const boundary='armarios-binary-test';const parts:Buffer[]=[];for(const [key,value] of Object.entries(fields))parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`));parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`),content,Buffer.from(`\r\n--${boundary}--\r\n`));return {payload:Buffer.concat(parts),headers:{'content-type':`multipart/form-data; boundary=${boundary}`}};}

beforeAll(async()=>{if(!process.env.DATABASE_URL?.includes('armarios_test'))throw new Error('Use o banco armarios_test');process.env.DEVICE_SECRET_KEY='integration-device-key-with-over-thirty-two-characters';await app.ready();});
beforeEach(async()=>{await pool.query('TRUNCATE branches,people,users CASCADE');await pool.query("INSERT INTO users(email,password_hash,role,must_change_password) VALUES($1,$2,'geral',false)",['test@example.invalid',await argon2.hash('Testing-Password-123',{type:argon2.argon2id})]);});
afterAll(async()=>{await app.close();});

describe('regras transacionais',()=>{
  it('aceita uma única disputa pela última capacidade e não duplica operação',async()=>{
    const {auth,branch,location}=await setup();const cabinet=await locker(auth,branch.id,location.id,'101');const a=await person(auth,branch.id,'Pessoa A','0001'),b=await person(auth,branch.id,'Pessoa B','0002');
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
    const {auth,branch,location}=await setup();const cabinet=await locker(auth,branch.id,location.id,'360',2,'grande');const a=await person(auth,branch.id,'Pessoa A','0001'),b=await person(auth,branch.id,'Pessoa B','0002');
    const first=await send(auth,'POST',`/api/branches/${branch.id}/allocations/occupy`,{operationId:uuid(),personId:a.person_id,lockerId:cabinet.id,expectedVersion:1,modality:'fixo',seasonal:false});expect(first.statusCode).toBe(200);
    const second=await send(auth,'POST',`/api/branches/${branch.id}/allocations/occupy`,{operationId:uuid(),personId:b.person_id,lockerId:cabinet.id,expectedVersion:2,modality:'fixo',seasonal:false,sharingReason:'Cobertura temporária',sharingDueAt:new Date(Date.now()+86400000).toISOString()});expect(second.statusCode).toBe(200);
    const release=await send(auth,'POST',`/api/branches/${branch.id}/allocations/release`,{operationId:uuid(),allocationId:first.json().id,expectedVersion:1});expect(release.statusCode).toBe(200);
    expect((await pool.query('SELECT id FROM allocations WHERE ended_at IS NULL')).rowCount).toBe(1);
    expect((await pool.query('SELECT id FROM sharings WHERE ended_at IS NULL')).rowCount).toBe(0);
    const old=await send(auth,'POST',`/api/branches/${branch.id}/allocations/release`,{operationId:uuid(),allocationId:first.json().id,expectedVersion:1});expect(old.statusCode).toBe(409);
  });
  it('transfere integralmente e rejeita versão antiga da alocação',async()=>{
    const {auth,branch,location}=await setupWithoutLogin();
    const source=await locker(auth,branch.id,location.id,'A'),destination=await locker(auth,branch.id,location.id,'B');
    const member=await person(auth,branch.id,'Pessoa A','0001');
    const first=await send(auth,'POST',`/api/branches/${branch.id}/allocations/occupy`,{operationId:uuid(),personId:member.person_id,lockerId:source.id,expectedVersion:1,modality:'fixo',seasonal:false});expect(first.statusCode).toBe(200);
    const payload={operationId:uuid(),allocationId:first.json().id,expectedAllocationVersion:1,destinationLockerId:destination.id,sourceVersion:2,destinationVersion:1};
    const transferred=await send(auth,'POST',`/api/branches/${branch.id}/allocations/transfer`,payload);expect(transferred.statusCode).toBe(200);
    expect((await pool.query<{locker_id:string}>('SELECT locker_id FROM allocations WHERE person_id=$1 AND ended_at IS NULL',[member.person_id])).rows).toEqual([{locker_id:destination.id}]);
    expect((await send(auth,'POST',`/api/branches/${branch.id}/allocations/transfer`,{...payload,operationId:uuid()})).statusCode).toBe(409);
    const secondDestination=await locker(auth,branch.id,location.id,'C');
    const stale=await send(auth,'POST',`/api/branches/${branch.id}/allocations/transfer`,{operationId:uuid(),allocationId:transferred.json().id,expectedAllocationVersion:999,destinationLockerId:secondDestination.id,sourceVersion:2,destinationVersion:1});expect(stale.statusCode).toBe(409);
    expect((await pool.query<{locker_id:string}>('SELECT locker_id FROM allocations WHERE person_id=$1 AND ended_at IS NULL',[member.person_id])).rows[0].locker_id).toBe(destination.id);
  });
  it('preserva ocupação ao encerrar atuação e exige prazo e capacidade no compartilhamento',async()=>{
    const {auth,branch,location}=await setupWithoutLogin();
    const shared=await locker(auth,branch.id,location.id,'Grande',3,'grande'),other=await locker(auth,branch.id,location.id,'Outro');
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
  it('mantém versão estável de pendência aberta e exige revisão para espera e exceção',async()=>{
    const {auth,branch}=await setupWithoutLogin();const member=await person(auth,branch.id,'Promotora','1001');
    const pending=(await pool.query<{id:string;version:number;state:string}>("SELECT id,version,state FROM pending_items WHERE branch_id=$1 AND kind='sem_armario'",[branch.id])).rows[0];
    expect(pending.version).toBe(1);
    const waiting=await send(auth,'POST',`/api/branches/${branch.id}/pending/${pending.id}/wait`,{operationId:uuid(),expectedVersion:1,reason:'Aguardando espaço disponível'});expect(waiting.statusCode).toBe(200);
    expect(waiting.json().version).toBe(2);
    await transaction(client=>refreshPending(client,branch.id));
    expect((await pool.query<{version:number}>('SELECT version FROM pending_items WHERE id=$1',[pending.id])).rows[0].version).toBe(2);
    expect((await send(auth,'POST',`/api/branches/${branch.id}/pending/${pending.id}/wait`,{operationId:uuid(),expectedVersion:1,reason:'Motivo antigo'})).statusCode).toBe(409);
    const exception=await send(auth,'POST',`/api/branches/${branch.id}/people/${member.id}/exception`,{operationId:uuid(),expectedVersion:1,reason:'Atuação externa sem uso fixo'});expect(exception.statusCode).toBe(200);
    expect((await pool.query<{state:string;version:number}>('SELECT state,version FROM pending_items WHERE id=$1',[pending.id])).rows[0]).toMatchObject({state:'resolvida',version:3});
    expect((await send(auth,'POST',`/api/branches/${branch.id}/people/${member.id}/exception`,{operationId:uuid(),expectedVersion:1,reason:'Motivo antigo'})).statusCode).toBe(409);
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
  it('mantém ausentes e cadastros manuais, recalcula ocupações e recusa lote antigo ou repetido',async()=>{
    const {auth,branch,location}=await setupWithoutLogin();
    const manual=await person(auth,branch.id,'Promotora','0099');
    const fields=(date:string)=>({operationId:uuid(),sheet:'CSV',headerRow:'1',extractedOn:date,mapping:JSON.stringify({registration:'MATRICULA',name:'NOME'}),encoding:'utf8',delimiter:';'});
    const prepare=async(date:string,content:string)=>{const upload=form(fields(date),'ti.csv',`MATRICULA;NOME\r\n${content}`);return app.inject({method:'POST',url:`/api/branches/${branch.id}/imports/ti/prepare`,...upload,headers:{...upload.headers,cookie:auth.cookie,'x-csrf-token':auth.csrf}});};
    const first=await prepare('2026-09-01','0001;Colaborador A\r\n0002;Colaborador B\r\n');expect(first.statusCode).toBe(200);
    expect((await send(auth,'POST',`/api/branches/${branch.id}/imports/${first.json().importId}/confirm`,{operationId:uuid(),acknowledgeComplete:true})).statusCode).toBe(200);
    const member=(await pool.query<{person_id:string}>('SELECT person_id FROM memberships WHERE branch_id=$1 AND registration=$2',[branch.id,'0001'])).rows[0];
    const cabinet=await locker(auth,branch.id,location.id,'TI-1');
    const occupied=await send(auth,'POST',`/api/branches/${branch.id}/allocations/occupy`,{operationId:uuid(),personId:member.person_id,lockerId:cabinet.id,expectedVersion:cabinet.version,modality:'fixo',seasonal:false});expect(occupied.statusCode).toBe(200);
    const second=await prepare('2026-09-20','0002;Colaborador B alterado\r\n');expect(second.statusCode).toBe(200);expect(second.json().counts.absent).toBe(1);
    const third=await prepare('2026-09-21','0002;Colaborador B alterado\r\n');expect(third.statusCode).toBe(200);
    const confirmation={operationId:uuid(),acknowledgeComplete:true};
    expect((await send(auth,'POST',`/api/branches/${branch.id}/imports/${second.json().importId}/confirm`,confirmation)).statusCode).toBe(200);
    expect((await send(auth,'POST',`/api/branches/${branch.id}/imports/${second.json().importId}/confirm`,confirmation)).statusCode).toBe(200);
    expect((await pool.query("SELECT id FROM pending_items WHERE kind='ausente_ti' AND state='aberta'")).rowCount).toBe(1);
    expect((await pool.query('SELECT id FROM allocations WHERE id=$1 AND ended_at IS NULL',[occupied.json().id])).rowCount).toBe(1);
    expect((await pool.query('SELECT status,origin FROM memberships WHERE person_id=$1',[manual.person_id])).rows[0]).toMatchObject({status:'ativo',origin:'manual'});
    expect((await send(auth,'POST',`/api/branches/${branch.id}/imports/${third.json().importId}/confirm`,{operationId:uuid(),acknowledgeComplete:true})).statusCode).toBe(409);
    expect((await send(auth,'POST',`/api/branches/${branch.id}/imports/${second.json().importId}/confirm`,{operationId:uuid(),acknowledgeComplete:true})).statusCode).toBe(409);
    const older=await prepare('2026-09-10','0002;Colaborador B\r\n');expect(older.statusCode).toBe(200);
    expect((await send(auth,'POST',`/api/branches/${branch.id}/imports/${older.json().importId}/confirm`,{operationId:uuid(),acknowledgeComplete:true})).statusCode).toBe(409);
    const empty=await prepare('2026-10-01','');expect(empty.statusCode).toBe(422);
    const returned=await prepare('2026-10-01','0001;Colaborador A\r\n0002;Colaborador B alterado\r\n');expect(returned.statusCode).toBe(200);
    expect((await send(auth,'POST',`/api/branches/${branch.id}/imports/${returned.json().importId}/confirm`,{operationId:uuid(),acknowledgeComplete:true})).statusCode).toBe(200);
    expect((await pool.query("SELECT id FROM pending_items WHERE kind='ausente_ti' AND state='aberta'")).rowCount).toBe(0);
    expect((await pool.query('SELECT id FROM people WHERE id=$1',[member.person_id])).rowCount).toBe(1);
  });
  it('resiste a dez operadores simultâneos no último armário',async()=>{
    const {auth:admin,branch,location}=await setup();const cabinet=await locker(admin,branch.id,location.id,'Único');
    const actors:Auth[]=[],persons:string[]=[];
    for(let i=0;i<10;i++){
      const personId=(await person(admin,branch.id,`Pessoa ${i}`,`T${i.toString().padStart(3,'0')}`)).person_id;
      const token=uuid(),csrf=uuid();
      const user=(await pool.query<{id:string}>("INSERT INTO users(email,password_hash,role,branch_id,must_change_password) VALUES($1,'unused','operador',$2,false) RETURNING id",[`operador${i}@example.invalid`,branch.id])).rows[0];
      await pool.query("INSERT INTO sessions(id_hash,user_id,csrf_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[hash(token),user.id,hash(csrf)]);
      actors.push({cookie:`armarios_session=${token}`,csrf});persons.push(personId);
    }
    const results=await Promise.all(actors.map((auth,index)=>send(auth,'POST',`/api/branches/${branch.id}/allocations/occupy`,{operationId:uuid(),personId:persons[index],lockerId:cabinet.id,expectedVersion:cabinet.version,modality:'fixo',seasonal:false})));
    expect(results.filter(x=>x.statusCode===200)).toHaveLength(1);
    expect(results.filter(x=>x.statusCode===409)).toHaveLength(9);
    expect((await pool.query('SELECT id FROM allocations WHERE ended_at IS NULL')).rowCount).toBe(1);
  });
  it('bloqueia filial alheia, escrita de consulta e dispositivo revogado',async()=>{
    const {auth,branch}=await setup();
    const other=(await send(auth,'POST','/api/branches',{operationId:uuid(),name:'Outra Filial',timezone:'America/Fortaleza'})).json();
    const readUser=(await pool.query<{id:string}>("INSERT INTO users(email,password_hash,role,branch_id,must_change_password) VALUES($1,$2,'consulta',$3,false) RETURNING id",['consulta@example.invalid',await argon2.hash('Consult-Password-123',{type:argon2.argon2id}),branch.id])).rows[0];
    const token=uuid(),csrf=uuid(),consult={cookie:`armarios_session=${token}`,csrf};
    await pool.query("INSERT INTO sessions(id_hash,user_id,csrf_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[hash(token),readUser.id,hash(csrf)]);
    const denied=await app.inject({method:'GET',url:`/api/branches/${other.id}/lockers`,headers:{cookie:consult.cookie}});expect(denied.statusCode).toBe(403);
    const write=await send(consult,'POST',`/api/branches/${branch.id}/locations`,{operationId:uuid(),name:'Sem permissão'});expect(write.statusCode).toBe(403);
    const device=await send(auth,'POST',`/api/branches/${branch.id}/devices`,{operationId:uuid(),label:'PC teste'});expect(device.statusCode).toBe(200);
    const snapshot=await app.inject({method:'GET',url:`/api/branches/${branch.id}/offline`,headers:{cookie:auth.cookie,'x-device-secret':device.json().secret}});expect(snapshot.statusCode).toBe(200);
    const revoke=await send(auth,'POST',`/api/branches/${branch.id}/devices/${device.json().id}/revoke`,{operationId:uuid(),expectedVersion:1});expect(revoke.statusCode).toBe(200);
    const rejected=await app.inject({method:'GET',url:`/api/branches/${branch.id}/offline`,headers:{cookie:auth.cookie,'x-device-secret':device.json().secret}});expect(rejected.statusCode).toBe(403);
  });
  it('preserva incerteza e histórico na migração fictícia',async()=>{
    const {auth,branch,location}=await setupWithoutLogin();
    const workbook=new ExcelJS.Workbook();
    const lockersSheet=workbook.addWorksheet('ARMÁRIOS');
    lockersSheet.addRow(['N°','NOME','MATRÍCULA','SETOR','FUNÇÃO','STATUS','DUPLO','VAGA','MODIFICADO','OBSERVAÇÃO','ENDEREÇO']);
    lockersSheet.addRow(['1','Pessoa Exemplo','0001','Loja','Operador','OCUPADO',false,1,'2020-01-01','','']);
    lockersSheet.addRow(['2',{formula:'A1'},'','','','OCUPADO',false,1,'','','']);
    const roster=workbook.addWorksheet('COLABORADORES');roster.addRow(['MATRÍCULA','NOME','FUNÇÃO','SETOR']);roster.addRow(['0001','Pessoa Exemplo','Operador','Loja']);
    const banco=workbook.addWorksheet('BANCO DE DADOS');banco.addRow(['ARMÁRIO','NOME','MATRÍCULA','SETOR','FUNÇÃO']);banco.addRow(['2','','','','']);
    const history=workbook.addWorksheet('HISTÓRICO');history.addRow(['DATA','AÇÃO']);history.addRow(['data não confiável','registro legado']);
    const file=binaryForm({operationId:uuid()},'legado.xlsx',Buffer.from(await workbook.xlsx.writeBuffer()));
    const prepared=await app.inject({method:'POST',url:`/api/branches/${branch.id}/imports/migration/prepare`,...file,headers:{...file.headers,cookie:auth.cookie,'x-csrf-token':auth.csrf}});
    expect(prepared.statusCode).toBe(200);expect(prepared.json().physicalCount).toBe(2);expect(prepared.json().formulaIssues).toHaveLength(1);
    expect(prepared.json().sourceProposals).toHaveLength(2);
    expect(prepared.json().sourceProposals[1]).toMatchObject({number:'2',proposedCapacity:1,uncertain:true});
    const body={operationId:uuid(),locationId:location.id,confirmCapacities:true,acceptSuggestedCategories:true,duplicateDecisions:{}};
    const blocked=await send(auth,'POST',`/api/branches/${branch.id}/imports/migration/${prepared.json().importId}/confirm`,body);expect(blocked.statusCode).toBe(422);
    const confirmed=await send(auth,'POST',`/api/branches/${branch.id}/imports/migration/${prepared.json().importId}/confirm`,{...body,operationId:uuid(),acceptBancoSuggestions:true});expect(confirmed.statusCode).toBe(200);
    const migrated=await pool.query<{started_at:null;original_start_unknown:boolean}>('SELECT started_at,original_start_unknown FROM allocations');
    expect(migrated.rows).toHaveLength(1);expect(migrated.rows[0].started_at).toBeNull();expect(migrated.rows[0].original_start_unknown).toBe(true);
    expect((await pool.query("SELECT id FROM lockers WHERE migration_status='inconclusivo'")).rowCount).toBe(1);
    expect((await pool.query('SELECT id FROM legacy_history')).rowCount).toBe(1);
  });
  it('não transforma número duplicado em duas vagas e abre identificação conflitante',async()=>{
    const {auth,branch,location}=await setupWithoutLogin();
    const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('ARMÁRIOS');
    sheet.addRow(['N°','NOME','MATRÍCULA','STATUS','DUPLO']);
    sheet.addRow(['360','Pessoa Exemplo','0001','OCUPADO',true]);
    sheet.addRow(['360','','','DISPONÍVEL',true]);
    const file=binaryForm({operationId:uuid()},'duplicado.xlsx',Buffer.from(await workbook.xlsx.writeBuffer()));
    const prepared=await app.inject({method:'POST',url:`/api/branches/${branch.id}/imports/migration/prepare`,...file,headers:{...file.headers,cookie:auth.cookie,'x-csrf-token':auth.csrf}});
    expect(prepared.statusCode).toBe(200);expect(prepared.json().duplicateNumbers).toEqual(['360']);expect(prepared.json().physicalCount).toBe(1);
    const confirmed=await send(auth,'POST',`/api/branches/${branch.id}/imports/migration/${prepared.json().importId}/confirm`,{operationId:uuid(),locationId:location.id,confirmCapacities:true,acceptSuggestedCategories:true,duplicateDecisions:{'360':'same_physical'}});
    expect(confirmed.statusCode).toBe(200);
    expect((await pool.query('SELECT id FROM lockers')).rowCount).toBe(1);
    expect((await pool.query("SELECT id FROM pending_items WHERE kind='identificacao_conflitante' AND state='aberta'")).rowCount).toBe(1);
    expect((await pool.query("SELECT id FROM lockers WHERE migration_status='inconclusivo'")).rowCount).toBe(1);
  });
});

it('CSV mantém zeros à esquerda e campos entre aspas',async()=>{
  const sheets=await parseFile(Buffer.from('MATRICULA;NOME\r\n0009;"Nome; Composto"\r\n'),'ti.csv','utf8',';');
  expect(sheets[0].rows[1]).toEqual(['0009','Nome; Composto']);
});
it('OpenAPI publica contratos de operação',()=>{
  const document=app.swagger() as {paths:Record<string,Record<string,{requestBody?:unknown}>>};
  expect(document.paths['/api/branches/{branchId}/allocations/occupy'].post.requestBody).toBeDefined();
});
