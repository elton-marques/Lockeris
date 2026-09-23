import {useState} from 'react';
import {api,op,post} from '../api';
import type {PageProps} from '../App';

type Sheet={name:string;preview:string[][];rows:number};
type Employee={row:number;registration:string;name:string;department:string|null;functionName:string|null};
type Change={row:Employee;before:{name:string;department:string|null;function_name:string|null}};
type Conflict={row:number;registration:string;existing:{name:string;category:string}};
type Preview={importId:string;baseRevision:string;extractedOn:string;counts:{previous:number;current:number;absent:number};
  inclusions:Employee[];changes:Change[];absences:{id:string;registration:string;name:string}[];unchanged:unknown[];conflicts:Conflict[]};
type LockerRow={row:number;number:string;name:string;registration:string;sectorOccupant:string|null;status:string;isDouble:boolean;uncertain:boolean;nameRepeated:boolean};
type LockerPreview={importId:string;sourceRows:number;physicalCount:number;occupiedCount:number;sectorCount:number;uncertainCount:number;doubleCount:number;repeatedNameCount:number;rows:LockerRow[]};
const normalized=(value:string)=>value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
function column(headers:string[],...names:string[]){return headers.find(header=>names.some(name=>normalized(header)===normalized(name)))??'';}
export function Imports({branchId,readonly,refresh,notice}:PageProps){
  const [employeeFile,setEmployeeFile]=useState<File|null>(null),[sheets,setSheets]=useState<Sheet[]>([]),[sheet,setSheet]=useState('');
  const [headerRow,setHeaderRow]=useState(1),[mapping,setMapping]=useState({registration:'',name:'',department:'',functionName:''});
  const [encoding,setEncoding]=useState('utf8'),[delimiter,setDelimiter]=useState(''),[extractedOn,setExtractedOn]=useState(new Date().toISOString().slice(0,10));
  const [preview,setPreview]=useState<Preview|null>(null),[complete,setComplete]=useState(false),[sameDate,setSameDate]=useState(false);
  const [resolved,setResolved]=useState<Record<string,boolean>>({});
  const [lockerFile,setLockerFile]=useState<File|null>(null),[lockers,setLockers]=useState<LockerPreview|null>(null),[reviewed,setReviewed]=useState(false),[busy,setBusy]=useState(false);
  async function inspect(){
    if(!employeeFile)return;setBusy(true);
    try{
      const data=new FormData();data.append('encoding',encoding);data.append('delimiter',delimiter);data.append('file',employeeFile);
      const result=await api<{sheets:Sheet[]}>(`/branches/${branchId}/imports/inspect`,{method:'POST',body:data});
      const first=result.sheets.find(item=>normalized(item.name)==='COLABORADORES')??result.sheets[0];
      const headers=first?.preview[0]??[];
      setSheets(result.sheets);setSheet(first?.name??'');setHeaderRow(1);setPreview(null);
      setMapping({registration:column(headers,'MATRÍCULA','MATRICULA'),name:column(headers,'NOME'),
        department:column(headers,'SETOR'),functionName:column(headers,'FUNÇÃO','FUNCAO','CARGO')});
    }catch(error){notice(error instanceof Error?error.message:'Falha na inspeção');}finally{setBusy(false);}
  }
  async function prepare(){
    if(!employeeFile)return;setBusy(true);
    try{
      const data=new FormData();
      for(const [key,value] of Object.entries({operationId:op(),sheet,headerRow:String(headerRow),extractedOn,mapping:JSON.stringify(mapping),encoding,delimiter}))data.append(key,value);
      data.append('file',employeeFile);
      setPreview(await api<Preview>(`/branches/${branchId}/imports/ti/prepare`,{method:'POST',body:data}));
      setComplete(false);setResolved({});
    }catch(error){notice(error instanceof Error?error.message:'Falha na prévia');}finally{setBusy(false);}
  }
  async function confirm(){
    if(!preview)return;setBusy(true);
    try{
      const resolutions=Object.fromEntries(preview.conflicts.filter(item=>resolved[item.registration]).map(item=>[item.registration,'converter_para_ti']));
      await post(`/branches/${branchId}/imports/${preview.importId}/confirm`,{operationId:op(),acknowledgeComplete:complete,sameDateCorrection:sameDate,resolutions});
      notice('Base ativa de colaboradores atualizada. Armários de pessoas ausentes ficaram pendentes de conferência.');
      setPreview(null);refresh();
    }catch(error){notice(error instanceof Error?error.message:'Falha na confirmação');}finally{setBusy(false);}
  }
  async function prepareLockers(){
    if(!lockerFile)return;setBusy(true);
    try{
      const data=new FormData();data.append('operationId',op());data.append('file',lockerFile);
      setLockers(await api<LockerPreview>(`/branches/${branchId}/imports/migration/prepare`,{method:'POST',body:data}));
      setReviewed(false);
    }catch(error){notice(error instanceof Error?error.message:'Falha na prévia dos armários');}finally{setBusy(false);}
  }
  async function confirmLockers(){
    if(!lockers)return;setBusy(true);
    try{
      await post(`/branches/${branchId}/imports/migration/${lockers.importId}/confirm`,{operationId:op(),acknowledgeReviewed:reviewed});
      notice('Armários importados. Confira as pendências apontadas na prévia.');
      setLockers(null);refresh();
    }catch(error){notice(error instanceof Error?error.message:'Falha na importação dos armários');}finally{setBusy(false);}
  }
  const selected=sheets.find(item=>item.name===sheet),headers=selected?.preview[headerRow-1]??[];
  return <>
    <section className="card"><div className="section-head"><div><h2>Base de colaboradores</h2>
      <p>Envie a planilha com a lista atual de colaboradores. Cada envio substitui a lista ativa pela nova lista de matrículas.</p></div></div>
      {readonly?<p>Importação indisponível para este perfil ou em modo offline.</p>:<div className="form-grid">
        <label>Arquivo de colaboradores, XLSX ou CSV<input type="file" accept=".xlsx,.csv" onChange={event=>{setEmployeeFile(event.target.files?.[0]??null);setSheets([]);setPreview(null);}}/></label>
        <label>Data da extração<input type="date" value={extractedOn} onChange={event=>setExtractedOn(event.target.value)}/></label>
        <label>Codificação do CSV<select value={encoding} onChange={event=>setEncoding(event.target.value)}><option value="utf8">UTF-8</option><option value="win1252">Windows-1252</option><option value="latin1">Latin-1</option></select></label>
        <label>Delimitador do CSV<select value={delimiter} onChange={event=>setDelimiter(event.target.value)}><option value="">Detectar</option><option value=",">Vírgula</option><option value=";">Ponto e vírgula</option></select></label>
        <button disabled={!employeeFile||busy} onClick={inspect}>Ler arquivo</button>
      </div>}
    </section>
    {selected&&<section className="card"><h2>Colunas da planilha</h2><p>Confira matrícula, nome, setor e cargo ou função antes de importar.</p>
      <div className="form-grid"><label>Aba<select value={sheet} onChange={event=>setSheet(event.target.value)}>{sheets.map(item=><option key={item.name}>{item.name}</option>)}</select></label>
        <label>Linha do cabeçalho<input type="number" min={1} value={headerRow} onChange={event=>setHeaderRow(Number(event.target.value))}/></label>
        {(['registration','name','department','functionName'] as const).map(key=><label key={key}>{({registration:'Matrícula',name:'Nome',department:'Setor',functionName:'Cargo ou função'})[key]}
          <select required value={mapping[key]} onChange={event=>setMapping({...mapping,[key]:event.target.value})}><option value="">Selecione</option>{headers.map((header,index)=><option key={index} value={header}>{header}</option>)}</select></label>)}
        <button className="primary" disabled={busy||Object.values(mapping).some(value=>!value)} onClick={prepare}>Comparar com a base atual</button>
      </div><div className="table-wrap"><table><tbody>{selected.preview.map((row,index)=><tr key={index}><th>{index+1}</th>{row.map((cell,column)=><td key={column}>{cell}</td>)}</tr>)}</tbody></table></div>
    </section>}
    {preview&&<section className="card"><h2>Conferir atualização de colaboradores</h2><p>Arquivo de {new Date(`${preview.extractedOn}T12:00:00`).toLocaleDateString('pt-BR')}</p>
      <div className="stats compact"><div className="stat"><small>Antes</small><strong>{preview.counts.previous}</strong></div>
        <div className="stat"><small>Na nova lista</small><strong>{preview.counts.current}</strong></div>
        <div className="stat"><small>Saem da base ativa</small><strong>{preview.counts.absent}</strong></div></div>
      <div className="diff-grid"><Diff title="Novos" rows={preview.inclusions.map(item=>`${item.registration} · ${item.name}`)}/>
        <Diff title="Atualizados" rows={preview.changes.map(item=>`${item.row.registration} · ${item.row.name}`)}/>
        <Diff title="Ausentes da nova lista" rows={preview.absences.map(item=>`${item.registration} · ${item.name}`)}/>
        <Diff title="Sem alteração" rows={[]} count={preview.unchanged.length}/></div>
      {preview.conflicts.length>0&&<div className="warning"><h3>Matrículas já cadastradas</h3><p>Confirme a vinculação para manter uma única pessoa por matrícula.</p>
        {preview.conflicts.map(item=><label className="check" key={item.registration}><input type="checkbox" checked={!!resolved[item.registration]} onChange={event=>setResolved({...resolved,[item.registration]:event.target.checked})}/>
          {item.registration} · {item.existing.name} → dados da nova lista</label>)}</div>}
      <label className="check"><input type="checkbox" checked={complete} onChange={event=>setComplete(event.target.checked)}/>
        Confirmei que o arquivo traz todos os colaboradores ativos da filial. Pessoas ausentes sairão da base ativa; armários ainda ocupados ficarão pendentes.</label>
      <label className="check"><input type="checkbox" checked={sameDate} onChange={event=>setSameDate(event.target.checked)}/>Corrigir uma importação da mesma data, se necessário</label>
      <button className="primary" disabled={busy||!complete||preview.conflicts.some(item=>!resolved[item.registration])} onClick={confirm}>Atualizar base de colaboradores</button>
    </section>}
    {!readonly&&<section className="card"><h2>Carga inicial de armários</h2><p>Envie um XLSX com uma única aba e cabeçalho na primeira linha: N°, NOME, MATRÍCULA, SETOR, FUNÇÃO e STATUS. A coluna DUPLO é opcional. Repita o número quando duas pessoas ocuparem os compartimentos do mesmo armário. Esta carga é feita uma vez por filial.</p>
      <div className="inline-form"><label>Planilha de armários<input type="file" accept=".xlsx" onChange={event=>{setLockerFile(event.target.files?.[0]??null);setLockers(null);}}/></label>
        <button disabled={!lockerFile||busy} onClick={prepareLockers}>Conferir armários</button></div></section>}
    {lockers&&<section className="card"><h2>Conferir carga inicial</h2><p>{lockers.physicalCount} armários físicos · {lockers.occupiedCount} ocupados · {lockers.doubleCount} duplos · {lockers.sectorCount} por setores · {lockers.uncertainCount} a conferir</p>
      {lockers.repeatedNameCount>0&&<p className="warning">{lockers.repeatedNameCount} nome(s) sem matrícula aparecem em mais de um armário. Confira as identidades após a carga.</p>}
      <div className="table-wrap"><table><thead><tr><th>Linha</th><th>Armário</th><th>Ocupante</th><th>Matrícula</th><th>Status</th><th>Tipo</th><th>Conferência</th></tr></thead>
        <tbody>{lockers.rows.map(row=><tr key={row.row}><td>{row.row}</td><td>{row.number}</td><td>{row.sectorOccupant||row.name||'—'}</td><td>{row.registration||'—'}</td>
          <td>{row.status}</td><td>{row.isDouble?'Duplo':'—'}</td><td>{row.nameRepeated?'Nome repetido; conferir':row.uncertain?'Conferir ocupante':'Pronto'}</td></tr>)}</tbody></table></div>
      <label className="check"><input type="checkbox" checked={reviewed} onChange={event=>setReviewed(event.target.checked)}/>Revisei os números, ocupantes e armários duplos.</label>
      <button className="primary" disabled={busy||!reviewed} onClick={confirmLockers}>Importar armários</button>
    </section>}
  </>;
}
function Diff({title,rows,count=rows.length}:{title:string;rows:string[];count?:number}){return <div className="diff-card"><h3>{title} <span className="count">{count}</span></h3><div className="diff-list">
  {rows.length?rows.slice(0,30).map((row,index)=><p key={index}>{row}</p>):<p>{count?`${count} registros`:'Nenhum registro'}</p>}{rows.length>30&&<p>… e mais {rows.length-30}</p>}</div></div>;}
