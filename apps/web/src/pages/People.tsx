import {useEffect,useState} from 'react';
import {api,op,post,patch} from '../api';
import type {PageProps} from '../App';
import {DataState,EmptyState} from '../ui';
import {SelectField} from '../components/Select';

type Person={id:string;person_id:string;name:string;registration:string|null;category:string;origin:string;company:string|null;
  department:string|null;function_name:string|null;status:string;needs_fixed:boolean;ti_present:boolean|null;version:number;locker_id:string|null;number:string|null};
type Locker={id:string;number:string;version:number;modality:'fixo'|'rotativo';condition:string;migration_status:string;sector_occupant:string|null;
  occupants:{allocationId:string;allocationVersion:number;personId:string}[];capacity:number;is_double:boolean};
type Lookup={id:string;person_id:string;registration:string;name:string;department:string|null;function_name:string|null;locker_id:string|null};
const empty={name:'',registration:'',category:'vinculo_nao_identificado',company:'',department:'',functionName:'',needsFixed:true};
const labels:Record<string,string>={colaborador:'Colaborador',promotor_fixo:'Promotor fixo',roteirista:'Roteirista',terceirizado:'Terceirizado',vinculo_nao_identificado:'Vínculo não identificado'};
export function People({branchId,branchName,readonly,refresh,notice,askConfirm,askPrompt,admin=false}:PageProps){
  const [people,setPeople]=useState<Person[]>([]),[lockers,setLockers]=useState<Locker[]>([]),[q,setQ]=useState(''),[category,setCategory]=useState('');
  const [form,setForm]=useState(empty),[editing,setEditing]=useState<Person|null>(null),[busy,setBusy]=useState(false);
  const [selected,setSelected]=useState<string[]>([]),[registration,setRegistration]=useState(''),[found,setFound]=useState<Lookup|null>(null),[lockerId,setLockerId]=useState('');
  const [keyCopy,setKeyCopy]=useState('sim'),[transferReason,setTransferReason]=useState(''),[assignmentNote,setAssignmentNote]=useState('');
  const [loading,setLoading]=useState(true),[loadError,setLoadError]=useState(''),[lookupError,setLookupError]=useState('');
  async function load(){setLoading(true);setLoadError('');try{
    const [persons,cabinets]=await Promise.all([api<Person[]>(`/branches/${branchId}/people`),api<Locker[]>(`/branches/${branchId}/lockers`)]);
    setPeople(persons);setLockers(cabinets);
    }catch(error){setLoadError(error instanceof Error?error.message:'Confira a conexão e tente novamente.');throw error;}finally{setLoading(false);}
  }
  useEffect(()=>{load().catch(()=>{});},[branchId]);
  async function afterMutation(message:string){try{await load();refresh();notice(message);}catch{notice('A ação foi concluída, mas a lista não foi atualizada. Recarregue antes de agir novamente.');}}
  const filtered=people.filter(person=>(!category||person.category===category)&&(!q||[person.name,person.registration??'',person.company??'',person.number??''].some(value=>value.toLocaleLowerCase('pt-BR').includes(q.toLocaleLowerCase('pt-BR')))));
  const visibleCollaborators=filtered.filter(person=>person.category==='colaborador');
  const available=lockers.filter(locker=>locker.modality==='fixo'&&!locker.sector_occupant&&locker.condition==='disponivel'&&locker.migration_status==='conferido'&&
    (locker.occupants.length===0||locker.is_double&&locker.occupants.length<locker.capacity));
  function startEdit(person:Person){setEditing(person);setForm({name:person.name,registration:person.registration??'',category:person.category,company:person.company??'',department:person.department??'',functionName:person.function_name??'',needsFixed:person.needs_fixed});}
  async function save(event:React.FormEvent){event.preventDefault();setBusy(true);try{
    if(form.category==='terceirizado'&&!form.company.trim())throw new Error('Informe a empresa parceira confirmada ou selecione Vínculo não identificado.');
    if(form.category==='vinculo_nao_identificado'&&form.registration.trim())throw new Error('Valide a matrícula e escolha a categoria correspondente.');
    const payload={...form,registration:form.registration||null,company:form.company||null,department:form.department||null,functionName:form.functionName||null,operationId:op()};
    if(editing)await patch(`/branches/${branchId}/people/${editing.id}`,{...payload,expectedVersion:editing.version});
    else await post(`/branches/${branchId}/people`,{...payload,origin:'manual'});
    setForm(empty);setEditing(null);await afterMutation('Cadastro salvo.');
  }catch(error){notice(error instanceof Error?error.message:'Falha ao salvar');}finally{setBusy(false);}}
  async function status(person:Person){const next=person.status==='ativo'?'encerrado':'ativo';
    if(!await askConfirm(`${next==='encerrado'?'Encerrar atuação':'Reativar'} de ${person.name}? Ocupação atual permanece até liberação explícita.`))return;
    try{await post(`/branches/${branchId}/people/${person.id}/status`,{operationId:op(),expectedVersion:person.version,status:next});
      await afterMutation('Situação atualizada.');}catch(error){notice(error instanceof Error?error.message:'Falha');}}
  async function exception(person:Person){const reason=await askPrompt(`Por que ${person.name} não precisa de armário?`);if(!reason)return;
    try{await post(`/branches/${branchId}/people/${person.id}/exception`,{operationId:op(),expectedVersion:person.version,reason});
      await afterMutation('Dispensa de armário registrada.');}catch(error){notice(error instanceof Error?error.message:'Falha');}}
  async function lookup(){
    if(!registration.trim())return;setBusy(true);setFound(null);setLookupError('');setLockerId('');setKeyCopy('sim');setTransferReason('');setAssignmentNote('');
    try{setFound(await api<Lookup>(`/branches/${branchId}/people/registration/${encodeURIComponent(registration.trim())}`));}
    catch(error){setLookupError(error instanceof Error?error.message:'Não foi possível consultar esta matrícula.');}finally{setBusy(false);}
  }
  async function assign(){
    const cabinet=available.find(item=>item.id===lockerId),source=lockers.find(item=>item.id===found?.locker_id);
    if(!found||!cabinet||!keyCopy||source?.id===cabinet.id||source&&!transferReason.trim())return;setBusy(true);
    if(!await askConfirm(`${source?`Transferir ${found.name} do armário ${source.number} para o ${cabinet.number}`:`Atribuir o armário ${cabinet.number} a ${found.name}`} na filial ${branchName}?${source?' A ocupação anterior será encerrada.':''}`)){setBusy(false);return;}
    try{
      if(source){const allocation=source.occupants.find(item=>item.personId===found.person_id);if(!allocation)throw new Error('Ocupação atual não encontrada; recarregue a página');
        await post(`/branches/${branchId}/allocations/transfer`,{operationId:op(),allocationId:allocation.allocationId,expectedAllocationVersion:allocation.allocationVersion,
          destinationLockerId:cabinet.id,sourceVersion:source.version,destinationVersion:cabinet.version,reason:transferReason.trim(),
          note:assignmentNote.trim()||null,keyCopyAvailable:keyCopy==='sim'});
      }else await post(`/branches/${branchId}/allocations/occupy`,{operationId:op(),personId:found.person_id,lockerId:cabinet.id,expectedVersion:cabinet.version,
        modality:cabinet.modality,seasonal:false,note:assignmentNote.trim()||null,keyCopyAvailable:keyCopy==='sim'});
      await afterMutation(source?`Armário #${cabinet.number} transferido para ${found.name} com sucesso.`
        :`Armário #${cabinet.number} atribuído a ${found.name} com sucesso!`);
      setRegistration('');setFound(null);setLockerId('');setKeyCopy('sim');setTransferReason('');setAssignmentNote('');
    }catch(error){notice(error instanceof Error?error.message:'Falha na atribuição');}finally{setBusy(false);}
  }
  function choose(person:Person){setLookupError('');setRegistration(person.registration??'');setFound({id:person.id,person_id:person.person_id,registration:person.registration??'',
    name:person.name,department:person.department,function_name:person.function_name,locker_id:person.locker_id});setLockerId('');setKeyCopy('sim');setTransferReason('');setAssignmentNote('');}
  async function archive(all=false){
    if(!all&&!selected.length)return;
    const count=all?'todos os colaboradores ativos':`${selected.length} colaborador(es)`;
    if(!await askConfirm(`Remover ${count} da base ativa? Armários ainda ocupados ficarão pendentes de conferência.`))return;
    setBusy(true);
    try{const result=await post<{removed:number}>(`/branches/${branchId}/people/archive`,{operationId:op(),all,membershipIds:all?[]:selected});
      setSelected([]);setFound(null);await afterMutation(`${result.removed} colaborador(es) removido(s) da base ativa.`);
    }catch(error){notice(error instanceof Error?error.message:'Falha ao remover');}finally{setBusy(false);}
  }
  return <>
    <DataState loading={loading} error={loadError} onRetry={()=>{load().catch(()=>{});}}/>
    {!loading&&!loadError&&<>
    {!readonly&&<section className="card" id="people-assignment"><span className="eyebrow">Ação principal</span><h2>Atribuir ou transferir armário</h2><p>Localize uma pessoa pela matrícula para conferir os dados oficiais antes de escolher o armário.</p>
      <div className="inline-form"><label>Matrícula<input value={registration} onChange={event=>{setRegistration(event.target.value);setFound(null);}} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();lookup();}}}/></label>
        <button disabled={busy||!registration.trim()} onClick={lookup}>Buscar matrícula</button></div>
      {lookupError&&<p className="field-error" role="alert">{lookupError}</p>}
      {found&&<div className="lookup-result"><p><strong>{found.name}</strong> · Matrícula {found.registration}<br/>{found.department??'Setor não informado'} · {found.function_name??'Cargo ou função não informado'}</p>
        {found.locker_id&&<p>Ocupa o armário {lockers.find(item=>item.id===found.locker_id)?.number??'atual'}. Selecione outro para transferir.</p>}
        {lockerId&&<p className="action-summary"><strong>{found.locker_id?'Transferência':'Atribuição'}</strong> · {found.name}{found.locker_id?`, armário ${lockers.find(item=>item.id===found.locker_id)?.number??'atual'} → ${lockers.find(item=>item.id===lockerId)?.number}`:` receberá o armário ${lockers.find(item=>item.id===lockerId)?.number}`}, filial {branchName}.</p>}
        <div className="form-grid"><label>Armário de destino<select value={lockerId} onChange={event=>setLockerId(event.target.value)}>
          <option value="">Selecione</option>{available.filter(item=>item.id!==found.locker_id&&(!found.locker_id||item.modality===lockers.find(source=>source.id===found.locker_id)?.modality)).map(item=><option value={item.id} key={item.id}>Armário {item.number}{item.is_double?' · Duplo':''}</option>)}</select></label>
          <label>Cópia da chave<select required value={keyCopy} onChange={event=>setKeyCopy(event.target.value)}><option value="sim">Sim</option><option value="nao">Não</option></select></label>
          {found.locker_id&&<label>Motivo da transferência<input required minLength={3} value={transferReason} onChange={event=>setTransferReason(event.target.value)}/></label>}
          <label>Observação (opcional)<input value={assignmentNote} onChange={event=>setAssignmentNote(event.target.value)}/></label>
          <button className="primary" disabled={busy||!lockerId||!keyCopy||!!found.locker_id&&transferReason.trim().length<3} onClick={assign}>{found.locker_id?'Transferir armário':'Atribuir armário'}</button></div></div>}
    </section>}
    <section className="card"><div className="section-head"><div><span className="eyebrow">Base ativa</span><h2>Colaboradores e outras pessoas</h2><p>{filtered.length} {filtered.length===1?'cadastro ativo encontrado':'cadastros ativos encontrados'}</p></div></div>
      <div className="filters"><label>Buscar<input value={q} onChange={event=>setQ(event.target.value)} placeholder="Nome, matrícula ou armário"/></label>
        <SelectField label="Categoria" value={category} onChange={setCategory}
          options={[{value:'',label:'Todas'},{value:'colaborador',label:'Colaborador'},{value:'promotor_fixo',label:'Promotor fixo'},{value:'terceirizado',label:'Terceirizado'},{value:'vinculo_nao_identificado',label:'Vínculo não identificado'}]}/></div>
      {admin&&!readonly&&<div className="row-actions"><label className="check"><input type="checkbox" checked={visibleCollaborators.length>0&&visibleCollaborators.every(person=>selected.includes(person.id))}
        onChange={event=>setSelected(event.target.checked?[...new Set([...selected,...visibleCollaborators.map(person=>person.id)])]:selected.filter(id=>!visibleCollaborators.some(person=>person.id===id)))}/>
        Selecionar colaboradores exibidos</label><button disabled={busy||!selected.length} onClick={()=>archive()}>Remover selecionados ({selected.length})</button>
        <button disabled={busy} onClick={()=>archive(true)}>Limpar toda a base de colaboradores</button></div>}
      {!filtered.length?<EmptyState title={people.length?'Nenhuma pessoa encontrada':'Nenhuma pessoa na base ativa'} description={people.length?'Revise a busca ou a categoria selecionada.':'Confira a importação de colaboradores ou cadastre uma pessoa externa.'}/>:<div className="table-wrap people-table"><table><thead><tr>{admin&&!readonly&&<th>Selecionar</th>}<th>Pessoa</th><th>Categoria</th><th>Setor / função</th><th>Situação</th><th>Armário</th><th>Ações</th></tr></thead>
        <tbody>{filtered.map(person=><tr key={person.id}>{admin&&!readonly&&<td data-label="Selecionar">{person.category==='colaborador'&&<input type="checkbox" aria-label={`Selecionar ${person.name}`}
          checked={selected.includes(person.id)} onChange={event=>setSelected(event.target.checked?[...selected,person.id]:selected.filter(id=>id!==person.id))}/>}</td>}
          <td data-label="Pessoa"><strong>{person.name}</strong><small>{person.registration??'Sem matrícula'}</small></td><td data-label="Categoria">{labels[person.category]??'Outra categoria'}</td>
          <td data-label="Setor / função">{person.department??'—'}<small>{person.function_name??'—'}</small></td><td data-label="Situação">Ativo</td><td data-label="Armário">{person.number?`Armário ${person.number}`:'Sem armário'}</td>
          <td data-label="Ações">{!readonly&&<div className="row-actions">{person.category==='colaborador'?<button onClick={()=>{choose(person);document.getElementById('people-assignment')?.scrollIntoView();}}>{person.locker_id?'Transferir armário':'Atribuir armário'}</button>:<>
            <button onClick={()=>startEdit(person)}>Editar</button><button onClick={()=>status(person)}>Encerrar</button>
             {person.needs_fixed&&!person.locker_id&&<button onClick={()=>exception(person)}>Exceção</button>}</>}</div>}</td></tr>)}</tbody></table></div>}
    </section>
    {!readonly&&<section className="card"><div className="section-head"><div><h2>{editing?`Editar ${editing.name}`:'Cadastrar pessoa externa'}</h2>
      <p>Colaboradores da filial vêm da planilha de matrículas. Cadastre aqui pessoas externas ou com vínculo ainda não confirmado.</p></div>{editing&&<button onClick={()=>{setEditing(null);setForm(empty);}}>Cancelar edição</button>}</div>
      <form className="form-grid" onSubmit={save}><label>Nome<input required minLength={2} value={form.name} onChange={event=>setForm({...form,name:event.target.value})}/></label>
        <label>Categoria<select value={form.category} onChange={event=>setForm({...form,category:event.target.value,needsFixed:event.target.value==='promotor_fixo'})}>
          <option value="vinculo_nao_identificado">Vínculo não identificado</option><option value="promotor_fixo">Promotor fixo</option><option value="terceirizado">Terceirizado</option></select></label>
        <label>Matrícula<input required={form.category==='promotor_fixo'} value={form.registration} onChange={event=>setForm({...form,registration:event.target.value})}/></label>
        <label>Empresa / marca<input value={form.company} onChange={event=>setForm({...form,company:event.target.value})}/></label>
        <label>Setor<input value={form.department} onChange={event=>setForm({...form,department:event.target.value})}/></label>
        <label>Função<input value={form.functionName} onChange={event=>setForm({...form,functionName:event.target.value})}/></label>
        <label className="check"><input type="checkbox" checked={form.needsFixed} onChange={event=>setForm({...form,needsFixed:event.target.checked})}/>Precisa de armário fixo</label>
        <button className="primary" disabled={busy}>{busy?'Salvando…':'Salvar cadastro'}</button></form>
    </section>}
    </>}
  </>;
}
