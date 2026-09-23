import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import iconv from 'iconv-lite';
import yauzl from 'yauzl';
import { id } from '@armarios/contracts';
import { authenticate, adminAccess } from './auth.js';
import { hash, pool, transaction, one, fail } from './db.js';
import { event,idempotent } from './operations.js';
import { refreshPending } from './pending.js';

export type Sheet = { name: string; rows: string[][] };
type Mapping = { registration: string; name: string; department?: string; functionName?: string };
type TiRow = { row: number; registration: string; name: string; department: string | null; functionName: string | null };
type Existing = { id: string; person_id: string; registration: string; name: string; department: string | null; function_name: string | null; category: string; origin: string; ti_present: boolean | null };
const route = z.object({ branchId: id });
const routeImport = z.object({ branchId: id, importId: id });
const norm = (s: string) => s.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
async function checkZip(buffer:Buffer):Promise<void>{
  await new Promise<void>((resolve,reject)=>yauzl.fromBuffer(buffer,{lazyEntries:true,validateEntrySizes:true},(error,zip)=>{
    if(error||!zip){reject(error??new Error('ZIP inválido'));return;}
    let entries=0,total=0,finished=false;
    const abort=()=>{if(finished)return;finished=true;zip.close();reject(new Error('XLSX acima do limite de descompactação'));};
    zip.on('entry',entry=>{entries++;total+=entry.uncompressedSize;if(entries>2000||entry.uncompressedSize>20*1024*1024||total>60*1024*1024)abort();else zip.readEntry();});
    zip.on('end',()=>{if(!finished){finished=true;resolve();}});
    zip.on('error',err=>{if(!finished){finished=true;reject(err);}});
    zip.readEntry();
  }));
}
function cell(value: ExcelJS.CellValue, sheet: string, row: number, column: number): string {
  if (value == null) return '';
  if (typeof value !== 'object') return String(value);
  if (value instanceof Date) return value.toISOString();
  if ('formula' in value || 'sharedFormula' in value) {
    if (value.result == null) return `#FORMULA_SEM_RESULTADO@${sheet}:${row}:${column}`;
    return String(value.result);
  }
  if ('text' in value) return String(value.text);
  if ('richText' in value) return value.richText.map(x => x.text).join('');
  fail(422,'CELULA',`Valor não suportado em ${sheet}, linha ${row}, coluna ${column}`);
}
export async function parseFile(buffer: Buffer, filename: string, encoding: string, delimiter: string): Promise<Sheet[]> {
  if (!buffer.length || buffer.length > 10*1024*1024) fail(422,'ARQUIVO','Arquivo vazio ou acima de 10 MB');
  if (/\.csv$/i.test(filename)) {
    if (!['utf8','latin1','win1252'].includes(encoding)) fail(422,'CODIFICACAO','Codificação não suportada');
    const parsed = Papa.parse<string[]>(iconv.decode(buffer,encoding==='win1252'?'windows-1252':encoding),{ delimiter, skipEmptyLines:'greedy', dynamicTyping:false });
    if (parsed.errors.length) fail(422,'CSV',`CSV inválido na linha ${parsed.errors[0].row ?? '?'}`);
    if (parsed.data.length>10000) fail(422,'LIMITE','Arquivo acima de 10 mil linhas');
    return [{ name:'CSV', rows:parsed.data.map(row=>row.map(String)) }];
  }
  if (!/\.xlsx$/i.test(filename)) fail(422,'FORMATO','Use XLSX ou CSV');
  try { await checkZip(buffer); } catch { fail(422,'LIMITE','XLSX inválido ou acima do limite de descompactação'); }
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]); } catch { fail(422,'XLSX','Planilha XLSX inválida'); }
  const sheets: Sheet[] = [];
  for (const worksheet of workbook.worksheets) {
    if (worksheet.rowCount>10000) fail(422,'LIMITE',`Aba ${worksheet.name} acima de 10 mil linhas`);
    const rows: string[][] = [];
    worksheet.eachRow({includeEmpty:true},row=>{
      if (row.cellCount>100) fail(422,'LIMITE',`Aba ${worksheet.name} acima de 100 colunas`);
      const values: string[] = [];
      for (let column=1;column<=row.cellCount;column++) values.push(cell(row.getCell(column).value,worksheet.name,row.number,column));
      rows.push(values);
    });
    sheets.push({name:worksheet.name,rows});
  }
  return sheets;
}
function select(sheet: Sheet, headerRow: number, mapping: Mapping): TiRow[] {
  const headers=sheet.rows[headerRow-1]?.map(norm);
  if (!headers) fail(422,'CABECALHO','Linha de cabeçalho não encontrada');
  const ix=(name?:string)=>name?headers.indexOf(norm(name)):-1;
  const registration=ix(mapping.registration),name=ix(mapping.name),department=ix(mapping.department),functionName=ix(mapping.functionName);
  if (registration<0||name<0||(mapping.department&&department<0)||(mapping.functionName&&functionName<0)) fail(422,'MAPEAMENTO','Cabeçalho mapeado não encontrado');
  const rows:TiRow[]=[],seen=new Map<string,number>();
  for(let i=headerRow;i<sheet.rows.length;i++) {
    const row=sheet.rows[i],reg=(row[registration]??'').trim(),personName=(row[name]??'').trim();
    const values=[registration,name,department,functionName].filter(x=>x>=0).map(x=>row[x]??'');
    const formula=values.find(x=>x.startsWith('#FORMULA_SEM_RESULTADO@'));
    if(formula) fail(422,'FORMULA',`Fórmula sem resultado em ${formula.split('@')[1]}`);
    if (!row.some(x=>x.trim())) continue;
    if (!reg||!personName) fail(422,'LINHA',`Matrícula e nome obrigatórios em ${sheet.name}, linha ${i+1}`);
    if (seen.has(reg)) fail(422,'DUPLICADA',`Matrícula ${reg} duplicada nas linhas ${seen.get(reg)} e ${i+1}`);
    seen.set(reg,i+1);
    rows.push({row:i+1,registration:reg,name:personName,department:department<0?null:row[department]?.trim()||null,functionName:functionName<0?null:row[functionName]?.trim()||null});
  }
  if (!rows.length) fail(422,'VAZIO','A base não contém colaboradores');
  return rows;
}
async function existingFor(branchId:string,db:typeof pool|import('./db.js').Client=pool):Promise<Existing[]> {
  return (await db.query<Existing>('SELECT m.*,p.name FROM memberships m JOIN people p ON p.id=m.person_id WHERE m.branch_id=$1',[branchId])).rows;
}
function difference(rows:TiRow[],existing:Existing[]) {
  const byReg=new Map(existing.filter(x=>x.registration).map(x=>[x.registration,x])),seen=new Set(rows.map(x=>x.registration));
  const inclusions:TiRow[]=[],changes:unknown[]=[],unchanged:TiRow[]=[],conflicts:unknown[]=[];
  for(const row of rows) {
    const old=byReg.get(row.registration);
    if(!old) inclusions.push(row);
    else if(old.category!=='colaborador'||old.origin!=='ti') conflicts.push({row:row.row,registration:row.registration,existing:old});
    else if(old.name!==row.name||old.department!==row.department||old.function_name!==row.functionName||!old.ti_present) changes.push({row,before:old});
    else unchanged.push(row);
  }
  const absences=existing.filter(x=>x.category==='colaborador'&&x.origin==='ti'&&!seen.has(x.registration));
  return {inclusions,changes,absences,unchanged,conflicts,counts:{previous:existing.filter(x=>x.category==='colaborador'&&x.origin==='ti'&&x.ti_present).length,current:rows.length,absent:absences.length}};
}

export async function importRoutes(app:FastifyInstance):Promise<void> {
  app.post('/api/branches/:branchId/imports/inspect',async request=>{
    const actor=await authenticate(request),{branchId}=route.parse(request.params);adminAccess(actor,branchId);
    const data=await request.file({limits:{fileSize:10*1024*1024}});if(!data) fail(422,'ARQUIVO','Envie um arquivo');
    const buffer=await data.toBuffer(),fields=data.fields as Record<string,{value?:unknown}>;
    const sheets=await parseFile(buffer,data.filename,String(fields.encoding?.value??'utf8'),String(fields.delimiter?.value??''));
    return {sheets:sheets.map(sheet=>({name:sheet.name,preview:sheet.rows.slice(0,8),rows:sheet.rows.length})),fileHash:hash(buffer)};
  });
  app.post('/api/branches/:branchId/imports/ti/prepare',async request=>{
    const actor=await authenticate(request),{branchId}=route.parse(request.params);adminAccess(actor,branchId);
    const data=await request.file({limits:{fileSize:10*1024*1024}});if(!data) fail(422,'ARQUIVO','Envie um arquivo');
    const buffer=await data.toBuffer(),fields=data.fields as Record<string,{value?:unknown}>;
    const values=Object.fromEntries(Object.entries(fields).map(([key,field])=>[key,field.value]));
    const input=z.object({operationId:id,sheet:z.string(),headerRow:z.coerce.number().int().positive(),extractedOn:z.iso.date(),mapping:z.string(),encoding:z.string().default('utf8'),delimiter:z.string().default('')}).parse(values);
    const mapping=z.object({registration:z.string(),name:z.string(),department:z.string().optional(),functionName:z.string().optional()}).parse(JSON.parse(input.mapping));
    const sheet=(await parseFile(buffer,data.filename,input.encoding,input.delimiter)).find(x=>x.name===input.sheet);
    if(!sheet) fail(422,'ABA','Aba não encontrada');
    const rows=select(sheet,input.headerRow,mapping);
    return transaction(async client=>{
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      return idempotent(client,input.operationId,branchId,actor.id,{kind:'ti_prepare',fileHash:hash(buffer),input},async()=>{
        const branch=await one<{ti_revision:string}>(client,'SELECT ti_revision FROM branches WHERE id=$1',[branchId]);
        const preview=difference(rows,await existingFor(branchId,client));
        const saved=await client.query<{id:string}>(`INSERT INTO imports(branch_id,kind,extracted_on,file_hash,filename,sheet_name,base_revision,mapping,preview,raw_rows,created_by)
          VALUES($1,'ti',$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,[branchId,input.extractedOn,hash(buffer),data.filename,sheet.name,branch.ti_revision,JSON.stringify(mapping),JSON.stringify(preview),JSON.stringify(rows),actor.id]);
        return {importId:saved.rows[0].id,baseRevision:branch.ti_revision,extractedOn:input.extractedOn,...preview};
      });
    });
  });
  app.get('/api/branches/:branchId/imports/:importId',async request=>{
    const actor=await authenticate(request),{branchId,importId}=routeImport.parse(request.params);adminAccess(actor,branchId);
    const {rows}=await pool.query('SELECT id,kind,extracted_on,filename,sheet_name,base_revision,state,preview,created_at,applied_at FROM imports WHERE id=$1 AND branch_id=$2',[importId,branchId]);
    return rows[0]??fail(404,'IMPORTACAO','Lote não encontrado');
  });
  app.post('/api/branches/:branchId/imports/:importId/confirm',async request=>{
    const actor=await authenticate(request),{branchId,importId}=routeImport.parse(request.params);adminAccess(actor,branchId);
    const body=z.object({operationId:id,acknowledgeComplete:z.literal(true),sameDateCorrection:z.boolean().default(false),resolutions:z.record(z.string(),z.enum(['converter_para_ti'])).default({})}).parse(request.body);
    return transaction(async client=>{
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[body.operationId]);
      const payloadHash=hash(JSON.stringify({branchId,actorId:actor.id,importId,body}));
      const done=await client.query<{payload_hash:string;result:unknown}>('SELECT payload_hash,result FROM operations WHERE id=$1 FOR UPDATE',[body.operationId]);
      if(done.rows[0]) {if(done.rows[0].payload_hash!==payloadHash) fail(409,'OPERACAO_REUTILIZADA','Identificador já usado');return done.rows[0].result;}
      const branch=await one<{ti_revision:string;ti_extracted_on:string|null}>(client,'SELECT ti_revision,ti_extracted_on FROM branches WHERE id=$1 FOR UPDATE',[branchId]);
      const batch=await one<{state:string;kind:string;base_revision:string;extracted_on:string;file_hash:string;raw_rows:TiRow[];sheet_name:string}>(client,'SELECT * FROM imports WHERE id=$1 AND branch_id=$2 FOR UPDATE',[importId,branchId]);
      if(batch.state!=='prepared'||batch.kind!=='ti') fail(409,'LOTE','Lote já confirmado ou inválido');
      if(String(branch.ti_revision)!==String(batch.base_revision)) fail(409,'PREVIA_DESATUALIZADA','Outro lote foi aplicado; refaça a comparação');
      if(branch.ti_extracted_on&&batch.extracted_on<branch.ti_extracted_on) fail(409,'DATA','Extração anterior à vigente');
      if(branch.ti_extracted_on&&batch.extracted_on===branch.ti_extracted_on&&!body.sameDateCorrection) fail(409,'MESMA_DATA','Confirme explicitamente a correção da mesma data');
      const duplicate=await client.query('SELECT id FROM imports WHERE branch_id=$1 AND kind=$2 AND file_hash=$3 AND state=$4',[branchId,'ti',batch.file_hash,'applied']);
      if(duplicate.rows[0]) fail(409,'ARQUIVO_REPETIDO','Arquivo já aplicado');
      const diff=difference(batch.raw_rows,await existingFor(branchId,client));
      const conflicts=diff.conflicts as {registration:string}[];
      if(conflicts.some(x=>body.resolutions[x.registration]!=='converter_para_ti')) fail(409,'CONFLITOS','Resolva todas as matrículas conflitantes');
      if(Object.keys(body.resolutions).some(x=>!conflicts.some(c=>c.registration===x))) fail(422,'RESOLUCAO','Resolução sem conflito correspondente');
      await client.query('INSERT INTO operations(id,branch_id,actor_id,payload_hash) VALUES($1,$2,$3,$4)',[body.operationId,branchId,actor.id,payloadHash]);
      const byReg=new Map((await existingFor(branchId,client)).filter(x=>x.registration).map(x=>[x.registration,x]));
      const seen=new Set<string>();
      for(const row of batch.raw_rows) {
        seen.add(row.registration);
        const old=byReg.get(row.registration);
        let membershipId:string;
        if(old) {
          membershipId=old.id;
          await client.query(`UPDATE memberships SET category='colaborador',origin='ti',department=$2,function_name=$3,ti_present=true,version=version+1,updated_at=now() WHERE id=$1`,[old.id,row.department,row.functionName]);
          await client.query('UPDATE people SET name=$2 WHERE id=$1',[old.person_id,row.name]);
          if(old.name!==row.name||old.department!==row.department||old.function_name!==row.functionName) {
            await event(client,branchId,actor.id,'dados_ti_alterados','membership',old.id,{before:old,after:row,importId});
            await client.query(`INSERT INTO pending_items(branch_id,kind,subject_type,subject_id,reason) VALUES($1,'dados_alterados','membership',$2,$3)
              ON CONFLICT(branch_id,kind,subject_type,subject_id) DO UPDATE SET state='aberta',reason=$3,updated_at=now(),version=pending_items.version+1`,[branchId,old.id,`Lote ${importId}`]);
          }
        } else {
          const personId=(await client.query<{id:string}>('INSERT INTO people(name) VALUES($1) RETURNING id',[row.name])).rows[0].id;
          membershipId=(await client.query<{id:string}>(`INSERT INTO memberships(person_id,branch_id,category,origin,registration,department,function_name,needs_fixed,ti_present)
            VALUES($1,$2,'colaborador','ti',$3,$4,$5,true,true) RETURNING id`,[personId,branchId,row.registration,row.department,row.functionName])).rows[0].id;
          await event(client,branchId,actor.id,'pessoa_ti_incluida','membership',membershipId,{importId});
        }
        await client.query('INSERT INTO import_sources(import_id,sheet_name,row_number,entity_type,entity_id,raw) VALUES($1,$2,$3,$4,$5,$6)',[importId,batch.sheet_name,row.row,'membership',membershipId,JSON.stringify(row)]);
      }
      await client.query(`UPDATE memberships SET ti_present=false,version=version+1,updated_at=now() WHERE branch_id=$1 AND category='colaborador' AND origin='ti' AND registration <> ALL($2::text[])`,[branchId,[...seen]]);
      await client.query('UPDATE branches SET ti_revision=ti_revision+1,ti_extracted_on=$2,version=version+1 WHERE id=$1',[branchId,batch.extracted_on]);
      await client.query("UPDATE imports SET state='applied',applied_at=now(),preview=$2 WHERE id=$1",[importId,JSON.stringify(diff)]);
      await refreshPending(client,branchId);
      await event(client,branchId,actor.id,'lote_ti_aplicado','import',importId,{counts:diff.counts});
      const result={ok:true,importId,counts:diff.counts};
      await client.query('UPDATE operations SET result=$2 WHERE id=$1',[body.operationId,JSON.stringify(result)]);
      return result;
    });
  });
}
