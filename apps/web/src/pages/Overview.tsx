import {useEffect,useMemo,useState} from 'react';
import {ArrowLeftRight,ArrowRight,ChevronDown,Grid2X2,KeyRound,ShieldAlert,TriangleAlert,Undo2,UserPlus} from 'lucide-react';
import {api} from '../api';
import type {PageProps} from '../App';
import {DataState,EmptyState,Skeleton} from '../ui';
import {alertLevelLabels,doubleLockerBreakdown,keyControlSummary,occupancyByCategory,occupancyBySector,occupancySummary,openPendingCount,pendingAlertLevel,pendingLockerIds,type InsightLocker,type InsightPending,type LockerPreset} from '../locker-insights';

type Props=PageProps&{onOpenLockers:(preset:LockerPreset)=>void;onNavigate:(page:string)=>void};
type AllocationRow={started_at:string|null;ended_at:string|null};
type TransferRow={happened_at:string};
type Movements={allocations:AllocationRow[];transfers:TransferRow[]};
const periods=[7,30] as const;

export function Overview({branchId,branchName,copy,onOpenLockers,onNavigate}:Props){
  const [lockers,setLockers]=useState<InsightLocker[]>([]);
  const [pending,setPending]=useState<InsightPending[]>([]);
  const [loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  const [movements,setMovements]=useState<Movements|null>(null),[movementsError,setMovementsError]=useState(''),[movementsLoading,setMovementsLoading]=useState(false);
  const [period,setPeriod]=useState<(typeof periods)[number]>(30);

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

  useEffect(()=>{let active=true;
    if(copy){setMovements(null);setMovementsError('');setMovementsLoading(false);return;}
    setMovementsLoading(true);setMovementsError('');
    (async()=>{try{
      const [allocations,transfers]=await Promise.all([
        api<AllocationRow[]>(`/branches/${branchId}/allocations`),
        api<TransferRow[]>(`/branches/${branchId}/transfers`)
      ]);
      if(active)setMovements({allocations,transfers});
    }catch(cause){if(active)setMovementsError(cause instanceof Error?cause.message:'Confira a conexão e tente novamente.');}
    finally{if(active)setMovementsLoading(false);}})();
    return()=>{active=false;};
  },[branchId,copy]);

  const summary=useMemo(()=>occupancySummary(lockers),[lockers]);
  const doubles=useMemo(()=>doubleLockerBreakdown(lockers),[lockers]);
  const keyControl=useMemo(()=>keyControlSummary(lockers),[lockers]);
  const categories=useMemo(()=>occupancyByCategory(lockers),[lockers]);
  const sectors=useMemo(()=>occupancyBySector(lockers),[lockers]);
  const pendingIds=pendingLockerIds(pending);
  const openPendings=openPendingCount(pending);
  const alertLevel=pendingAlertLevel(openPendings);
  const pendingLockers=lockers.filter(item=>pendingIds.has(item.id)||item.migration_status==='inconclusivo').length;
  const movementCounts=useMemo(()=>{
    if(!movements)return null;
    const since=Date.now()-period*86400000;
    const transfers=movements.transfers.filter(row=>new Date(row.happened_at).getTime()>=since).length;
    const started=movements.allocations.filter(row=>row.started_at&&new Date(row.started_at).getTime()>=since).length;
    const ended=movements.allocations.filter(row=>row.ended_at&&new Date(row.ended_at).getTime()>=since).length;
    return {transfers,attributions:Math.max(0,started-transfers),releases:Math.max(0,ended-transfers)};
  },[movements,period]);

  return <div className="overview-page">
    <div className="operational-intro overview-intro"><div><h1>Painel da filial</h1><p>Acompanhe ocupação e pendências de {branchName}.</p></div></div>
    <DataState loading={loading} error={error} onRetry={()=>setRetry(value=>value+1)}/>
    {!loading&&!error&&(lockers.length===0?<EmptyState title="Nenhum armário cadastrado" description="Os indicadores aparecerão quando esta filial tiver armários cadastrados."/>:<>
      <section className="kpi-grid" aria-label="Resumo da filial">
        <section className={`kpi-card kpi-card--alert level-${alertLevel}`} aria-labelledby="kpi-alert-title">
          <div className="kpi-head"><span className="kpi-icon"><ShieldAlert size={18} aria-hidden="true"/></span><h2 className="kpi-title" id="kpi-alert-title">Pendências</h2>
            <span className={`kpi-badge kpi-badge--${alertLevel}`}>{alertLevelLabels[alertLevel]}</span></div>
          <div className="kpi-value-row"><strong className="kpi-value">{openPendings}</strong><span className="kpi-value-label">{openPendings===1?'pendência aberta':'pendências abertas'}</span></div>
          <div className="kpi-card-footer"><button type="button" className="kpi-text-action" onClick={()=>onOpenLockers({status:'pendente'})}>
            Com pendência: {pendingLockers} {pendingLockers===1?'armário':'armários'}
          </button><button type="button" className="kpi-action" onClick={()=>onNavigate('pendencias')}>Ver pendências <ArrowRight size={15} aria-hidden="true"/></button></div>
        </section>

        <button className="kpi-card kpi-card--capacity" type="button" onClick={()=>onOpenLockers({status:'com_vaga'})}
          aria-label={`${summary.available} ${summary.available===1?'vaga disponível':'vagas disponíveis'}. Ver armários com vaga`}>
          <span className="kpi-head"><span className="kpi-icon"><Grid2X2 size={18} aria-hidden="true"/></span><span className="kpi-title">Vagas disponíveis</span></span>
          <span className="kpi-value-row"><strong className="kpi-value">{summary.available}</strong><span className="kpi-value-label">{summary.available===1?'vaga imediata':'vagas imediatas'}</span></span>
          <span className="kpi-card-footer"><span className="kpi-support">{summary.occupied} de {summary.capacity} posições ocupadas · {summary.percent}%</span><span className="kpi-card-arrow" aria-hidden="true"><ArrowRight size={17}/></span></span>
        </button>

        <button className={`kpi-card kpi-card--keys ${keyControl.withoutKey>0||keyControl.unreported>0?'has-issue':'is-clear'}`} type="button" onClick={()=>onOpenLockers(keyControl.withoutKey>0?{key:'nao'}:{})}
          aria-label={`${keyControl.withoutKey} ${keyControl.withoutKey===1?'armário sem cópia da chave':'armários sem cópia da chave'}. ${keyControl.withoutKey>0?'Ver armários sem cópia':'Ver armários'}`}>
          <span className="kpi-head"><span className="kpi-icon"><KeyRound size={18} aria-hidden="true"/></span><span className="kpi-title">Cópia das chaves</span></span>
          <span className="kpi-value-row"><strong className="kpi-value">{keyControl.withoutKey}</strong><span className="kpi-value-label">{keyControl.withoutKey===1?'armário sem cópia':'armários sem cópia'}</span></span>
          <span className="kpi-card-footer"><span className="kpi-support">{keyControl.unreported>0?`${keyControl.unreported} sem informação`:keyControl.withoutKey===0?'Todas as cópias cadastradas':`${keyControl.withKey} com cópia cadastrada`}</span><span className="kpi-card-arrow" aria-hidden="true"><ArrowRight size={17}/></span></span>
        </button>
      </section>

      <section className="insight-panel insight-panel--sectors" aria-labelledby="sector-widget-title">
        <div className="insight-heading"><div><h2 id="sector-widget-title">Ocupação por setor</h2><p>Posições ocupadas por setor. Selecione uma barra para ver os armários.</p></div></div>
        {sectors.length?<div className="insight-scroll"><div className="insight-bars">{sectors.map(item=><div className={item.anomaly?'insight-bar-row anomaly':'insight-bar-row'} key={item.name}>
          <span>{item.anomaly&&<TriangleAlert size={13} aria-hidden="true"/>}{item.name}</span>
          <div className="insight-track"><button style={{width:`${Math.max(8,item.count/Math.max(1,sectors[0].count)*100)}%`}}
            onClick={()=>onOpenLockers({sector:item.anomaly?'__none__':item.name,status:'ocupado'})}
            aria-label={`${item.name}: ${item.count} ${item.count===1?'posição ocupada':'posições ocupadas'}. Ver armários`}/></div>
          <strong>{item.count}</strong></div>)}</div></div>:<p className="insight-empty">Ainda não há ocupações registradas nesta filial.</p>}
      </section>

      <details className="overview-details">
        <summary><span><strong>Mais análises</strong><small>Armários duplos, vínculos e movimentações</small></span><ChevronDown size={18} aria-hidden="true"/></summary>
        <div className="overview-details-content">
          <div className="overview-widgets">
            <section className="insight-panel" aria-labelledby="double-widget-title">
              <div className="insight-heading"><div><h2 id="double-widget-title">Armários duplos</h2><p>{doubles.total} armários · utilização das posições disponíveis</p></div></div>
              <div className="secondary-metric"><strong>{doubles.utilization}%</strong><span>{doubles.filled} de {doubles.positions} posições ocupadas</span></div>
              <div className="secondary-breakdown"><span>{doubles.full} completos</span><span>{doubles.partial} com uma vaga</span><span>{doubles.free} livres</span></div>
              <button type="button" className="insight-link" onClick={()=>onOpenLockers({double:true})}>Ver armários duplos <ArrowRight size={15} aria-hidden="true"/></button>
              <details className="insight-explanation"><summary>Como é calculado</summary><p>Duplos de Transporte Pesado e Conservação/Manutenção com um único ocupante contam como 100% ocupados, conforme a regra de uso individual.</p></details>
            </section>

            <section className="insight-panel" aria-labelledby="category-widget-title">
              <div className="insight-heading"><div><h2 id="category-widget-title">Ocupação por vínculo</h2><p>Distribuição das posições ocupadas</p></div></div>
              <div className="category-bars">{categories.map(item=><div className="category-row" key={item.key}>
                <div className="category-row-head"><span>{item.label}</span><strong>{item.count} <small>{item.percent}%</small></strong></div>
                <div className="insight-track"><span className={`category-fill fill-${item.key}`} style={{width:`${Math.max(item.count?3:0,item.percent)}%`}}/></div>
              </div>)}</div>
              <details className="insight-explanation"><summary>Como é calculado</summary><p>A posição conta pelo vínculo operacional do ocupante: Colaboradores FC, Promotores Fixos e Terceirizados. O setor PROMOTOR(A) entra como Promotor Fixo e empresas externas como Terceirizado; roteiristas sem armário fixo não aparecem aqui.</p></details>
            </section>
          </div>

          <section className="insight-panel insight-panel--movements" aria-labelledby="movement-widget-title">
            <div className="insight-heading"><div><h2 id="movement-widget-title">Movimentações</h2><p>Atribuições, desocupações e trocas do período</p></div>
              <div className="period-toggle" role="group" aria-label="Período das movimentações">
                {periods.map(value=><button key={value} type="button" className={period===value?'selected':''} aria-pressed={period===value} onClick={()=>setPeriod(value)}>{value} dias</button>)}
              </div></div>
            {copy?<p className="insight-empty">A cópia offline guarda apenas armários, pessoas e pendências. Conecte-se para ver as movimentações do período.</p>
              :movementsError?<p className="insight-empty">{movementsError}</p>
              :!movements||movementsLoading?<div className="movement-grid" aria-hidden="true">{Array.from({length:3},(_,index)=><Skeleton key={index} variant="card" label="Carregando movimentação"/>)}</div>
              :<div className="movement-grid">
                <div className="movement-stat"><span className="movement-icon"><UserPlus size={17} aria-hidden="true"/></span><strong>{movementCounts?.attributions??0}</strong><span>Atribuições</span></div>
                <div className="movement-stat"><span className="movement-icon"><Undo2 size={17} aria-hidden="true"/></span><strong>{movementCounts?.releases??0}</strong><span>Desocupações</span></div>
                <div className="movement-stat"><span className="movement-icon"><ArrowLeftRight size={17} aria-hidden="true"/></span><strong>{movementCounts?.transfers??0}</strong><span>Trocas</span></div>
              </div>}
          </section>
          <p className="overview-note">Vagas são posições livres imediatas. A ocupação usa a capacidade física total; os demais indicadores contam armários físicos. Um armário pode aparecer em mais de um indicador.</p>
        </div>
      </details>
    </>)}
  </div>;
}
