import {useEffect,useState} from 'react';
import {ArrowLeftRight, Boxes, Building2, ClipboardCheck, FileClock, LayoutDashboard, LogOut, Menu, ShieldCheck, Upload, UsersRound, Wifi, WifiOff} from 'lucide-react';
import {api,post,type User} from './api';
import {clearOffline,clearAuthorization,loadCopy,loadDevice,saveCopy,type OfflineCopy} from './offline';
import {roleName} from './ui';
import {Dashboard} from './pages/Dashboard';
import {Overview} from './pages/Overview';
import type {LockerPreset} from './locker-insights';
import {People} from './pages/People';
import {Movements} from './pages/Movements';
import {Imports} from './pages/Imports';
import {Pending} from './pages/Pending';
import {History} from './pages/History';
import {Admin} from './pages/Admin';

export type PageProps={branchId:string;branchName:string;readonly:boolean;admin?:boolean;copy:OfflineCopy|null;refresh:()=>void;notice:(message:string)=>void};
type Branch={id:string;name:string;timezone:string};
const tabs=[
  {key:'resumo',label:'Dashboard',icon:LayoutDashboard,group:'Operação'},
  {key:'painel',label:'Armários',icon:Boxes,group:'Operação'},
  {key:'pessoas',label:'Colaboradores',icon:UsersRound,group:'Operação'},
  {key:'pendencias',label:'Pendências',icon:ClipboardCheck,group:'Operação'},
  {key:'movimentacoes',label:'Transferências',icon:ArrowLeftRight,group:'Operação'},
  {key:'importacao',label:'Importações',icon:Upload,group:'Gestão'},
  {key:'historico',label:'Histórico',icon:FileClock,group:'Gestão'},
  {key:'administracao',label:'Administração',icon:ShieldCheck,group:'Gestão'}
] as const;
const pendingLogoutKey='armarios-pending-logout';
async function finishQueuedLogout(){if(localStorage.getItem(pendingLogoutKey)!=='1')return;try{await post('/auth/logout',{});localStorage.removeItem(pendingLogoutKey);}catch(error){if(error instanceof Error&&'status' in error){localStorage.removeItem(pendingLogoutKey);}else throw error;}}

export default function App(){
  const [user,setUser]=useState<User|null>(null),[branches,setBranches]=useState<Branch[]>([]),[branchId,setBranchId]=useState('');
  const [page,setPage]=useState<string>('painel'),[copy,setCopy]=useState<OfflineCopy|null>(null),[offline,setOffline]=useState(false);
  const [lockerPreset,setLockerPreset]=useState<LockerPreset|undefined>(undefined),[listRevision,setListRevision]=useState(0),[mobileMenu,setMobileMenu]=useState(false);
  const [ready,setReady]=useState(false),[message,setMessage]=useState(''),[tick,setTick]=useState(0);
  const [offlineUnavailable,setOfflineUnavailable]=useState(false);
  const refresh=()=>setTick(x=>x+1);
  useEffect(()=>{let active=true;(async()=>{
    try{
      await finishQueuedLogout();
      const me=await api<{user:User}>('/auth/me');if(!active)return;
      setUser(me.user);setOffline(false);
      if(me.user.mustChangePassword)return;
      const list=await api<Branch[]>('/branches');if(!active)return;
      setBranches(list);setBranchId(me.user.branchId??list[0]?.id??'');
    }catch(error){
      if(!active)return;
      if(error instanceof Error && 'status' in error){
        await clearOffline();setUser(null);setCopy(null);
      }else{
        const local=await loadCopy();
        if(local&&new Date(local.expiresAt).getTime()>Date.now()){
          setCopy(local);setBranchId(local.branchId);setBranches([{id:local.branchId,name:local.branchName,timezone:''}]);setOffline(true);
          setUser({id:local.userId,role:'consulta',branchId:local.branchId,mustChangePassword:false});
        }else setOfflineUnavailable(true);
      }
    }finally{if(active)setReady(true);}
  })();return()=>{active=false;};},[]);
  useEffect(()=>{if(!user||!branchId||offline)return;let active=true;
    (async()=>{const secret=await loadDevice();if(!secret)return;
      try{const updated=await api<OfflineCopy>(`/branches/${branchId}/offline`,{headers:{'x-device-secret':secret}});if(active){await saveCopy(updated);setCopy(updated);}}
      catch(error){if(error instanceof Error&&'status' in error&&Number((error as {status:number}).status)===403){await clearAuthorization();if(active)setCopy(null);}}
    })();return()=>{active=false;};},[user,branchId,tick,offline]);
  useEffect(()=>{const fn=async()=>{if(!navigator.onLine)return;try{await finishQueuedLogout();const me=await api<{user:User}>('/auth/me');setUser(me.user);setOffline(false);setOfflineUnavailable(false);const list=await api<Branch[]>('/branches');setBranches(list);setBranchId(me.user.branchId??list[0]?.id??'');refresh();}catch(error){if(error instanceof Error&&'status' in error){await clearOffline();setCopy(null);setUser(null);setOffline(false);setOfflineUnavailable(false);}}};window.addEventListener('online',fn);return()=>window.removeEventListener('online',fn);},[]);
  useEffect(()=>{const fn=async()=>{const local=await loadCopy();if(local&&new Date(local.expiresAt).getTime()>Date.now()){setCopy(local);setBranchId(local.branchId);setBranches([{id:local.branchId,name:local.branchName,timezone:''}]);setUser({id:local.userId,role:'consulta',branchId:local.branchId,mustChangePassword:false});setOffline(true);setPage('painel');}else{setCopy(null);setUser(null);setOffline(true);setOfflineUnavailable(true);}};window.addEventListener('offline',fn);return()=>window.removeEventListener('offline',fn);},[]);
  useEffect(()=>{const onEscape=(event:KeyboardEvent)=>{if(event.key==='Escape')setMobileMenu(false);};window.addEventListener('keydown',onEscape);return()=>window.removeEventListener('keydown',onEscape);},[]);
  async function logout(){try{if(offline)localStorage.setItem(pendingLogoutKey,'1');else await post('/auth/logout',{});}finally{await clearOffline();setUser(null);setCopy(null);setOffline(false);setOfflineUnavailable(offline);setBranchId('');}}
  if(!ready)return <main className="center" role="status"><p>Preparando sua área de trabalho…</p></main>;
  if(offlineUnavailable&&!user)return <main className="center"><section className="auth-card"><WifiOff size={28} aria-hidden="true"/><h1>Conecte-se para consultar os armários</h1><p>Este navegador não tem uma cópia local válida. Quando a conexão voltar, entre para atualizar os dados.</p></section></main>;
  if(!user)return <Login onLogin={async result=>{setUser(result.user);if(result.user.mustChangePassword)return;const list=await api<Branch[]>('/branches');setBranches(list);setBranchId(result.user.branchId??list[0]?.id??'');}}/>;
  if(user.mustChangePassword)return <Password onDone={async()=>{setUser({...user,mustChangePassword:false});const list=await api<Branch[]>('/branches');setBranches(list);setBranchId(user.branchId??list[0]?.id??'');}}/>;
  const admin=['geral','filial_admin'].includes(user.role);
  const props:PageProps={branchId,branchName:branches.find(branch=>branch.id===branchId)?.name??'Filial autorizada',readonly:offline||user.role==='consulta',admin,copy:offline?copy:null,refresh,notice:setMessage};
  const visibleTabs=tabs.filter(({key})=>offline?['resumo','painel','pessoas','pendencias'].includes(key):!['administracao','importacao','historico'].includes(key)||admin);
  const current=tabs.find(({key})=>key===page);
  function navigate(next:string){setPage(next);setMessage('');setMobileMenu(false);if(next==='painel'){setLockerPreset(undefined);setListRevision(value=>value+1);}}
  function openLockers(preset:LockerPreset){setLockerPreset(preset);setListRevision(value=>value+1);setPage('painel');setMobileMenu(false);setMessage('');}
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Pular para o conteúdo</a>
    {mobileMenu&&<button type="button" className="mobile-scrim" aria-label="Fechar menu" onClick={()=>setMobileMenu(false)}/>}
    <aside className={`sidebar ${mobileMenu?'mobile-open':''}`}>
      <div className="brand"><span className="brand-icon"><Boxes size={22} strokeWidth={1.8} aria-hidden="true"/></span><div><strong>armários<span className="brand-dot">.</span></strong><small>Gestão operacional</small></div></div>
      <nav aria-label="Navegação principal">{(['Operação','Gestão'] as const).map(group=>visibleTabs.some(item=>item.group===group)&&<div className="nav-group-wrap" key={group}><span className="nav-group">{group}</span>{visibleTabs.filter(item=>item.group===group).map(item=>{const Icon=item.icon;return <button key={item.key} className={page===item.key?'nav-item active':'nav-item'} aria-current={page===item.key?'page':undefined} onClick={()=>navigate(item.key)}><Icon size={18} strokeWidth={1.8} aria-hidden="true"/><span>{item.label}</span></button>;})}</div>)}</nav>
      <span className="nav-hint">Deslize para ver mais opções</span>
      <div className="sidebar-footer"><span>{roleName[user.role]}</span><button onClick={logout}><LogOut size={17} aria-hidden="true"/> Sair</button></div>
    </aside>
    <div className="main-area">
      <header className={`topbar ${page==='resumo'||page==='painel'?'topbar-compact':''}`}><div className="topbar-main"><button type="button" className="mobile-menu-button" aria-label={mobileMenu?'Fechar menu':'Abrir menu'} aria-expanded={mobileMenu} onClick={()=>setMobileMenu(!mobileMenu)}><Menu size={20} aria-hidden="true"/></button>{page==='resumo'||page==='painel'?<div className="topbar-breadcrumb"><span>Área de trabalho</span><i>/</i><strong>{current?.label}</strong></div>:<div className="page-heading"><span className="eyebrow">Área de trabalho</span><h1>{current?.label}</h1><p>{page==='pessoas'?'Encontre pessoas, atribua ou transfira armários.':page==='pendencias'?'Confira situações que precisam de decisão.':page==='movimentacoes'?'Acompanhe ocupações e trocas registradas.':page==='importacao'?'Valide as planilhas antes de atualizar os dados.':page==='historico'?'Consulte eventos registrados na filial.':'Gerencie armários, acessos e consulta offline.'}</p></div>}</div><div className="top-actions">
        {branches.length>1?<label className="branch-select"><Building2 size={17} aria-hidden="true"/><span>Filial</span><select value={branchId} onChange={e=>{setBranchId(e.target.value);setLockerPreset(undefined);if(page!=='resumo'&&page!=='painel')setPage('painel');}}>{branches.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>:<span className="branch-chip"><Building2 size={16} aria-hidden="true"/>{branches[0]?.name??'Filial autorizada'}</span>}
        <span className={offline?'status offline':'status online'}>{offline?<WifiOff size={15} aria-hidden="true"/>:<Wifi size={15} aria-hidden="true"/>}{offline?'Sem conexão · apenas consulta':'Conectado'}</span>
      </div></header>
      {offline&&<div className="offline-banner" role="status"><strong>Dados locais para consulta.</strong> Atualizados em {copy?new Date(copy.issuedAt).toLocaleString('pt-BR'):'data desconhecida'}. Válidos até {copy?new Date(copy.expiresAt).toLocaleString('pt-BR'):'—'}.</div>}
      {message&&<div className="notice" role="status">{message}<button onClick={()=>setMessage('')} aria-label="Fechar aviso">×</button></div>}
      <main className="content" id="main-content" key={page==='painel'?`painel:${listRevision}`:`${branchId}:${page}`}>
        {!branchId?<section className="card"><p>Crie ou selecione uma filial em Administração.</p><Admin {...props} general={user.role==='geral'}/></section>:
          page==='resumo'?<Overview {...props} onOpenLockers={openLockers}/>:page==='painel'?<Dashboard {...props} preset={lockerPreset}/>:page==='pessoas'?<People {...props}/>:page==='movimentacoes'?<Movements {...props}/>:page==='importacao'?<Imports {...props}/>:page==='pendencias'?<Pending {...props}/>:page==='historico'?<History {...props}/>:<Admin {...props} general={user.role==='geral'}/>}
      </main>
    </div>
  </div>;
}

function Login({onLogin}:{onLogin:(result:{user:User})=>void}){
  const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function submit(event:React.FormEvent){event.preventDefault();setBusy(true);setError('');try{await onLogin(await post('/auth/login',{username,password}));}catch(e){setError(e instanceof Error?e.message:'Falha no login');}finally{setBusy(false);}}
  return <main className="auth-page"><div className="auth-intro"><span className="brand-icon"><Boxes size={28} aria-hidden="true"/></span><span className="eyebrow">Gestão de Armários</span><h2>Uma operação clara começa por aqui.</h2><p>Consulte ocupações, confira pendências e acompanhe cada movimentação na filial autorizada.</p></div><form className="auth-card" onSubmit={submit}><span className="eyebrow">Acesso interno</span><h1>Entrar</h1><p>Use as credenciais fornecidas pela administração.</p><label>Nome de usuário<input required autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)}/></label><label>Senha<input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>{error&&<p className="field-error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy?'Entrando…':'Entrar'}</button></form></main>;
}
function Password({onDone}:{onDone:()=>void}){
  const [oldPassword,setOld]=useState(''),[newPassword,setNew]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function submit(event:React.FormEvent){event.preventDefault();setBusy(true);setError('');try{await post('/auth/password',{oldPassword,newPassword});onDone();}catch(e){setError(e instanceof Error?e.message:'Não foi possível atualizar a senha.');}finally{setBusy(false);}}
  return <main className="auth-page"><form className="auth-card" onSubmit={submit}><span className="eyebrow">Segurança de acesso</span><h1>Troque sua senha</h1><p>A senha temporária precisa ser substituída antes de continuar.</p><label>Senha temporária<input type="password" autoComplete="current-password" value={oldPassword} onChange={e=>setOld(e.target.value)} required/></label><label>Nova senha (12 caracteres ou mais)<input type="password" autoComplete="new-password" minLength={12} value={newPassword} onChange={e=>setNew(e.target.value)} required/></label>{error&&<p className="field-error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy?'Salvando…':'Salvar nova senha'}</button></form></main>;
}
