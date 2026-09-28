import {useEffect,useMemo,useState} from 'react';
import {ArrowLeftRight,ArrowRight,CircleAlert,Copy,FileClock,Grid2X2,KeyRound,Plus,ShieldAlert,TriangleAlert,Undo2,Upload,UserPlus,UserX} from 'lucide-react';
import {api} from '../api';
import type {PageProps,PeoplePreset} from '../App';
import {DataState,EmptyState,Skeleton} from '../ui';
import {alertLevelLabels,categoryShares,doubleLockerBreakdown,keyControlSummary,lockersWithoutSectorOrRegistration,occupancyBySector,occupancySummary,openPendingCount,openPendingWithLocker,pendingAlertLevel,pendingLockerIds,sectorOccupiedPositions,type CategoryLinks,type InsightLocker,type InsightPending,type LockerPreset} from '../locker-insights';

type Props=PageProps&{onOpenLockers:(preset:LockerPreset)=>void;onNavigate:(page:string,preset?:PeoplePreset)=>void};
type AllocationRow={started_at:string|null;ended_at:string|null};
type TransferRow={happened_at:string};
type Movements={allocations:AllocationRow[];transfers:TransferRow[]};
type DashboardStats={links:CategoryLinks;people:{total:string};withoutLocker:{total:number}};
const periods=[7,30] as const;

export function Overview({branchId,branchName,admin=false,onOpenLockers,onNavigate}:Props){
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
  const pendingIds=pendingLockerIds(pending);
  const openPendings=openPendingCount(pending);
  const alertLevel=pendingAlertLevel(openPendings);
  const pendingLockers=lockers.filter(item=>pendingIds.has(item.id)||item.migration_status==='inconclusivo').length;
  const outsideBase=openPendingWithLocker(pending,'ausente_ti');
  const untracked=lockersWithoutSectorOrRegistration(lockers);
  const withoutLocker=stats?.withoutLocker.total??0;
  const activePeople=Number(stats?.people.total??0);
  const withLocker=Math.max(0,activePeople-withoutLocker);
  const missingSector=sectors.find(item=>item.anomaly);
  const movementCounts=useMemo(()=>{
    if(!movements)return null;
    const since=Date.now()-period*86400000;
    const transfers=movements.transfers.filter(row=>new Date(row.happened_at).getTime()>=since).length;
    const started=movements.allocations.filter(row=>row.started_at&&new Date(row.started_at).getTime()>=since).length;
    const ended=movements.allocations.filter(row=>row.ended_at&&new Date(row.ended_at).getTime()>=since).length;
    return {transfers,attributions:Math.max(0,started-transfers),releases:Math.max(0,ended-transfers)};
  },[movements,period]);
  const canManage=admin;

  return <div className="overview-page">
    <div className="operational-intro"><div><h1>Painel da filial</h1><p>Centro de comando de prevenção de perdas e gestão de armários de {branchName}.</p></div><span>{lockers.length} armários físicos</span></div>
    <DataState loading={loading} error={error} onRetry={()=>setRetry(value=>value+1)}/>
    {!loading&&!error&&(lockers.length===0?<EmptyState title="Nenhum armário cadastrado" description="Os indicadores aparecerão quando esta filial tiver armários cadastrados."/>:<>
      <section className="kpi-grid" aria-label="Indicadores executivos">
        <button className="kpi-card kpi-card--capacity" type="button" onClick={()=>onOpenLockers({status:'com_vaga'})}
          aria-label={`${summary.available} ${summary.available===1?'vaga disponível':'vagas disponíveis'}. Ver armários com vaga`}>
          <span className="kpi-head"><span className="kpi-icon"><Grid2X2 size={18} aria-hidden="true"/></span><span className="kpi-title">Capacidade e ocupação real</span><span className="kpi-link">Ver armários <ArrowRight size={15} aria-hidden="true"/></span></span>
          <span className="kpi-value-row"><strong className="kpi-value">{summary.percent}%</strong><span className="kpi-value-label">Ocupação total</span></span>
          <span className="kpi-progress" role="img" aria-label={`${summary.percent}% de ocupação total`}><span style={{width:`${summary.percent}%`}}/></span>
          <span className="kpi-subs">
            <span className="kpi-sub"><span>Posições ocupadas</span><strong>{summary.occupied} de {summary.capacity}</strong></span>
            <span className="kpi-sub kpi-sub--highlight"><span>Vagas livres imediatas</span><strong>{summary.available} {summary.available===1?'vaga disponível':'vagas disponíveis'}</strong></span>
          </span>
          <span className="kpi-foot">de {summary.capacity} posições em {summary.physical} armários físicos</span>
        </button>

        <section className={`kpi-card kpi-card--alert level-${alertLevel}`} aria-labelledby="kpi-alert-title">
          <span className="kpi-head"><span className="kpi-icon"><ShieldAlert size={18} aria-hidden="true"/></span><span className="kpi-title" id="kpi-alert-title">Nível de alerta e pendências críticas</span>
            <span className={`kpi-badge kpi-badge--${alertLevel}`}>{alertLevelLabels[alertLevel]}</span></span>
          <span className="kpi-value-row"><strong className="kpi-value">{openPendings}</strong><span className="kpi-value-label">Pendências abertas</span></span>
          <span className="kpi-subs kpi-subs--stack">
            <button type="button" className="kpi-sub kpi-sub--action" onClick={()=>onOpenLockers({status:'pendente'})}>
              <span>Com pendência</span><strong>{pendingLockers}</strong><small>de {summary.physical} armários físicos · ver armários</small>
            </button>
            <button type="button" className="kpi-sub kpi-sub--action" onClick={()=>onNavigate('pendencias')}>
              <span>Pessoas fora da base ativa com armário</span><strong>{outsideBase}</strong><small>conferir cadastros</small>
            </button>
            <span className="kpi-sub"><span>Armários sem setor ou matrícula</span><strong>{untracked}</strong></span>
          </span>
          <button type="button" className="kpi-action" onClick={()=>onNavigate('pendencias')}>Resolver Pendências <ArrowRight size={15} aria-hidden="true"/></button>
        </section>

        <section className="kpi-card kpi-card--double" aria-labelledby="kpi-double-title">
          <span className="kpi-head"><span className="kpi-icon"><Copy size={18} aria-hidden="true"/></span><span className="kpi-title" id="kpi-double-title">Eficiência dos armários duplos</span></span>
          <span className="kpi-value-row"><strong className="kpi-value">{doubles.utilization}%</strong><span className="kpi-value-label">Taxa de utilização de duplos</span></span>
          <span className="kpi-progress kpi-progress--double" role="img" aria-label={`${doubles.filled} de ${doubles.positions} vagas duplas preenchidas`}><span style={{width:`${doubles.utilization}%`}}/></span>
          <span className="kpi-pills">
            <span className="kpi-pill"><strong>{doubles.total}</strong> Total de Duplos</span>
            <span className="kpi-pill kpi-pill--full"><strong>{doubles.full}</strong> 100% Ocupados</span>
            <span className="kpi-pill kpi-pill--partial"><strong>{doubles.partial}</strong> Subutilizados (1/2)</span>
            <span className="kpi-pill kpi-pill--free"><strong>{doubles.free}</strong> Livres (0/2)</span>
          </span>
          <p className="kpi-foot kpi-foot--inline">Duplos de Transporte Pesado e Conservação/Manutenção com um único ocupante valem como 100% ocupados (armário duplo individual, dentro da regra).</p>
          <button type="button" className="kpi-action" onClick={()=>onOpenLockers({double:true})}>Ver armários duplos <ArrowRight size={15} aria-hidden="true"/></button>
        </section>

        <section className="kpi-card kpi-card--keys" aria-labelledby="kpi-keys-title">
          <span className="kpi-head"><span className="kpi-icon"><KeyRound size={18} aria-hidden="true"/></span><span className="kpi-title" id="kpi-keys-title">Controle de Chaves</span></span>
          <span className="kpi-value-row"><strong className="kpi-value">{keyControl.withoutKey}</strong><span className="kpi-value-label">{keyControl.withoutKey===1?'Armário sem cópia da chave cadastrada':'Armários sem cópia da chave cadastrada'}</span></span>
          <span className="kpi-subs kpi-subs--stack">
            <button type="button" className="kpi-sub kpi-sub--action" onClick={()=>onOpenLockers({key:'nao'})}>
              <span>Armários sem cópia</span><strong>{keyControl.withoutKey}</strong><small>ver armários sem cópia</small>
            </button>
            <button type="button" className="kpi-sub kpi-sub--action" onClick={()=>onOpenLockers({key:'sim'})}>
              <span>Armários com cópia</span><strong>{keyControl.withKey}</strong><small>ver armários com cópia</small>
            </button>
            <span className="kpi-sub"><span>Cópia não informada</span><strong>{keyControl.unreported}</strong></span>
          </span>
          <button type="button" className="kpi-action" onClick={()=>onOpenLockers({key:'nao'})}>Ver armários sem cópia <ArrowRight size={15} aria-hidden="true"/></button>
        </section>

        <section className={`kpi-card kpi-card--unassigned${withoutLocker===0?' level-ok':''}`} aria-labelledby="kpi-unassigned-title">
          <span className="kpi-head"><span className="kpi-icon"><UserX size={18} aria-hidden="true"/></span><span className="kpi-title" id="kpi-unassigned-title">Colaboradores sem Armário</span></span>
          <span className="kpi-value-row"><strong className="kpi-value">{withoutLocker}</strong><span className="kpi-value-label">{withoutLocker===1?'pessoa ativa sem armário vinculado':'pessoas ativas sem armário vinculado'}</span></span>
          <span className="kpi-subs">
            <span className="kpi-sub"><span>Com armário vinculado</span><strong>{withLocker}</strong></span>
            <span className="kpi-sub kpi-sub--highlight"><span>Base ativa da filial</span><strong>{activePeople}</strong></span>
          </span>
          <button type="button" className="kpi-action" onClick={()=>onNavigate('pessoas',{withoutLocker:true})}>Ver colaboradores sem armário <ArrowRight size={15} aria-hidden="true"/></button>
        </section>
      </section>

      <div className="overview-widgets">
        <section className="insight-panel" aria-labelledby="sector-widget-title">
          <div className="insight-heading"><div><h2 id="sector-widget-title">Ranking de ocupação por setor</h2><p>Posições ocupadas, dos mais demandantes aos menos</p></div><span>{branchName}</span></div>
          {sectors.length?<div className="insight-scroll"><div className="insight-bars">{sectors.map(item=><div className={item.anomaly?'insight-bar-row anomaly':'insight-bar-row'} key={item.name}>
            <span>{item.anomaly&&<TriangleAlert size={13} aria-hidden="true"/>}{item.name}</span>
            <div className="insight-track"><button style={{width:`${Math.max(8,item.count/Math.max(1,sectors[0].count)*100)}%`}}
              onClick={()=>onOpenLockers({sector:item.anomaly?'__none__':item.name,status:'ocupado'})}
              aria-label={`${item.name}: ${item.count} ${item.count===1?'posição ocupada':'posições ocupadas'}. Ver armários`}/></div>
            <strong>{item.count}</strong></div>)}</div></div>:<p className="insight-empty">Ainda não há ocupações registradas nesta filial.</p>}
          {missingSector&&<p className="insight-alert"><TriangleAlert size={15} aria-hidden="true"/><span><strong>{missingSector.count} {missingSector.count===1?'posição':'posições'} sem setor identificado.</strong> Confira o cadastro desses ocupantes antes que virem perda de rastreio.</span></p>}
          <p className="insight-note">Cada posição ocupada é atribuída ao setor do ocupante. Promotores ficam de fora do ranking: promotor é cargo, contado em Pessoas por vínculo. Clique em uma barra para ver os registros.</p>
        </section>

        <section className="insight-panel" aria-labelledby="category-widget-title">
          <div className="insight-heading"><div><h2 id="category-widget-title">Pessoas por vínculo</h2><p>Toda a base ativa da filial, separada por vínculo cadastral.</p></div></div>
          <div className="category-bars">{categories.map(item=><div className="category-row" key={item.key}>
            <div className="category-row-head"><span>{item.label}</span><strong>{item.count} <small>{item.percent}%</small></strong></div>
            <div className="insight-track"><span className={`category-fill fill-${item.key}`} style={{width:`${Math.max(item.count?3:0,item.percent)}%`}}/></div>
          </div>)}</div>
          <p className="insight-note">Contagem sem limite de exibição: todos os promotores ativos da filial entram em Promotor(a), mesmo sem armário, e quem está sem setor, sem cargo e sem empresa entra em Pendência Cadastral. Jovens aprendizes contam em Colaborador. {sectorOccupiedPositions(lockers)} posições ocupadas diretamente por setor. {openPendings} pendências cadastrais e operacionais abertas, contadas pelos itens registrados.</p>
        </section>
      </div>

      <div className="overview-widgets overview-widgets--base">
        <section className="insight-panel" aria-labelledby="movement-widget-title">
          <div className="insight-heading"><div><h2 id="movement-widget-title">Movimentações e atividade</h2><p>Atribuições, desocupações e trocas do período</p></div>
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
          <p className="insight-note">Contagem de eventos concluídos nos últimos {period} dias nesta filial.</p>
        </section>

        <section className="insight-panel" aria-labelledby="quick-widget-title">
          <div className="insight-heading"><div><h2 id="quick-widget-title">Ações rápidas</h2><p>Atalhos para a rotina do dia</p></div></div>
          <div className="quick-grid">
            <button type="button" className="quick-action" onClick={()=>onOpenLockers({status:'com_vaga'})}>
              <span className="quick-icon"><Plus size={17} aria-hidden="true"/></span><strong>+ Atribuir / Desocupar Armário</strong><small>Abra a lista de armários com vaga para cadastrar ou desocupar um armário.</small></button>
            {canManage&&<button type="button" className="quick-action" onClick={()=>onNavigate('importacao')}>
              <span className="quick-icon"><Upload size={17} aria-hidden="true"/></span><strong>Importar Planilha de Colaboradores</strong><small>Envie a base mensal e confira inclusões, alterações e ausências.</small></button>}
            <button type="button" className="quick-action" onClick={()=>onNavigate('pendencias')}>
              <span className="quick-icon"><CircleAlert size={17} aria-hidden="true"/></span><strong>Ver Pendências Abertas</strong><small>{openPendings} {openPendings===1?'registro aguardando decisão':'registros aguardando decisão'}.</small></button>
            {canManage&&<button type="button" className="quick-action" onClick={()=>onNavigate('historico')}>
              <span className="quick-icon"><FileClock size={17} aria-hidden="true"/></span><strong>Consultar Histórico</strong><small>Acompanhe eventos e exporte o registro da filial.</small></button>}
          </div>
        </section>
      </div>

      <p className="overview-note">Vagas são posições livres imediatas, a ocupação usa a capacidade física total e os demais indicadores contam armários físicos. Um armário pode aparecer em mais de um indicador.</p>
    </>)}
  </div>;
}
