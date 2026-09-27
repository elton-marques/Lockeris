import {useEffect,useState} from 'react';
import {api} from '../api';
import type {PageProps} from '../App';
import {DataState,EmptyState} from '../ui';

type RecordItem={id:number;kind:string;entity_type:string;details:unknown;happened_at:string};
const events:Record<string,string>={
  filial_criada:'Filial criada',colaboradores_removidos_da_base:'Colaboradores removidos da base ativa',
  pessoa_cadastrada:'Pessoa cadastrada',pessoa_alterada:'Cadastro de pessoa atualizado',
  atuacao_encerrada:'Atuação encerrada',atuacao_reativada:'Atuação reativada',
  armario_criado:'Armário cadastrado',armario_alterado:'Dados do armário atualizados',armario_revisado:'Armário conferido',
  copia_chave_atualizada:'Cópia da chave atualizada',dados_ti_alterados:'Dados oficiais atualizados',
  pessoa_ti_incluida:'Colaborador incluído na base ativa',lote_ti_aplicado:'Base de colaboradores atualizada',
  pendencia_revisada:'Pendência conferida',pendencia_resolvida:'Pendência resolvida',
  excecao_armario:'Dispensa de armário registrada',usuario_criado:'Usuário criado',usuario_alterado:'Acesso atualizado',
  senha_redefinida:'Senha redefinida',dispositivo_autorizado:'Navegador autorizado para consulta',
  dispositivo_revogado:'Autorização de consulta revogada',armarios_importados:'Armários importados',
  compartilhamento_autorizado:'Compartilhamento autorizado',compartilhamento_encerrado:'Compartilhamento encerrado',
  ocupacao_iniciada:'Armário atribuído',ocupacao_encerrada:'Ocupação encerrada',ocupacao_transferida:'Armário transferido',
  previsao_alterada:'Prazo da ocupação atualizado',sazonal_efetivada:'Ocupação mantida sem prazo',
  compartilhamento_renovado:'Prazo de compartilhamento atualizado'
};
const subjects:Record<string,string>={branch:'Filial',membership:'Pessoa',locker:'Armário',import:'Importação',pending:'Pendência',user:'Acesso',device:'Dispositivo legado',allocation:'Ocupação',sharing:'Compartilhamento'};
export const eventLabel=(kind:string)=>events[kind]??'Evento registrado';
const eventTone=(kind:string)=>kind.includes('pendencia')?'warning':kind.includes('encerrada')||kind.includes('removidos')?'neutral':'success';
function summary(details:unknown):string{
  if(!details||typeof details!=='object'||Array.isArray(details))return 'Alteração registrada.';
  const data=details as Record<string,unknown>;
  if(typeof data.lockerNumber==='string')return `Armário ${data.lockerNumber}.`;
  if(typeof data.reason==='string'&&data.reason.trim())return `Motivo: ${data.reason}`;
  if(typeof data.count==='number')return `${data.count} armários.`;
  if(typeof data.counts==='object'&&data.counts!==null){const counts=data.counts as Record<string,unknown>;
    if(typeof counts.current==='number')return `${counts.current} colaboradores na nova base.`;}
  return 'Alteração registrada.';
}
export function History({branchId}:PageProps){
  const [records,setRecords]=useState<RecordItem[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  function load(){setLoading(true);setError('');api<RecordItem[]>(`/branches/${branchId}/history`).then(setRecords).catch(e=>setError(e instanceof Error?e.message:'Confira a conexão e tente novamente.')).finally(()=>setLoading(false));}
  useEffect(()=>{load();},[branchId]);
  return <section className="card"><div className="section-head"><div><span className="eyebrow">Rastreabilidade</span><h2>Histórico de eventos</h2><p>Movimentações, cadastros, conferências e importações.</p></div><a className="button" href={`/api/branches/${branchId}/history/export`} download>Exportar registro CSV</a></div>
    <DataState loading={loading} error={error} onRetry={load}/>
      {!loading&&!error&&(records.length?<ol className="timeline" aria-label="Linha do tempo de eventos">{records.map(item=><li className={`timeline-item timeline-item--${eventTone(item.kind)}`} key={item.id}>
        <span className="timeline-marker" aria-hidden="true"/><div className="timeline-event"><div className="timeline-event-head"><strong>{eventLabel(item.kind)}</strong><time dateTime={item.happened_at}>{new Date(item.happened_at).toLocaleString('pt-BR')}</time></div><div className="timeline-event-meta">{subjects[item.entity_type]??'Operação'}</div><p>{summary(item.details)}</p></div>
      </li>)}</ol>:<EmptyState title="Nenhum evento registrado" description="As alterações desta filial aparecerão aqui depois da primeira operação."/>)}
  </section>;
}
