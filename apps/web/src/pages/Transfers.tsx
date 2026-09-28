import {useEffect,useState} from 'react';
import {api} from '../api';
import type {PageProps} from '../App';
import {DataState,EmptyState} from '../ui';
import {SelectField} from '../components/Select';
type Allocation={id:string;name:string;sector:string|null;number:string;started_at:string|null;ended_at:string|null;version:number};
type Transfer={id:number;happened_at:string;name:string;registration:string|null;source_number:string;destination_number:string;reason:string|null};
type Filter='ativas'|'encerradas'|'todas';
const stamp=(value:string|null)=>value?new Date(value).toLocaleString('pt-BR'):'-';
export function Transfers({branchId}:PageProps){
  const [items,setItems]=useState<Allocation[]>([]),[transfers,setTransfers]=useState<Transfer[]>([]),[filter,setFilter]=useState<Filter>('ativas');
  const [loading,setLoading]=useState(true),[error,setError]=useState('');
  async function load(){setLoading(true);setError('');try{const [allocations,history]=await Promise.all([api<Allocation[]>(`/branches/${branchId}/allocations`),api<Transfer[]>(`/branches/${branchId}/transfers`)]);setItems(allocations);setTransfers(history);}
    catch(e){setError(e instanceof Error?e.message:'Confira a conexão e tente novamente.');throw e;}finally{setLoading(false);}}
  useEffect(()=>{load().catch(()=>{});},[branchId]);
  const shown=items.filter(x=>filter==='todas'||(filter==='ativas'?x.ended_at===null:x.ended_at!==null));
  return <><DataState loading={loading} error={error} onRetry={()=>{load().catch(()=>{});}}/>{!loading&&!error&&<><section className="card"><div className="section-head"><div><span className="eyebrow">Ocupações</span><h2>Histórico de Ocupações e Transferências</h2><p>Acompanhe as ocupações registradas e as trocas de armário da filial.</p></div><SelectField label="Exibir" value={filter} onChange={value=>setFilter(value as Filter)} options={[{value:'ativas',label:'Ativas'},{value:'encerradas',label:'Desocupadas'},{value:'todas',label:'Todas'}]}/></div>
      {shown.length?<div className="table-wrap movement-table"><table><thead><tr><th>PESSOA / SETOR</th><th>ARMÁRIO</th><th>ENTRADA</th><th>SITUAÇÃO</th></tr></thead><tbody>{shown.map(x=><tr key={x.id}>
        <td data-label="Pessoa / Setor"><strong>{x.name}</strong>{x.sector&&<small>{x.sector}</small>}</td>
        <td data-label="Armário">№ {x.number}</td>
        <td data-label="Entrada">{stamp(x.started_at)}</td>
        <td data-label="Situação"><span className={`status-badge ${x.ended_at?'status-badge--closed':'status-badge--active'}`}>{x.ended_at?'Desocupada':'Ativa'}</span></td>
      </tr>)}</tbody></table></div>:<EmptyState title="Nenhuma ocupação neste filtro" description="Altere o filtro para consultar outros registros."/>}</section>
    <section className="card"><h2>Histórico de trocas de armário</h2><p>Transferências registradas com pessoa, armário anterior, novo armário e motivo.</p>
      <div className="table-wrap history-table"><table><thead><tr><th>DATA</th><th>PESSOA</th><th>DE</th><th>PARA</th><th>MOTIVO</th></tr></thead>
        <tbody>{transfers.map(item=><tr key={item.id}><td data-label="Data">{stamp(item.happened_at)}</td><td data-label="Pessoa"><strong>{item.name}</strong><small>{item.registration??'Sem matrícula'}</small></td>
          <td data-label="De">Armário {item.source_number}</td><td data-label="Para">Armário {item.destination_number}</td><td data-label="Motivo">{item.reason??'-'}</td></tr>)}</tbody></table>
        {!transfers.length&&<EmptyState title="Nenhuma transferência registrada" description="As trocas de armário desta filial aparecerão aqui."/>}</div></section></>}</>;
}
