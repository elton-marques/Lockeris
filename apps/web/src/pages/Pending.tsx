import {useEffect,useRef,useState} from 'react';
import {api,op,post,patch} from '../api';
import type {PageProps} from '../App';
import {RegistrationInput,findRegistration,registrationKey} from '../RegistrationInput';
import type {RegistrationOption} from '../RegistrationInput';

type Occupant={allocationId:string;allocationVersion:number;membershipId:string;membershipVersion:number;personId:string;
  name:string;registration:string|null;department:string|null;functionName:string|null;origin:string};
type Locker={id:string;number:string;version:number;capacity:number;is_double:boolean;condition:string;migration_status:string;
  sector_occupant:string|null;modality:'fixo'|'rotativo';occupants:unknown[]};
type SourceRow={row:number;name?:string;registration?:string;department?:string;functionName?:string;status?:string;sectorOccupant?:string|null};
type Item={id:string;version:number;kind:string;subject_type:string;subject_id:string;state:string;person_name:string|null;registration:string|null;
  person_id:string|null;origin:string|null;department:string|null;function_name:string|null;membership_version:number|null;locker_number:string|null;locker_version:number|null;
  sector_occupant:string|null;is_double:boolean|null;condition:string|null;key_copy_available:boolean|null;migration_status:string|null;occupants:Occupant[];source_rows:SourceRow[];
  allocation_id:string|null;allocation_version:number|null;sharing_version:number|null;seasonal_version:number|null;
  reason:string|null;resolution:string|null;updated_at:string};
const labels:Record<string,string>={ausente_ti:'Matrícula não encontrada na base atual',sem_armario:'Pessoa precisa de armário',
  atuacao_encerrada:'Cadastro encerrado com armário',sazonal_vencida:'Prazo de ocupação vencido',
  compartilhamento_vencido:'Prazo de compartilhamento vencido',migracao_inconclusiva:'Dados do armário a conferir',
  dados_alterados:'Dados cadastrais alterados',identificacao_conflitante:'Identificação conflitante'};
const resolvedLabels:Record<string,string>={sem_armario:'Necessidade de armário encerrada',migracao_inconclusiva:'Conferência do armário concluída',
  ausente_ti:'Matrícula ausente: caso encerrado',atuacao_encerrada:'Ocupação de cadastro encerrado concluída'};
const numeric=new Intl.Collator('pt-BR',{numeric:true,sensitivity:'base'});
const text=(value:string|null|undefined)=>value?.trim()||'Não informado';
const lockerItem=(item:Item)=>item.kind!=='sem_armario'&&!!item.locker_number;
const title=(item:Item)=>lockerItem(item)?`Armário ${item.locker_number}`:item.person_name??'Cadastro sem nome';
const resolutionText=(item:Item)=>{
  if(item.resolution&&item.resolution!=='Condição regularizada')return item.resolution;
  if(item.kind==='sem_armario'&&item.locker_number)return `Armário ${item.locker_number} atribuído; a pessoa deixou de estar sem armário.`;
  if(item.kind==='migracao_inconclusiva'&&item.migration_status==='conferido')return 'Os dados do armário foram conferidos.';
  return 'A condição que gerou esta pendência deixou de ocorrer.';
};
const originalReason=(item:Item)=>({sem_armario:'A pessoa estava ativa e precisava receber um armário.',
  migracao_inconclusiva:'Os dados importados deste armário precisavam de conferência.',
  ausente_ti:'A matrícula do ocupante não constava na base atual de colaboradores.',
  atuacao_encerrada:'O cadastro do ocupante foi encerrado enquanto o armário ainda estava ocupado.',
  sazonal_vencida:'A data prevista para a ocupação terminou.',
  compartilhamento_vencido:'A data prevista para o compartilhamento terminou.',
  dados_alterados:'Os dados da pessoa mudaram na base atual.',
  identificacao_conflitante:'Os dados de identificação apresentaram divergência.'} as Record<string,string>)[item.kind]??item.reason??'Registro criado para conferência.';
const searchText=(item:Item)=>[item.locker_number,item.person_name,item.registration,item.department,item.function_name,item.sector_occupant,
  ...(item.occupants??[]).flatMap(person=>[person.name,person.registration,person.department])].join(' ').toLocaleLowerCase('pt-BR');
const emptyEdit={isDouble:false,condition:'disponivel',keyCopy:'sim',sectorOccupant:'',name:'',registration:'',department:'',functionName:''};

export function Pending({branchId,readonly,copy,refresh,notice,admin=false}:PageProps){
  const [items,setItems]=useState<Item[]>([]),[lockers,setLockers]=useState<Locker[]>([]),[registrations,setRegistrations]=useState<RegistrationOption[]>([]),[stateFilter,setStateFilter]=useState('aberta'),[tab,setTab]=useState<'lockers'|'people'>('lockers');
  const [query,setQuery]=useState(''),[selectedId,setSelectedId]=useState<string|null>(null),[reviewed,setReviewed]=useState(false);
  const [note,setNote]=useState(''),[due,setDue]=useState(''),[busy,setBusy]=useState(false),closeRef=useRef<HTMLButtonElement>(null);
  const [edit,setEdit]=useState(emptyEdit),[occupantId,setOccupantId]=useState(''),[createPerson,setCreatePerson]=useState(false),[lockerId,setLockerId]=useState(''),[keyCopy,setKeyCopy]=useState('');
  async function load(){if(copy){setItems(copy.pending as Item[]);setLockers(copy.lockers as Locker[]);setRegistrations([]);return;}
    const [pending,cabinets,roster]=await Promise.all([api<Item[]>(`/branches/${branchId}/pending`),api<Locker[]>(`/branches/${branchId}/lockers`),
      api<RegistrationOption[]>(`/branches/${branchId}/people/registrations`)]);
    setItems(pending);setLockers(cabinets);setRegistrations(roster);}
  useEffect(()=>{load().catch(error=>notice(error.message));},[branchId,copy]);
  useEffect(()=>{if(!selectedId)return;const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';closeRef.current?.focus();return()=>{document.body.style.overflow=overflow;previous?.focus();};},[selectedId]);
  const selected=items.find(item=>item.id===selectedId);
  const byState=items.filter(item=>stateFilter==='todas'||item.state===stateFilter);
  const counts={lockers:byState.filter(lockerItem).length,people:byState.filter(item=>!lockerItem(item)).length};
  const shown=byState.filter(item=>(tab==='lockers'?lockerItem(item):!lockerItem(item))&&
    searchText(item).includes(query.toLocaleLowerCase('pt-BR'))).sort((a,b)=>tab==='lockers'
      ?numeric.compare(a.locker_number??'',b.locker_number??'')||numeric.compare(a.person_name??a.occupants?.[0]?.name??'',b.person_name??b.occupants?.[0]?.name??'')
      :(a.person_name??'').localeCompare(b.person_name??'','pt-BR',{sensitivity:'base'}));
  function fillEdit(item:Item,person?:Occupant){setEdit({isDouble:!!item.is_double,
    condition:item.condition??'disponivel',keyCopy:item.key_copy_available===false?'nao':'sim',
    sectorOccupant:item.sector_occupant??'',name:person?.name??item.person_name??'',registration:person?.registration??item.registration??'',
    department:person?.department??item.department??'',functionName:person?.functionName??item.function_name??''});}
  function open(item:Item){setSelectedId(item.id);setReviewed(false);setNote('');setDue('');setLockerId('');setKeyCopy('sim');
    setCreatePerson(false);setOccupantId(item.occupants?.[0]?.allocationId??'');fillEdit(item,item.occupants?.[0]);}
  function chooseOccupant(item:Item,id:string){setOccupantId(id);fillEdit(item,item.occupants.find(person=>person.allocationId===id));setReviewed(false);}
  const chosenOccupant=selected?.occupants?.find(person=>person.allocationId===occupantId);
  const officialEdit=findRegistration(registrations,edit.registration);
  const officialFieldsLocked=!!officialEdit||!!chosenOccupant&&chosenOccupant.origin==='ti'&&
    registrationKey(edit.registration)===registrationKey(chosenOccupant.registration??'');
  function changeRegistration(value:string,match:RegistrationOption|undefined){
    const replacingOfficial=chosenOccupant?.origin==='ti'&&registrationKey(value)!==registrationKey(chosenOccupant.registration??'');
    setEdit(current=>({...current,registration:value,name:match?.name??(replacingOfficial?'':current.name),
      department:match?.department??(replacingOfficial?'':current.department),functionName:match?.functionName??(replacingOfficial?'':current.functionName)}));
  }
  function toggleCreatePerson(item:Item,checked:boolean){setCreatePerson(checked);setOccupantId(checked?'':item.occupants?.[0]?.allocationId??'');
    if(checked)setEdit(current=>({...current,sectorOccupant:'',name:'',registration:'',department:'',functionName:''}));
    else fillEdit(item,item.occupants?.[0]);}
  async function act<T>(callback:()=>Promise<T>,message:string|((result:T)=>string)){setBusy(true);try{const result=await callback();await load();refresh();notice(typeof message==='string'?message:message(result));setSelectedId(null);}
    catch(error){notice(error instanceof Error?error.message:'Falha na operação');}finally{setBusy(false);}}
  function saveReview(finalize=false){if(!selected||!selected.locker_number||!selected.locker_version||!reviewed)return;
    const occupant=selected.occupants?.find(person=>person.allocationId===occupantId);
    act(()=>post<{officialName:string|null}>(`/branches/${branchId}/pending/${selected.id}/revise`,{
      operationId:op(),expectedVersion:selected.version,expectedLockerVersion:selected.locker_version,
      isDouble:edit.isDouble,condition:edit.condition,keyCopyAvailable:edit.keyCopy==='sim',
      sectorOccupant:createPerson?null:edit.sectorOccupant.trim()||null,finalize,
      occupant:occupant||createPerson?{allocationId:occupant?.allocationId,membershipId:occupant?.membershipId,expectedMembershipVersion:occupant?.membershipVersion,
        name:edit.name.trim(),registration:edit.registration.trim()||null,department:edit.department.trim()||null,functionName:edit.functionName.trim()||null}:null}),
    result=>`${finalize?'Dados salvos e conferência concluída.':'Correções salvas.'}${result.officialName?` Dados oficiais de ${result.officialName} aplicados.`:''}`);}
  function assignFromPending(){if(!selected?.person_id||!lockerId||!keyCopy||!reviewed)return;
    const locker=lockers.find(item=>item.id===lockerId);if(!locker)return;
    act(()=>post(`/branches/${branchId}/allocations/occupy`,{operationId:op(),personId:selected.person_id,lockerId:locker.id,
      expectedVersion:locker.version,modality:locker.modality,seasonal:false,note:null,keyCopyAvailable:keyCopy==='sim'}),'Armário atribuído e pendência resolvida.');}
  function savePerson(){if(!selected||!selected.membership_version||selected.origin==='ti'||!reviewed||!edit.name.trim())return;
    act(()=>patch(`/branches/${branchId}/people/${selected.subject_id}`,{operationId:op(),expectedVersion:selected.membership_version,
      name:edit.name.trim(),registration:edit.registration.trim()||null,department:edit.department.trim()||null,
      functionName:edit.functionName.trim()||null}),'Dados da pessoa atualizados.');}
  function run(item:Item){if(!reviewed||busy)return;
    if(['ausente_ti','atuacao_encerrada'].includes(item.kind)&&item.allocation_id&&item.allocation_version)
      return act(()=>post(`/branches/${branchId}/allocations/release`,{operationId:op(),allocationId:item.allocation_id,expectedVersion:item.allocation_version}),'Saída do armário registrada.');
    if(item.kind==='migracao_inconclusiva'&&item.locker_version)return saveReview(true);
    if(item.kind==='sem_armario'&&item.membership_version&&note.trim().length>=3)
      return act(()=>post(`/branches/${branchId}/people/${item.subject_id}/exception`,{operationId:op(),expectedVersion:item.membership_version,reason:note.trim()}),'Dispensa de armário registrada.');
    if(['dados_alterados','identificacao_conflitante'].includes(item.kind)&&note.trim().length>=3)
      return act(()=>post(`/branches/${branchId}/pending/${item.id}/resolve`,{operationId:op(),expectedVersion:item.version,resolution:note.trim()}),'Revisão registrada.');
    if(item.kind==='sazonal_vencida'&&item.seasonal_version&&due&&note.trim().length>=3)
      return act(()=>post(`/branches/${branchId}/allocations/${item.subject_id}/due`,{operationId:op(),expectedVersion:item.seasonal_version,
        dueAt:new Date(`${due}T12:00:00`).toISOString(),reason:note.trim()}),'Prazo atualizado.');
    if(item.kind==='compartilhamento_vencido'&&item.sharing_version&&due&&note.trim().length>=3)
      return act(()=>post(`/branches/${branchId}/sharings/${item.subject_id}/renew`,{operationId:op(),expectedVersion:item.sharing_version,
        dueAt:new Date(`${due}T12:00:00`).toISOString(),reason:note.trim()}),'Prazo atualizado.');
  }
  function effective(item:Item){if(!reviewed||!item.seasonal_version||note.trim().length<3)return;
    act(()=>post(`/branches/${branchId}/allocations/${item.subject_id}/effective`,{operationId:op(),expectedVersion:item.seasonal_version,reason:note.trim()}),'Ocupação efetivada.');}
  function modalKeyDown(event:React.KeyboardEvent<HTMLElement>){if(event.key==='Escape'){event.preventDefault();setSelectedId(null);return;}
    if(event.key!=='Tab')return;const elements=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)'));
    if(!elements.length)return;if(event.shiftKey&&document.activeElement===elements[0]){event.preventDefault();elements.at(-1)?.focus();}
    else if(!event.shiftKey&&document.activeElement===elements.at(-1)){event.preventDefault();elements[0].focus();}}
  const available=lockers.filter(item=>item.condition==='disponivel'&&item.migration_status==='conferido'&&!item.sector_occupant&&
    (item.occupants.length===0||item.is_double&&item.occupants.length<item.capacity)).sort((a,b)=>numeric.compare(a.number,b.number));
  const needsNote=selected&&['sem_armario','dados_alterados','identificacao_conflitante','sazonal_vencida','compartilhamento_vencido'].includes(selected.kind);
  const needsDue=selected&&['sazonal_vencida','compartilhamento_vencido'].includes(selected.kind);
  const actionLabel=selected&&({ausente_ti:'Registrar saída do armário',atuacao_encerrada:'Registrar saída do armário',
    migracao_inconclusiva:'Concluir conferência',sem_armario:'Registrar dispensa de armário',dados_alterados:'Registrar revisão',
    identificacao_conflitante:'Registrar revisão',sazonal_vencida:'Prorrogar prazo',compartilhamento_vencido:'Prorrogar prazo'} as Record<string,string>)[selected.kind];
  const reviewReady=(!chosenOccupant||!!edit.name.trim())&&(!createPerson||!!edit.name.trim()||!!edit.registration.trim());
  const actionEnabled=!!selected&&reviewed&&!busy&&(!needsNote||note.trim().length>=3)&&(!needsDue||!!due)&&
    (selected?.kind!=='migracao_inconclusiva'||reviewReady);
  return <>
    <section className="card"><div className="section-head"><div><h2>{stateFilter==='resolvida'?'Histórico de pendências resolvidas':'Pendências para conferência'}</h2>
      <p>{stateFilter==='resolvida'?'Estes registros mostram situações anteriores e por que deixaram de estar pendentes.':'Abra um registro para comparar os dados do armário com o cadastro atual antes de agir.'}</p></div></div>
      <div className="pending-tabs" role="tablist" aria-label="Tipo de pendência">
        <button type="button" role="tab" aria-selected={tab==='lockers'} onClick={()=>setTab('lockers')}>Armários ({counts.lockers})</button>
        <button type="button" role="tab" aria-selected={tab==='people'} onClick={()=>setTab('people')}>Pessoas ({counts.people})</button>
      </div>
      <div className="filters"><label>Buscar<input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Número, nome, matrícula ou setor"/></label>
        <label>Exibir<select value={stateFilter} onChange={event=>setStateFilter(event.target.value)}><option value="aberta">Abertas</option>
          <option value="resolvida">Resolvidas</option><option value="todas">Todas</option></select></label></div>
      <div className="pending-list">{shown.length===0?<p className="empty">Nenhuma pendência neste filtro.</p>:shown.map(item=><article className="pending-item" key={item.id}>
        <div><span className={`badge${item.state==='aberta'?' alert':''}`}>{item.state==='resolvida'?(resolvedLabels[item.kind]??labels[item.kind]??item.kind):(labels[item.kind]??item.kind)}</span><h3>{title(item)}</h3>
          <p>{item.person_name??item.occupants?.map(person=>person.name).join(', ')??''}{item.registration?` · Matrícula ${item.registration}`:''}</p>
          <p>Motivo: {originalReason(item)}</p>{item.state==='resolvida'&&<p>Resolução: {resolutionText(item)}</p>}</div>
        <button type="button" onClick={()=>open(item)}>{item.state==='resolvida'?'Ver histórico':'Conferir dados'}</button></article>)}</div>
    </section>
    {selected&&<div className="locker-modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setSelectedId(null);}}>
      <section className="locker-modal pending-modal" role="dialog" aria-modal="true" aria-labelledby="pending-dialog-title" onKeyDown={modalKeyDown}>
        <div className="section-head"><div><span className={`badge${selected.state==='aberta'?' alert':''}`}>{selected.state==='resolvida'?(resolvedLabels[selected.kind]??labels[selected.kind]??selected.kind):(labels[selected.kind]??selected.kind)}</span>
          <h2 id="pending-dialog-title">{title(selected)}</h2><p>{selected.state==='aberta'?'Aguardando conferência':'Pendência resolvida'}</p></div>
          <button ref={closeRef} type="button" onClick={()=>setSelectedId(null)}>Fechar</button></div>
        <p><strong>Motivo da pendência:</strong> {originalReason(selected)}</p>
        {selected.kind==='ausente_ti'&&selected.state==='aberta'&&<p className="warning">Esta matrícula não foi encontrada na base atual de colaboradores. A ocupação permanece registrada até a conferência.</p>}
        <div className="pending-detail-grid">
          <div><small>Armário</small><strong>{text(selected.locker_number)}</strong></div>
          <div><small>Nome no cadastro</small><strong>{text(selected.person_name??selected.occupants?.[0]?.name)}</strong></div>
          <div><small>Matrícula</small><strong>{text(selected.registration??selected.occupants?.[0]?.registration)}</strong></div>
          <div><small>Setor</small><strong>{text(selected.department??selected.occupants?.[0]?.department??selected.sector_occupant)}</strong></div>
          <div><small>Função</small><strong>{text(selected.function_name??selected.occupants?.[0]?.functionName)}</strong></div>
          {selected.is_double&&<div><small>Tipo de armário</small><strong>Duplo</strong></div>}
          {selected.locker_number&&<><div><small>Situação</small><strong>{selected.condition==='disponivel'?'Disponível':selected.condition==='manutencao'?'Manutenção':selected.condition==='bloqueado'?'Bloqueado':'Não informada'}</strong></div>
            <div><small>Cópia da chave</small><strong>{selected.key_copy_available===null?'Não informada':selected.key_copy_available?'Sim':'Não'}</strong></div></>}
        </div>
        {!!selected.source_rows?.length&&<div className="pending-table"><h3>Dados da planilha de armários</h3><div className="table-wrap"><table><thead><tr><th>Linha</th><th>Nome</th><th>Matrícula</th><th>Setor</th><th>Função</th><th>Status</th></tr></thead>
          <tbody>{selected.source_rows.map((row,index)=><tr key={`${row.row}-${index}`}><td>{row.row}</td><td>{text(row.name??row.sectorOccupant)}</td>
            <td>{text(row.registration)}</td><td>{text(row.department)}</td><td>{text(row.functionName)}</td><td>{text(row.status)}</td></tr>)}</tbody></table></div></div>}
        {!!selected.occupants?.length&&<div className="pending-table"><h3>Ocupação atual</h3><div className="table-wrap"><table><thead><tr><th>Nome</th><th>Matrícula</th><th>Setor</th><th>Função</th></tr></thead>
          <tbody>{selected.occupants.map(person=><tr key={person.allocationId}><td>{text(person.name)}</td><td>{text(person.registration)}</td>
            <td>{text(person.department)}</td><td>{text(person.functionName)}</td></tr>)}</tbody></table></div></div>}
        {selected.reason&&<p className="muted">Observação: {selected.reason}</p>}
        {selected.state==='resolvida'&&<p className="muted"><strong>Por que foi resolvida:</strong> {resolutionText(selected)} · {new Date(selected.updated_at).toLocaleDateString('pt-BR')}</p>}
        {admin&&!readonly&&selected.state==='aberta'&&selected.locker_number&&<div className="pending-editor">
          <h3>Corrigir dados nesta pendência</h3><p>Ao informar uma matrícula da base atual, nome, setor e função oficiais serão usados automaticamente.</p>
          <div className="form-grid"><div><small>Número do armário (fixo)</small><strong className="fixed-locker-number">{selected.locker_number}</strong></div>
            <label className="check"><input type="checkbox" checked={edit.isDouble} onChange={event=>{
              if(!event.target.checked&&createPerson&&selected.occupants.length)toggleCreatePerson(selected,false);
              setEdit(current=>({...current,isDouble:event.target.checked}));
            }}/>Armário duplo</label>
            <label>Situação<select value={edit.condition} onChange={event=>setEdit({...edit,condition:event.target.value})}>
              <option value="disponivel">Disponível</option><option value="manutencao">Manutenção</option><option value="bloqueado">Bloqueado</option></select></label>
            <label>Cópia da chave<select value={edit.keyCopy} onChange={event=>setEdit({...edit,keyCopy:event.target.value})}>
              <option value="sim">Sim</option><option value="nao">Não</option></select></label>
            {selected.occupants?.length>1&&<label>Ocupante a corrigir<select value={occupantId} onChange={event=>chooseOccupant(selected,event.target.value)}>
              {selected.occupants.map(person=><option key={person.allocationId} value={person.allocationId}>{person.name} · {person.registration??'Sem matrícula'}</option>)}</select></label>}
            {(selected.occupants.length===0||edit.isDouble&&selected.occupants.length<2)&&<label className="check"><input type="checkbox" checked={createPerson} onChange={event=>toggleCreatePerson(selected,event.target.checked)}/>
              {selected.occupants.length?'Adicionar segundo ocupante':'Cadastrar ocupante'}</label>}
            {chosenOccupant||createPerson?<>
              <RegistrationInput id="pending-occupant-registration" value={edit.registration} options={registrations} onChange={changeRegistration}/>
              <label>Nome<input value={edit.name} disabled={officialFieldsLocked} onChange={event=>setEdit({...edit,name:event.target.value})}/></label>
              <label>Setor<input value={edit.department} disabled={officialFieldsLocked} onChange={event=>setEdit({...edit,department:event.target.value})}/></label>
              <label>Função<input value={edit.functionName} disabled={officialFieldsLocked} onChange={event=>setEdit({...edit,functionName:event.target.value})}/></label>
            </>:<label>Setor ocupante<input value={edit.sectorOccupant} onChange={event=>setEdit({...edit,sectorOccupant:event.target.value})} placeholder="Ex.: Restaurante FC"/></label>}
          </div>
          {officialFieldsLocked&&<p className="muted">Nome, setor e função vêm da base atual de colaboradores.</p>}
          <button type="button" disabled={!reviewed||busy||!reviewReady} onClick={()=>saveReview(false)}>Salvar correções</button>
        </div>}
        {!readonly&&selected.state==='aberta'&&selected.kind==='sem_armario'&&<div className="pending-editor">
          {selected.origin!=='ti'&&<><h3>Corrigir cadastro</h3><div className="form-grid">
            <label>Nome<input value={edit.name} onChange={event=>setEdit({...edit,name:event.target.value})}/></label>
            <label>Matrícula<input value={edit.registration} onChange={event=>setEdit({...edit,registration:event.target.value})}/></label>
            <label>Setor<input value={edit.department} onChange={event=>setEdit({...edit,department:event.target.value})}/></label>
            <label>Função<input value={edit.functionName} onChange={event=>setEdit({...edit,functionName:event.target.value})}/></label></div>
            <button type="button" disabled={!reviewed||busy||!edit.name.trim()} onClick={savePerson}>Salvar cadastro</button></>}
          <h3>Atribuir armário nesta revisão</h3><div className="form-grid">
            <label>Armário disponível<select value={lockerId} onChange={event=>setLockerId(event.target.value)}><option value="">Selecione</option>
              {available.map(item=><option key={item.id} value={item.id}>Armário {item.number}{item.is_double?' · Duplo':''}</option>)}</select></label>
            <label>Cópia da chave<select value={keyCopy} onChange={event=>setKeyCopy(event.target.value)}>
              <option value="sim">Sim</option><option value="nao">Não</option></select></label></div>
          <button type="button" disabled={!reviewed||!lockerId||!keyCopy||busy} onClick={assignFromPending}>Atribuir armário</button>
        </div>}
        {!readonly&&selected.state==='aberta'&&<div className="pending-actions">
          {needsDue&&<label>Nova data prevista<input type="date" value={due} onChange={event=>setDue(event.target.value)}/></label>}
          {needsNote&&<label>{selected.kind==='sem_armario'?'Por que não precisa de armário?':'Registro da decisão'}
            <textarea value={note} onChange={event=>setNote(event.target.value)} minLength={3} rows={3}/></label>}
          <label className="check"><input type="checkbox" checked={reviewed} onChange={event=>setReviewed(event.target.checked)}/>Conferi os dados acima</label>
          <div className="row-actions">{actionLabel&&(selected.kind!=='migracao_inconclusiva'||admin)&&<button type="button" className="primary" disabled={!actionEnabled} onClick={()=>run(selected)}>{actionLabel}</button>}
            {selected.kind==='sazonal_vencida'&&<button type="button" disabled={!reviewed||note.trim().length<3||busy} onClick={()=>effective(selected)}>Manter ocupação sem prazo</button>}</div>
        </div>}
      </section></div>}
  </>;
}
