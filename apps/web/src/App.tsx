import {useEffect,useRef,useState} from 'react';
import {Eye, EyeOff, Info, LogOut} from 'lucide-react';
import {api,post,setUnauthorizedHandler,type User} from './api';
import {purgeOfflineCopy} from './offline';
import {LockerisIcon,roleName} from './ui';
import {tabs,tabKeys,resolveHashPage} from './navigation';
import {Header,ThemeSwitch,type NotificationKey} from './components/Header';
import {AboutModal} from './components/AboutModal';
import {ChangePasswordModal} from './components/ChangePasswordModal';
import {Dashboard} from './pages/Dashboard';
import {Overview} from './pages/Overview';
import type {LockerPreset} from './locker-insights';
import {People} from './pages/People';
import {Transfers} from './pages/Transfers';
import {Imports} from './pages/Imports';
import {Pending} from './pages/Pending';
import {History} from './pages/History';
import {Admin} from './pages/Admin';
import {RetainedItems} from './pages/RetainedItems';
import {Audits} from './pages/Audits';
import {NotFound} from './pages/NotFound';

export type NoticeAction={label:string;onClick:()=>void};
export type PageProps={branchId:string;branchName:string;readonly:boolean;admin?:boolean;refresh:()=>void;notice:(message:string,action?:NoticeAction)=>void;askConfirm:(message:string)=>Promise<boolean>;askPrompt:(message:string)=>Promise<string|null>};
export type PeoplePreset={withoutLocker?:boolean};
type Branch={id:string;name:string;timezone:string;status:string;version:number};
type Theme='light'|'dark';
type AppDialog={kind:'confirm';message:string;value:string;resolve:(value:boolean)=>void}|{kind:'prompt';message:string;value:string;resolve:(value:string|null)=>void};
const themePreferenceKey='armarios-theme';

export default function App(){
  const [theme,setTheme]=useState<Theme>(()=>document.documentElement.dataset.theme==='dark'?'dark':'light');
  const [user,setUser]=useState<User|null>(null),[branches,setBranches]=useState<Branch[]>([]),[branchId,setBranchId]=useState('');
  const [page,setPage]=useState<string>('painel');
  const [notFoundPath,setNotFoundPath]=useState<string|null>(null);
  const [sessionExpiredNotice,setSessionExpiredNotice]=useState(false);
  const [lockerPreset,setLockerPreset]=useState<LockerPreset|undefined>(undefined),[peoplePreset,setPeoplePreset]=useState<PeoplePreset|undefined>(undefined),[listRevision,setListRevision]=useState(0),[mobileMenu,setMobileMenu]=useState(false);
  const [ready,setReady]=useState(false),[message,setMessage]=useState(''),[noticeAction,setNoticeAction]=useState<NoticeAction|undefined>();
  const [dialog,setDialog]=useState<AppDialog|null>(null);
  const [aboutOpen,setAboutOpen]=useState(false);
  const [passwordOpen,setPasswordOpen]=useState(false);
  const userRoleRef=useRef<string|undefined>(undefined);
  userRoleRef.current=user?.role;
  const refresh=()=>{setBranches(current=>[...current]);void api<Branch[]>('/branches').then(list=>{setBranches(list);setBranchId(current=>list.some(branch=>branch.id===current)?current:list[0]?.id??'');}).catch(()=>{});};
  useEffect(()=>{void purgeOfflineCopy();},[]);
  useEffect(()=>{document.documentElement.dataset.theme=theme;document.querySelector('meta[name="theme-color"]')?.setAttribute('content','#2E1065');try{localStorage.setItem(themePreferenceKey,theme);}catch{/* A preferência continua ativa nesta sessão. */}},[theme]);
  const applyHash=()=>{
    const resolution=resolveHashPage(window.location.hash,userRoleRef.current);
    setSessionExpiredNotice(false);
    if(resolution.kind==='none'){setNotFoundPath(null);setPage(current=>tabKeys.has(current)?current:'painel');return;}
    if(resolution.kind==='notfound'){setNotFoundPath(resolution.path);return;}
    setNotFoundPath(null);setPage(resolution.page);
  };
  useEffect(()=>{applyHash();window.addEventListener('hashchange',applyHash);return()=>window.removeEventListener('hashchange',applyHash);},[]);
  useEffect(()=>{if(user)applyHash();},[user]);
  useEffect(()=>{setUnauthorizedHandler(()=>{setUser(null);setBranchId('');setSessionExpiredNotice(true);});return()=>setUnauthorizedHandler(null);},[]);
  const toggleTheme=()=>setTheme(current=>current==='dark'?'light':'dark');
  useEffect(()=>{let active=true;(async()=>{
    try{
      const me=await api<{user:User}>('/auth/me');if(!active)return;
      setUser(me.user);
      if(me.user.mustChangePassword)return;
      const list=await api<Branch[]>('/branches');if(!active)return;
      setBranches(list);setBranchId(list.find(item=>item.id===me.user.branchId)?.id??list[0]?.id??'');
    }catch(error){
      if(!active)return;
      if(error instanceof Error && 'status' in error)setUser(null);
      else setMessage('Não foi possível conectar ao servidor. Tente novamente.');
    }finally{if(active)setReady(true);}
  })();return()=>{active=false;};},[]);
  useEffect(()=>{const onEscape=(event:KeyboardEvent)=>{if(event.key==='Escape')setMobileMenu(false);};window.addEventListener('keydown',onEscape);return()=>window.removeEventListener('keydown',onEscape);},[]);
  async function logout(){try{await post('/auth/logout',{});}finally{setUser(null);setBranchId('');}}
  if(!ready)return <main className="center" role="status"><p>Preparando sua área de trabalho…</p></main>;
  if(!user)return <Login theme={theme} sessionExpired={sessionExpiredNotice} onToggleTheme={toggleTheme} onLogin={async result=>{setUser(result.user);if(result.user.mustChangePassword)return;const list=await api<Branch[]>('/branches');setBranches(list);setBranchId(list.find(item=>item.id===result.user.branchId)?.id??list[0]?.id??'');}}/>;
  if(user.mustChangePassword)return <Password theme={theme} onToggleTheme={toggleTheme} onDone={async()=>{setUser({...user,mustChangePassword:false});const list=await api<Branch[]>('/branches');setBranches(list);setBranchId(list.find(item=>item.id===user.branchId)?.id??list[0]?.id??'');}}/>;
  const admin=['geral','filial_admin'].includes(user.role);
  const showNotice=(nextMessage:string,action?:NoticeAction)=>{setMessage(nextMessage);setNoticeAction(action);};
  const askConfirm=(dialogMessage:string)=>new Promise<boolean>(resolve=>setDialog({kind:'confirm',message:dialogMessage,value:'',resolve}));
  const askPrompt=(dialogMessage:string)=>new Promise<string|null>(resolve=>setDialog({kind:'prompt',message:dialogMessage,value:'',resolve}));
  const finishDialog=(value:boolean|string|null)=>{if(!dialog)return;if(dialog.kind==='confirm')dialog.resolve(value===true);else dialog.resolve(typeof value==='string'?value:null);setDialog(null);};
  const updateDialogValue=(value:string)=>setDialog(current=>current?{...current,value}:current);
  const props:PageProps={branchId,branchName:branches.find(branch=>branch.id===branchId)?.name??'Filial autorizada',readonly:user.role==='consulta',admin,refresh,notice:showNotice,askConfirm,askPrompt};
  const visibleTabs=tabs.filter(({key})=>!['administracao','importacao','historico'].includes(key)||admin);
  function navigate(next:string,preset?:PeoplePreset){setPage(next);setMessage('');setNoticeAction(undefined);setMobileMenu(false);if(window.location.hash!==`#/${next}`)window.location.hash=`#/${next}`;if(next==='painel'){setLockerPreset(undefined);setListRevision(value=>value+1);}if(next==='pessoas')setPeoplePreset(preset);}
  function openLockers(preset:LockerPreset){setLockerPreset(preset);setListRevision(value=>value+1);setPage('painel');setMobileMenu(false);setMessage('');}
  function openAlert(key:NotificationKey){
    if(key==='withoutLocker')navigate('pessoas',{withoutLocker:true});
    else if(key==='registrationPending')navigate('pendencias');
    else openLockers({doublePartial:true});
  }
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Pular para o conteúdo</a>
    {mobileMenu&&<button type="button" className="mobile-scrim" aria-label="Fechar menu" onClick={()=>setMobileMenu(false)}/>}
    <aside className={`sidebar hide-on-print ${mobileMenu?'mobile-open':''}`}>
      <div className="brand"><span className="brand-icon"><LockerisIcon size={39}/></span><div><strong>Lockeris<span className="brand-dot">*</span></strong><small>Gestão de Armários</small></div></div>
      <nav aria-label="Navegação principal">{(['Operação','Gestão'] as const).map(group=>visibleTabs.some(item=>item.group===group)&&<div className="nav-group-wrap" key={group}><span className="nav-group">{group}</span>{visibleTabs.filter(item=>item.group===group).map(item=>{const Icon=item.icon;return <button key={item.key} className={page===item.key?'nav-item active':'nav-item'} aria-current={page===item.key?'page':undefined} onClick={()=>navigate(item.key)}><Icon size={18} strokeWidth={1.8} aria-hidden="true"/><span>{item.label}</span></button>;})}</div>)}</nav>
      <span className="nav-hint">Deslize para ver mais opções</span>
      <div className="sidebar-footer"><span>{roleName[user.role]}</span><button onClick={logout}><LogOut size={17} aria-hidden="true"/> Sair</button></div>
      <div className="sidebar-signature">
        <span>Desenvolvido por Elton Marques</span>
        <button type="button" className="sidebar-signature-info" aria-label="Sobre o Lockeris" title="Sobre o Lockeris" onClick={()=>setAboutOpen(true)}><Info size={15} strokeWidth={2} aria-hidden="true"/></button>
      </div>
    </aside>
    <div className="main-area">
      <Header page={page} tabs={tabs} theme={theme} onToggleTheme={toggleTheme} branches={branches} branchId={branchId}
        mobileMenu={mobileMenu} onToggleMobileMenu={()=>setMobileMenu(open=>!open)} user={user} onChangePassword={()=>setPasswordOpen(true)}
        onAlert={openAlert}
        onBranchChange={value=>{setBranchId(value);setLockerPreset(undefined);setPeoplePreset(undefined);if(page!=='resumo'&&page!=='painel')navigate('painel');}}/>
      {(message||dialog)&&<div className="app-dialog-backdrop" role="presentation">
        {message&&<section className="app-dialog" role="alertdialog" aria-modal="true" aria-labelledby="app-dialog-title">
          <div className="app-dialog-heading"><span className="eyebrow">Atualização</span><button type="button" className="app-dialog-close" onClick={()=>{setMessage('');setNoticeAction(undefined);}} aria-label="Fechar aviso">×</button></div>
          <h2 id="app-dialog-title">{message}</h2><div className="app-dialog-actions">{noticeAction&&<button type="button" className="primary btn-action" onClick={noticeAction.onClick}>{noticeAction.label}</button>}<button type="button" onClick={()=>{setMessage('');setNoticeAction(undefined);}}>Fechar</button></div>
        </section>}
        {dialog&&<section className="app-dialog" role="alertdialog" aria-modal="true" aria-labelledby="question-dialog-title">
          <div className="app-dialog-heading"><span className="eyebrow">Confirmação</span><button type="button" className="app-dialog-close" onClick={()=>finishDialog(dialog.kind==='confirm'?false:null)} aria-label="Fechar">×</button></div>
          <h2 id="question-dialog-title">{dialog.message}</h2>{dialog.kind==='prompt'&&<input autoFocus value={dialog.value} onChange={event=>updateDialogValue(event.target.value)} onKeyDown={event=>{if(event.key==='Enter')finishDialog(dialog.value);}}/>}
          <div className="app-dialog-actions"><button type="button" className="primary" onClick={()=>finishDialog(dialog.kind==='confirm'?true:dialog.value)}>Confirmar</button><button type="button" onClick={()=>finishDialog(dialog.kind==='confirm'?false:null)}>Cancelar</button></div>
        </section>}
      </div>}
      <main className="content" id="main-content" key={page==='painel'?`painel:${listRevision}`:`${branchId}:${page}`}>
        {!branchId?<section className="card"><p>Crie ou selecione uma filial em Administração.</p><Admin {...props} general={user.role==='geral'}/></section>:
          notFoundPath?<NotFound path={notFoundPath} onBack={()=>navigate('painel')}/>:
          page==='resumo'?<Overview {...props} onOpenLockers={openLockers} onNavigate={navigate}/>:page==='painel'?<Dashboard {...props} preset={lockerPreset}/>:page==='pessoas'?<People {...props} preset={peoplePreset}/>:page==='movimentacoes'?<Transfers {...props}/>:page==='achados'?<RetainedItems {...props}/>:page==='auditorias'?<Audits {...props}/>:page==='importacao'?<Imports {...props}/>:page==='pendencias'?<Pending {...props}/>:page==='historico'?<History {...props}/>:<Admin {...props} general={user.role==='geral'}/>}
      </main>
    </div>
    {aboutOpen&&<AboutModal onClose={()=>setAboutOpen(false)}/>}
    {passwordOpen&&<ChangePasswordModal onClose={()=>setPasswordOpen(false)} onChanged={message=>{setPasswordOpen(false);showNotice(message);}}/>}
  </div>;
}

function Login({onLogin,theme,onToggleTheme,sessionExpired}:{onLogin:(result:{user:User})=>void;theme:Theme;onToggleTheme:()=>void;sessionExpired?:boolean}){
  const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [revealPassword,setRevealPassword]=useState(false);
  async function submit(event:React.FormEvent){event.preventDefault();setBusy(true);setError('');try{await onLogin(await post('/auth/login',{username,password}));}catch(e){setError(e instanceof Error?e.message:'Falha no login');}finally{setBusy(false);}}
  return <main className="auth-page"><div className="auth-theme-control"><ThemeSwitch theme={theme} onToggle={onToggleTheme}/></div>
    <div className="auth-intro"><span className="brand-icon"><LockerisIcon size={56}/></span><span className="auth-brand">LOCKERIS</span>
      <h2>Gestão Integrada e Controle de Armários</h2>
      <p>Sistema de controle operacional de armários e rastreabilidade para Prevenção de Perdas.</p></div>
    <form className="auth-card" onSubmit={submit}><span className="eyebrow">Acesso interno</span><h1>Entrar</h1><p>Use as credenciais fornecidas pela administração.</p>
      <label>Nome de usuário<input required autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)}/></label>
      <label className="password-field">Senha
        <span className="password-control">
          <input type={revealPassword?'text':'password'} required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/>
          <button type="button" className="password-toggle" aria-pressed={revealPassword} title={revealPassword?'Ocultar senha':'Mostrar senha'}
            onClick={()=>setRevealPassword(current=>!current)}>
            <span className="sr-only">{revealPassword?'Ocultar senha':'Mostrar senha'}</span>
            <span className="password-toggle-icon">{revealPassword?<EyeOff size={20} strokeWidth={2} aria-hidden="true"/>:<Eye size={20} strokeWidth={2} aria-hidden="true"/>}</span>
          </button>
        </span>
      </label>{error&&<p className="field-error" role="alert">{error}</p>}{!error&&sessionExpired&&<p className="field-error" role="alert">Sua sessão expirou. Faça login novamente.</p>}<button className="primary" disabled={busy}>{busy?'Entrando…':'Entrar'}</button></form>
  </main>;
}
function Password({onDone,theme,onToggleTheme}:{onDone:()=>void;theme:Theme;onToggleTheme:()=>void}){
  const [oldPassword,setOld]=useState(''),[newPassword,setNew]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [revealOld,setRevealOld]=useState(false),[revealNew,setRevealNew]=useState(false);
  async function submit(event:React.FormEvent){event.preventDefault();setBusy(true);setError('');try{await post('/auth/password',{oldPassword,newPassword});onDone();}catch(e){setError(e instanceof Error?e.message:'Não foi possível atualizar a senha.');}finally{setBusy(false);}}
  return <main className="auth-page auth-page--center"><div className="auth-theme-control"><ThemeSwitch theme={theme} onToggle={onToggleTheme}/></div>
    <div className="auth-intro"><span className="brand-icon"><LockerisIcon size={56}/></span><span className="auth-brand">LOCKERIS</span>
      <h2>Atualização de Credenciais</h2>
      <p>Uma senha exclusiva protege a operação da filial e a Prevenção de Perdas.</p></div>
    <form className="auth-card" onSubmit={submit}><span className="eyebrow">Segurança de acesso</span><h1>Troque sua senha</h1><p>A senha temporária precisa ser substituída antes de continuar.</p>
      <label className="password-field">Senha temporária
        <span className="password-control">
          <input type={revealOld?'text':'password'} autoComplete="current-password" value={oldPassword} onChange={e=>setOld(e.target.value)} required/>
          <button type="button" className="password-toggle" aria-pressed={revealOld} title={revealOld?'Ocultar senha temporária':'Mostrar senha temporária'}
            onClick={()=>setRevealOld(current=>!current)}>
            <span className="sr-only">{revealOld?'Ocultar senha temporária':'Mostrar senha temporária'}</span>
            <span className="password-toggle-icon">{revealOld?<EyeOff size={20} strokeWidth={2} aria-hidden="true"/>:<Eye size={20} strokeWidth={2} aria-hidden="true"/>}</span>
          </button>
        </span>
      </label>
      <label className="password-field">Nova senha (12 caracteres ou mais)
        <span className="password-control">
          <input type={revealNew?'text':'password'} autoComplete="new-password" minLength={12} value={newPassword} onChange={e=>setNew(e.target.value)} required/>
          <button type="button" className="password-toggle" aria-pressed={revealNew} title={revealNew?'Ocultar nova senha':'Mostrar nova senha'}
            onClick={()=>setRevealNew(current=>!current)}>
            <span className="sr-only">{revealNew?'Ocultar nova senha':'Mostrar nova senha'}</span>
            <span className="password-toggle-icon">{revealNew?<EyeOff size={20} strokeWidth={2} aria-hidden="true"/>:<Eye size={20} strokeWidth={2} aria-hidden="true"/>}</span>
          </button>
        </span>
      </label>{error&&<p className="field-error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy?'Salvando…':'Salvar nova senha'}</button></form>
  </main>;
}
