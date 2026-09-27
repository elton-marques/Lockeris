import {useEffect,useState} from 'react';
import {api} from '../api';
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
  senha_redefinida:'Senha redefinida',dispositivo_autorizado:'Navegador autorizado para consulta',
  dispositivo_revogado:'Autorização de consulta revogada',armarios_importados:'Armários importados',
  compartilhamento_autorizado:'Compartilhamento autorizado',compartilhamento_encerrado:'Compartilhamento encerrado',
  ocupacao_iniciada:'Armário atribuído',ocupacao_encerrada:'Ocupação encerrada',ocupacao_transferida:'Armário transferido',
  previsao_alterada:'Prazo da ocupação atualizado',sazonal_efetivada:'Ocupação mantida sem prazo',
  compartilhamento_renovado:'Prazo de compartilhamento atualizado',
  ocupacao_provisoria_reconhecida:'Ocupação provisória reconhecida',
  terceirizado_sem_matricula_reconhecido:'Terceirizado sem matrícula reconhecido',
  promotor_roteirista_retirado:'Promotor roteirista retirado',ocupante_associado_por_nome:'Ocupante associado por nome',
  pendencia_auto_reconciliada:'Matrícula reconciliada automaticamente'
};
const subjects:Record<string,string>={branch:'Filial',membership:'Pessoa',locker:'Armário',import:'Importação',pending:'Pendência',user:'Acesso',device:'Dispositivo legado',allocation:'Ocupação',sharing:'Compartilhamento'};
export const eventLabel=(kind:string)=>events[kind]??'Evento registrado';
const eventTone=(kind:string)=>kind.includes('pendencia')?'warning':kind.includes('encerrada')||kind.includes('removidos')?'neutral':'success';
function involved(item:RecordItem):string|null{
  if(item.person_name)return item.person_registration?`${item.person_name} (Matrícula: ${item.person_registration})`:item.person_name;
  if(item.sector_name)return `Setor: ${item.sector_name}`;
  return null;
}
function action(item:RecordItem):string{
  const description=(item.description??'').trim();
  return description||eventLabel(item.kind);
}
function summary(item:RecordItem):string|null{
  const parts:string[]=[];
  if(item.locker_number)parts.push(`Armário #${item.locker_number}`);
  const subject=involved(item);
  if(subject)parts.push(subject);
  if(!parts.length)return null;
  return [...parts,action(item)].join(' · ');
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
export function History({branchId}:PageProps){
  const [records,setRecords]=useState<RecordItem[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  function load(){setLoading(true);setError('');api<RecordItem[]>(`/branches/${branchId}/history`).then(setRecords).catch(e=>setError(e instanceof Error?e.message:'Confira a conexão e tente novamente.')).finally(()=>setLoading(false));}
  useEffect(()=>{load();},[branchId]);
  return <section className="card"><div className="section-head"><div><span className="eyebrow">Rastreabilidade</span><h2>Histórico de eventos</h2><p>Movimentações, cadastros, conferências e importações.</p></div><a className="button" href={`/api/branches/${branchId}/history/export`} download>Exportar registro CSV</a></div>
    <DataState loading={loading} error={error} onRetry={load}/>
      {!loading&&!error&&(records.length?<ol className="timeline" aria-label="Linha do tempo de eventos">{records.map(item=>{
        const headline=summary(item),extra=detail(item);
        return <li className={`timeline-item timeline-item--${eventTone(item.kind)}`} key={item.id}>
        <span className="timeline-marker" aria-hidden="true"/><div className="timeline-event">
          <div className="timeline-event-head"><span className="timeline-event-kind">{eventLabel(item.kind)}</span><time dateTime={item.happened_at}>{new Date(item.happened_at).toLocaleString('pt-BR')}</time></div>
          <div className="timeline-event-meta"><span>{subjects[item.entity_type]??'Operação'}</span></div>
          {headline&&<p>{headline}</p>}{extra&&<p className="timeline-event-detail">{extra}</p>}
        </div>
      </li>;})}</ol>:<EmptyState title="Nenhum evento registrado" description="As alterações desta filial aparecerão aqui depois da primeira operação."/>)}
  </section>;
}
