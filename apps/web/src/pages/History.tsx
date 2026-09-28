import {useEffect,useState} from 'react';
import {api,del,op} from '../api';
import type {PageProps} from '../App';
import {DataState,EmptyState} from '../ui';

type RecordItem={id:number;kind:string;entity_type:string;details:unknown;happened_at:string;
  locker_number:string|null;person_name:string|null;person_registration:string|null;sector_name:string|null;description:string|null};
const events:Record<string,string>={
  filial_criada:'Filial criada',colaboradores_removidos_da_base:'Colaboradores removidos da base ativa',
  pessoa_cadastrada:'Pessoa cadastrada',pessoa_alterada:'Cadastro de pessoa atualizado',
  atuacao_encerrada:'Atuação encerrada',atuacao_reativada:'Atuação reativada',
  armario_criado:'Armário cadastrado',armario_alterado:'Dados do armário atualizados',armario_revisado:'Armário conferido',
  copia_chave_atualizada:'Cópia da chave atualizada',dados_ti_alterados:'Dados oficiais atualizados',
  pessoa_ti_incluida:'Colaborador incluído na base ativa',lote_ti_aplicado:'Base de colaboradores atualizada',
  pendencia_revisada:'Pendência conferida',pendencia_resolvida:'Pendência resolvida',
  excecao_armario:'Dispensa de armário registrada',usuario_criado:'Usuário criado',usuario_alterado:'Acesso atualizado',
  usuario_excluido:'Usuário excluído',
  senha_redefinida:'Senha redefinida',dispositivo_autorizado:'Navegador autorizado para consulta',
  dispositivo_revogado:'Autorização de consulta revogada',armarios_importados:'Armários importados',
  compartilhamento_autorizado:'Compartilhamento autorizado',compartilhamento_encerrado:'Compartilhamento encerrado',
  ocupacao_iniciada:'Armário atribuído',ocupacao_encerrada:'Ocupação encerrada',ocupacao_transferida:'Armário transferido',
  previsao_alterada:'Prazo da ocupação atualizado',sazonal_efetivada:'Ocupação mantida sem prazo',
  compartilhamento_renovado:'Prazo de compartilhamento atualizado',
  ocupacao_provisoria_reconhecida:'Ocupação provisória reconhecida',
  terceirizado_sem_matricula_reconhecido:'Terceirizado sem matrícula reconhecido',
  promotor_roteirista_retirado:'Promotor roteirista retirado',ocupante_associado_por_nome:'Ocupante associado por nome',
  pendencia_auto_reconciliada:'Matrícula reconciliada automaticamente',
  historico_limpo:'Histórico legado limpo'
};
const subjects:Record<string,string>={branch:'Filial',membership:'Pessoa',locker:'Armário',import:'Importação',pending:'Pendência',user:'Acesso',device:'Dispositivo legado',allocation:'Ocupação',sharing:'Compartilhamento'};
export const eventLabel=(kind:string)=>events[kind]??'Evento registrado';
const eventTone=(kind:string)=>kind.includes('pendencia')?'warning':kind.includes('encerrada')||kind.includes('removidos')?'neutral':'success';
function involved(item:RecordItem):string|null{
  if(item.person_name)return item.person_registration?`${item.person_name} (Matrícula: ${item.person_registration})`:item.person_name;
  if(item.sector_name)return `Setor: ${item.sector_name}`;
  return null;
}
function descriptionOf(item:RecordItem):string{
  return (item.description??'').trim();
}
function uniqueDescription(item:RecordItem):string|null{
  const description=descriptionOf(item);
  return description&&description!==eventLabel(item.kind)?description:null;
}
function hasContext(item:RecordItem):boolean{
  return Boolean(item.locker_number||involved(item));
}
function summary(item:RecordItem):string{
  const parts:string[]=[];
  if(item.locker_number)parts.push(`Armário #${item.locker_number}`);
  const subject=involved(item);
  if(subject)parts.push(subject);
  if(parts.length)return parts.join(' · ');
  return uniqueDescription(item)??'Ajuste de registro de ocupação';
}
function supporting(item:RecordItem):string|null{
  const extra=detail(item);
  return hasContext(item)?uniqueDescription(item)??extra:extra;
}
function detail(item:RecordItem):string|null{
  const raw=item.details;
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  const data=raw as Record<string,unknown>;
  if(typeof data.resolution==='string'&&data.resolution.trim())return `Resolvido com: ${data.resolution}`;
  if(typeof data.reason==='string'&&data.reason.trim())return `Motivo: ${data.reason}`;
  if(typeof data.count==='number')return `${data.count} ${item.kind==='armarios_importados'?'armários importados':item.kind==='colaboradores_removidos_da_base'?'colaboradores removidos da base ativa':'registros'}.`;
  const counts=data.counts as Record<string,unknown>|undefined;
  if(counts&&typeof counts==='object'&&typeof counts.current==='number')return `${counts.current} colaboradores na nova base.`;
  if(!item.locker_number&&typeof data.lockerNumber==='string')return `Armário #${data.lockerNumber}`;
  if(!item.person_name&&typeof data.officialName==='string'&&data.officialName.trim())return `Ocupante: ${data.officialName}`;
  return null;
}
export function History({branchId,notice,askConfirm}:PageProps){
  const [records,setRecords]=useState<RecordItem[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[clearing,setClearing]=useState(false);
  function load(){setLoading(true);setError('');return api<RecordItem[]>(`/branches/${branchId}/history`).then(setRecords).catch(e=>setError(e instanceof Error?e.message:'Confira a conexão e tente novamente.')).finally(()=>setLoading(false));}
  useEffect(()=>{load();},[branchId]);
  async function clearLegacy(){
    if(!await askConfirm('Deseja remover os registros de histórico legados/incompletos? Esta ação não afetará os logs operacionais recentes.'))return;
    setClearing(true);
    try{
      const result=await del<{removed:number}>(`/branches/${branchId}/history/clear`,{operationId:op()});
      await load();
      notice(result.removed?`${result.removed} registro(s) legado(s) removido(s) do histórico.`:'Nenhum registro legado foi encontrado para remoção.');
    }catch(e){notice(e instanceof Error?e.message:'Não foi possível limpar o histórico antigo.');}
    finally{setClearing(false);}
  }
  return <section className="card"><div className="section-head"><div><span className="eyebrow">Rastreabilidade</span><h2>Histórico de eventos</h2><p>Movimentações, cadastros, conferências e importações.</p></div>
    <div className="section-head-actions"><button type="button" onClick={clearLegacy} disabled={clearing||loading}>{clearing?'Limpando…':'Limpar históricos antigos'}</button>
      <a className="button" href={`/api/branches/${branchId}/history/export`} download>Exportar registro CSV</a></div></div>
    <DataState loading={loading} error={error} onRetry={load}/>
      {!loading&&!error&&(records.length?<ol className="timeline" aria-label="Linha do tempo de eventos">{records.map(item=>{
        const headline=summary(item),note=supporting(item);
        return <li className={`timeline-item timeline-item--${eventTone(item.kind)}`} key={item.id}>
        <span className="timeline-marker" aria-hidden="true"/><div className="timeline-event">
          <div className="timeline-event-head"><span className="timeline-event-kind">{eventLabel(item.kind)}</span><time dateTime={item.happened_at}>{new Date(item.happened_at).toLocaleString('pt-BR')}</time></div>
          <div className="timeline-event-meta"><span>{subjects[item.entity_type]??'Operação'}</span></div>
          <p className="timeline-event-title">{headline}</p>{note&&<p className="timeline-event-detail">{note}</p>}
        </div>
      </li>;})}</ol>:<EmptyState title="Nenhum evento registrado" description="As alterações desta filial aparecerão aqui depois da primeira operação."/>)}
  </section>;
}
