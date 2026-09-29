import {useEffect,useState} from 'react';
import {Bell, Building2, ChevronDown, Menu, Moon, Sun, UsersRound, Wifi} from 'lucide-react';
import {api,type User} from '../api';
import {LockerisIcon} from '../ui';
import {Select} from './Select';

export type Theme='light'|'dark';
export type Branch={id:string;name:string;timezone:string;status:string;version:number};
export type Tab={key:string;label:string;icon:typeof Bell;group:string};
export type NotificationKey='withoutLocker'|'registrationPending'|'underusedDoubles';
type NotificationAlert={key:NotificationKey;label:string;description:string;count:number};
type NotificationSummary={total:number;alerts:NotificationAlert[];checkedAt:string};
const refreshInterval=60_000;
const notificationCopy:Record<NotificationKey,{description:string;action:string;className:string}>={
  withoutLocker:{description:'Pessoas ativas aguardando alocação.',action:'Ver colaboradores',className:'without-locker'},
  registrationPending:{description:'Cadastros com dados incompletos ou divergentes.',action:'Revisar pendências',className:'registration-pending'},
  underusedDoubles:{description:'Armários duplos com uma vaga livre.',action:'Ver armários duplos',className:'underused-doubles'}
};
const pageCopy:Record<string,string>={
  pessoas:'Encontre pessoas, atribua ou transfira armários.',
  pendencias:'Confira situações que precisam de decisão.',
  movimentacoes:'Acompanhe ocupações e trocas registradas.',
  retidos:'Acompanhe pertences esquecidos e o prazo de guarda.',
  auditorias:'Registre inspeções e apresente resultados à gestão.',
  importacao:'Valide as planilhas antes de atualizar os dados.',
  historico:'Consulte eventos registrados na filial.'
};

export function ThemeSwitch({theme,onToggle}:{theme:Theme;onToggle:()=>void}){
  return <button type="button" className="theme-switch" role="switch" aria-label="Modo escuro" aria-checked={theme==='dark'} title={theme==='dark'?'Ativar modo claro':'Ativar modo escuro'} onClick={onToggle}><Sun size={15} aria-hidden="true"/><span className="theme-switch-thumb" aria-hidden="true"/><Moon size={15} aria-hidden="true"/></button>;
}

function NotificationCenter({branchId,onNavigate}:{branchId:string;onNavigate:(key:NotificationKey)=>void}){
  const [summary,setSummary]=useState<NotificationSummary|null>(null);
  const [open,setOpen]=useState(false);
  useEffect(()=>{
    if(!branchId){setSummary(null);return;}
    let active=true;
    const load=()=>api<NotificationSummary>(`/branches/${branchId}/notifications`)
      .then(value=>{if(active)setSummary(value);})
      .catch(()=>{});
    load();
    const timer=window.setInterval(load,refreshInterval);
    return()=>{active=false;window.clearInterval(timer);};
  },[branchId]);
  useEffect(()=>{
    if(!open)return;
    const onPointerDown=(event:MouseEvent)=>{if(!(event.target instanceof Element)||!event.target.closest('.notification-menu'))setOpen(false);};
    const onEscape=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false);};
    document.addEventListener('mousedown',onPointerDown);
    document.addEventListener('keydown',onEscape);
    return()=>{document.removeEventListener('mousedown',onPointerDown);document.removeEventListener('keydown',onEscape);};
  },[open]);
  const alerts=summary?.alerts??[],total=summary?.total??0;
  return <div className="notification-menu">
    <button type="button" className="notification-toggle" aria-label="Alertas da filial" aria-haspopup="menu" aria-expanded={open}
      title="Alertas da filial" onClick={()=>setOpen(current=>!current)}>
      <Bell size={17} strokeWidth={1.9} aria-hidden="true"/>
      {total>0&&<span className="notification-badge" aria-hidden="true">{total>99?'99+':total}</span>}
      <span className="sr-only">{total?`${total} alerta(s) ativo(s)`:'Nenhum alerta ativo'}</span>
    </button>
    {open&&<div className="notification-popover" role="menu" aria-label="Central de alertas">
      <div className="notification-head"><span className="eyebrow">Central de alertas</span>
        <strong>{total?`${total} ${total===1?'alerta ativo':'alertas ativos'}`:'Tudo sob controle'}</strong></div>
      {alerts.map(alert=>{const copy=notificationCopy[alert.key];return <button type="button" role="menuitem" key={alert.key} className={`notification-item notification-item--${copy.className}`}
        onClick={()=>{setOpen(false);onNavigate(alert.key);}}>
        <span className="notification-item-top"><strong>{alert.label}</strong><span className={alert.count?'notification-count':'notification-count empty'}>{alert.count}</span></span>
        <small className="notification-description">{copy.description}</small>
        <span className="notification-action">{copy.action}<span aria-hidden="true">→</span></span>
      </button>;})}
      {total===0&&<p className="notification-empty">Nenhum alerta aberto nesta filial.</p>}
    </div>}
  </div>;
}

export type HeaderProps={
  page:string;
  tabs:readonly Tab[];
  theme:Theme;
  onToggleTheme:()=>void;
  branches:Branch[];
  branchId:string;
  onBranchChange:(value:string)=>void;
  mobileMenu:boolean;
  onToggleMobileMenu:()=>void;
  user:User;
  onChangePassword:()=>void;
  onAlert:(key:NotificationKey)=>void;
};
export function Header({page,tabs,theme,onToggleTheme,branches,branchId,onBranchChange,mobileMenu,onToggleMobileMenu,user,onChangePassword,onAlert}:HeaderProps){
  const [userMenu,setUserMenu]=useState(false);
  const current=tabs.find(tab=>tab.key===page);
  useEffect(()=>{if(!userMenu)return;
    const onPointerDown=(event:MouseEvent)=>{if(!(event.target instanceof Element)||!event.target.closest('.user-menu'))setUserMenu(false);};
    document.addEventListener('mousedown',onPointerDown);
    return()=>document.removeEventListener('mousedown',onPointerDown);},[userMenu]);
  useEffect(()=>{
    if(!userMenu)return;
    const onEscape=(event:KeyboardEvent)=>{if(event.key==='Escape')setUserMenu(false);};
    window.addEventListener('keydown',onEscape);
    return()=>window.removeEventListener('keydown',onEscape);},[userMenu]);
  const compact=page==='resumo'||page==='painel';
  return <header className={`topbar hide-on-print ${compact?'topbar-compact':''}`}><div className="topbar-main">
    <button type="button" className="mobile-menu-button" aria-label={mobileMenu?'Fechar menu':'Abrir menu'} aria-expanded={mobileMenu} onClick={onToggleMobileMenu}><Menu size={20} aria-hidden="true"/></button>
    <span className="topbar-brand"><LockerisIcon size={28}/><strong>Lockeris<span className="brand-dot">*</span></strong></span>
    {compact?<div className="topbar-breadcrumb"><span>Área de trabalho</span><i>/</i><strong>{current?.label}</strong></div>
      :<div className="page-heading"><span className="eyebrow">Área de trabalho</span><h1>{current?.label}</h1><p>{pageCopy[page]??'Gerencie armários e acessos.'}</p></div>}
  </div><div className="top-actions"><ThemeSwitch theme={theme} onToggle={onToggleTheme}/>
    {branches.length>1?<div className="branch-select"><Building2 size={17} aria-hidden="true"/><span>Filial</span><Select className="branch-select-field" ariaLabel="Filial" value={branchId}
      onChange={onBranchChange}
      options={branches.map(x=>({value:x.id,label:x.name}))}/></div>:<span className="branch-chip"><Building2 size={16} aria-hidden="true"/>{branches[0]?.name??'Filial autorizada'}</span>}
    {branchId&&<NotificationCenter branchId={branchId} onNavigate={onAlert}/>}
    <span className="status online"><Wifi size={15} aria-hidden="true"/>Conectado</span>
    <div className="user-menu">
      <button type="button" className="user-menu-toggle" aria-label={`Conta de ${user.username}`} aria-haspopup="menu" aria-expanded={userMenu} onClick={()=>setUserMenu(open=>!open)}>
        <UsersRound size={16} aria-hidden="true"/><span>{user.username}</span><ChevronDown size={14} aria-hidden="true"/>
      </button>
      {userMenu&&<div className="user-menu-popover" role="menu">
        <button type="button" role="menuitem" onClick={()=>{setUserMenu(false);onChangePassword();}}>Alterar senha</button>
      </div>}
    </div>
  </div></header>;
}
