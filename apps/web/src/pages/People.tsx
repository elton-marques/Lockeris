import {useEffect,useRef,useState} from 'react';
import {ArrowRight,ArrowRightLeft,Boxes,CircleAlert,User} from 'lucide-react';
import {api,op,post,patch} from '../api';
import type {PageProps,PeoplePreset} from '../App';
import {DataState,EmptyState,trapTabNavigation} from '../ui';
import {SelectField} from '../components/Select';

type Person={id:string;person_id:string;name:string;registration:string|null;category:string;origin:string;company:string|null;
  department:string|null;function_name:string|null;status:string;needs_fixed:boolean;ti_present:boolean|null;version:number;locker_id:string|null;number:string|null};
type Locker={id:string;number:string;version:number;modality:'fixo'|'rotativo';condition:string;migration_status:string;sector_occupant:string|null;
  occupants:{allocationId:string;allocationVersion:number;personId:string}[];capacity:number;is_double:boolean};
const empty={name:'',registration:'',category:'vinculo_nao_identificado',company:'',department:'',functionName:'',needsFixed:true};
const labels:Record<string,string>={colaborador:'Colaborador',promotor_fixo:'Promotor(a)',roteirista:'Roteirista',terceirizado:'Terceirizado',vinculo_nao_identificado:'Pendência Cadastral'};
export function People({branchId,branchName,readonly,refresh,notice,askConfirm,askPrompt,admin=false,preset}:PageProps&{preset?:PeoplePreset}){
  const [people,setPeople]=useState<Person[]>([]),[lockers,setLockers]=useState<Locker[]>([]),[q,setQ]=useState(''),[category,setCategory]=useState('');
  const [onlyWithoutLocker,setOnlyWithoutLocker]=useState(preset?.withoutLocker??false);
  const [form,setForm]=useState(empty),[editing,setEditing]=useState<Person|null>(null),[busy,setBusy]=useState(false);
  const [selected,setSelected]=useState<string[]>([]),[lockerId,setLockerId]=useState('');
  const [keyCopy,setKeyCopy]=useState('sim'),[transferReason,setTransferReason]=useState(''),[assignmentNote,setAssignmentNote]=useState('');
  const [loading,setLoading]=useState(true),[loadError,setLoadError]=useState('');
  const [details,setDetails]=useState<Person|null>(null),closeRef=useRef<HTMLButtonElement>(null);
  async function load(){setLoading(true);setLoadError('');try{
    const [persons,cabinets]=await Promise.all([api<Person[]>(`/branches/${branchId}/people`),api<Locker[]>(`/branches/${branchId}/lockers`)]);
    setPeople(persons);setLockers(cabinets);
    }catch(error){setLoadError(error instanceof Error?error.message:'Confira a conexão e tente novamente.');throw error;}finally{setLoading(false);}
  }
  useEffect(()=>{load().catch(()=>{});},[branchId]);
  useEffect(()=>{setOnlyWithoutLocker(preset?.withoutLocker??false);},[preset]);
  useEffect(()=>{if(!details)return;
    const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';closeRef.current?.focus();
    return()=>{document.body.style.overflow=overflow;previous?.focus();};},[details]);
  function modalKeyDown(event:React.KeyboardEvent<HTMLElement>){
    if(document.querySelector('#question-dialog-title'))return;
    if(event.key==='Escape'){event.preventDefault();setDetails(null);return;}
    trapTabNavigation(event);
  }
  function lockerCell(person:Person){
    if(person.number)return `Armário ${person.number}`;
    if(person.category==='colaborador'||person.category==='promotor_fixo')return <span className="status-badge status-badge--warning">Sem armário</span>;
    return 'Sem armário';
  }
  function editFromDetails(){if(!details)return;const person=details;setDetails(null);startEdit(person);
    setTimeout(()=>document.getElementById('people-form')?.scrollIntoView(),0);}
  async function afterMutation(message:string){try{await load();refresh();notice(message);}catch{notice('A ação foi concluída, mas a lista não foi atualizada. Recarregue antes de agir novamente.');}}
  const filtered=people.filter(person=>(!category||person.category===category)&&(!onlyWithoutLocker||!person.number)&&(!q||[person.name,person.registration??'',person.company??'',person.number??''].some(value=>value.toLocaleLowerCase('pt-BR').includes(q.toLocaleLowerCase('pt-BR')))));
  const visibleCollaborators=filtered.filter(person=>person.category==='colaborador');
  const visibleIds=visibleCollaborators.map(person=>person.id);
  const allVisibleSelected=visibleIds.length>0&&visibleIds.every(id=>selected.includes(id));
  function togglePerson(id:string,checked:boolean){
    setSelected(current=>checked?(current.includes(id)?current:[...current,id]):current.filter(value=>value!==id));
  }
  function toggleAllVisible(checked:boolean){
    setSelected(current=>checked?[...new Set([...current,...visibleIds])]:[]);
  }
  const available=lockers.filter(locker=>locker.modality==='fixo'&&!locker.sector_occupant&&locker.condition==='disponivel'&&locker.migration_status==='conferido'&&
    (locker.occupants.length===0||locker.is_double&&locker.occupants.length<locker.capacity));
  function startEdit(person:Person){setEditing(person);setForm({name:person.name,registration:person.registration??'',category:person.category,company:person.company??'',department:person.department??'',functionName:person.function_name??'',needsFixed:person.needs_fixed});}
  async function save(event:React.FormEvent){event.preventDefault();setBusy(true);try{
    if(form.category==='terceirizado'&&!form.company.trim())throw new Error('Informe a empresa parceira confirmada ou selecione Pendência Cadastral.');
    if(form.category==='vinculo_nao_identificado'&&form.registration.trim())throw new Error('Valide a matrícula e escolha a categoria correspondente.');
    const payload={...form,registration:form.registration||null,company:form.company||null,department:form.department||null,functionName:form.functionName||null,operationId:op()};
    if(editing)await patch(`/branches/${branchId}/people/${editing.id}`,{...payload,expectedVersion:editing.version});
    else await post(`/branches/${branchId}/people`,{...payload,origin:'manual'});
    setForm(empty);setEditing(null);await afterMutation('Cadastro salvo.');
  }catch(error){notice(error instanceof Error?error.message:'Falha ao salvar');}finally{setBusy(false);}}
  async function status(person:Person){const next=person.status==='ativo'?'encerrado':'ativo';
    const question=next==='encerrado'
      ?`Tem certeza que deseja excluir o colaborador ${person.name} da base? A ocupação atual permanece até a desocupação explícita.`
      :`Reativar o cadastro de ${person.name} na base?`;
    if(!await askConfirm(question))return;
    try{await post(`/branches/${branchId}/people/${person.id}/status`,{operationId:op(),expectedVersion:person.version,status:next});
      setDetails(null);await afterMutation(next==='encerrado'?'Cadastro excluído.':'Cadastro reativado.');}catch(error){notice(error instanceof Error?error.message:'Falha');}}
  async function exception(person:Person){const reason=await askPrompt(`Por que ${person.name} não precisa de armário?`);if(!reason)return;
    try{await post(`/branches/${branchId}/people/${person.id}/exception`,{operationId:op(),expectedVersion:person.version,reason});
      setDetails(null);await afterMutation('Dispensa de armário registrada.');}catch(error){notice(error instanceof Error?error.message:'Falha');}}
  async function assign(){
    const person=details;if(!person)return;
    const cabinet=available.find(item=>item.id===lockerId),source=lockers.find(item=>item.id===person.locker_id);
    if(!cabinet||!keyCopy||source?.id===cabinet.id||source&&!transferReason.trim())return;setBusy(true);
    if(!await askConfirm(`${source?`Transferir ${person.name} do armário ${source.number} para o ${cabinet.number}`:`Atribuir o armário ${cabinet.number} a ${person.name}`} na filial ${branchName}?${source?' O armário anterior ficará desocupado.':''}`)){setBusy(false);return;}
    try{
      if(source){const allocation=source.occupants.find(item=>item.personId===person.person_id);if(!allocation)throw new Error('Ocupação atual não encontrada; recarregue a página');
        await post(`/branches/${branchId}/allocations/transfer`,{operationId:op(),allocationId:allocation.allocationId,expectedAllocationVersion:allocation.allocationVersion,
          destinationLockerId:cabinet.id,sourceVersion:source.version,destinationVersion:cabinet.version,reason:transferReason.trim(),
          note:assignmentNote.trim()||null,keyCopyAvailable:keyCopy==='sim'});
      }else await post(`/branches/${branchId}/allocations/occupy`,{operationId:op(),personId:person.person_id,lockerId:cabinet.id,expectedVersion:cabinet.version,
        modality:cabinet.modality,seasonal:false,note:assignmentNote.trim()||null,keyCopyAvailable:keyCopy==='sim'});
      setDetails(null);setLockerId('');setKeyCopy('sim');setTransferReason('');setAssignmentNote('');
      await afterMutation(source?`Armário #${cabinet.number} transferido para ${person.name} com sucesso.`
        :`Armário #${cabinet.number} atribuído a ${person.name} com sucesso!`);
    }catch(error){notice(error instanceof Error?error.message:'Falha na atribuição');}finally{setBusy(false);}
  }
  async function archive(all=false){
    if(!all&&!selected.length)return;
    const count=all?'toda a base de colaboradores':`${selected.length} cadastro(s)`;
    if(!await askConfirm(`Excluir ${count} da base ativa? Armários ainda ocupados ficarão pendentes de conferência.`))return;
    setBusy(true);
    try{const result=await post<{removed:number}>(`/branches/${branchId}/people/archive`,{operationId:op(),all,membershipIds:all?[]:selected});
      setSelected([]);await afterMutation(`${result.removed} cadastro(s) excluído(s) da base ativa.`);
    }catch(error){notice(error instanceof Error?error.message:'Falha ao excluir');}finally{setBusy(false);}
  }
  return <>
    <DataState loading={loading} error={loadError} onRetry={()=>{load().catch(()=>{});}}/>
    {!loading&&!loadError&&<>
    <section className="card"><div className="section-head"><div><span className="eyebrow">Base ativa</span><h2>Colaboradores e outras pessoas</h2><p>{filtered.length} {filtered.length===1?'cadastro ativo encontrado':'cadastros ativos encontrados'}</p></div></div>
      <div className="filters"><label>Buscar<input value={q} onChange={event=>setQ(event.target.value)} placeholder="Nome, matrícula ou armário"/></label>
        <SelectField label="Categoria" value={category} onChange={setCategory}
          options={[{value:'',label:'Todas'},{value:'colaborador',label:'Colaborador'},{value:'promotor_fixo',label:'Promotor(a)'},{value:'terceirizado',label:'Terceirizado'},{value:'vinculo_nao_identificado',label:'Pendência Cadastral'}]}/></div>
      <div className="quick-filters"><span>Atalhos</span>
        <div className="chip-group" role="group" aria-label="Filtros rápidos">
          {[{label:'Todas as pessoas',active:!onlyWithoutLocker,apply:()=>setOnlyWithoutLocker(false)},
            {label:'Sem armário',active:onlyWithoutLocker,apply:()=>setOnlyWithoutLocker(true)}].map(filter=>
            <button key={filter.label} type="button" className={filter.active?'quick-filter active':'quick-filter'} aria-pressed={filter.active} onClick={filter.apply}>{filter.label}</button>)}
        </div>
      </div>
      {admin&&!readonly&&<div className="row-actions"><label className="check"><input type="checkbox" checked={allVisibleSelected} disabled={!visibleIds.length}
        onChange={event=>toggleAllVisible(event.target.checked)}/>
        Selecionar colaboradores exibidos</label>{selected.length>0&&<button disabled={busy} onClick={()=>archive()}>Excluir selecionados ({selected.length})</button>}
        <button disabled={busy} onClick={()=>archive(true)}>Excluir toda a base de colaboradores</button></div>}
      {!filtered.length?<EmptyState title={people.length?'Nenhuma pessoa encontrada':'Nenhuma pessoa na base ativa'} description={people.length?'Revise a busca, a categoria ou o filtro de armários.':'Confira a importação de colaboradores ou cadastre uma pessoa externa.'}/>:<div className="table-wrap people-table"><table><thead><tr>{admin&&!readonly&&<th>Selecionar</th>}<th>Pessoa</th><th>Categoria</th><th>Setor / função</th><th>Situação</th><th>Armário</th><th>Ações</th></tr></thead>
        <tbody>{filtered.map(person=><tr key={person.id} className="people-row" onClick={()=>setDetails(person)}>{admin&&!readonly&&<td data-label="Selecionar" onClick={event=>event.stopPropagation()}>{person.category==='colaborador'&&<div className="people-cell"><input type="checkbox" aria-label={`Selecionar ${person.name}`}
          checked={selected.includes(person.id)} onChange={event=>togglePerson(person.id,event.target.checked)}/></div>}</td>}
          <td data-label="Pessoa"><div className="people-cell"><strong>{person.name}</strong><small>{person.registration??'Sem matrícula'}</small></div></td><td data-label="Categoria">{labels[person.category]??'Outra categoria'}</td>
          <td data-label="Setor / função">{person.department??'—'}<small>{person.function_name??'—'}</small></td><td data-label="Situação">Ativo</td><td data-label="Armário">{lockerCell(person)}</td>
          <td data-label="Ações" onClick={event=>event.stopPropagation()}><div className="row-actions people-cell">
            <button type="button" className="table-detail" onClick={()=>setDetails(person)} aria-label={`Ver detalhes de ${person.name}`}>Ver detalhes <ArrowRight size={15} aria-hidden="true"/></button></div></td></tr>)}</tbody></table></div>}
    </section>
    {!readonly&&<section className="card" id="people-form"><div className="section-head"><div><h2>{editing?`Editar ${editing.name}`:'Cadastrar pessoa externa'}</h2>
      <p>Colaboradores da filial vêm da planilha de matrículas. Cadastre aqui pessoas externas ou com vínculo ainda não confirmado.</p></div>{editing&&<button onClick={()=>{setEditing(null);setForm(empty);}}>Cancelar edição</button>}</div>
      <form className="form-grid" onSubmit={save}><label>Nome<input required minLength={2} value={form.name} onChange={event=>setForm({...form,name:event.target.value})}/></label>
        <label>Categoria<select value={form.category} onChange={event=>setForm({...form,category:event.target.value,needsFixed:event.target.value==='promotor_fixo'})}>
          <option value="vinculo_nao_identificado">Pendência Cadastral</option><option value="promotor_fixo">Promotor(a)</option><option value="terceirizado">Terceirizado</option></select></label>
        <label>Matrícula<input required={form.category==='promotor_fixo'} value={form.registration} onChange={event=>setForm({...form,registration:event.target.value})}/></label>
        <label>Empresa / marca<input value={form.company} onChange={event=>setForm({...form,company:event.target.value})}/></label>
        <label>Setor<input value={form.department} onChange={event=>setForm({...form,department:event.target.value})}/></label>
        <label>Função<input value={form.functionName} onChange={event=>setForm({...form,functionName:event.target.value})}/></label>
        <label className="check"><input type="checkbox" checked={form.needsFixed} onChange={event=>setForm({...form,needsFixed:event.target.checked})}/>Precisa de armário fixo</label>
        <button className="primary" disabled={busy}>{busy?'Salvando…':'Salvar cadastro'}</button></form>
    </section>}
    {details&&<div className="locker-modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setDetails(null);}}>
      <section className="locker-modal" role="dialog" aria-modal="true" aria-labelledby="person-dialog-title" onKeyDown={modalKeyDown}>
        <div className="section-head"><div className="locker-title"><span className="eyebrow">Detalhes da pessoa</span>
          <h2 id="person-dialog-title">{details.name}</h2>
          <div className="locker-title-badges"><span className="badge">{labels[details.category]??'Outra categoria'}</span>
            <span className="badge">{details.registration?`Matrícula ${details.registration}`:'Sem matrícula'}</span></div>
          <p className="locker-title-sub">{details.status==='ativo'?'Ativa na filial':'Cadastro excluído'} · {details.number?`armário ${details.number}`:'sem armário'}</p></div>
          <div className="row-actions"><button ref={closeRef} type="button" onClick={()=>setDetails(null)}>Fechar</button></div></div>
        <section className="locker-card" aria-labelledby="person-data-title">
          <div className="locker-card-head"><h3 id="person-data-title"><span className="card-icon"><User size={16} aria-hidden="true"/></span>Cadastro</h3>
            <span className="badge">{labels[details.category]??'Outra categoria'}</span></div>
          <div className="locker-detail-summary">
            <div><small>Setor</small><strong>{details.department||'Não informado'}</strong></div>
            <div><small>Função</small><strong>{details.function_name||'Não informada'}</strong></div>
            <div><small>Empresa</small><strong>{details.company||'Não informada'}</strong></div>
            <div><small>Precisa de armário fixo</small><strong>{details.needs_fixed?'Sim':'Não'}</strong></div>
          </div>
        </section>
        <section className="locker-card" aria-labelledby="person-locker-title">
          <div className="locker-card-head"><h3 id="person-locker-title"><span className="card-icon"><Boxes size={16} aria-hidden="true"/></span>Armário vinculado</h3>
            {!details.number&&(details.category==='colaborador'||details.category==='promotor_fixo')&&<span className="status-badge status-badge--warning">Sem armário</span>}</div>
          {details.number
            ?<div className="locker-detail-summary"><div className="detail-availability"><small>Armário</small><strong>Nº {details.number}</strong><span>Vínculo ativo nesta filial.</span></div></div>
            :<p className="warning locker-warning"><CircleAlert size={15} aria-hidden="true"/><span>{details.category!=='colaborador'&&details.category!=='promotor_fixo'
              ?'Sem armário vinculado, conforme o vínculo desta pessoa.'
              :!readonly?'Sem armário vinculado. Escolha um armário livre abaixo para resolver esta pendência.':'Sem armário vinculado.'}</span></p>}
        </section>
        {!readonly&&(details.category==='colaborador'||details.category==='promotor_fixo')&&<section className="locker-card" aria-labelledby="person-assignment-title">
          <div className="locker-card-head"><h3 id="person-assignment-title"><span className="card-icon"><ArrowRightLeft size={16} aria-hidden="true"/></span>Atribuir ou transferir armário</h3>
            {details.locker_id&&<span className="badge">Transferência</span>}</div>
          <p className="locker-card-note">Confira os dados oficiais acima antes de escolher o armário de destino.</p>
          {lockerId&&<p className="action-summary"><strong>{details.locker_id?'Transferência':'Atribuição'}</strong> · {details.name}{details.locker_id?`, armário ${lockers.find(item=>item.id===details.locker_id)?.number??'atual'} → ${lockers.find(item=>item.id===lockerId)?.number}`:` receberá o armário ${lockers.find(item=>item.id===lockerId)?.number}`}, filial {branchName}.</p>}
          <div className="form-grid"><label>Armário de destino<select value={lockerId} onChange={event=>setLockerId(event.target.value)}>
            <option value="">Selecione</option>{available.filter(item=>item.id!==details.locker_id&&(!details.locker_id||item.modality===lockers.find(source=>source.id===details.locker_id)?.modality)).map(item=><option value={item.id} key={item.id}>Armário {item.number}{item.is_double?' · Duplo':''}</option>)}</select></label>
            <label>Cópia da chave<select value={keyCopy} onChange={event=>setKeyCopy(event.target.value)}><option value="sim">Sim</option><option value="nao">Não</option></select></label>
            {details.locker_id&&<label>Motivo da transferência<input required minLength={3} value={transferReason} onChange={event=>setTransferReason(event.target.value)}/></label>}
            <label>Observação (opcional)<input value={assignmentNote} onChange={event=>setAssignmentNote(event.target.value)}/></label>
            <button className="primary" disabled={busy||!lockerId||!keyCopy||!!details.locker_id&&transferReason.trim().length<3} onClick={assign}>{details.locker_id?'Transferir armário':'Atribuir armário'}</button></div>
        </section>}
        {!readonly&&<div className="row-actions">
          {details.category!=='colaborador'&&<button type="button" onClick={editFromDetails}>Editar cadastro</button>}
          {details.category!=='colaborador'&&<button type="button" onClick={()=>status(details)}>{details.status==='ativo'?'Excluir cadastro':'Reativar cadastro'}</button>}
          {details.category!=='colaborador'&&details.needs_fixed&&!details.locker_id&&<button type="button" onClick={()=>exception(details)}>Exceção</button>}
          <button type="button" onClick={()=>setDetails(null)}>Fechar</button>
        </div>}
      </section>
    </div>}
    </>}
  </>;
}
