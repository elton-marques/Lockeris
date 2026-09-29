import {useEffect,useState} from 'react';
import {api,patch} from '../api';
import type {PageProps} from '../App';
import {DataState,EmptyState} from '../ui';

type Item={id:string;locker_number:string;person_name:string|null;description:string;status:'retido'|'devolvido'|'destinado';retained_at:string;expires_at:string;resolved_at:string|null;notes:string|null};
const date=(value:string)=>new Date(value).toLocaleDateString('pt-BR');
const daysLeft=(value:string)=>Math.ceil((new Date(value).getTime()-Date.now())/86400000);

export function RetainedItems({branchId,branchName,readonly,notice,askConfirm}:PageProps){
  const [items,setItems]=useState<Item[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function load(){setLoading(true);setError('');try{setItems(await api<Item[]>(`/branches/${branchId}/retained-items`));}
    catch(e){setError(e instanceof Error?e.message:'Falha ao carregar pertences.');}finally{setLoading(false);}}
  useEffect(()=>{void load();},[branchId]);
  async function resolve(item:Item,status:'devolvido'|'destinado'){
    if(!await askConfirm(status==='devolvido'?`Confirmar devolução dos pertences do armário ${item.locker_number}?`:`Confirmar destinação dos pertences do armário ${item.locker_number}?`))return;
    setBusy(true);
    try{await patch(`/retained-items/${item.id}/status`,{status});await load();notice(status==='devolvido'?'Devolução registrada.':'Destinação registrada.');}
    catch(e){notice(e instanceof Error?e.message:'Não foi possível dar baixa.');}finally{setBusy(false);}
  }
  return <><div className="operational-intro"><div><h1>Pertences Retidos</h1><p>Acompanhe os pertences encontrados nos armários de {branchName} e o prazo de guarda de 30 dias.</p></div><span>{items.filter(item=>item.status==='retido').length} em guarda</span></div>
    <DataState loading={loading} error={error} onRetry={()=>{void load();}}/>
    {!loading&&!error&&<section className="card"><div className="section-head"><div><span className="eyebrow">Achados e perdidos</span><h2>Controle de guarda</h2><p>Registre a baixa ao devolver ou destinar os pertences.</p></div></div>
      {items.length?<div className="custody-list">{items.map(item=>{const days=daysLeft(item.expires_at);return <article className="custody-item" key={item.id}>
        <div><div className="custody-item-title"><strong>Armário № {item.locker_number}</strong><span className={`custody-badge ${item.status==='retido'?(days<=0?'custody-badge--overdue':days<=7?'custody-badge--soon':'custody-badge--open'):''}`}>{item.status==='retido'?(days<=0?`Vencido há ${Math.abs(days)} dia(s)`:`${days} dia(s) restantes`):item.status==='devolvido'?'Devolvido':'Destinado'}</span></div>
          <p>{item.description}</p><small>{item.person_name??'Proprietário não identificado'} · Retido em {date(item.retained_at)} · Prazo até {date(item.expires_at)}</small>
          {item.resolved_at&&<small>Baixa em {date(item.resolved_at)}</small>}{item.notes&&<small>{item.notes}</small>}</div>
        {item.status==='retido'&&!readonly&&<div className="custody-actions"><button type="button" disabled={busy} onClick={()=>{void resolve(item,'devolvido');}}>Devolver ao Dono</button><button type="button" disabled={busy||days>0} onClick={()=>{void resolve(item,'destinado');}}>Dar Destinação</button></div>}
      </article>;})}</div>:<EmptyState title="Nenhum pertence registrado" description="Pertences encontrados na desocupação aparecerão aqui."/>}</section>}
  </>;
}
