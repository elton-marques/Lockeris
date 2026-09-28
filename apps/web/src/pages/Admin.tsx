import {useEffect,useState} from 'react';
import {api,del,op,post,patch} from '../api';
import type {PageProps} from '../App';
import {conditionName,DataState,EmptyState,roleName} from '../ui';
import {categoryLabels} from '../locker-insights';
import {SelectField} from '../components/Select';
import {sectorSelectOptions} from '../sectors';
type Person={department:string|null;status:string};
type StaleRow={membership_id:string;person_id:string;name:string;registration:string|null;department:string|null;function_name:string|null;category:string;last_activity:string};
type Locker={id:string;number:string;sector_occupant:string|null;size:string;capacity:number;is_double:boolean;condition:string;modality:string;destination:string|null;version:number;occupants:unknown[];migration_status:string};
type User={id:string;username:string;role:string;active:boolean;must_change_password:boolean;version:number};
type Branch={id:string;name:string;version:number};
export function Admin({branchId,readonly,refresh,notice,askConfirm,general=false,admin=false}:PageProps&{general?:boolean}){
  const [lockers,setLockers]=useState<Locker[]>([]),[users,setUsers]=useState<User[]>([]),
    [people,setPeople]=useState<Person[]>([]),[branches,setBranches]=useState<Branch[]>([]);
  const [branchName,setBranchName]=useState(''),[lockerSearch,setLockerSearch]=useState('');
  const [staleDays,setStaleDays]=useState('90'),[stale,setStale]=useState<StaleRow[]|null>(null),
    [staleLoading,setStaleLoading]=useState(false),[staleError,setStaleError]=useState(''),
    [selected,setSelected]=useState<Set<string>>(new Set()),[purging,setPurging]=useState(false);
  const [locker,setLocker]=useState({number:'',size:'padrao',capacity:1,isDouble:false,modality:'fixo',destination:'',sectorOccupant:'',condition:'disponivel'});
  const [username,setUsername]=useState(''),[role,setRole]=useState('operador'),[temporaryPassword,setTemporaryPassword]=useState('');
  const [resetEditor,setResetEditor]=useState<string|null>(null),[resetValue,setResetValue]=useState('');
  const [loading,setLoading]=useState(true),[loadError,setLoadError]=useState('');
  async function load(){if(!branchId){setLoading(false);return;}setLoading(true);setLoadError('');try{const [b,c,p]=await Promise.all([api<Locker[]>(`/branches/${branchId}/lockers`),api<User[]>(`/branches/${branchId}/users`),api<Person[]>(`/branches/${branchId}/people`)]);setLockers(b);setUsers(c);setPeople(p);}
    catch(e){setLoadError(e instanceof Error?e.message:'Confira a conexão e tente novamente.');throw e;}finally{setLoading(false);}}
  useEffect(()=>{if(!readonly)load().catch(()=>{});},[branchId,readonly]);
  useEffect(()=>{if(!general)return;api<Branch[]>('/branches').then(setBranches).catch(()=>{});},[general]);
  async function loadStale(){
    const days=Math.min(3650,Math.max(30,Math.trunc(Number(staleDays))||90));
    setStaleLoading(true);setStaleError('');setSelected(new Set());
    try{setStale(await api<StaleRow[]>(`/branches/${branchId}/people/stale?inactiveDays=${days}`));}
    catch(e){setStale(null);setStaleError(e instanceof Error?e.message:'Confira a conexão e tente novamente.');}
    finally{setStaleLoading(false);}
  }
  useEffect(()=>{setStale(null);setSelected(new Set());if(admin&&!readonly&&branchId)loadStale().catch(()=>{});},[branchId,admin,readonly]);
  async function purge(){
    if(!selected.size)return;
    if(!await askConfirm(`Excluir ${selected.size} cadastro(s) da base? Esta ação não pode ser desfeita.`))return;
    setPurging(true);
    try{
      const result=await post<{purged:number;people:number}>('/people/bulk-purge',{operationId:op(),branchId,membershipIds:[...selected]});
      notice(`${result.purged} cadastro(s) excluído(s) da base${result.people?` e ${result.people} registro(s) de pessoa removido(s)`:''}.`);
      await loadStale();refresh();
    }catch(e){notice(e instanceof Error?e.message:'Não foi possível concluir a exclusão.');await loadStale();}
    finally{setPurging(false);}
  }
  async function act(fn:()=>Promise<unknown>,message:string){try{await fn();try{await load();refresh();notice(message);}catch{notice('A alteração foi concluída, mas a lista não foi atualizada. Recarregue antes de agir novamente.');}return true;}
    catch(e){notice(e instanceof Error?e.message:'Não foi possível concluir a alteração.');return false;}}
  async function createBranch(event:React.FormEvent){event.preventDefault();try{await post('/branches',{operationId:op(),name:branchName});window.location.reload();}catch(e){notice(e instanceof Error?e.message:'Falha');}}
  async function deleteBranch(item:Branch){
    if(!await askConfirm('Esta ação excluirá permanentemente a filial e TODOS os armários e históricos associados. Deseja continuar?'))return;
    try{await del(`/branches/${item.id}`,{operationId:op(),expectedVersion:item.version});}
    catch(e){notice(e instanceof Error?e.message:'Não foi possível excluir a filial.');return;}
    if(item.id===branchId){window.location.reload();return;}
    setBranches(current=>current.filter(branch=>branch.id!==item.id));
    refresh();
    notice(`Filial ${item.name} excluída com todos os dados associados.`);
  }
  async function createLocker(event:React.FormEvent){event.preventDefault();if(await act(()=>post(`/branches/${branchId}/lockers`,{operationId:op(),...locker,destination:locker.destination||null,sectorOccupant:locker.sectorOccupant||null}),`Armário ${locker.number} cadastrado.`))setLocker({...locker,number:'',destination:'',sectorOccupant:''});}
  async function createUser(event:React.FormEvent){event.preventDefault();if(await act(()=>post(`/branches/${branchId}/users`,{operationId:op(),username,role,temporaryPassword}),`Acesso de ${username} criado.`)){setUsername('');setTemporaryPassword('');}}
  async function reset(event:React.FormEvent,user:User){event.preventDefault();if(await act(()=>post(`/branches/${branchId}/users/${user.id}/reset`,{operationId:op(),expectedVersion:user.version,temporaryPassword:resetValue}),`Senha de ${user.username} redefinida. A troca será exigida no próximo acesso.`)){setResetEditor(null);setResetValue('');}}
  async function toggleUser(user:User){if(!await askConfirm(`${user.active?'Desativar':'Ativar'} o acesso de ${user.username}?`))return;await act(()=>patch(`/branches/${branchId}/users/${user.id}`,{operationId:op(),expectedVersion:user.version,active:!user.active}),`Acesso de ${user.username} ${user.active?'desativado':'ativado'}.`);}
  async function removeUser(user:User){
    if(!await askConfirm(`Tem certeza que deseja excluir o utilizador ${user.username}? Esta ação não poderá ser desfeita.`))return;
    await act(()=>del(`/users/${user.id}`,{operationId:op(),expectedVersion:user.version}),`Acesso de ${user.username} excluído.`);
  }
  async function changeRole(user:User,next:string){if(next===user.role||!await askConfirm(`Alterar o perfil de ${user.username} para ${roleName[next]}?`))return;await act(()=>patch(`/branches/${branchId}/users/${user.id}`,{operationId:op(),expectedVersion:user.version,role:next}),`Perfil de ${user.username} atualizado.`);}
  async function toggleDouble(item:Locker){await act(()=>patch(`/branches/${branchId}/lockers/${item.id}`,{operationId:op(),expectedVersion:item.version,isDouble:!item.is_double,capacity:item.is_double?1:2}),`Tipo do armário ${item.number} atualizado.`);}
  async function condition(item:Locker,value:string){if(value===item.condition||!await askConfirm(`Alterar a situação do armário ${item.number} para ${conditionName[value]}?`))return;await act(()=>patch(`/branches/${branchId}/lockers/${item.id}`,{operationId:op(),expectedVersion:item.version,condition:value}),`Situação do armário ${item.number} atualizada.`);}
  const shownLockers=lockers.filter(item=>item.number.toLocaleLowerCase('pt-BR').includes(lockerSearch.trim().toLocaleLowerCase('pt-BR')));
  return <div className="stack">{general&&<section className="card"><span className="eyebrow">Estrutura</span><h2>Criar filial</h2><form className="inline-form" onSubmit={createBranch}><label>Nome<input required value={branchName} onChange={e=>setBranchName(e.target.value)}/></label><button className="primary">Criar filial</button></form></section>}
    {general&&<section className="card"><span className="eyebrow">Filiais</span><h2>Filiais cadastradas</h2>
      {branches.length?<div className="table-wrap"><table><thead><tr><th>Nome</th><th>Ações</th></tr></thead><tbody>{branches.map(item=><tr key={item.id}>
        <td data-label="Nome"><strong>{item.name}</strong>{item.id===branchId&&<small> Filial em uso</small>}</td>
        <td data-label="Ações"><div className="row-actions"><button type="button" onClick={()=>{deleteBranch(item).catch(()=>{});}}>Excluir filial</button></div></td>
      </tr>)}</tbody></table></div>:<EmptyState title="Nenhuma filial cadastrada" description="Crie a primeira filial no formulário acima."/>}
    </section>}
    {!branchId?null:readonly?<section className="card"><EmptyState title="Administração indisponível" description="Este perfil ou a consulta sem conexão não permite alterar dados."/></section>:<>
      <DataState loading={loading} error={loadError} onRetry={()=>{load().catch(()=>{});}}/>
      {!loading&&!loadError&&<>
      <section className="card"><span className="eyebrow">Cadastro e capacidade</span><h2>Armários</h2><label>Buscar pelo número do armário<input type="search" value={lockerSearch} onChange={event=>setLockerSearch(event.target.value)} onKeyDown={event=>{if(event.key==='Escape')setLockerSearch('');}}/></label><p role="status">{shownLockers.length} de {lockers.length} armários</p>
        {lockers.length?<div className="table-wrap admin-locker-table" tabIndex={0} aria-label="Lista de armários; use as setas para rolar"><table><thead><tr><th>Número</th><th>Tipo</th><th>Ocupação</th><th>Situação</th><th>Ações</th></tr></thead><tbody>{shownLockers.map(x=><tr key={x.id}>
          <td data-label="Número"><strong>{x.number}</strong></td><td data-label="Tipo">{x.is_double&&<span className="double-badge table-badge">Duplo</span>}<span>{x.capacity} {x.capacity===1?'vaga':'vagas'}</span></td><td data-label="Ocupação">{x.sector_occupant?`Setor: ${x.sector_occupant}`:x.occupants.length?`${x.occupants.length} ${x.occupants.length===1?'pessoa':'pessoas'}`:'Livre'}</td>
          <td data-label="Situação">{conditionName[x.condition]??'Não informada'}{x.migration_status==='inconclusivo'?' · conferência pendente':''}</td><td data-label="Ações"><div className="row-actions"><button onClick={()=>toggleDouble(x)}>{x.is_double?'Remover indicação de duplo':'Marcar duplo'}</button>
            <label className="inline-control">Situação<select aria-label={`Situação do armário ${x.number}`} value={x.condition} onChange={event=>condition(x,event.target.value)}><option value="disponivel">Disponível</option><option value="manutencao">Em manutenção</option><option value="bloqueado">Bloqueado</option></select></label></div></td></tr>)}</tbody></table></div>:<EmptyState title="Nenhum armário cadastrado" description="Cadastre o primeiro armário abaixo ou use a carga inicial em Importações."/>}
        <h3 className="subsection-title">Novo armário</h3><form className="form-grid" onSubmit={createLocker}><label>Número<input required value={locker.number} onChange={e=>setLocker({...locker,number:e.target.value})}/></label><label className="check"><input type="checkbox" checked={locker.isDouble} onChange={e=>setLocker({...locker,isDouble:e.target.checked,capacity:e.target.checked?2:1})}/>Armário duplo (dois compartimentos)</label><label>Modalidade<input value="Fixo" readOnly/></label><label>Destinação<input value={locker.destination} onChange={e=>setLocker({...locker,destination:e.target.value})}/></label><div className="control-cell control-span"><SelectField label="Setor ocupante (opcional)" value={locker.sectorOccupant} placeholder="Sem setor ocupante"
          onChange={value=>setLocker({...locker,sectorOccupant:value})} options={sectorSelectOptions(people,lockers,locker.sectorOccupant)}/></div><button className="primary">Cadastrar armário</button></form></section>
      <section className="card"><span className="eyebrow">Permissões</span><h2>Acessos</h2><div className="list">{users.map(x=><div className="list-row" key={x.id}><div><strong>{x.username}</strong><small>{roleName[x.role]??'Perfil de acesso'} · {x.active?'ativo':'inativo'}{x.must_change_password?' · troca de senha pendente':''}</small></div><div className="user-actions"><div className="row-actions"><label className="inline-control">Perfil<select aria-label={`Perfil de ${x.username}`} value={x.role} onChange={event=>changeRole(x,event.target.value)}>{x.role==='geral'&&<option value="geral" disabled>Administração geral</option>}<option value="filial_admin">Administração da filial</option><option value="operador">Operação</option><option value="consulta">Consulta</option></select></label><button onClick={()=>toggleUser(x)}>{x.active?'Desativar':'Ativar'}</button><button onClick={()=>{setResetEditor(resetEditor===x.id?null:x.id);setResetValue('');}}>Redefinir senha</button><button onClick={()=>{removeUser(x).catch(()=>{});}}>Excluir</button></div>
        {resetEditor===x.id&&<form className="inline-edit" onSubmit={event=>reset(event,x)}><label>Nova senha temporária para {x.username}<input type="password" autoComplete="new-password" required minLength={12} value={resetValue} onChange={event=>setResetValue(event.target.value)}/></label><p>A troca será exigida no próximo acesso.</p><button className="primary">Salvar nova senha</button><button type="button" onClick={()=>setResetEditor(null)}>Cancelar</button></form>}</div></div>)}</div><h3 className="subsection-title">Novo usuário</h3><form className="form-grid" onSubmit={createUser}><label>Nome de usuário<input required minLength={3} pattern="[a-zA-Z0-9._-]+" value={username} onChange={e=>setUsername(e.target.value)}/></label><label>Perfil<select value={role} onChange={e=>setRole(e.target.value)}><option value="filial_admin">Administração da filial</option><option value="operador">Operação</option><option value="consulta">Consulta</option></select></label><label>Senha temporária<input type="password" minLength={12} required value={temporaryPassword} onChange={e=>setTemporaryPassword(e.target.value)}/></label><button className="primary">Criar usuário</button></form></section>
      {admin&&<section className="card sanitation-card" id="sanitation" aria-labelledby="sanitation-title">
        <span className="eyebrow">Manutenção da base</span><h2 id="sanitation-title">Higienização de base</h2>
        <p>Exclua em lote cadastros ativos que estão sem armário e sem movimentação dentro da janela informada. Cadastros com armário vinculado são bloqueados até a ocupação ser encerrada.</p>
        <div className="sanitation-toolbar">
          <label>Inatividade mínima (dias)<input type="number" inputMode="numeric" min={30} max={3650} value={staleDays} disabled={staleLoading||purging}
            onChange={event=>setStaleDays(event.target.value)} onBlur={()=>{if(stale)loadStale().catch(()=>{});}}/></label>
          <button type="button" disabled={staleLoading||purging||!branchId} onClick={()=>{loadStale().catch(()=>{});}}>{staleLoading?'Analisando…':'Analisar cadastros'}</button>
        </div>
        {staleError&&<p className="warning" role="alert">{staleError}</p>}
        {!staleError&&staleLoading&&<p role="status">Analisando cadastros da filial…</p>}
        {!staleError&&!staleLoading&&stale&&<>
          {!stale.length?<EmptyState title="Nenhum cadastro obsoleto" description={`Nenhum cadastro ativo e sem armário está parado há mais de ${staleDays} dias nesta filial.`}/>
          :<>
            <div className="table-wrap sanitation-table" tabIndex={0} aria-label="Cadastros obsoletos; use as setas para rolar"><table>
              <thead><tr><th className="sanitation-check-cell">Selecionar</th>
                <th>Nome</th><th>Matrícula</th><th>Setor</th><th>Última movimentação</th></tr></thead>
              <tbody>{stale.map(row=><tr key={row.membership_id}>
                <td className="sanitation-check-cell" data-label="Selecionar"><input type="checkbox" aria-label={`Selecionar ${row.name}`} checked={selected.has(row.membership_id)} disabled={purging}
                  onChange={event=>setSelected(current=>{const next=new Set(current);if(event.target.checked)next.add(row.membership_id);else next.delete(row.membership_id);return next;})}/></td>
                <td data-label="Nome"><strong>{row.name}</strong><small>{categoryLabels[row.category]??row.category}</small></td>
                <td data-label="Matrícula">{row.registration??'Sem matrícula'}</td>
                <td data-label="Setor">{row.department??'Sem setor'}</td>
                <td data-label="Última movimentação">{new Date(row.last_activity).toLocaleDateString('pt-BR')}</td>
              </tr>)}</tbody></table></div>
            <div className="sanitation-actions">
              <label className="check"><input type="checkbox" checked={selected.size===stale.length} disabled={purging}
                aria-label="Selecionar todos os cadastros"
                onChange={event=>setSelected(event.target.checked?new Set(stale.map(row=>row.membership_id)):new Set())}/>Selecionar todos</label>
              <strong aria-live="polite" role="status">{selected.size} de {stale.length} cadastro(s) selecionado(s)</strong>
              <button className="primary" type="button" disabled={!selected.size||purging} onClick={()=>{purge().catch(()=>{});}}>{purging?'Excluindo…':'Excluir cadastros selecionados'}</button>
            </div>
          </>}
        </>}
      </section>}
      </>}
    </>}
  </div>;
}
