import {useEffect,useState} from 'react';
import {api,del,patch,post} from '../api';
import type {PageProps} from '../App';
import {DataState,EmptyState} from '../ui';

type Audit={id:string;title:string;auditor_name:string;status:'em_andamento'|'concluida';started_at:string;completed_at:string|null;summary_notes:string|null;total_lockers:number;affected_lockers?:number};
type Occupant={name:string;registration:string|null;department:string|null};
type RecordRow={id:string;locker_id:string;locker_number:string;issue_type:Issue;notes:string|null;occupants:Occupant[];sector_occupant:string|null;recommendation?:string};
type Report={audit:Audit&{branch_name:string};records:RecordRow[];affectedLockers:number;complianceIndex:number};
type Locker={id:string;number:string};
type Auditor={id:string;name:string;registration:string|null;department:string|null};
type Issue='cadeado_fora_padrao'|'sem_cadeado'|'itens_fora_armario'|'mecanismo_avariado'|'outro';
const issues:Record<Issue,string>={cadeado_fora_padrao:'Cadeado fora do padrão',sem_cadeado:'Sem cadeado',itens_fora_armario:'Itens fora do armário',mecanismo_avariado:'Mecanismo avariado',outro:'Outro'};
const stamp=(value:string)=>new Date(value).toLocaleString('pt-BR');
function Occupancy({record}:{record:RecordRow}){return record.occupants?.length?<div className="custody-occupants">{record.occupants.map((person,index)=><div key={`${record.id}:${index}`}><strong>{person.name}</strong><small>Matrícula: {person.registration??'Não informada'} · Setor: {person.department??'Não informado'}</small></div>)}</div>
  :record.sector_occupant?<p className="custody-occupants">Ocupado pelo setor: {record.sector_occupant}</p>:<strong className="custody-vacant">Armário desocupado</strong>;}

export function Audits({branchId,branchName,readonly,admin,notice,askConfirm}:PageProps){
  const [audits,setAudits]=useState<Audit[]>([]),[lockers,setLockers]=useState<Locker[]>([]),[auditors,setAuditors]=useState<Auditor[]>([]),[selected,setSelected]=useState(''),[records,setRecords]=useState<RecordRow[]>([]);
  const [auditorId,setAuditorId]=useState(''),[lockerId,setLockerId]=useState(''),[issueType,setIssueType]=useState<Issue>('cadeado_fora_padrao'),[notes,setNotes]=useState(''),[summary,setSummary]=useState('');
  const [report,setReport]=useState<Report|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const active=audits.find(audit=>audit.id===selected);
  async function load(){setLoading(true);setError('');try{const [list,available,eligible]=await Promise.all([api<Audit[]>(`/branches/${branchId}/audits`),api<Locker[]>(`/branches/${branchId}/lockers`),api<Auditor[]>(`/branches/${branchId}/auditors`)]);
    setAudits(list);setLockers(available);setAuditors(eligible);setLockerId(current=>current||available[0]?.id||'');}
    catch(e){setError(e instanceof Error?e.message:'Falha ao carregar auditorias.');}finally{setLoading(false);}}
  useEffect(()=>{void load();},[branchId]);
  useEffect(()=>{if(!selected){setRecords([]);return;}void api<{records:RecordRow[]}>(`/audits/${selected}`).then(data=>setRecords(data.records)).catch(e=>notice(e instanceof Error?e.message:'Falha ao consultar ocorrências.'));},[selected]);
  async function run(action:()=>Promise<unknown>,message:string){setBusy(true);try{await action();await load();if(selected){const detail=await api<{records:RecordRow[]}>(`/audits/${selected}`);setRecords(detail.records);}notice(message);}catch(e){notice(e instanceof Error?e.message:'Não foi possível concluir a ação.');}finally{setBusy(false);}}
  async function create(event:React.FormEvent){event.preventDefault();await run(async()=>{const created=await post<Audit>(`/branches/${branchId}/audits`,{auditorId});setSelected(created.id);setAuditorId('');},'Auditoria iniciada.');}
  async function remove(){if(!active||!await askConfirm(`Excluir a auditoria “${active.title}” e todas as ocorrências registradas?`))return;
    setBusy(true);try{await del(`/audits/${active.id}`,{});setSelected('');setReport(null);setRecords([]);await load();notice('Auditoria excluída.');}
    catch(e){notice(e instanceof Error?e.message:'Não foi possível excluir a auditoria.');}finally{setBusy(false);}}
  async function add(event:React.FormEvent){event.preventDefault();await run(async()=>{await post(`/audits/${selected}/records`,{lockerId,issueType,notes:notes.trim()||null});setNotes('');},'Irregularidade registrada.');}
  async function complete(){if(!active||!await askConfirm(`Concluir a auditoria “${active.title}”? Depois disso não será possível adicionar irregularidades.`))return;
    await run(()=>patch(`/audits/${selected}/complete`,{summaryNotes:summary.trim()||null}),'Auditoria concluída.');}
  async function showReport(){try{setReport(await api<Report>(`/audits/${selected}/report`));}catch(e){notice(e instanceof Error?e.message:'Falha ao gerar relatório.');}}
  return <><div className="operational-intro"><div><h1>Auditorias</h1><p>Inspeções periódicas de armários em {branchName} e relatório para a gestão.</p></div><span>{audits.length} auditoria(s)</span></div>
    <DataState loading={loading} error={error} onRetry={()=>{void load();}}/>
    {!loading&&!error&&<div className="custody-layout"><section className="card"><div className="section-head"><div><span className="eyebrow">Inspeções</span><h2>Auditorias da filial</h2></div></div>
      {!readonly&&<form className="custody-form" onSubmit={create}><h3>Abrir nova auditoria</h3><p>A data e a hora de abertura identificam a auditoria.</p><label>Responsável da Prevenção de Perdas<select required value={auditorId} onChange={event=>setAuditorId(event.target.value)}><option value="">Selecione o colaborador</option>{auditors.map(person=><option key={person.id} value={person.id}>{person.name} · {person.registration??'Sem matrícula'}</option>)}</select></label>
        {!auditors.length&&<p className="custody-hint">Nenhum colaborador ativo da Prevenção de Perdas encontrado nesta filial.</p>}<button className="primary" disabled={busy||!auditors.length}>Iniciar auditoria</button></form>}
      {audits.length?<div className="custody-list">{audits.map(audit=><button type="button" key={audit.id} className={`custody-audit ${selected===audit.id?'custody-audit--active':''}`} onClick={()=>{setSelected(audit.id);setReport(null);setSummary(audit.summary_notes??'');}}><strong>{audit.title}</strong><span>{audit.status==='concluida'?'Concluída':'Em andamento'} · {stamp(audit.started_at)}</span><small>{audit.affected_lockers} armário(s) com ocorrência</small></button>)}</div>:<EmptyState title="Nenhuma auditoria" description="Inicie uma inspeção para registrar irregularidades."/>}</section>
      <section className="card"><div className="section-head"><div><span className="eyebrow">Conferência</span><h2>{active?.title??'Selecione uma auditoria'}</h2>{active&&<p>Responsável: {active.auditor_name} · {active.total_lockers} armário(s) no início da inspeção</p>}</div></div>
        {active&&<>{active.status==='em_andamento'&&!readonly&&<form className="custody-form" onSubmit={add}><h3>Registrar irregularidade</h3><label>Armário<select required value={lockerId} onChange={e=>setLockerId(e.target.value)}>{lockers.map(locker=><option key={locker.id} value={locker.id}>№ {locker.number}</option>)}</select></label>
          <label>Ocorrência<select value={issueType} onChange={e=>setIssueType(e.target.value as Issue)}>{Object.entries(issues).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
          <label>Observações<textarea value={notes} maxLength={2000} onChange={e=>setNotes(e.target.value)}/></label><button className="primary" disabled={busy||!lockerId}>Adicionar ocorrência</button></form>}
          <h3>Armários com problemas ({new Set(records.map(record=>record.locker_id)).size})</h3>
          {records.length?<div className="custody-list">{records.map(record=><div className="custody-item" key={record.id}><div><strong>№ {record.locker_number} · {issues[record.issue_type]}</strong><Occupancy record={record}/>{record.notes&&<p>{record.notes}</p>}</div></div>)}</div>:<p>Nenhuma irregularidade registrada.</p>}
          {active.status==='em_andamento'&&!readonly&&<div className="custody-form custody-complete"><label>Resumo da auditoria<textarea value={summary} maxLength={2000} onChange={e=>setSummary(e.target.value)}/></label><button type="button" disabled={busy} onClick={()=>{void complete();}}>Concluir auditoria</button></div>}
          {active.status==='concluida'&&<button type="button" className="primary" onClick={()=>{void showReport();}}>Gerar Relatório para Gestão</button>}
          {admin&&<div className="custody-delete"><button type="button" disabled={busy} onClick={()=>{void remove();}}>Excluir Auditoria</button></div>}
        </>}</section></div>}
    {report&&<><div className="custody-report-controls"><button type="button" onClick={()=>setReport(null)}>Fechar relatório</button><button type="button" className="primary" onClick={()=>window.print()}>Imprimir relatório</button></div>
      <article className="custody-report" aria-label="Relatório para Gestão"><header><span>LOCKERIS · PREVENÇÃO DE PERDAS</span><h2>Relatório de Auditoria para a Gestão</h2><p>{report.audit.title}</p></header>
        <div className="custody-report-meta"><div><small>FILIAL</small><strong>{report.audit.branch_name}</strong></div><div><small>DATA DA CONCLUSÃO</small><strong>{report.audit.completed_at?stamp(report.audit.completed_at):'—'}</strong></div><div><small>RESPONSÁVEL</small><strong>{report.audit.auditor_name}</strong></div></div>
        <div className="custody-report-index"><strong>{report.complianceIndex}%</strong><div><b>Índice de conformidade</b><p>{report.affectedLockers} armário(s) com irregularidade em {report.audit.total_lockers} avaliados no início da auditoria.</p></div></div>
        <h3>Ocorrências e providências recomendadas</h3><table><thead><tr><th>Armário</th><th>Irregularidade</th><th>Ocupação / observações</th><th>Providência recomendada</th></tr></thead><tbody>{report.records.map(row=><tr key={row.id}><td>№ {row.locker_number}</td><td>{issues[row.issue_type]}</td><td><Occupancy record={row}/>{row.notes||''}</td><td>{row.recommendation}</td></tr>)}</tbody></table>
        {!report.records.length&&<p>Nenhuma irregularidade registrada.</p>}{report.audit.summary_notes&&<section><h3>Resumo da inspeção</h3><p>{report.audit.summary_notes}</p></section>}
        <footer>Relatório gerado em {stamp(new Date().toISOString())} · Lockeris</footer></article></>}
  </>;
}
