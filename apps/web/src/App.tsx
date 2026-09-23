import {useEffect,useState} from 'react';
import {api,post,type User} from './api';
import {clearOffline,clearAuthorization,loadCopy,loadDevice,saveCopy,type OfflineCopy} from './offline';
import {Dashboard} from './pages/Dashboard';
import {People} from './pages/People';
import {Movements} from './pages/Movements';
import {Imports} from './pages/Imports';
import {Pending} from './pages/Pending';
import {History} from './pages/History';
import {Admin} from './pages/Admin';

export type PageProps={branchId:string;readonly:boolean;copy:OfflineCopy|null;refresh:()=>void;notice:(message:string)=>void};
type Branch={id:string;name:string;timezone:string};
const tabs=[['painel','Painel'],['pessoas','Pessoas'],['movimentacoes','Movimentações'],['importacao','Importação'],['pendencias','Pendências'],['historico','Histórico'],['administracao','Administração']] as const;
const pendingLogoutKey='armarios-pending-logout';
async function finishQueuedLogout(){if(localStorage.getItem(pendingLogoutKey)!=='1')return;try{await post('/auth/logout',{});localStorage.removeItem(pendingLogoutKey);}catch(error){if(error instanceof Error&&'status' in error){localStorage.removeItem(pendingLogoutKey);}else throw error;}}

export default function App(){
  const [user,setUser]=useState<User|null>(null),[branches,setBranches]=useState<Branch[]>([]),[branchId,setBranchId]=useState('');
  const [page,setPage]=useState<string>('painel'),[copy,setCopy]=useState<OfflineCopy|null>(null),[offline,setOffline]=useState(false);
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
  async function logout(){try{if(offline)localStorage.setItem(pendingLogoutKey,'1');else await post('/auth/logout',{});}finally{await clearOffline();setUser(null);setCopy(null);setOffline(false);setOfflineUnavailable(offline);setBranchId('');}}
  if(!ready)return <main className="center"><p>Carregando…</p></main>;
  if(offlineUnavailable&&!user)return <main className="center"><section className="auth-card"><h1>Consulta indisponível</h1><p>Não há cópia offline válida neste navegador. Conecte-se para entrar e atualizar os dados.</p></section></main>;
  if(!user)return <Login onLogin={async result=>{setUser(result.user);if(result.user.mustChangePassword)return;const list=await api<Branch[]>('/branches');setBranches(list);setBranchId(result.user.branchId??list[0]?.id??'');}}/>;
  if(user.mustChangePassword)return <Password onDone={async()=>{setUser({...user,mustChangePassword:false});const list=await api<Branch[]>('/branches');setBranches(list);setBranchId(user.branchId??list[0]?.id??'');}}/>;
  const props:PageProps={branchId,readonly:offline||user.role==='consulta',copy:offline?copy:null,refresh,notice:setMessage};
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-icon">▥</span><div><strong>Armários</strong><small>Gestão operacional</small></div></div>
      <nav aria-label="Navegação principal">{tabs.filter(([key])=>offline?['painel','pessoas','pendencias'].includes(key):key!=='administracao'||['geral','filial_admin'].includes(user.role)).map(([key,label])=><button key={key} className={page===key?'nav-item active':'nav-item'} onClick={()=>setPage(key)}>{label}</button>)}</nav>
      <div className="sidebar-footer"><span>{user.role.replace('_',' ')}</span><button onClick={logout}>Sair</button></div>
    </aside>
    <div className="main-area">
      <header className="topbar"><div><h1>{tabs.find(([key])=>key===page)?.[1]}</h1><p>Controle de ocupação e conferência</p></div><div className="top-actions">
        {branches.length>1?<label>Filial <select value={branchId} onChange={e=>{setBranchId(e.target.value);setPage('painel');}}>{branches.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>:<span className="branch-chip">{branches[0]?.name??'Filial autorizada'}</span>}
        <span className={offline?'status offline':'status online'}>{offline?'Offline · somente consulta':'Online'}</span>
      </div></header>
      {offline&&<div className="offline-banner" role="status">Cópia de {copy?new Date(copy.issuedAt).toLocaleString('pt-BR'):'data desconhecida'}. Consulta válida até {copy?new Date(copy.expiresAt).toLocaleString('pt-BR'):'—'}.</div>}
      {message&&<div className="notice" role="status">{message}<button onClick={()=>setMessage('')} aria-label="Fechar aviso">×</button></div>}
      <main className="content" key={`${branchId}:${page}`}>
        {!branchId?<section className="card"><p>Crie ou selecione uma filial em Administração.</p><Admin {...props} general={user.role==='geral'}/></section>:
          page==='painel'?<Dashboard {...props}/>:page==='pessoas'?<People {...props}/>:page==='movimentacoes'?<Movements {...props}/>:page==='importacao'?<Imports {...props}/>:page==='pendencias'?<Pending {...props}/>:page==='historico'?<History {...props}/>:<Admin {...props} general={user.role==='geral'}/>}
      </main>
    </div>
  </div>;
}

function Login({onLogin}:{onLogin:(result:{user:User})=>void}){
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function submit(event:React.FormEvent){event.preventDefault();setBusy(true);setError('');try{await onLogin(await post('/auth/login',{email,password}));}catch(e){setError(e instanceof Error?e.message:'Falha no login');}finally{setBusy(false);}}
  return <main className="auth-page"><form className="auth-card" onSubmit={submit}><div className="brand"><span className="brand-icon">▥</span><div><strong>Gestão de Armários</strong><small>Acesso interno</small></div></div><h1>Entrar</h1><p>Use sua conta autorizada para acessar a filial.</p><label>E-mail<input type="email" required autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Senha<input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>{error&&<p className="field-error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy?'Entrando…':'Entrar'}</button></form></main>;
}
function Password({onDone}:{onDone:()=>void}){
  const [oldPassword,setOld]=useState(''),[newPassword,setNew]=useState(''),[error,setError]=useState('');
  async function submit(event:React.FormEvent){event.preventDefault();try{await post('/auth/password',{oldPassword,newPassword});onDone();}catch(e){setError(e instanceof Error?e.message:'Falha');}}
  return <main className="auth-page"><form className="auth-card" onSubmit={submit}><h1>Troque sua senha</h1><p>A senha temporária precisa ser substituída antes de continuar.</p><label>Senha temporária<input type="password" value={oldPassword} onChange={e=>setOld(e.target.value)} required/></label><label>Nova senha (12 caracteres ou mais)<input type="password" minLength={12} value={newPassword} onChange={e=>setNew(e.target.value)} required/></label>{error&&<p className="field-error">{error}</p>}<button className="primary">Salvar senha</button></form></main>;
}
