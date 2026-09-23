import {useEffect,useState} from 'react';
import {api,op,post} from '../api';
import type {PageProps} from '../App';
type Allocation={id:string;person_id:string;name:string;number:string;modality:string;started_at:string|null;ended_at:string|null;due_at:string|null;seasonal:boolean;version:number};
type Transfer={id:number;happened_at:string;name:string;registration:string|null;source_number:string;destination_number:string;reason:string|null};
export function Movements({branchId,readonly,copy,refresh,notice}:PageProps){
  const [items,setItems]=useState<Allocation[]>([]),[transfers,setTransfers]=useState<Transfer[]>([]),[filter,setFilter]=useState('ativas');
  async function load(){if(!copy){const [allocations,history]=await Promise.all([api<Allocation[]>(`/branches/${branchId}/allocations`),api<Transfer[]>(`/branches/${branchId}/transfers`)]);setItems(allocations);setTransfers(history);}}
  useEffect(()=>{load().catch(e=>notice(e.message));},[branchId,copy]);
  async function release(item:Allocation){if(!window.confirm(`Registrar devolução de ${item.name} do armário ${item.number}?`))return;try{await post(`/branches/${branchId}/allocations/release`,{operationId:op(),allocationId:item.id,expectedVersion:item.version});await load();refresh();notice('Devolução registrada.');}catch(e){notice(e instanceof Error?e.message:'Falha');}}
  const shown=items.filter(x=>filter==='todas'||(filter==='rotativos'?x.modality==='rotativo'&&x.ended_at===null:filter==='ativas'?x.ended_at===null:x.ended_at!==null));
  return <><section className="card"><div className="section-head"><div><h2>Movimentações e rotativos</h2><p>Entradas rotativas permanecem ativas até devolução registrada.</p></div><label>Exibir<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="ativas">Ativas</option><option value="rotativos">Rotativos ativos</option><option value="encerradas">Encerradas</option><option value="todas">Todas</option></select></label></div>{copy?<p>Movimentações detalhadas não ficam disponíveis offline. Consulte os ocupantes no painel.</p>:<div className="table-wrap"><table><thead><tr><th>Pessoa</th><th>Armário</th><th>Modalidade</th><th>Entrada</th><th>Previsão</th><th>Saída</th><th>Ação</th></tr></thead><tbody>{shown.map(x=><tr key={x.id}><td>{x.name}</td><td>{x.number}</td><td>{x.modality==='rotativo'?'Rotativo':'Fixo'}{x.seasonal?' · sazonal':''}</td><td>{x.started_at?new Date(x.started_at).toLocaleString('pt-BR'):'Início original desconhecido'}</td><td>{x.due_at?new Date(x.due_at).toLocaleDateString('pt-BR'):'—'}</td><td>{x.ended_at?new Date(x.ended_at).toLocaleString('pt-BR'):'Ativa'}</td><td>{!readonly&&!x.ended_at&&<button onClick={()=>release(x)}>Registrar devolução</button>}</td></tr>)}</tbody></table></div>}</section>
    {!copy&&<section className="card"><h2>Histórico de trocas de armário</h2><p>Transferências registradas com pessoa, armário anterior, novo armário e motivo.</p>
      <div className="table-wrap"><table><thead><tr><th>Data</th><th>Pessoa</th><th>De</th><th>Para</th><th>Motivo</th></tr></thead>
        <tbody>{transfers.map(item=><tr key={item.id}><td>{new Date(item.happened_at).toLocaleString('pt-BR')}</td><td>{item.name}<small>{item.registration??'Sem matrícula'}</small></td>
          <td>Armário {item.source_number}</td><td>Armário {item.destination_number}</td><td>{item.reason??'Não informado'}</td></tr>)}</tbody></table>
        {!transfers.length&&<p>Nenhuma troca registrada.</p>}</div></section>}</>;
}
