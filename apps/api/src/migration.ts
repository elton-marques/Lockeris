import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import {id} from '@armarios/contracts';
import {authenticate,adminAccess} from './auth.js';
import {hash,transaction,one,fail} from './db.js';
import {parseFile,type Sheet} from './imports.js';
import {event,idempotent} from './operations.js';
import {refreshPending} from './pending.js';
import {registrationKey} from './registration.js';

type LockerRow={
  row:number;number:string;name:string;registration:string;department:string;functionName:string;
  sectorOccupant:string|null;status:'OCUPADO'|'DISPONÍVEL';isDouble:boolean;capacity:number;
  doubleSpecified:boolean|null;
  uncertain:boolean;nameRepeated:boolean;
};
const route=z.object({branchId:id});
const norm=(value:string)=>value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
const sectorNames=new Set(['JERINANA','RESTAURANTE FC']);
export function rowsFrom(sheet:Sheet):LockerRow[]{
  const headers=sheet.rows[0]?.map(norm)??[];
  const column=(...names:string[])=>headers.findIndex(header=>names.some(name=>header===norm(name)));
  const numberColumn=column('N°','Nº','NÚMERO','NUMERO','ARMÁRIO','ARMARIO');
  if(numberColumn<0)fail(422,'CABECALHO','A planilha de armários precisa da coluna Número, N° ou Armário');
  const nameColumn=column('NOME','PESSOA','COLABORADOR');
  const registrationColumn=column('MATRÍCULA','MATRICULA');
  const departmentColumn=column('SETOR');
  const functionColumn=column('FUNÇÃO','FUNCAO','CARGO');
  const sectorColumn=column('SETOR OCUPANTE','OCUPANTE SETOR','OCUPADO POR SETOR');
  const statusColumn=column('STATUS');
  const doubleColumn=column('DUPLO');
  if(statusColumn<0)fail(422,'CABECALHO','A planilha de armários precisa da coluna STATUS');
  const clean=(text:string)=>text.replace(/[\u200B-\u200D\u2060\uFEFF]/g,'').trim();
  const value=(row:string[],index:number)=>index<0?'':clean(row[index]??'');
  const numeric=(text:string)=>/^\d+\.0+$/.test(text)?text.replace(/\.0+$/,''):text;
  const result:LockerRow[]=[],numbers=new Map<string,LockerRow[]>(),registrations=new Set<string>();
  for(let index=1;index<sheet.rows.length;index++){
    const raw=sheet.rows[index];
    if(!raw.some(cell=>cell.trim()))continue;
    if(raw.some(cell=>cell.startsWith('#FORMULA_SEM_RESULTADO@')))fail(422,'FORMULA',`Fórmula sem resultado na linha ${index+1}; salve a planilha com os valores calculados`);
    const number=numeric(value(raw,numberColumn)),registration=numeric(value(raw,registrationColumn));
    let name=value(raw,nameColumn),sectorOccupant=value(raw,sectorColumn)||null;
    const statusText=norm(value(raw,statusColumn));
    const status=statusText==='LIVRE'||statusText==='DISPONIVEL'?'DISPONÍVEL':statusText;
    if(!number)fail(422,'LINHA',`Número do armário obrigatório na linha ${index+1}`);
    if(status!=='OCUPADO'&&status!=='DISPONÍVEL')fail(422,'STATUS',`Linha ${index+1}: informe OCUPADO ou DISPONÍVEL`);
    const department=value(raw,departmentColumn);
    if(!sectorOccupant&&!registration&&!name&&department&&status==='OCUPADO')sectorOccupant=department;
    if(!sectorOccupant&&!registration&&sectorNames.has(norm(name))){sectorOccupant=name;name='';}
    if(sectorOccupant&&(name||registration))fail(422,'OCUPANTE',`Linha ${index+1}: informe um setor ou uma pessoa, não ambos`);
    if(registration){
      const key=registrationKey(registration);
      if(registrations.has(key))fail(422,'MATRICULA_DUPLICADA',`Matrícula ${registration} aparece em mais de um armário`);
      registrations.add(key);
    }
    if(status==='DISPONÍVEL'&&(name||registration||sectorOccupant))fail(422,'STATUS',`Linha ${index+1}: armário disponível tem ocupante`);
    const doubleText=norm(value(raw,doubleColumn));
    if(doubleText&&!['TRUE','FALSE','VERDADEIRO','FALSO','SIM','NAO','1','0'].includes(doubleText))
      fail(422,'DUPLO',`Linha ${index+1}: use verdadeiro ou falso na coluna DUPLO`);
    const doubleSpecified=doubleText?['TRUE','VERDADEIRO','SIM','1'].includes(doubleText):null;
    const item:LockerRow={row:index+1,number,name,registration,department,functionName:value(raw,functionColumn),
      sectorOccupant,status,isDouble:!!doubleSpecified,capacity:doubleSpecified?2:1,doubleSpecified,
      uncertain:status==='OCUPADO'&&!registration&&!sectorOccupant&&!value(raw,functionColumn),nameRepeated:false};
    result.push(item);
    numbers.set(number,[...(numbers.get(number)??[]),item]);
  }
  if(!result.length)fail(422,'VAZIO','A planilha não contém armários');
  for(const [number,items] of numbers){
    if(items.length===1)continue;
    if(items.length!==2||items.some(item=>item.status!=='OCUPADO'||!item.name||item.sectorOccupant||item.doubleSpecified===false))
      fail(422,'DUPLICADA',`Armário ${number} repetido nas linhas ${items.map(item=>item.row).join(' e ')}; revise a planilha`);
    for(const item of items){item.isDouble=true;item.capacity=2;}
  }
  for(const items of numbers.values())if(items.some(item=>item.uncertain))for(const item of items)item.uncertain=true;
  const names=new Map<string,LockerRow[]>();
  for(const item of result)if(item.name&&!item.registration){const key=norm(item.name);names.set(key,[...(names.get(key)??[]),item]);}
  for(const items of names.values())if(items.length>1)for(const item of items)item.nameRepeated=true;
  return result;
}
export async function migrationRoutes(app:FastifyInstance):Promise<void>{
  app.post('/api/branches/:branchId/imports/migration/prepare',async request=>{
    const actor=await authenticate(request),{branchId}=route.parse(request.params);adminAccess(actor,branchId);
    const data=await request.file({limits:{fileSize:10*1024*1024}});if(!data)fail(422,'ARQUIVO','Envie a planilha XLSX');
    if(!/\.xlsx$/i.test(data.filename))fail(422,'FORMATO','Use uma planilha XLSX');
    const buffer=await data.toBuffer(),sheets=await parseFile(buffer,data.filename,'utf8','');
    if(sheets.length!==1)fail(422,'ABAS','Envie uma planilha com uma única aba de armários');
    const rows=rowsFrom(sheets[0]);
    const physical=new Map(rows.map(row=>[row.number,row]));
    const preview={sourceRows:rows.length,physicalCount:physical.size,occupiedCount:[...physical.values()].filter(row=>row.status==='OCUPADO').length,
      sectorCount:[...physical.values()].filter(row=>row.sectorOccupant).length,uncertainCount:[...physical.values()].filter(row=>row.uncertain).length,
      doubleCount:[...physical.values()].filter(row=>row.isDouble).length,
      repeatedNameCount:new Set(rows.filter(row=>row.nameRepeated).map(row=>norm(row.name))).size,
      rows:rows.map(({row,number,name,registration,sectorOccupant,status,isDouble,uncertain,nameRepeated})=>({row,number,name,registration,sectorOccupant,status,isDouble,uncertain,nameRepeated}))};
    const fields=data.fields as Record<string,{value?:unknown}>,operationId=id.parse(fields.operationId?.value);
    return transaction(client=>idempotent(client,operationId,branchId,actor.id,{kind:'lockers_prepare',fileHash:hash(buffer)},async()=>{
      const branch=await one<{ti_revision:string}>(client,'SELECT ti_revision FROM branches WHERE id=$1',[branchId]);
      const saved=await client.query<{id:string}>(`INSERT INTO imports(branch_id,kind,file_hash,filename,sheet_name,base_revision,mapping,preview,raw_rows,created_by)
        VALUES($1,'migracao',$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,[branchId,hash(buffer),data.filename,sheets[0].name,branch.ti_revision,
          JSON.stringify({source:'single_sheet'}),JSON.stringify(preview),JSON.stringify(rows),actor.id]);
      return {importId:saved.rows[0].id,...preview};
    }));
  });
  app.post('/api/branches/:branchId/imports/migration/:importId/confirm',async request=>{
    const actor=await authenticate(request),{branchId}=route.parse(request.params);adminAccess(actor,branchId);
    const {importId}=z.object({importId:id}).parse(request.params);
    const body=z.object({operationId:id,acknowledgeReviewed:z.literal(true)}).parse(request.body);
    return transaction(client=>idempotent(client,body.operationId,branchId,actor.id,{importId,...body},async()=>{
      const branch=await one<{ti_revision:string}>(client,'SELECT ti_revision FROM branches WHERE id=$1 FOR UPDATE',[branchId]);
      const count=await client.query<{count:string}>('SELECT count(*) FROM lockers WHERE branch_id=$1',[branchId]);
      if(Number(count.rows[0].count))fail(409,'IMPORTACAO','A planilha de armários é uma carga inicial e a filial já tem armários');
      const batch=await one<{state:string;base_revision:string;raw_rows:LockerRow[];sheet_name:string}>(client,
        'SELECT state,base_revision,raw_rows,sheet_name FROM imports WHERE id=$1 AND branch_id=$2 AND kind=$3 FOR UPDATE',[importId,branchId,'migracao']);
      if(batch.state!=='prepared')fail(409,'LOTE','Lote já confirmado');
      if(String(branch.ti_revision)!==String(batch.base_revision))fail(409,'PREVIA_DESATUALIZADA','A base de colaboradores mudou; refaça a prévia');
      const lockers=new Map<string,string>();
      const roster=(await client.query<{id:string;person_id:string;registration:string}>(`SELECT id,person_id,registration FROM memberships
        WHERE branch_id=$1 AND registration IS NOT NULL`,[branchId])).rows;
      for(const row of batch.raw_rows){
        let lockerId=lockers.get(row.number);
        if(!lockerId){
          lockerId=(await client.query<{id:string}>(`INSERT INTO lockers(branch_id,number,size,capacity,is_double,modality,condition,migration_status,sector_occupant)
            VALUES($1,$2,'padrao',$3,$4,'fixo','disponivel',$5,$6) RETURNING id`,
            [branchId,row.number,row.capacity,row.isDouble,row.uncertain?'inconclusivo':'conferido',row.sectorOccupant])).rows[0].id;
          lockers.set(row.number,lockerId);
        }
        await client.query('INSERT INTO import_sources(import_id,sheet_name,row_number,entity_type,entity_id,raw) VALUES($1,$2,$3,$4,$5,$6)',
          [importId,batch.sheet_name,row.row,'locker',lockerId,JSON.stringify(row)]);
        if(row.sectorOccupant||(!row.name&&!row.registration&&!row.functionName))continue;
        const candidates=row.registration?roster.filter(member=>registrationKey(member.registration)===registrationKey(row.registration)):[];
        if(candidates.length>1)fail(409,'MATRICULA_AMBIGUA',`Matrícula ${row.registration} corresponde a mais de um colaborador`);
        const existing=candidates[0]??null;
        let personId=existing?.person_id,membershipId=existing?.id;
        if(!personId){
          personId=(await client.query<{id:string}>('INSERT INTO people(name) VALUES($1) RETURNING id',[row.name||row.functionName||`Matrícula ${row.registration}`])).rows[0].id;
          const promoter=norm(row.functionName).includes('PROMOTOR');
          const category=promoter?(row.registration?'promotor_fixo':'roteirista'):(row.registration?'colaborador':'terceirizado');
          membershipId=(await client.query<{id:string}>(`INSERT INTO memberships(person_id,branch_id,category,origin,registration,department,function_name,needs_fixed,ti_present,status)
            VALUES($1,$2,$3,'migracao',$4,$5,$6,$7,$8,$9) RETURNING id`,
            [personId,branchId,category,row.registration||null,row.department||null,row.functionName||null,category!=='roteirista',
              category==='colaborador'&&Number(branch.ti_revision)>0?false:null,category==='colaborador'&&Number(branch.ti_revision)>0?'encerrado':'ativo'])).rows[0].id;
        }
        await client.query(`INSERT INTO allocations(branch_id,locker_id,person_id,modality,started_at,original_start_unknown,migrated_at,reason,started_by)
          VALUES($1,$2,$3,'fixo',NULL,true,now(),'Carga inicial; início original desconhecido',$4)`,[branchId,lockerId,personId,actor.id]);
        await client.query('INSERT INTO import_sources(import_id,sheet_name,row_number,entity_type,entity_id,raw) VALUES($1,$2,$3,$4,$5,$6)',
          [importId,batch.sheet_name,row.row,'membership',membershipId,JSON.stringify(row)]);
      }
      await client.query("UPDATE imports SET state='applied',applied_at=now() WHERE id=$1",[importId]);
      await refreshPending(client,branchId);
      await event(client,branchId,actor.id,'armarios_importados','import',importId,{count:lockers.size});
      return {ok:true,importId,physicalCount:lockers.size};
    }));
  });
}
