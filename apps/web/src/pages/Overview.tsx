import {useEffect,useMemo,useState} from 'react';
import {ArrowLeftRight,ArrowRight,Copy,Grid2X2,KeyRound,ShieldAlert,TriangleAlert,Undo2,UserPlus,UserX} from 'lucide-react';
import {api} from '../api';
import type {PageProps,PeoplePreset} from '../App';
import {DataState,EmptyState,Skeleton} from '../ui';
import {categoryShares,doubleLockerBreakdown,keyControlSummary,occupancyBySector,occupancySummary,openPendingCount,pendingAlertLevel,type CategoryLinks,type InsightLocker,type InsightPending,type LockerPreset} from '../locker-insights';

type Props=PageProps&{onOpenLockers:(preset:LockerPreset)=>void;onNavigate:(page:string,preset?:PeoplePreset)=>void};
type AllocationRow={started_at:string|null;ended_at:string|null};
type TransferRow={happened_at:string};
type Movements={allocations:AllocationRow[];transfers:TransferRow[]};
type DashboardStats={links:CategoryLinks;people:{total:string};withoutLocker:{total:number}};
const periods=[7,30] as const;

export function Overview({branchId,branchName,onOpenLockers,onNavigate}:Props){
  const [lockers,setLockers]=useState<InsightLocker[]>([]);
  const [pending,setPending]=useState<InsightPending[]>([]);
  const [stats,setStats]=useState<DashboardStats|null>(null);
  const [loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  const [movements,setMovements]=useState<Movements|null>(null),[movementsError,setMovementsError]=useState(''),[movementsLoading,setMovementsLoading]=useState(false);
  const [period,setPeriod]=useState<(typeof periods)[number]>(30);

  useEffect(()=>{let active=true;setLoading(true);setError('');
    (async()=>{try{
      const [items,issues,summary]=await Promise.all([
        api<InsightLocker[]>(`/branches/${branchId}/lockers`),
        api<InsightPending[]>(`/branches/${branchId}/pending`),
        api<DashboardStats>(`/branches/${branchId}/dashboard`)
      ]);
      if(active){setLockers(items);setPending(issues);setStats(summary);}
    }catch(cause){if(active)setError(cause instanceof Error?cause.message:'Confira a conexão e tente novamente.');}
    finally{if(active)setLoading(false);}})();
    return()=>{active=false;};
  },[branchId,retry]);

  useEffect(()=>{let active=true;
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
  },[branchId]);

  const summary=useMemo(()=>occupancySummary(lockers),[lockers]);
  const doubles=useMemo(()=>doubleLockerBreakdown(lockers),[lockers]);
  const keyControl=useMemo(()=>keyControlSummary(lockers),[lockers]);
  const categories=useMemo(()=>stats?categoryShares(stats.links):[],[stats]);
  const sectors=useMemo(()=>occupancyBySector(lockers),[lockers]);
  const openPendings=openPendingCount(pending);
  const alertLevel=pendingAlertLevel(openPendings);
  const withoutLocker=stats?.withoutLocker.total??0;
  const movementCounts=useMemo(()=>{
    if(!movements)return null;
    const since=Date.now()-period*86400000;
    const transfers=movements.transfers.filter(row=>new Date(row.happened_at).getTime()>=since).length;
    const started=movements.allocations.filter(row=>row.started_at&&new Date(row.started_at).getTime()>=since).length;
    const ended=movements.allocations.filter(row=>row.ended_at&&new Date(row.ended_at).getTime()>=since).length;
    return {transfers,attributions:Math.max(0,started-transfers),releases:Math.max(0,ended-transfers)};
  },[movements,period]);

  return <div className="overview-page">
    <div className="operational-intro"><div><h1>Painel da filial</h1><p>Centro de comando de prevenção de perdas e gestão de armários de {branchName}.</p></div><span>{lockers.length} armários físicos</span></div>
    <DataState loading={loading} error={error} onRetry={()=>setRetry(value=>value+1)}/>
    {!loading&&!error&&(lockers.length===0?<EmptyState title="Nenhum armário cadastrado" description="Os indicadores aparecerão quando esta filial tiver armários cadastrados."/>:<>
      <section className="kpi-grid" aria-label="Indicadores executivos">
        <section className="kpi-card kpi-card--occupancy" aria-labelledby="kpi-occupancy-title">
          <span className="kpi-head"><span className="kpi-icon"><Grid2X2 size={18} aria-hidden="true"/></span><span className="kpi-title" id="kpi-occupancy-title">Ocupação Total</span></span>
          <strong className="kpi-value">{summary.percent}%</strong>
          <span className="kpi-legend">{summary.occupied} {summary.occupied===1?'ocupado':'ocupados'} • {summary.available} {summary.available===1?'vaga livre':'vagas livres'}</span>
          <button type="button" className="kpi-action" onClick={()=>onOpenLockers({status:'com_vaga'})}>Ver armários <ArrowRight size={15} aria-hidden="true"/></button>
        </section>

        <section className={`kpi-card kpi-card--unassigned${withoutLocker===0?' level-ok':''}`} aria-labelledby="kpi-unassigned-title">
          <span className="kpi-head"><span className="kpi-icon"><UserX size={18} aria-hidden="true"/></span><span className="kpi-title" id="kpi-unassigned-title">Colaboradores sem Armário</span></span>
          <strong className="kpi-value">{withoutLocker}</strong>
          <span className="kpi-legend">Pessoas ativas aguardando vaga</span>
          <button type="button" className="kpi-action" onClick={()=>onNavigate('pessoas',{withoutLocker:true})}>Ver pessoas sem armário <ArrowRight size={15} aria-hidden="true"/></button>
        </section>

        <section className={`kpi-card kpi-card--alert level-${alertLevel}`} aria-labelledby="kpi-alert-title">
          <span className="kpi-head"><span className="kpi-icon"><ShieldAlert size={18} aria-hidden="true"/></span><span className="kpi-title" id="kpi-alert-title">Pendências Críticas</span></span>
          <span className="kpi-value-line">
            <strong className="kpi-value">{openPendings}</strong>
            {openPendings>0&&<span className={`kpi-badge kpi-badge--${alertLevel}`}>Ação necessária</span>}
          </span>
          <span className="kpi-legend">Ajustes cadastrais e operacionais</span>
          <button type="button" className="kpi-action" onClick={()=>onNavigate('pendencias')}>Resolver pendências <ArrowRight size={15} aria-hidden="true"/></button>
        </section>

        <section className="kpi-card kpi-card--double" aria-labelledby="kpi-double-title">
          <span className="kpi-head"><span className="kpi-icon"><Copy size={18} aria-hidden="true"/></span><span className="kpi-title" id="kpi-double-title">Armários Duplos</span></span>
          <strong className="kpi-value">{doubles.utilization}%</strong>
          <span className="kpi-legend">{doubles.full} de {doubles.total} duplos 100% ocupados</span>
          <button type="button" className="kpi-action" onClick={()=>onOpenLockers({double:true})}>Ver duplos <ArrowRight size={15} aria-hidden="true"/></button>
        </section>

        <section className="kpi-card kpi-card--keys" aria-labelledby="kpi-keys-title">
          <span className="kpi-head"><span className="kpi-icon"><KeyRound size={18} aria-hidden="true"/></span><span className="kpi-title" id="kpi-keys-title">Controle de Chaves</span></span>
          <strong className="kpi-value">{keyControl.withoutKey}</strong>
          <span className="kpi-legend">{keyControl.withoutKey===1?'Armário sem cópia cadastrada':'Armários sem cópia cadastrada'}</span>
          <button type="button" className="kpi-action" onClick={()=>onOpenLockers({key:'nao'})}>Ver chaves <ArrowRight size={15} aria-hidden="true"/></button>
        </section>
      </section>

      <div className="overview-widgets">
        <section className="insight-panel" aria-labelledby="sector-widget-title">
          <div className="insight-heading"><h2 id="sector-widget-title">Ranking de ocupação por setor</h2></div>
          {sectors.length?<div className="insight-scroll"><div className="insight-bars">{sectors.map(item=><button type="button"
            className={item.anomaly?'insight-bar-row anomaly':'insight-bar-row'} key={item.name}
            onClick={()=>onOpenLockers({sector:item.anomaly?'__none__':item.name,status:'ocupado'})}>
            <span>{item.anomaly&&<TriangleAlert size={13} aria-hidden="true"/>}{item.name}</span>
            <strong>{item.count}</strong></button>)}</div></div>:<p className="insight-empty">Ainda não há ocupações registradas nesta filial.</p>}
        </section>

        <section className="insight-panel" aria-labelledby="category-widget-title">
          <div className="insight-heading"><h2 id="category-widget-title">Pessoas por vínculo</h2></div>
          <div className="category-bars">{categories.map(item=><div className="category-row" key={item.key}>
            <div className="category-row-head"><span>{item.label}</span><strong>{item.count} <small>{item.percent}%</small></strong></div>
          </div>)}</div>
        </section>
      </div>

      <div className="overview-widgets overview-widgets--base">
        <section className="insight-panel" aria-labelledby="movement-widget-title">
          <div className="insight-heading"><h2 id="movement-widget-title">Movimentações e atividade</h2>
            <div className="period-toggle" role="group" aria-label="Período das movimentações">
              {periods.map(value=><button key={value} type="button" className={period===value?'selected':''} aria-pressed={period===value} onClick={()=>setPeriod(value)}>{value} dias</button>)}
            </div></div>
          {movementsError?<p className="insight-empty">{movementsError}</p>
            :!movements||movementsLoading?<div className="movement-grid" aria-hidden="true">{Array.from({length:3},(_,index)=><Skeleton key={index} variant="card" label="Carregando movimentação"/>)}</div>
            :<div className="movement-grid">
              <div className="movement-stat"><span className="movement-icon"><UserPlus size={17} aria-hidden="true"/></span><strong>{movementCounts?.attributions??0}</strong><span>Atribuições</span></div>
              <div className="movement-stat"><span className="movement-icon"><Undo2 size={17} aria-hidden="true"/></span><strong>{movementCounts?.releases??0}</strong><span>Desocupações</span></div>
              <div className="movement-stat"><span className="movement-icon"><ArrowLeftRight size={17} aria-hidden="true"/></span><strong>{movementCounts?.transfers??0}</strong><span>Trocas</span></div>
            </div>}
        </section>
      </div>
    </>)}
  </div>;
}
