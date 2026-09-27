import {useEffect,useState} from 'react';
import {api,op,post} from '../api';
import type {PageProps} from '../App';
import {DataState,EmptyState} from '../ui';
import {SelectField} from '../components/Select';
type Allocation={id:string;person_id:string;name:string;number:string;modality:string;started_at:string|null;ended_at:string|null;due_at:string|null;seasonal:boolean;version:number};
type Transfer={id:number;happened_at:string;name:string;registration:string|null;source_number:string;destination_number:string;reason:string|null};
export function Movements({branchId,readonly,refresh,notice,askConfirm}:PageProps){
  const [items,setItems]=useState<Allocation[]>([]),[transfers,setTransfers]=useState<Transfer[]>([]),[filter,setFilter]=useState('ativas');
  const [loading,setLoading]=useState(true),[error,setError]=useState('');
  async function load(){setLoading(true);setError('');try{const [allocations,history]=await Promise.all([api<Allocation[]>(`/branches/${branchId}/allocations`),api<Transfer[]>(`/branches/${branchId}/transfers`)]);setItems(allocations);setTransfers(history);}
    catch(e){setError(e instanceof Error?e.message:'Confira a conexão e tente novamente.');throw e;}finally{setLoading(false);}}
  useEffect(()=>{load().catch(()=>{});},[branchId]);
  async function release(item:Allocation){if(!await askConfirm(`Registrar devolução de ${item.name} do armário ${item.number}? A ocupação será encerrada.`))return;try{await post(`/branches/${branchId}/allocations/release`,{operationId:op(),allocationId:item.id,expectedVersion:item.version});
      try{await load();refresh();notice(`Devolução do armário ${item.number} registrada para ${item.name}.`);}catch{notice('A devolução foi registrada, mas a lista não foi atualizada. Recarregue antes de agir novamente.');}}
    catch(e){notice(e instanceof Error?e.message:'Não foi possível registrar a devolução.');}}
  const shown=items.filter(x=>filter==='todas'||(filter==='rotativos'?x.modality==='rotativo'&&x.ended_at===null:filter==='ativas'?x.ended_at===null:x.ended_at!==null));
  return <><DataState loading={loading} error={error} onRetry={()=>{load().catch(()=>{});}}/>{!loading&&!error&&<><section className="card"><div className="section-head"><div><span className="eyebrow">Ocupações</span><h2>Movimentações e rotativos</h2><p>Entradas rotativas permanecem ativas até a devolução registrada.</p></div><SelectField label="Exibir" value={filter} onChange={setFilter} options={[{value:'ativas',label:'Ativas'},{value:'rotativos',label:'Rotativos ativos'},{value:'encerradas',label:'Encerradas'},{value:'todas',label:'Todas'}]}/></div>
      {shown.length?<div className="table-wrap movement-table"><table><thead><tr><th>Pessoa</th><th>Armário</th><th>Modalidade</th><th>Entrada</th><th>Previsão</th><th>Saída</th><th>Ação</th></tr></thead><tbody>{shown.map(x=><tr key={x.id}>
        <td data-label="Pessoa">{x.name}</td><td data-label="Armário">{x.number}</td><td data-label="Modalidade">{x.modality==='rotativo'?'Rotativo':'Fixo'}{x.seasonal?' · sazonal':''}</td><td data-label="Entrada">{x.started_at?new Date(x.started_at).toLocaleString('pt-BR'):'Início original desconhecido'}</td><td data-label="Previsão">{x.due_at?new Date(x.due_at).toLocaleDateString('pt-BR'):'—'}</td><td data-label="Saída">{x.ended_at?new Date(x.ended_at).toLocaleString('pt-BR'):'Ativa'}</td><td data-label="Ação">{!readonly&&!x.ended_at&&<button onClick={()=>release(x)}>Registrar devolução</button>}</td>
      </tr>)}</tbody></table></div>:<EmptyState title="Nenhuma movimentação neste filtro" description="Altere o filtro para consultar outros registros."/>}</section>
    <section className="card"><h2>Histórico de trocas de armário</h2><p>Transferências registradas com pessoa, armário anterior, novo armário e motivo.</p>
      <div className="table-wrap history-table"><table><thead><tr><th>Data</th><th>Pessoa</th><th>De</th><th>Para</th><th>Motivo</th></tr></thead>
        <tbody>{transfers.map(item=><tr key={item.id}><td data-label="Data">{new Date(item.happened_at).toLocaleString('pt-BR')}</td><td data-label="Pessoa">{item.name}<small>{item.registration??'Sem matrícula'}</small></td>
          <td data-label="De">Armário {item.source_number}</td><td data-label="Para">Armário {item.destination_number}</td><td data-label="Motivo">{item.reason??'Não informado'}</td></tr>)}</tbody></table>
        {!transfers.length&&<EmptyState title="Nenhuma transferência registrada" description="As trocas de armário desta filial aparecerão aqui."/>}</div></section></>}</>;
}
