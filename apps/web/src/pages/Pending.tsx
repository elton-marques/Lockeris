import {useEffect,useState} from 'react';
import {api,op,post,patch} from '../api';
import type {PageProps} from '../App';

type Item={id:string;version:number;kind:string;subject_id:string;state:string;person_name:string|null;registration:string|null;
  membership_version:number|null;locker_number:string|null;locker_version:number|null;
  allocation_id:string|null;allocation_version:number|null;allocation_locker_number:string|null;
  sharing_version:number|null;sharing_due_at:string|null;seasonal_version:number|null;seasonal_due_at:string|null;
  reason:string|null;resolution:string|null};
const labels:Record<string,string>={ausente_ti:'Saiu da base com armário',sem_armario:'Precisa de armário',atuacao_encerrada:'Atuação encerrada com armário',
  sazonal_vencida:'Alocação sazonal vencida',compartilhamento_vencido:'Compartilhamento vencido',
  migracao_inconclusiva:'Ocupação a conferir',dados_alterados:'Dados cadastrais alterados',identificacao_conflitante:'Identificação conflitante'};
export function Pending({branchId,readonly,copy,refresh,notice}:PageProps){
  const [items,setItems]=useState<Item[]>([]),[filter,setFilter]=useState('aberta');
  async function load(){setItems(copy?copy.pending as Item[]:await api<Item[]>(`/branches/${branchId}/pending`));}
  useEffect(()=>{load().catch(error=>notice(error.message));},[branchId,copy]);
  async function act(callback:()=>Promise<unknown>){try{await callback();await load();refresh();notice('Pendência atualizada.');}catch(error){notice(error instanceof Error?error.message:'Falha');}}
  function release(item:Item){if(!item.allocation_id||!item.allocation_version)return;
    if(!window.confirm(`Confirmar devolução de ${item.person_name} do armário ${item.allocation_locker_number}?`))return;
    act(()=>post(`/branches/${branchId}/allocations/release`,{operationId:op(),allocationId:item.allocation_id,expectedVersion:item.allocation_version}));}
  function renew(item:Item){const date=window.prompt('Nova previsão (AAAA-MM-DD):');if(!date)return;
    const reason=window.prompt('Motivo da prorrogação:');if(!reason)return;
    const dueAt=new Date(`${date}T12:00:00`).toISOString();
    act(()=>post(`/branches/${branchId}/${item.kind==='sazonal_vencida'?`allocations/${item.subject_id}/due`:`sharings/${item.subject_id}/renew`}`,
      {operationId:op(),expectedVersion:item.kind==='sazonal_vencida'?item.seasonal_version:item.sharing_version,dueAt,reason}));}
  function resolve(item:Item){const resolution=window.prompt('Descreva a conferência e a decisão:');if(!resolution)return;
    act(()=>post(`/branches/${branchId}/pending/${item.id}/resolve`,{operationId:op(),expectedVersion:item.version,resolution}));}
  function exception(item:Item){const reason=window.prompt(`Por que ${item.person_name} não precisa de armário?`);if(!reason)return;
    act(()=>post(`/branches/${branchId}/people/${item.subject_id}/exception`,{operationId:op(),expectedVersion:item.membership_version,reason}));}
  function effective(item:Item){const reason=window.prompt('Motivo da efetivação:');if(!reason)return;
    act(()=>post(`/branches/${branchId}/allocations/${item.subject_id}/effective`,{operationId:op(),expectedVersion:item.seasonal_version,reason}));}
  function migration(item:Item){if(!item.locker_version||!window.confirm(`Armário ${item.locker_number}: identificação e ocupação conferidas?`))return;
    act(()=>patch(`/branches/${branchId}/lockers/${item.subject_id}`,{operationId:op(),expectedVersion:item.locker_version,migrationStatus:'conferido'}));}
  const shown=items.filter(item=>filter==='todas'||item.state===filter);
  return <section className="card"><div className="section-head"><div><h2>Conferência</h2><p>Armários de pessoas que saíram da base continuam ocupados até confirmação da devolução.</p></div>
    <label>Exibir<select value={filter} onChange={event=>setFilter(event.target.value)}><option value="aberta">Abertas</option><option value="resolvida">Resolvidas</option><option value="todas">Todas</option></select></label></div>
    <div className="pending-list">{shown.length===0?<p className="empty">Nenhuma pendência neste filtro.</p>:shown.map(item=><article className="pending-item" key={item.id}>
      <div><span className="badge alert">{labels[item.kind]??item.kind}</span><h3>{item.person_name??(item.locker_number?`Armário ${item.locker_number}`:`Registro ${item.subject_id.slice(0,8)}`)}</h3>
        <p>{item.registration?`Matrícula ${item.registration} · `:''}{item.allocation_locker_number?`Armário ${item.allocation_locker_number}`:item.reason??'Aguardando conferência'}</p>
        {item.state==='resolvida'&&<small>Resolvida: {item.resolution}</small>}</div>
      {!readonly&&item.state==='aberta'&&<div className="row-actions">
        {['ausente_ti','atuacao_encerrada'].includes(item.kind)&&item.allocation_id&&<button onClick={()=>release(item)}>Confirmar devolução</button>}
        {['sazonal_vencida','compartilhamento_vencido'].includes(item.kind)&&<button onClick={()=>renew(item)}>Prorrogar</button>}
        {item.kind==='sazonal_vencida'&&<button onClick={()=>effective(item)}>Efetivar</button>}
        {item.kind==='sem_armario'&&<button onClick={()=>exception(item)}>Marcar exceção</button>}
        {item.kind==='migracao_inconclusiva'&&<button onClick={()=>migration(item)}>Confirmar vistoria</button>}
        {['dados_alterados','identificacao_conflitante'].includes(item.kind)&&<button onClick={()=>resolve(item)}>Registrar revisão</button>}
      </div>}</article>)}</div>
  </section>;
}
