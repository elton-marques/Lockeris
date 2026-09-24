import {useEffect,useMemo,useState} from 'react';
import {Activity,ArrowRight,CircleAlert,Grid2X2,KeyRound,LockKeyhole} from 'lucide-react';
import {api} from '../api';
import type {PageProps} from '../App';
import {DataState,EmptyState} from '../ui';
import {availablePositions,occupiedPositions,openLockerPending,pendingKindLabels,pendingLockerIds,requiresReview,type InsightLocker,type InsightPending,type LockerPreset} from '../locker-insights';

type Props=PageProps&{onOpenLockers:(preset:LockerPreset)=>void};

export function Overview({branchId,branchName,copy,onOpenLockers}:Props){
  const [lockers,setLockers]=useState<InsightLocker[]>([]);
  const [pending,setPending]=useState<InsightPending[]>([]);
  const [loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0);

  useEffect(()=>{let active=true;setLoading(true);setError('');
    (async()=>{try{
      if(copy){if(active){setLockers(copy.lockers as InsightLocker[]);setPending(copy.pending as InsightPending[]);}return;}
      const [items,issues]=await Promise.all([
        api<InsightLocker[]>(`/branches/${branchId}/lockers`),
        api<InsightPending[]>(`/branches/${branchId}/pending`)
      ]);
      if(active){setLockers(items);setPending(issues);}
    }catch(cause){if(active)setError(cause instanceof Error?cause.message:'Confira a conexão e tente novamente.');}
    finally{if(active)setLoading(false);}})();
    return()=>{active=false;};
  },[branchId,copy,retry]);

  const summary=useMemo(()=>{
    const capacity=lockers.reduce((sum,item)=>sum+item.capacity,0);
    const occupied=lockers.reduce((sum,item)=>sum+occupiedPositions(item),0);
    const pendingIds=pendingLockerIds(pending);
    return {capacity,occupied,available:lockers.reduce((sum,item)=>sum+availablePositions(item),0),
      physical:lockers.length,blocked:lockers.filter(requiresReview).length,
      pending:lockers.filter(item=>pendingIds.has(item.id)||item.migration_status==='inconclusivo').length,
      noKey:lockers.filter(item=>item.key_copy_available===false).length};
  },[lockers,pending]);
  const sectors=useMemo(()=>{
    const counts=new Map<string,number>();
    for(const locker of lockers){
      if(locker.sector_occupant){counts.set(locker.sector_occupant,(counts.get(locker.sector_occupant)??0)+locker.capacity);continue;}
      for(const person of locker.occupants){const sector=person.department?.trim()||'Sem setor';counts.set(sector,(counts.get(sector)??0)+1);}
    }
    return [...counts].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'pt-BR'));
  },[lockers]);
  const reasons=useMemo(()=>{
    const counts=new Map<string,number>();
    for(const item of openLockerPending(pending))counts.set(item.kind,(counts.get(item.kind)??0)+1);
    return [...counts].map(([kind,count])=>({kind,label:pendingKindLabels[kind]??'Conferência necessária',count}))
      .sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label,'pt-BR'));
  },[pending]);
  const maxSector=Math.max(1,...sectors.map(item=>item.count));

  return <div className="overview-page">
    <div className="operational-intro"><div><h1>Painel da filial</h1><p>Ocupação, vagas disponíveis e pendências dos armários de {branchName}.</p></div></div>
    <DataState loading={loading} error={error} onRetry={()=>setRetry(value=>value+1)}/>
    {!loading&&!error&&(lockers.length===0?<EmptyState title="Nenhum armário cadastrado" description="Os indicadores aparecerão quando esta filial tiver armários cadastrados."/>:<>
      <div className="overview-top">
        <button className="availability-feature" onClick={()=>onOpenLockers({status:'com_vaga'})} aria-label={`${summary.available} ${summary.available===1?'vaga disponível':'vagas disponíveis'}. Ver armários com vaga`}>
          <span className="feature-header"><span className="feature-icon"><Grid2X2 size={19} aria-hidden="true"/></span><span className="feature-link">Ver armários <ArrowRight size={16} aria-hidden="true"/></span></span>
          <span className="feature-copy"><span>Vagas disponíveis</span><strong>{summary.available}</strong><small>de {summary.capacity} posições em {summary.physical} armários físicos</small></span>
          <span className="locker-art" aria-hidden="true">{Array.from({length:12},(_,index)=><i key={index} className={index%4===2?'art-free':''}/>)}</span>
          <span className="feature-foot">Posições livres em armários disponíveis e conferidos</span>
        </button>
        <div className="overview-metrics">
          <Metric icon={<Activity size={19}/>} label="Ocupação" value={`${summary.capacity?Math.round(summary.occupied/summary.capacity*100):0}%`} detail={`${summary.occupied} de ${summary.capacity} posições ocupadas`} onClick={()=>onOpenLockers({status:'ocupado'})}/>
          <Metric icon={<LockKeyhole size={19}/>} label="Bloqueios / revisão" value={summary.blocked} detail={`de ${summary.physical} armários físicos`} onClick={()=>onOpenLockers({status:'indisponivel'})}/>
          <Metric icon={<CircleAlert size={19}/>} label="Com pendência" value={summary.pending} detail={`de ${summary.physical} armários físicos`} onClick={()=>onOpenLockers({status:'pendente'})}/>
          <Metric icon={<KeyRound size={19}/>} label="Sem cópia da chave" value={summary.noKey} detail={`de ${summary.physical} armários físicos`} onClick={()=>onOpenLockers({key:'nao'})}/>
        </div>
      </div>
      <div className="overview-bottom">
        <section className="insight-panel"><div className="insight-heading"><div><h2>Ocupação por setor</h2><p>Posições ocupadas nesta filial</p></div><span>{branchName}</span></div>
          {sectors.length?<div className="insight-bars">{sectors.map(item=><div className="insight-bar-row" key={item.name}><span>{item.name}</span><div className="insight-track"><button style={{width:`${Math.max(8,item.count/maxSector*100)}%`}} onClick={()=>onOpenLockers({sector:item.name==='Sem setor'?'__none__':item.name,status:'ocupado'})} aria-label={`${item.name}: ${item.count} ${item.count===1?'posição ocupada':'posições ocupadas'}. Ver armários`}/></div><strong>{item.count}</strong></div>)}</div>:<p className="insight-empty">Ainda não há ocupações registradas nesta filial.</p>}
          <p className="insight-note">Cada posição ocupada é atribuída ao setor do ocupante. Clique em uma barra para ver os registros.</p>
        </section>
        <section className="insight-panel"><div className="insight-heading"><div><h2>Pendências por motivo</h2><p>Pendências abertas vinculadas a armários</p></div></div>
          {reasons.length?<div className="reason-list">{reasons.map(item=><button key={item.kind} onClick={()=>onOpenLockers({status:'pendente',pendingKind:item.kind})}><span>{item.label}</span><strong>{item.count}<ArrowRight size={15} aria-hidden="true"/></strong></button>)}</div>:<p className="insight-empty">Nenhuma pendência vinculada a armários nesta filial.</p>}
          {reasons.length>0&&<button className="insight-link" onClick={()=>onOpenLockers({status:'pendente'})}>Ver armários com pendência <ArrowRight size={16} aria-hidden="true"/></button>}
        </section>
      </div>
      <p className="overview-note">Vagas são posições livres, ocupação usa a capacidade física total e os demais indicadores contam armários físicos. Um armário pode aparecer em mais de um indicador.</p>
    </>)}
  </div>;
}

function Metric({icon,label,value,detail,onClick}:{icon:React.ReactNode;label:string;value:string|number;detail:string;onClick:()=>void}){
  return <button className="insight-metric" onClick={onClick}><span className="metric-head"><span>{icon}</span><ArrowRight size={16} aria-hidden="true"/></span><span className="metric-label">{label}</span><strong>{value}</strong><small>{detail}</small></button>;
}
