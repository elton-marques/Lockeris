import {useEffect,useMemo,useState} from 'react';
import {api,patch,post} from '../api';
import type {PageProps} from '../App';
import {DataState,EmptyState} from '../ui';
import {pendingKindLabels} from '../locker-insights';
import {FoundItemForm,categoryLabels,foundItemPayload,newFoundItem,type Category} from '../components/FoundItemForm';

type Item={id:string;locker_number:string|null;person_name:string|null;category:Category;custom_category:string|null;finder_name:string;
  found_at:string;found_location:string;description:string;status:'retido'|'devolvido'|'destinado';expires_at:string;resolved_at:string|null;notes:string|null};
type Locker={id:string;number:string};
type DailySummary={overdue:{id:string;description:string;locker_number:string|null;days_overdue:number}[];
  expiring:{id:string;description:string;locker_number:string|null;days_left:number}[];
  keyLoans:{id:string;locker_number:string;person_name:string;days_out:number}[];
  pending:{kind:string;count:number}[]};
const stamp=(value:string)=>{const date=new Date(value);return `${date.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'})} ${date.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',hour12:false})}`;};
const daysLeft=(value:string)=>Math.ceil((new Date(value).getTime()-Date.now())/86400000);
type StatusFilter='todos'|'retido'|'devolvido'|'vencido_destinado';

export function RetainedItems({branchId,branchName,readonly,notice,askConfirm}:PageProps){
  const [items,setItems]=useState<Item[]>([]),[lockers,setLockers]=useState<Locker[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [registering,setRegistering]=useState(false),[draft,setDraft]=useState(()=>newFoundItem()),[lockerId,setLockerId]=useState('');
  const [category,setCategory]=useState<Category|'todas'>('todas'),[status,setStatus]=useState<StatusFilter>('todos'),[search,setSearch]=useState('');
  const [summary,setSummary]=useState<DailySummary|null>(null),[printing,setPrinting]=useState(false);
  async function load(){setLoading(true);setError('');try{const [found,available,daily]=await Promise.all([api<Item[]>(`/branches/${branchId}/retained-items`),api<Locker[]>(`/branches/${branchId}/lockers`),api<DailySummary>(`/branches/${branchId}/daily-summary`)]);setItems(found);setLockers(available);setSummary(daily);}
    catch(e){setError(e instanceof Error?e.message:'Falha ao carregar os itens.');}finally{setLoading(false);}}
  useEffect(()=>{void load();},[branchId]);
  const filtered=useMemo(()=>items.filter(item=>{
    if(category!=='todas'&&item.category!==category)return false;
    if(status==='retido'&&(item.status!=='retido'||daysLeft(item.expires_at)<=0))return false;
    if(status==='devolvido'&&item.status!=='devolvido')return false;
    if(status==='vencido_destinado'&&item.status!=='destinado'&&!(item.status==='retido'&&daysLeft(item.expires_at)<=0))return false;
    const term=search.trim().toLocaleLowerCase('pt-BR');
    return !term||[item.description,item.finder_name,item.found_location,item.custom_category??'',item.person_name??'',item.locker_number??''].some(value=>value.toLocaleLowerCase('pt-BR').includes(term));
  }),[items,category,status,search]);
  async function register(event:React.FormEvent){event.preventDefault();setBusy(true);
    try{await post('/retained-items',{branchId,lockerId:lockerId||null,item:foundItemPayload(draft)});setRegistering(false);setDraft(newFoundItem());setLockerId('');await load();notice('Item registrado em Achados e Perdidos.');}
    catch(e){notice(e instanceof Error?e.message:'Não foi possível registrar o item.');}finally{setBusy(false);}}
  async function resolve(item:Item,next:'devolvido'|'destinado'){
    if(!await askConfirm(next==='devolvido'?'Confirmar devolução deste item ao proprietário?':'Confirmar destinação deste item após o prazo de guarda?'))return;
    setBusy(true);
    try{await patch(`/retained-items/${item.id}/status`,{status:next});await load();notice(next==='devolvido'?'Devolução registrada.':'Destinação registrada.');}
    catch(e){notice(e instanceof Error?e.message:'Não foi possível dar baixa.');}finally{setBusy(false);}
  }
  const retained=items.filter(item=>item.status==='retido');
  const attention=retained.filter(item=>daysLeft(item.expires_at)<=5).length;
  function printSummary(){setPrinting(true);window.setTimeout(()=>{window.print();setPrinting(false);},150);}
  return <><div className={`operational-intro${printing?' hide-on-print':''}`}><div><h1>Achados e Perdidos</h1><p>Itens encontrados em {branchName} com guarda de 30 dias a partir do achado.</p></div><span>{retained.length} em guarda{attention?` · ${attention} exigem atenção`:''}</span></div>
    <DataState loading={loading} error={error} onRetry={()=>{void load();}}/>
    {!loading&&!error&&summary&&<section className="card daily-summary" aria-labelledby="daily-summary-title">
      <div className="section-head"><div><span className="eyebrow">Rotina diária</span><h2 id="daily-summary-title">Resumo do dia</h2><p>Vencimentos da semana, chaves emprestadas e pendências que precisam de decisão.</p></div>
        <button type="button" className="primary" onClick={printSummary}>Imprimir resumo</button></div>
      <div className="daily-summary-grid">
        <div className="daily-summary-block"><h3>Prazo vencido <span className="count">{summary.overdue.length}</span></h3>
          {summary.overdue.length?<ul>{summary.overdue.map(item=><li key={item.id}><strong>{item.description}</strong><small>{item.locker_number?`Armário № ${item.locker_number} · `:''}vencido há {item.days_overdue} dia(s)</small></li>)}</ul>:<p className="daily-summary-empty">Nenhum item com prazo vencido.</p>}</div>
        <div className="daily-summary-block"><h3>Vencendo em até 5 dias <span className="count">{summary.expiring.length}</span></h3>
          {summary.expiring.length?<ul>{summary.expiring.map(item=><li key={item.id}><strong>{item.description}</strong><small>{item.locker_number?`Armário № ${item.locker_number} · `:''}{item.days_left} dia(s) restante(s)</small></li>)}</ul>:<p className="daily-summary-empty">Nada vencendo nos próximos dias.</p>}</div>
        <div className="daily-summary-block"><h3>Chaves emprestadas <span className="count">{summary.keyLoans.length}</span></h3>
          {summary.keyLoans.length?<ul>{summary.keyLoans.map(item=><li key={item.id}><strong>Armário № {item.locker_number}</strong><small>{item.person_name} · {item.days_out} dia(s)</small></li>)}</ul>:<p className="daily-summary-empty">Nenhum empréstimo de chave em aberto.</p>}</div>
        <div className="daily-summary-block"><h3>Pendências abertas <span className="count">{summary.pending.reduce((sum,item)=>sum+item.count,0)}</span></h3>
          {summary.pending.length?<ul>{summary.pending.map(item=><li key={item.kind}><strong>{pendingKindLabels[item.kind]??'Conferência necessária'}</strong><small>{item.count} {item.count===1?'pendente':'pendências'}</small></li>)}</ul>:<p className="daily-summary-empty">Nenhuma pendência aberta.</p>}</div>
      </div>
    </section>}
    {!loading&&!error&&<><section className={`card${printing?' hide-on-print':''}`}><div className="section-head"><div><span className="eyebrow">Prevenção de Perdas</span><h2>Itens encontrados</h2><p>Consulte o prazo e a situação de cada item.</p></div>
      {!readonly&&<button type="button" className="primary" onClick={()=>setRegistering(current=>!current)}>{registering?'Fechar cadastro':'+ Registrar Item'}</button>}</div>
      {registering&&<form className="custody-form custody-register" onSubmit={register}><h3>Registrar item encontrado</h3>
        <label>Armário associado (opcional)<select value={lockerId} onChange={event=>setLockerId(event.target.value)}><option value="">Sem armário associado</option>{lockers.map(locker=><option key={locker.id} value={locker.id}>№ {locker.number}</option>)}</select></label>
        <FoundItemForm value={draft} onChange={setDraft}/><button type="submit" className="primary" disabled={busy}>Salvar item</button></form>}
      <div className="custody-filters"><label>Buscar item<input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Descrição, pessoa ou local"/></label>
        <label>Categoria<select value={category} onChange={event=>setCategory(event.target.value as Category|'todas')}><option value="todas">Todas</option>{Object.entries(categoryLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label>Situação<select value={status} onChange={event=>setStatus(event.target.value as StatusFilter)}><option value="todos">Todas</option><option value="retido">Em guarda</option><option value="devolvido">Devolvido</option><option value="vencido_destinado">Prazo Vencido / Destinado</option></select></label></div>
      <p className="custody-count" aria-live="polite">{filtered.length} {filtered.length===1?'item encontrado':'itens encontrados'}</p>
      {filtered.length?<div className="custody-list">{filtered.map(item=>{const days=daysLeft(item.expires_at);return <article className="custody-item" key={item.id}>
        <div><div className="custody-item-title"><strong>{item.category==='outro'?item.custom_category:categoryLabels[item.category]}{item.locker_number?` · Armário № ${item.locker_number}`:''}</strong>
          <span className={`custody-badge ${item.status==='retido'?(days<=0?'custody-badge--overdue':days<=5?'custody-badge--urgent':days<=7?'custody-badge--soon':'custody-badge--open'):''}`}>{item.status==='retido'?(days<=0?`Prazo vencido há ${Math.max(1,Math.ceil((Date.now()-new Date(item.expires_at).getTime())/86400000))} dia(s)`:`${days} dia(s) restantes`):item.status==='devolvido'?'Devolvido':'Destinado'}</span></div>
          <p>{item.description}</p><small>Encontrado em {stamp(item.found_at)} · Por {item.finder_name}</small>
          <small>Local do achado: {item.found_location}</small>
          <small>Proprietário: {item.person_name??'Não identificado'} · Prazo até {stamp(item.expires_at)}</small>
          {item.resolved_at&&<small>Baixa em {stamp(item.resolved_at)}</small>}{item.notes&&<small>{item.notes}</small>}</div>
        {item.status==='retido'&&!readonly&&<div className="custody-actions"><button type="button" disabled={busy} onClick={()=>{void resolve(item,'devolvido');}}>Registrar Devolução ao Proprietário</button><button type="button" disabled={busy||days>0} onClick={()=>{void resolve(item,'destinado');}}>Dar Destinação</button></div>}
      </article>;})}</div>:<EmptyState title="Nenhum item encontrado" description="Altere os filtros ou registre um novo achado."/>}</section></>}
  </>;
}
