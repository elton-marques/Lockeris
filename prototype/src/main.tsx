import {useEffect, useMemo, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Activity, ArrowRight, Boxes, Building2, Check, ChevronDown, CircleAlert, Clock3, Grid2X2, KeyRound, LayoutDashboard, List, LockKeyhole, Menu, Search, SlidersHorizontal, X} from 'lucide-react';
import {available, branches, lockers, sectors, situation, type Locker} from './data';
import './style.css';

type Page = 'dashboard' | 'lockers';
type SituationFilter = '' | 'disponivel' | 'ocupado' | 'bloqueado' | 'pendente';
type Filters = {query:string; branch:string; sector:string; situation:SituationFilter; keyCopy:string; reason:string};
type ChipKey = Exclude<keyof Filters,'branch'>;
type PreviewState = 'normal' | 'loading' | 'error' | 'empty';
const blankFilters = (branch:string): Filters => ({query:'',branch,sector:'',situation:'',keyCopy:'',reason:''});
const statusLabels: Record<Exclude<SituationFilter,''>,string> = {disponivel:'Com vaga',ocupado:'Ocupado',bloqueado:'Bloqueado / revisão',pendente:'Com pendência'};
const compactNumber = new Intl.NumberFormat('pt-BR');

function App(){
  const [page,setPage] = useState<Page>(location.hash === '#armarios' ? 'lockers' : 'dashboard');
  const [dashboardBranch,setDashboardBranch] = useState(branches[0]);
  const [filters,setFilters] = useState<Filters>(()=>blankFilters(branches[0]));
  const [view,setView] = useState<'cards'|'table'>('cards');
  const [selected,setSelected] = useState<Locker|null>(null);
  const [previewState,setPreviewState] = useState<PreviewState>(()=>{
    const requested=new URLSearchParams(location.search).get('state');
    return requested==='loading'||requested==='error'||requested==='empty'?requested:'normal';
  });
  const [mobileMenu,setMobileMenu] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(()=>{
    const onHash = () => setPage(location.hash === '#armarios' ? 'lockers' : 'dashboard');
    window.addEventListener('hashchange',onHash);
    return ()=>window.removeEventListener('hashchange',onHash);
  },[]);
  useEffect(()=>{
    const onEscape = (event:KeyboardEvent) => {if(event.key==='Escape')setMobileMenu(false);};
    window.addEventListener('keydown',onEscape);
    return ()=>window.removeEventListener('keydown',onEscape);
  },[]);
  useEffect(()=>{
    if(!selected)return;
    const previous = document.activeElement as HTMLElement|null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow='hidden';
    closeRef.current?.focus();
    return ()=>{document.body.style.overflow=overflow;previous?.focus();};
  },[selected]);

  const scoped = useMemo(()=>lockers.filter(item=>item.branch===dashboardBranch),[dashboardBranch]);
  const metrics = useMemo(()=>{
    const capacity=scoped.reduce((n,item)=>n+item.capacity,0);
    const occupied=scoped.reduce((n,item)=>n+item.occupants.length,0);
    return {
      available:scoped.reduce((n,item)=>n+available(item),0),
      capacity, occupied,
      blocked:scoped.filter(item=>item.condition!=='disponivel'||item.migrationStatus==='inconclusivo').length,
      pending:scoped.filter(item=>!!item.pending).length,
      noKey:scoped.filter(item=>item.keyCopy==='nao').length,
      physical:scoped.length,
    };
  },[scoped]);
  const sectorData=useMemo(()=>sectors.map(sector=>{
    const items=scoped.filter(item=>item.sector===sector);
    return {sector,available:items.reduce((n,item)=>n+available(item),0),occupied:items.reduce((n,item)=>n+item.occupants.length,0),capacity:items.reduce((n,item)=>n+item.capacity,0)};
  }),[scoped]);
  const pendingData=useMemo(()=>[...new Set(scoped.flatMap(item=>item.pending?[item.pending]:[]))].map(reason=>({reason,count:scoped.filter(item=>item.pending===reason).length})).sort((a,b)=>b.count-a.count),[scoped]);
  const filtered=useMemo(()=>lockers.filter(item=>{
    if(item.branch!==filters.branch)return false;
    if(filters.sector&&item.sector!==filters.sector)return false;
    if(filters.situation==='disponivel'&&available(item)===0)return false;
    if(filters.situation==='ocupado'&&item.occupants.length===0)return false;
    if(filters.situation==='bloqueado'&&item.condition==='disponivel'&&item.migrationStatus==='conferido')return false;
    if(filters.situation==='pendente'&&!item.pending)return false;
    if(filters.keyCopy&&item.keyCopy!==filters.keyCopy)return false;
    if(filters.reason&&item.pending!==filters.reason)return false;
    if(filters.query){const normalized=filters.query.toLocaleLowerCase('pt-BR');
      if(![item.number,item.branch,item.sector,...item.occupants.flatMap(person=>[person.name,person.registration])].some(value=>value.toLocaleLowerCase('pt-BR').includes(normalized)))return false;
    }
    return true;
  }),[filters]);
  const activeFilters: {key:ChipKey; label:string}[] = [
    filters.query&&{key:'query' as const,label:`Busca: ${filters.query}`},
    filters.sector&&{key:'sector' as const,label:`Setor: ${filters.sector}`},
    filters.situation&&{key:'situation' as const,label:`Situação: ${statusLabels[filters.situation]}`},
    filters.keyCopy&&{key:'keyCopy' as const,label:`Cópia da chave: ${filters.keyCopy==='sim'?'Sim':'Não'}`},
    filters.reason&&{key:'reason' as const,label:`Motivo: ${filters.reason}`},
  ].filter((item):item is {key:ChipKey;label:string}=>!!item);

  function navigate(next:Page){setPage(next);location.hash=next==='lockers'?'armarios':'dashboard';setMobileMenu(false);setPreviewState('normal');}
  function openListing(next:Partial<Filters>){setFilters({...blankFilters(dashboardBranch),...next});navigate('lockers');}
  function changeBranch(branch:string){setDashboardBranch(branch);setFilters(blankFilters(branch));setSelected(null);}
  function updateFilter<K extends keyof Filters>(key:K,value:Filters[K]){setFilters(current=>({...current,[key]:value, ...(key==='situation'&&value!=='pendente'?{reason:''}:{})}));}
  function modalKeyDown(event:React.KeyboardEvent<HTMLElement>){
    if(event.key==='Escape'){event.preventDefault();setSelected(null);return;}
    if(event.key!=='Tab')return;
    const elements=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),a[href]'));
    if(!elements.length)return;
    if(event.shiftKey&&document.activeElement===elements[0]){event.preventDefault();elements.at(-1)?.focus();}
    else if(!event.shiftKey&&document.activeElement===elements.at(-1)){event.preventDefault();elements[0].focus();}
  }

  return <div className="app-shell">
    <a className="skip-link" href="#main">Pular para o conteúdo</a>
    {mobileMenu&&<button className="mobile-scrim" aria-label="Fechar menu" onClick={()=>setMobileMenu(false)}/>}
    <aside className={`sidebar ${mobileMenu?'mobile-open':''}`}>
      <div className="brand"><span className="brand-mark"><Boxes size={23} strokeWidth={1.7}/></span><span><strong>armários<span className="brand-dot">.</span></strong><small>Gestão por filial</small></span></div>
      <div className="sidebar-section">Espaço de trabalho</div>
      <nav aria-label="Navegação principal">
        <button className={`nav-link ${page==='dashboard'?'active':''}`} aria-current={page==='dashboard'?'page':undefined} onClick={()=>navigate('dashboard')}><LayoutDashboard size={19} strokeWidth={1.8}/> Dashboard</button>
        <button className={`nav-link ${page==='lockers'?'active':''}`} aria-current={page==='lockers'?'page':undefined} onClick={()=>navigate('lockers')}><Grid2X2 size={19} strokeWidth={1.8}/> Armários <span className="nav-count">{scoped.length}</span></button>
      </nav>
      <div className="sidebar-spacer"/>
      <div className="sidebar-footer"><span className="avatar"><Building2 size={17}/></span><span><strong>Filial {dashboardBranch}</strong><small>Dados demonstrativos</small></span></div>
    </aside>
    <div className="main-column">
      <header className="topbar">
        <div className="topbar-left"><button className="mobile-menu-button" aria-label={mobileMenu?'Fechar menu':'Abrir menu'} aria-expanded={mobileMenu} onClick={()=>setMobileMenu(!mobileMenu)}><Menu size={21}/></button><span className="breadcrumb">Área de trabalho</span><span className="crumb-separator">/</span><strong>{page==='dashboard'?'Dashboard':'Armários'}</strong></div>
        <div className="topbar-right"><span className="demo-label"><span className="demo-pulse"/> Dados demonstrativos</span></div>
      </header>
      <main id="main" className="content">
        {page==='dashboard'?<>
          <div className="page-intro"><div><h1>Painel da filial</h1><p>Ocupação, vagas disponíveis e pendências dos armários desta filial.</p></div><label className="branch-control"><Building2 size={17}/><span className="sr-only">Filial do dashboard</span><select value={dashboardBranch} onChange={event=>changeBranch(event.target.value)}>{branches.map(branch=><option key={branch}>{branch}</option>)}</select><ChevronDown size={15} className="select-chevron"/></label></div>
          <div className="dashboard-grid">
            <button className="availability-feature" onClick={()=>openListing({situation:'disponivel'})} aria-label={`${metrics.available} ${metrics.available===1?'vaga disponível':'vagas disponíveis'}. Ver armários com vaga`}>
              <span className="feature-glow"/><span className="feature-header"><span className="feature-icon"><Grid2X2 size={19}/></span><span className="feature-link">Ver armários <ArrowRight size={17}/></span></span>
              <span className="feature-copy"><span className="feature-label">Vagas disponíveis</span><strong>{compactNumber.format(metrics.available)}</strong><span className="feature-desc">de {metrics.capacity} posições em {metrics.physical} armários físicos</span></span>
              <span className="locker-art" aria-hidden="true">{Array.from({length:12},(_,index)=><span key={index} className={`art-door ${[2,5,9].includes(index)?'art-free':index===7?'art-pending':''}`}><i/></span>)}</span>
              <span className="feature-foot"><span className="feature-foot-dot"/> Posições livres em armários disponíveis e conferidos</span>
            </button>
            <div className="metric-grid">
              <Metric icon={<Activity size={20}/>} title="Ocupação" value={`${metrics.capacity?Math.round(metrics.occupied/metrics.capacity*100):0}%`} detail={`${metrics.occupied} de ${metrics.capacity} posições ocupadas`} onClick={()=>openListing({situation:'ocupado'})} variant="violet"/>
              <Metric icon={<LockKeyhole size={20}/>} title="Bloqueios / revisão" value={String(metrics.blocked)} detail={`de ${metrics.physical} armários físicos`} onClick={()=>openListing({situation:'bloqueado'})} variant="slate"/>
              <Metric icon={<CircleAlert size={20}/>} title="Com pendência" value={String(metrics.pending)} detail={`de ${metrics.physical} armários físicos`} onClick={()=>openListing({situation:'pendente'})} variant="amber"/>
              <Metric icon={<KeyRound size={20}/>} title="Sem cópia da chave" value={String(metrics.noKey)} detail={`de ${metrics.physical} armários físicos`} onClick={()=>openListing({keyCopy:'nao'})} variant="slate"/>
            </div>
          </div>
          <div className="dashboard-lower">
            <section className="surface chart-surface"><div className="surface-heading"><div><h2>Ocupação por setor</h2><p>Posições ocupadas e vagas disponíveis</p></div><span className="surface-side">{dashboardBranch}</span></div>
              <div className="chart-legend"><span><i className="legend-occupied"/> Ocupadas</span><span><i className="legend-available"/> Disponíveis</span></div>
              <div className="sector-chart">{sectorData.map(item=><div className="sector-row" key={item.sector}><span className="sector-name">{item.sector}</span><div className="sector-bars">{item.occupied>0&&<button className="bar occupied-bar" style={{width:`${item.occupied/item.capacity*100}%`}} onClick={()=>openListing({sector:item.sector,situation:'ocupado'})} aria-label={`${item.sector}: ${item.occupied} ${item.occupied===1?'posição ocupada':'posições ocupadas'}. Ver armários`}/>}{item.available>0&&<button className="bar available-bar" style={{width:`${item.available/item.capacity*100}%`}} onClick={()=>openListing({sector:item.sector,situation:'disponivel'})} aria-label={`${item.sector}: ${item.available} ${item.available===1?'vaga disponível':'vagas disponíveis'}. Ver armários`}/>}</div><span className="sector-total">{item.occupied}/{item.capacity}</span></div>)}</div>
              <p className="chart-footnote">O restante inclui posições em armários bloqueados ou ainda não conferidos. Clique em uma barra para abrir os registros.</p>
            </section>
            <section className="surface pending-surface"><div className="surface-heading"><div><h2>Pendências por motivo</h2><p>Armários que precisam de conferência</p></div><span className="attention-icon"><CircleAlert size={19}/></span></div>
              <div className="pending-reasons">{pendingData.map(item=><button key={item.reason} onClick={()=>openListing({situation:'pendente',reason:item.reason})}><span className="pending-reason-name"><span className="reason-marker"/>{item.reason}</span><span className="pending-count">{item.count}<ArrowRight size={15}/></span></button>)}</div>
              <button className="text-link" onClick={()=>openListing({situation:'pendente'})}>Ver todas as pendências <ArrowRight size={17}/></button>
            </section>
          </div>
          <p className="data-note"><CircleAlert size={15}/> Indicadores da filial {dashboardBranch}, calculados com dados fictícios. Pendências e bloqueios podem se sobrepor.</p>
        </>:<>
          <div className="page-intro lockers-intro"><div><h1>Armários</h1><p>Consulte os armários e seus ocupantes na filial selecionada.</p></div><span className="results-pill">{scoped.length} armários físicos · {dashboardBranch}</span></div>
          <section className="surface listings-surface" aria-label="Consulta de armários">
            <div className="listing-heading"><div><h2>Registros</h2><p>Use os filtros em conjunto para chegar ao armário certo.</p></div><div className="view-switch" role="group" aria-label="Modo de visualização"><button aria-pressed={view==='cards'} className={view==='cards'?'selected':''} onClick={()=>setView('cards')} title="Visualizar cards"><Grid2X2 size={18}/><span>Cards</span></button><button aria-pressed={view==='table'} className={view==='table'?'selected':''} onClick={()=>setView('table')} title="Visualizar tabela"><List size={18}/><span>Tabela</span></button></div></div>
            <div className="filter-box"><div className="search-wrap"><Search size={19}/><label className="sr-only" htmlFor="locker-search">Buscar por número, nome ou matrícula</label><input id="locker-search" value={filters.query} onChange={event=>updateFilter('query',event.target.value)} placeholder="Número, nome ou matrícula"/></div><div className="filter-selects"><Select label="Filial" value={filters.branch} options={branches} allowAll={false} onChange={changeBranch}/><Select label="Setor" value={filters.sector} options={sectors} onChange={value=>updateFilter('sector',value)}/><Select label="Situação" value={filters.situation} options={Object.entries(statusLabels).map(([value,label])=>({value,label}))} onChange={value=>updateFilter('situation',value as SituationFilter)}/><Select label="Cópia da chave" value={filters.keyCopy} options={[{value:'sim',label:'Com cópia'},{value:'nao',label:'Sem cópia'}]} onChange={value=>updateFilter('keyCopy',value)}/></div></div>
            <div className="filter-summary"><div className="summary-left"><SlidersHorizontal size={16}/><strong aria-live="polite">{previewState==='normal'?`${filtered.length} ${filtered.length===1?'resultado':'resultados'}`:'Prévia de estado'}</strong><span className="summary-separator"/>{activeFilters.length?<div className="filter-chips">{activeFilters.map(item=><button key={item.key} onClick={()=>updateFilter(item.key,'')} aria-label={`Remover filtro ${item.label}`}>{item.label}<X size={13}/></button>)}</div>:<span className="all-records">Nesta filial</span>}</div>{activeFilters.length>0&&<button className="clear-button" onClick={()=>setFilters(blankFilters(dashboardBranch))}>Limpar filtros</button>}</div>
            {previewState==='loading'?<div className="skeleton-grid" role="status" aria-label="Carregando armários">{Array.from({length:6},(_,index)=><div key={index} className="skeleton-card"><span/><span/><span/></div>)}</div>:
              previewState==='error'?<div className="state-panel" role="alert"><CircleAlert size={25}/><h3>Não foi possível carregar os armários</h3><p>Confira a conexão e tente novamente.</p><button onClick={()=>setPreviewState('normal')}>Tentar novamente</button></div>:
              previewState==='empty'||filtered.length===0?<div className="state-panel"><Search size={25}/><h3>{previewState==='empty'?'Nenhum armário cadastrado':'Nenhum armário encontrado'}</h3><p>{previewState==='empty'?'Não há registros para esta filial nesta simulação.':'Revise a busca ou limpe os filtros para ver outros armários.'}</p><button onClick={()=>{setPreviewState('normal');setFilters(blankFilters(dashboardBranch));}}>Mostrar armários</button></div>:
              view==='cards'?<div className="locker-grid">{filtered.map(item=><LockerCard key={item.id} locker={item} onClick={()=>setSelected(item)}/>)}</div>:
              <div className="table-wrap"><table><thead><tr><th>Armário</th><th>Setor</th><th>Situação</th><th>Ocupante / matrícula</th><th>Ocupação</th><th>Vagas disponíveis</th><th>Cópia da chave</th><th><span className="sr-only">Ação</span></th></tr></thead><tbody>{filtered.map(item=><tr key={item.id}><td><strong>№ {item.number}</strong></td><td>{item.sector}</td><td><Status locker={item}/></td><td>{item.occupants.length?item.occupants.map(person=><span className="table-person" key={person.registration}>{person.name}<small>Matrícula {person.registration}</small></span>):'Sem ocupante'}</td><td>{item.occupants.length} de {item.capacity}</td><td>{available(item)}</td><td>{keyLabel(item.keyCopy)}</td><td><button className="table-action" onClick={()=>setSelected(item)}>Ver detalhes <ArrowRight size={15}/></button></td></tr>)}</tbody></table></div>}
          </section>
          <p className="data-note"><CircleAlert size={15}/> Registros fictícios. O protótipo é somente para consulta visual; nenhuma alteração operacional é salva.</p>
        </>}
      </main>
    </div>
    {selected&&<div className="drawer-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setSelected(null);}}><section className="detail-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" onKeyDown={modalKeyDown}><div className="drawer-top"><span>Detalhes do armário</span><button ref={closeRef} onClick={()=>setSelected(null)} aria-label="Fechar detalhes"><X size={21}/></button></div><div className="drawer-heading"><span className="drawer-number">№ {selected.number}</span><Status locker={selected}/><h2 id="drawer-title">Armário {selected.number}</h2><p>{selected.branch} <span>•</span> {selected.sector}</p></div><div className="drawer-content"><div className="detail-highlight"><span>Vagas disponíveis</span><strong>{available(selected)}</strong><small>{available(selected)===0?'Nenhuma posição disponível para nova ocupação.':`de ${selected.capacity} ${selected.capacity===1?'posição física':'posições físicas'}`}</small></div><div className="detail-section"><h3>Ocupação</h3><div className="detail-row"><span>Capacidade física</span><strong>{selected.capacity} {selected.capacity===1?'posição':'posições'}</strong></div><div className="detail-row"><span>Posições ocupadas</span><strong>{selected.occupants.length}</strong></div>{selected.occupants.length>0?<div className="occupant-list">{selected.occupants.map(person=><div key={person.registration}><span className="occupant-avatar">{person.name.split(' ').slice(0,2).map(part=>part[0]).join('')}</span><span><strong>{person.name}</strong><small>Matrícula {person.registration}</small></span></div>)}</div>:<p className="drawer-muted">Nenhum ocupante registrado nesta prévia.</p>}</div><div className="detail-section"><h3>Condição e chave</h3><div className="detail-row"><span>Condição</span><strong>{conditionLabel(selected.condition)}</strong></div><div className="detail-row"><span>Dados do armário</span><strong>{selected.migrationStatus==='conferido'?'Conferidos':'A conferir'}</strong></div><div className="detail-row"><span>Cópia da chave</span><strong>{keyLabel(selected.keyCopy)}</strong></div></div><div className="detail-section"><h3>Pendência</h3>{selected.pending?<div className="detail-pending"><CircleAlert size={18}/><span>{selected.pending}</span></div>:<div className="no-pending"><Check size={17}/> Nenhuma pendência indicada</div>}</div></div><div className="drawer-bottom"><span><Clock3 size={15}/> Dados demonstrativos</span><button onClick={()=>setSelected(null)}>Fechar</button></div></section></div>}
  </div>;
}

function Metric({icon,title,value,detail,onClick,variant}:{icon:React.ReactNode;title:string;value:string;detail:string;onClick:()=>void;variant:string}){
  return <button className={`metric metric-${variant}`} onClick={onClick}><span className="metric-top"><span className="metric-icon">{icon}</span><ArrowRight size={17}/></span><span className="metric-title">{title}</span><strong>{value}</strong><span className="metric-detail">{detail}</span></button>;
}
function Select({label,value,options,onChange,allowAll=true}:{label:string;value:string;options:(string|{value:string;label:string})[];onChange:(value:string)=>void;allowAll?:boolean}){
  return <label className="filter-select"><span>{label}</span><select value={value} onChange={event=>onChange(event.target.value)}>{allowAll&&<option value="">{label==='Setor'?'Todos':'Todas'}</option>}{options.map(option=>{const item=typeof option==='string'?{value:option,label:option}:option;return <option key={item.value} value={item.value}>{item.label}</option>;})}</select><ChevronDown size={15}/></label>;
}
function conditionLabel(condition:Locker['condition']){return condition==='disponivel'?'Disponível':condition==='bloqueado'?'Bloqueado':'Manutenção';}
function keyLabel(key:Locker['keyCopy']){return key==='sim'?'Sim':'Não';}
function Status({locker}:{locker:Locker}){const state=situation(locker);return <span className={`status-badge status-${state}`}><i/>{state==='indisponivel'?locker.migrationStatus==='inconclusivo'?'Em revisão':conditionLabel(locker.condition):state==='pendente'?'Pendente':state==='ocupado'?'Ocupado':'Livre'}</span>;}
function LockerCard({locker,onClick}:{locker:Locker;onClick:()=>void}){
  return <button className="locker-card" onClick={onClick} aria-label={`Abrir detalhes do armário ${locker.number}, ${locker.branch}, ${locker.sector}`}><span className="locker-card-top"><span className="locker-number">№ {locker.number}</span><Status locker={locker}/></span><span className="locker-location">{locker.sector}</span><span className="locker-divider"/><span className="locker-occupants">{locker.occupants.length?locker.occupants.map(person=><span className="card-person" key={person.registration}>{person.name}<small>Matrícula {person.registration}</small></span>):'Sem ocupante'}</span><span className="locker-card-bottom"><span>{locker.occupants.length}/{locker.capacity} {locker.capacity===1?'posição ocupada':'posições ocupadas'}</span><span className="locker-open"><ArrowRight size={17}/></span></span>{locker.pending&&<span className="locker-pending"><CircleAlert size={14}/>{locker.pending}</span>}{locker.keyCopy==='nao'&&!locker.pending&&<span className="locker-key"><KeyRound size={14}/> Sem cópia da chave</span>}</button>;
}

createRoot(document.getElementById('root')!).render(<App/>);
