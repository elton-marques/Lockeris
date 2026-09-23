import {useEffect,useState} from 'react';
import {api} from '../api';
import type {PageProps} from '../App';
type RecordItem={id:number;kind:string;entity_type:string;entity_id:string|null;details:unknown;happened_at:string};
export function History({branchId,readonly,copy,notice}:PageProps){
  const [records,setRecords]=useState<RecordItem[]>([]);
  useEffect(()=>{if(copy)return;api<RecordItem[]>(`/branches/${branchId}/history`).then(setRecords).catch(e=>notice(e.message));},[branchId,copy]);
  return <section className="card"><div className="section-head"><div><h2>Histórico de eventos</h2><p>Movimentações, cadastros, compartilhamentos e importações.</p></div>{!readonly&&<a className="button" href={`/api/branches/${branchId}/history/export`} download>Exportar CSV</a>}</div>{copy?<p>Histórico completo não é guardado offline.</p>:<div className="table-wrap"><table><thead><tr><th>Data</th><th>Evento</th><th>Registro</th><th>Detalhes</th></tr></thead><tbody>{records.map(x=><tr key={x.id}><td>{new Date(x.happened_at).toLocaleString('pt-BR')}</td><td>{x.kind.replaceAll('_',' ')}</td><td>{x.entity_type} · {x.entity_id?.slice(0,8)??'—'}</td><td><details><summary>Ver</summary><pre>{JSON.stringify(x.details,null,2)}</pre></details></td></tr>)}</tbody></table></div>}</section>;
}
