import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {id} from '@armarios/contracts';
import {authenticate,adminAccess} from './auth.js';
import {hash,transaction,one,fail} from './db.js';
import {parseFile,type Sheet} from './imports.js';
import {event,idempotent} from './operations.js';
import {refreshPending} from './pending.js';

type LegacyRow={row:number;number:string;name:string;registration:string;department:string;functionName:string;status:string;double:boolean;observation:string;address:string;suggestedCategory:string;uncertain:boolean;sourceRaw:string[]};
type FormulaIssue={key:string;row:number;number:string;column:string;source:string;suggestion:string|null;uniqueBanco:boolean};
const route=z.object({branchId:id});
const norm=(s:string)=>s.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
function getRows(sheet:Sheet):{headers:string[];data:string[][]}{return {headers:sheet.rows[0]?.map(norm)??[],data:sheet.rows.slice(1)};}
function value(row:string[],headers:string[],key:string):string{return (row[headers.indexOf(norm(key))]??'').trim();}
function legacyRows(sheet:Sheet,roster:Set<string>):LegacyRow[]{
  const {headers,data}=getRows(sheet);
  for(const key of ['N°','NOME','MATRÍCULA','STATUS','DUPLO'])if(!headers.includes(norm(key)))fail(422,'CABECALHO',`Coluna ${key} não encontrada em ARMÁRIOS`);
  return data.map((raw,index)=>{
    const number=value(raw,headers,'N°'),name=value(raw,headers,'NOME'),registration=value(raw,headers,'MATRÍCULA'),department=value(raw,headers,'SETOR'),functionName=value(raw,headers,'FUNÇÃO'),status=value(raw,headers,'STATUS');
    const double=['TRUE','SIM','1','VERDADEIRO'].includes(norm(value(raw,headers,'DUPLO')));
    const suggestedCategory=registration&&roster.has(registration)?'colaborador':norm(functionName).includes('PROMOTOR')?(registration?'promotor_fixo':'roteirista'):'terceirizado';
    return {row:index+2,number,name,registration,department,functionName,status,double,observation:value(raw,headers,'OBSERVAÇÃO'),address:value(raw,headers,'ENDEREÇO'),suggestedCategory,uncertain:(!name&&norm(status)==='OCUPADO')||(!registration&&!!name)||(!!name&&norm(status)!=='OCUPADO')||raw.some(x=>x.startsWith('#FORMULA_SEM_RESULTADO@')),sourceRaw:raw};
  }).filter(row=>row.number);
}
function duplicates(rows:LegacyRow[]):string[]{const counts=new Map<string,number>();for(const row of rows)counts.set(row.number,(counts.get(row.number)??0)+1);return [...counts].filter(([,count])=>count>1).map(([number])=>number);}
function formulaIssues(rows:LegacyRow[],banco?:Sheet):FormulaIssue[]{
  const byNumber=new Map<string,string[][]>();
  for(const raw of banco?.rows.slice(1)??[]){const number=raw[0]?.trim();if(number)byNumber.set(number,[...(byNumber.get(number)??[]),raw]);}
  const columns:[number,string][]=[[1,'NOME'],[3,'SETOR'],[4,'FUNÇÃO']];
  const issues:FormulaIssue[]=[];
  for(const row of rows)for(const [index,column] of columns){const source=row.sourceRaw[index];if(!source?.startsWith('#FORMULA_SEM_RESULTADO@'))continue;
    const candidates=byNumber.get(row.number)??[],uniqueBanco=candidates.length===1;
    issues.push({key:`${row.row}:${index}`,row:row.row,number:row.number,column,source:source.split('@')[1],suggestion:uniqueBanco?candidates[0][index]??'':null,uniqueBanco});
  }
  return issues;
}
export async function migrationRoutes(app:FastifyInstance):Promise<void>{
  app.post('/api/branches/:branchId/imports/migration/prepare',async request=>{
    const actor=await authenticate(request),{branchId}=route.parse(request.params);adminAccess(actor,branchId);
    const data=await request.file({limits:{fileSize:10*1024*1024}});if(!data)fail(422,'ARQUIVO','Envie o XLSX');
    const buffer=await data.toBuffer(),sheets=await parseFile(buffer,data.filename,'utf8','');
    const fields=data.fields as Record<string,{value?:unknown}>;
    const operationId=id.parse(fields.operationId?.value);
    const selected=sheets.find(x=>norm(x.name)==='ARMARIOS');if(!selected)fail(422,'ABA','Aba ARMÁRIOS não encontrada');
    const rosterSheet=sheets.find(x=>norm(x.name)==='COLABORADORES');
    const roster=new Set<string>();if(rosterSheet){const {headers,data:people}=getRows(rosterSheet);const index=headers.indexOf('MATRICULA');for(const row of people)if(index>=0&&row[index])roster.add(row[index].trim());}
    const rows=legacyRows(selected,roster),history=sheets.find(x=>norm(x.name)==='HISTORICO');
    if(!rows.length)fail(422,'VAZIO','Aba ARMÁRIOS vazia');
    const issues=formulaIssues(rows,sheets.find(x=>norm(x.name)==='BANCO DE DADOS'));
    const historyRows=(history?.rows??[]).map((raw,index)=>({row:index+1,raw})).filter(x=>x.row>1&&x.raw.some(cell=>cell.trim()));
    const numbers=[...new Set(rows.map(x=>x.number))],dupes=duplicates(rows),uncertain=rows.filter(x=>x.uncertain);
    const registrationCount=new Map<string,number>();for(const row of rows)if(row.registration)registrationCount.set(row.registration,(registrationCount.get(row.registration)??0)+1);
    const duplicateRegistrations=[...registrationCount].filter(([,count])=>count>1).map(([registration])=>registration);
    const headers=getRows(selected).headers;
    const display=(text:string)=>text.startsWith('#FORMULA_SEM_RESULTADO@')?'[fórmula sem resultado]':text;
    const preview={physicalCount:numbers.length,sourceRows:rows.length,duplicateNumbers:dupes,duplicateRegistrations,largeCount:numbers.filter(n=>rows.some(r=>r.number===n&&r.double)).length,uncertainRows:uncertain.map(x=>({row:x.row,number:x.number,name:display(x.name),registration:x.registration,suggestedCategory:x.suggestedCategory})),categorySuggestions:rows.filter(x=>x.name).map(x=>({row:x.row,number:x.number,name:display(x.name),registration:x.registration,suggestedCategory:x.suggestedCategory})),sourceProposals:rows.map(x=>({row:x.row,number:x.number,name:display(x.name),registration:x.registration,department:display(x.department),functionName:display(x.functionName),status:x.status,size:x.double?'grande':'padrao',proposedCapacity:rows.some(r=>r.number===x.number&&r.double)?2:1,observation:x.observation,address:x.address,modified:value(x.sourceRaw,headers,'MODIFICADO'),suggestedCategory:x.suggestedCategory,uncertain:x.uncertain})),formulaIssues:issues,legacyHistoryRows:historyRows.length,bancoUsedAsSource:false};
    return transaction(client=>idempotent(client,operationId,branchId,actor.id,{kind:'migration_prepare',fileHash:hash(buffer)},async()=>{
      const branch=await one<{ti_revision:string}>(client,'SELECT ti_revision FROM branches WHERE id=$1',[branchId]);
      const saved=await client.query<{id:string}>(`INSERT INTO imports(branch_id,kind,file_hash,filename,sheet_name,base_revision,mapping,preview,raw_rows,created_by)
        VALUES($1,'migracao',$2,$3,'ARMÁRIOS',$4,$5,$6,$7,$8) RETURNING id`,[branchId,hash(buffer),data.filename,branch.ti_revision,JSON.stringify({source:'ARMÁRIOS'}),JSON.stringify(preview),JSON.stringify({rows,history:historyRows,formulaIssues:issues}),actor.id]);
      return {importId:saved.rows[0].id,...preview};
    }));
  });
  app.post('/api/branches/:branchId/imports/migration/:importId/confirm',async request=>{
    const actor=await authenticate(request),{branchId}=route.parse(request.params);adminAccess(actor,branchId);
    const {importId}=z.object({importId:id}).parse(request.params);
    const body=z.object({operationId:id,locationId:id,confirmCapacities:z.literal(true),acceptSuggestedCategories:z.literal(true),acceptBancoSuggestions:z.boolean().default(false),formulaOverrides:z.record(z.string(),z.string()).default({}),duplicateDecisions:z.record(z.string(),z.enum(['same_physical','mark_inconclusive'])),categoryOverrides:z.record(z.string(),z.enum(['colaborador','promotor_fixo','roteirista','terceirizado'])).default({}),capacityOverrides:z.record(z.string(),z.number().int().positive()).default({})}).parse(request.body);
    return transaction(async client=>{
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[body.operationId]);
      const payloadHash=hash(JSON.stringify({branchId,actorId:actor.id,importId,body}));
      const done=await client.query<{payload_hash:string;result:unknown}>('SELECT payload_hash,result FROM operations WHERE id=$1 FOR UPDATE',[body.operationId]);
      if(done.rows[0]){if(done.rows[0].payload_hash!==payloadHash)fail(409,'OPERACAO_REUTILIZADA','Identificador já usado');return done.rows[0].result;}
      const branch=await one<{ti_revision:string}>(client,'SELECT ti_revision FROM branches WHERE id=$1 FOR UPDATE',[branchId]);
      await one(client,'SELECT id FROM locations WHERE id=$1 AND branch_id=$2',[body.locationId,branchId]);
      const count=await client.query<{count:string}>('SELECT count(*) FROM lockers WHERE branch_id=$1',[branchId]);
      const peopleCount=await client.query<{count:string}>('SELECT count(*) FROM memberships WHERE branch_id=$1',[branchId]);
      if(Number(count.rows[0].count)||Number(peopleCount.rows[0].count))fail(409,'MIGRACAO','Migração inicial exige filial sem armários e pessoas');
      const batch=await one<{state:string;base_revision:string;raw_rows:{rows:LegacyRow[];history:{row:number;raw:string[]}[];formulaIssues:FormulaIssue[]};file_hash:string}>(client,'SELECT state,base_revision,raw_rows,file_hash FROM imports WHERE id=$1 AND branch_id=$2 AND kind=$3 FOR UPDATE',[importId,branchId,'migracao']);
      if(batch.state!=='prepared')fail(409,'LOTE','Lote já confirmado');
      if(String(branch.ti_revision)!==String(batch.base_revision))fail(409,'PREVIA_DESATUALIZADA','Refaça a prévia após alteração da base da TI');
      const rows=batch.raw_rows.rows,dupes=duplicates(rows);
      const registrations=new Set<string>();for(const row of rows)if(row.registration){if(registrations.has(row.registration))fail(422,'MATRICULA_DUPLICADA',`Matrícula duplicada na linha ${row.row}`);registrations.add(row.registration);}
      for(const issue of batch.raw_rows.formulaIssues){
        const chosen=body.formulaOverrides[issue.key]??(body.acceptBancoSuggestions&&issue.uniqueBanco?issue.suggestion:null);
        if(chosen===null||chosen===undefined)fail(422,'FORMULA',`Fórmula sem resultado em ${issue.source}; informe uma correção ou confirme a sugestão da aba BANCO DE DADOS`);
        const row=rows.find(x=>x.row===issue.row)!;
        if(issue.column==='NOME')row.name=chosen;
        if(issue.column==='SETOR')row.department=chosen;
        if(issue.column==='FUNÇÃO')row.functionName=chosen;
      }
      if(dupes.some(n=>!body.duplicateDecisions[n]))fail(422,'DUPLICADAS','Revise todos os números duplicados');
      if(Object.keys(body.categoryOverrides).some(key=>!rows.some(row=>String(row.row)===key&&row.name)))fail(422,'CATEGORIA','Substituição de categoria sem linha correspondente');
      await client.query('INSERT INTO operations(id,branch_id,actor_id,payload_hash) VALUES($1,$2,$3,$4)',[body.operationId,branchId,actor.id,payloadHash]);
      for(const number of [...new Set(rows.map(x=>x.number))]){
        const group=rows.filter(x=>x.number===number),large=group.some(x=>x.double),capacity=body.capacityOverrides[number]??(large?2:1);
        const occupied=group.filter(x=>norm(x.status)==='OCUPADO'&&x.name);
        if(capacity<occupied.length)fail(422,'CAPACIDADE',`Armário ${number}: capacidade menor que ocupantes identificados`);
        const inconclusive=group.some(x=>x.uncertain)||group.length>1||group.some(x=>norm(x.status)==='OCUPADO'&&!x.name);
        const migrationStatus=inconclusive?'inconclusivo':'conferido';
        const locker=(await client.query<{id:string}>(`INSERT INTO lockers(branch_id,location_id,number,size,capacity,modality,destination,condition,migration_status)
          VALUES($1,$2,$3,$4,$5,'fixo',$6,'disponivel',$7) RETURNING id`,[branchId,body.locationId,number,large?'grande':'padrao',capacity,group.find(x=>x.observation)?.observation||null,migrationStatus])).rows[0];
        if(group.length>1)await client.query(`INSERT INTO pending_items(branch_id,kind,subject_type,subject_id,reason)
          VALUES($1,'identificacao_conflitante','locker',$2,$3) ON CONFLICT(branch_id,kind,subject_type,subject_id) DO NOTHING`,
          [branchId,locker.id,`Número ${number} repetido nas linhas ${group.map(x=>x.row).join(', ')}`]);
        for(const row of group){
          await client.query('INSERT INTO import_sources(import_id,sheet_name,row_number,entity_type,entity_id,raw) VALUES($1,$2,$3,$4,$5,$6)',[importId,'ARMÁRIOS',row.row,'locker',locker.id,JSON.stringify(row)]);
          if(!row.name||norm(row.status)!=='OCUPADO')continue;
          const category=body.categoryOverrides[String(row.row)]??row.suggestedCategory;
          if(['colaborador','promotor_fixo'].includes(category)&&!row.registration)fail(422,'MATRICULA',`Linha ${row.row}: matrícula obrigatória para ${category}`);
          const person=(await client.query<{id:string}>('INSERT INTO people(name) VALUES($1) RETURNING id',[row.name])).rows[0];
          const member=(await client.query<{id:string}>(`INSERT INTO memberships(person_id,branch_id,category,origin,registration,department,function_name,needs_fixed,ti_present)
            VALUES($1,$2,$3,'migracao',$4,$5,$6,$7,NULL) RETURNING id`,[person.id,branchId,category,row.registration||null,row.department||null,row.functionName||null,category!=='roteirista'])).rows[0];
          await client.query(`INSERT INTO allocations(branch_id,locker_id,person_id,modality,started_at,original_start_unknown,migrated_at,reason,note,started_by)
            VALUES($1,$2,$3,'fixo',NULL,true,now(),$4,$5,$6)`,[branchId,locker.id,person.id,'Migração; início original desconhecido',row.observation||null,actor.id]);
          await client.query('INSERT INTO import_sources(import_id,sheet_name,row_number,entity_type,entity_id,raw) VALUES($1,$2,$3,$4,$5,$6)',[importId,'ARMÁRIOS',row.row,'membership',member.id,JSON.stringify(row)]);
        }
      }
      for(const item of batch.raw_rows.history)await client.query('INSERT INTO legacy_history(import_id,sheet_name,row_number,raw) VALUES($1,$2,$3,$4)',[importId,'HISTÓRICO',item.row,JSON.stringify(item.raw)]);
      await client.query("UPDATE imports SET state='applied',applied_at=now() WHERE id=$1",[importId]);
      await refreshPending(client,branchId);
      await event(client,branchId,actor.id,'migracao_aplicada','import',importId,{source:'ARMÁRIOS',physicalCount:new Set(rows.map(x=>x.number)).size,duplicateDecisions:body.duplicateDecisions,capacityOverrides:body.capacityOverrides,categoryOverrides:body.categoryOverrides,acceptedBancoSuggestions:body.acceptBancoSuggestions});
      const result={ok:true,importId,physicalCount:new Set(rows.map(x=>x.number)).size};
      await client.query('UPDATE operations SET result=$2 WHERE id=$1',[body.operationId,JSON.stringify(result)]);
      return result;
    });
  });
}
