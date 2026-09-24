import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowRight,CircleAlert,Grid2X2,KeyRound,List,SlidersHorizontal,X} from 'lucide-react';
import {api,op,post} from '../api';
import type {PageProps} from '../App';
import {conditionName,DataState,EmptyState} from '../ui';
import {RegistrationInput,findRegistration,registrationKey} from '../RegistrationInput';
import type {RegistrationOption} from '../RegistrationInput';
import {availablePositions,lockerSectors,occupiedPositions,pendingKindLabels,pendingLockerIds,requiresReview,type LockerPreset} from '../locker-insights';

type Occupant={allocationId:string;allocationVersion:number;personId:string;membershipId:string;membershipVersion:number;origin:string;name:string;registration:string|null;department:string|null;functionName:string|null;dueAt:string|null};
type Locker={id:string;number:string;sector_occupant:string|null;capacity:number;is_double:boolean;key_copy_available:boolean|null;
  modality:string;destination:string|null;condition:string;migration_status:string;version:number;occupants:Occupant[]};
type Person={person_id:string;name:string;registration:string|null;department:string|null;status:string;locker_id:string|null;number:string|null};
type Pending={pending_locker_id:string|null;state:string;kind:string};
type LockerState='livre'|'ocupado'|'pendente'|'indisponivel';
const stateLabels:Record<LockerState,string>={livre:'Livre',ocupado:'Ocupado',pendente:'Pendente',indisponivel:'Indisponível'};
const numeric=new Intl.Collator('pt-BR',{numeric:true,sensitivity:'base'});
const lower=(value:string)=>value.toLocaleLowerCase('pt-BR');
const sectors=lockerSectors;

export function Dashboard({branchId,branchName,readonly,copy,refresh,notice,admin=false,preset}:PageProps&{preset?:LockerPreset}){
  const [lockers,setLockers]=useState<Locker[]>([]),[people,setPeople]=useState<Person[]>([]),[registrations,setRegistrations]=useState<RegistrationOption[]>([]),[pending,setPending]=useState<Pending[]>([]);
  const [query,setQuery]=useState(''),[statusFilter,setStatusFilter]=useState(preset?.status??''),[sectorFilter,setSectorFilter]=useState(preset?.sector??''),[keyFilter,setKeyFilter]=useState(preset?.key??''),[pendingKindFilter,setPendingKindFilter]=useState(preset?.pendingKind??''),[doubleOnly,setDoubleOnly]=useState(false);
  const [view,setView]=useState<'cards'|'table'>('cards');
  const [selected,setSelected]=useState<string|null>(null),closeRef=useRef<HTMLButtonElement>(null);
  const [personQuery,setPersonQuery]=useState(''),[personId,setPersonId]=useState(''),[keyCopy,setKeyCopy]=useState(''),[note,setNote]=useState(''),[transferReason,setTransferReason]=useState('');
  const [sharingReason,setSharingReason]=useState(''),[sharingDue,setSharingDue]=useState(''),[busy,setBusy]=useState(false);
  const [edit,setEdit]=useState({isDouble:false,condition:'disponivel',sectorOccupant:'',keyCopy:'sim',name:'',registration:'',department:'',functionName:''});
  const [editOccupantId,setEditOccupantId]=useState(''),[createOccupant,setCreateOccupant]=useState(false);
  const [loading,setLoading]=useState(true),[loadError,setLoadError]=useState('');

  async function load(){
    setLoading(true);setLoadError('');
    try{
    if(copy){setLockers(copy.lockers as Locker[]);setPeople(copy.people as Person[]);setPending(copy.pending as Pending[]);setRegistrations([]);return;}
    const [l,p,items,roster]=await Promise.all([api<Locker[]>(`/branches/${branchId}/lockers`),api<Person[]>(`/branches/${branchId}/people`),
      api<Pending[]>(`/branches/${branchId}/pending`),
      api<RegistrationOption[]>(`/branches/${branchId}/people/registrations`)]);
    setLockers(l);setPeople(p);setPending(items);setRegistrations(roster);
    }catch(error){setLoadError(error instanceof Error?error.message:'Confira a conexão e tente novamente.');throw error;}
    finally{setLoading(false);}
  }
  useEffect(()=>{load().catch(()=>{});},[branchId,copy]);
  useEffect(()=>{setSelected(null);},[branchId]);
  useEffect(()=>{
    if(!selected)return;
    const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';closeRef.current?.focus();
    return()=>{document.body.style.overflow=overflow;previous?.focus();};
  },[selected]);

  const pendingIds=pendingLockerIds(pending);
  function state(locker:Locker):LockerState{
    if(pendingIds.has(locker.id)||locker.migration_status==='inconclusivo')return 'pendente';
    if(locker.condition!=='disponivel')return 'indisponivel';
    return locker.sector_occupant||locker.occupants.length?'ocupado':'livre';
  }
  const sectorOptions=useMemo(()=>{
    const names=[...new Set(lockers.flatMap(sectors))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
    if(lockers.some(item=>sectors(item).length===0))names.push('__none__');
    return names;
  },[lockers]);
  const filtered=useMemo(()=>lockers.filter(locker=>{
    if(statusFilter==='com_vaga'&&availablePositions(locker)===0)return false;
    if(statusFilter==='ocupado'&&occupiedPositions(locker)===0)return false;
    if(statusFilter==='livre'&&(occupiedPositions(locker)>0||availablePositions(locker)===0))return false;
    if(statusFilter==='pendente'&&!pendingIds.has(locker.id)&&locker.migration_status!=='inconclusivo')return false;
    if(statusFilter==='indisponivel'&&!requiresReview(locker))return false;
    if(doubleOnly&&!locker.is_double)return false;
    if(sectorFilter==='__none__'&&sectors(locker).length>0)return false;
    if(sectorFilter&&sectorFilter!=='__none__'&&!sectors(locker).includes(sectorFilter))return false;
    if(keyFilter==='sim'&&locker.key_copy_available!==true)return false;
    if(keyFilter==='nao'&&locker.key_copy_available!==false)return false;
    if(pendingKindFilter&&!pending.some(item=>item.state==='aberta'&&item.pending_locker_id===locker.id&&item.kind===pendingKindFilter))return false;
    return !query||[locker.number,...sectors(locker),...locker.occupants.flatMap(item=>[item.name,item.registration??''])].some(value=>lower(value).includes(lower(query)));
  }).sort((a,b)=>numeric.compare(a.number,b.number)),[lockers,pending,query,statusFilter,sectorFilter,keyFilter,pendingKindFilter,doubleOnly]);
  const activeFilters=[
    query&&{label:`Busca: ${query}`,clear:()=>setQuery('')},
    statusFilter&&{label:`Situação: ${statusFilter==='com_vaga'?'Com vaga':statusFilter==='ocupado'?'Ocupados':statusFilter==='livre'?'Livres':statusFilter==='pendente'?'Com pendência':'Bloqueados / revisão'}`,clear:()=>{setStatusFilter('');setPendingKindFilter('');}},
    sectorFilter&&{label:`Setor: ${sectorFilter==='__none__'?'Sem setor':sectorFilter}`,clear:()=>setSectorFilter('')},
    keyFilter&&{label:`Cópia da chave: ${keyFilter==='sim'?'Sim':'Não'}`,clear:()=>setKeyFilter('')},
    pendingKindFilter&&{label:`Motivo: ${pendingKindLabels[pendingKindFilter]??'Conferência necessária'}`,clear:()=>setPendingKindFilter('')},
    doubleOnly&&{label:'Somente duplos',clear:()=>setDoubleOnly(false)}
  ].filter((item):item is {label:string;clear:()=>void}=>!!item);
  function clearFilters(){setQuery('');setStatusFilter('');setSectorFilter('');setKeyFilter('');setPendingKindFilter('');setDoubleOnly(false);}
  const locker=lockers.find(item=>item.id===selected);
  const editOccupant=locker?.occupants.find(item=>item.allocationId===editOccupantId);
  const officialEdit=findRegistration(registrations,edit.registration);
  const officialFieldsLocked=!!officialEdit||!!editOccupant&&editOccupant.origin==='ti'&&
    registrationKey(edit.registration)===registrationKey(editOccupant.registration??'');
  const matches=people.filter(person=>person.status==='ativo'&&(!personQuery||[person.name,person.registration??''].some(value=>lower(value).includes(lower(personQuery)))))
    .sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
  const chosen=people.find(person=>person.person_id===personId);
  const source=lockers.find(item=>item.occupants.some(occupant=>occupant.personId===personId));
  const sourceAllocation=source?.occupants.find(occupant=>occupant.personId===personId);
  const needsSharing=!!locker&&locker.occupants.length>0&&!locker.is_double;
  const canEnter=!!locker&&!readonly&&!locker.sector_occupant&&locker.condition==='disponivel'&&locker.migration_status==='conferido'&&locker.occupants.length<locker.capacity;

  function openLocker(item:Locker){
    setPersonQuery('');setPersonId('');setNote('');setTransferReason('');setSharingReason('');setSharingDue('');
    setKeyCopy(item.key_copy_available===false?'nao':'sim');setCreateOccupant(false);
    setEditOccupantId(item.occupants[0]?.allocationId??'');fillEdit(item,item.occupants[0]);setSelected(item.id);
  }
  function fillEdit(item:Locker,occupant?:Occupant){setEdit({isDouble:item.is_double,condition:item.condition,
    sectorOccupant:item.sector_occupant??'',keyCopy:item.key_copy_available===false?'nao':'sim',
    name:occupant?.name??'',registration:occupant?.registration??'',department:occupant?.department??'',functionName:occupant?.functionName??''});}
  function chooseEditOccupant(item:Locker,id:string){setEditOccupantId(id);fillEdit(item,item.occupants.find(person=>person.allocationId===id));}
  function changeRegistration(value:string,match:RegistrationOption|undefined){
    const replacingOfficial=editOccupant?.origin==='ti'&&registrationKey(value)!==registrationKey(editOccupant.registration??'');
    setEdit(current=>({...current,registration:value,name:match?.name??(replacingOfficial?'':current.name),
      department:match?.department??(replacingOfficial?'':current.department),functionName:match?.functionName??(replacingOfficial?'':current.functionName)}));
  }
  function toggleCreateOccupant(item:Locker,checked:boolean){setCreateOccupant(checked);setEditOccupantId(checked?'':item.occupants[0]?.allocationId??'');
    if(checked)setEdit(current=>({...current,sectorOccupant:'',name:'',registration:'',department:'',functionName:''}));
    else fillEdit(item,item.occupants[0]);}
  async function act<T>(callback:()=>Promise<T>,message:string|((result:T)=>string),close=false){
    setBusy(true);
    try{const result=await callback();try{await load();refresh();}catch{notice('A ação foi concluída, mas a lista não foi atualizada. Tente recarregar antes de agir novamente.');return;}
      notice(typeof message==='string'?message:message(result));if(close)setSelected(null);}
    catch(error){notice(error instanceof Error?error.message:'Falha na operação');}
    finally{setBusy(false);}
  }
  function saveKey(){if(!locker||!keyCopy)return;act(()=>post(`/branches/${branchId}/lockers/${locker.id}/key-copy`,
    {operationId:op(),expectedVersion:locker.version,available:keyCopy==='sim'}),'Situação da cópia da chave atualizada.');}
  function saveLocker(event:React.FormEvent){event.preventDefault();if(!locker||!admin)return;
    act(()=>post<{officialName:string|null}>(`/branches/${branchId}/lockers/${locker.id}/revise`,{operationId:op(),expectedLockerVersion:locker.version,
      isDouble:edit.isDouble,condition:edit.condition,keyCopyAvailable:edit.keyCopy==='sim',
      sectorOccupant:createOccupant?null:edit.sectorOccupant.trim()||null,
      occupant:editOccupant||createOccupant?{allocationId:editOccupant?.allocationId,membershipId:editOccupant?.membershipId,
        expectedMembershipVersion:editOccupant?.membershipVersion,name:edit.name.trim(),registration:edit.registration.trim()||null,
        department:edit.department.trim()||null,functionName:edit.functionName.trim()||null}:null}),
    result=>`Dados do armário atualizados.${result.officialName?` Dados oficiais de ${result.officialName} aplicados.`:''}`,true);}
  function assign(event:React.FormEvent){
    event.preventDefault();if(!locker||!chosen||!keyCopy||!canEnter||source?.id===locker.id)return;
    if(!window.confirm(`${source?`Transferir ${chosen.name} do armário ${source.number} para o ${locker.number}`:`Atribuir o armário ${locker.number} a ${chosen.name}`} na filial ${branchName}?${source?' A ocupação anterior será encerrada.':''}`))return;
    const keyCopyAvailable=keyCopy==='sim';
    if(source&&sourceAllocation){
      if(transferReason.trim().length<3)return;
      act(()=>post(`/branches/${branchId}/allocations/transfer`,{operationId:op(),allocationId:sourceAllocation.allocationId,
        expectedAllocationVersion:sourceAllocation.allocationVersion,destinationLockerId:locker.id,sourceVersion:source.version,destinationVersion:locker.version,
        reason:transferReason.trim(),note:note.trim()||null,keyCopyAvailable,sharingReason:sharingReason.trim()||null,
        sharingDueAt:sharingDue?new Date(`${sharingDue}T12:00:00`).toISOString():null}),`${chosen.name} transferido para o armário ${locker.number}.`,true);
      return;
    }
    act(()=>post(`/branches/${branchId}/allocations/occupy`,{operationId:op(),personId:chosen.person_id,lockerId:locker.id,
      expectedVersion:locker.version,modality:locker.modality,seasonal:false,note:note.trim()||null,keyCopyAvailable,
      sharingReason:sharingReason.trim()||null,sharingDueAt:sharingDue?new Date(`${sharingDue}T12:00:00`).toISOString():null}),
    `${chosen.name} cadastrado no armário ${locker.number}.`,true);
  }
  function release(occupant:Occupant){
    if(!locker||!window.confirm(`Confirmar saída de ${occupant.name} do armário ${locker.number}?`))return;
    act(()=>post(`/branches/${branchId}/allocations/release`,{operationId:op(),allocationId:occupant.allocationId,
      expectedVersion:occupant.allocationVersion}),'Saída registrada.');
  }
  function modalKeyDown(event:React.KeyboardEvent<HTMLElement>){
    if(event.key==='Escape'){event.preventDefault();setSelected(null);return;}
    if(event.key!=='Tab')return;
    const elements=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)'));
    if(!elements.length)return;
    if(event.shiftKey&&document.activeElement===elements[0]){event.preventDefault();elements.at(-1)?.focus();}
    else if(!event.shiftKey&&document.activeElement===elements.at(-1)){event.preventDefault();elements[0].focus();}
  }

  return <>
    <DataState loading={loading} error={loadError} onRetry={()=>{load().catch(()=>{});}}/>
    {!loading&&!loadError&&<>
    <div className="operational-intro"><div><h1>Armários</h1><p>Consulte os armários e seus ocupantes em {branchName}.</p></div><span>{lockers.length} armários físicos</span></div>
    <section className="card locker-list-panel" aria-label="Consulta de armários">
      <div className="locker-list-heading"><div><h2>Registros</h2><p>Busque por número, nome ou matrícula e combine os filtros.</p></div><div className="view-switch" role="group" aria-label="Modo de visualização"><button type="button" aria-pressed={view==='cards'} className={view==='cards'?'selected':''} onClick={()=>setView('cards')}><Grid2X2 size={17} aria-hidden="true"/> Cards</button><button type="button" aria-pressed={view==='table'} className={view==='table'?'selected':''} onClick={()=>setView('table')}><List size={17} aria-hidden="true"/> Tabela</button></div></div>
      <div className="filters locker-filters">
        <label>Buscar armário, nome ou matrícula<input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Número, nome ou matrícula"/></label>
        <label>Situação<select value={statusFilter} onChange={event=>{setStatusFilter(event.target.value);if(event.target.value!=='pendente')setPendingKindFilter('');}}><option value="">Todas</option><option value="com_vaga">Com vaga</option><option value="livre">Livres</option>
          <option value="ocupado">Ocupados</option><option value="pendente">Com pendência</option><option value="indisponivel">Bloqueados / revisão</option></select></label>
        <label>Setor<select value={sectorFilter} onChange={event=>setSectorFilter(event.target.value)}><option value="">Todos</option>
          {sectorOptions.map(sector=><option key={sector} value={sector}>{sector==='__none__'?'Sem setor':sector}</option>)}</select></label>
        <label>Filtrar por cópia da chave<select value={keyFilter} onChange={event=>setKeyFilter(event.target.value)}><option value="">Todas</option>
          <option value="sim">Com cópia</option><option value="nao">Sem cópia</option></select></label>
        <label className="check"><input type="checkbox" checked={doubleOnly} onChange={event=>setDoubleOnly(event.target.checked)}/>Somente duplos</label>
      </div>
      <div className="filter-summary"><div className="filter-summary-left"><SlidersHorizontal size={16} aria-hidden="true"/><strong aria-live="polite">{filtered.length} {filtered.length===1?'resultado':'resultados'}</strong>{activeFilters.length?<div className="active-filter-list">{activeFilters.map(item=><button key={item.label} type="button" onClick={item.clear} aria-label={`Remover filtro ${item.label}`}>{item.label}<X size={13} aria-hidden="true"/></button>)}</div>:<span>Todos os registros da filial</span>}</div>{activeFilters.length>0&&<button type="button" className="clear-filters" onClick={clearFilters}>Limpar filtros</button>}</div>
      {!filtered.length?<EmptyState title={lockers.length?'Nenhum armário encontrado':'Nenhum armário cadastrado'} description={lockers.length?'Revise a busca ou limpe os filtros para ver outros armários.':'Cadastre armários em Administração ou confira a carga inicial.'} action={activeFilters.length>0?<button type="button" onClick={clearFilters}>Limpar filtros</button>:undefined}/>:view==='cards'?<div className="locker-grid">{filtered.map(item=>{const itemState=state(item);
        return <button key={item.id} className={`locker-tile ${itemState==='pendente'?'has-pending':itemState==='ocupado'?'occupied':itemState==='livre'?'free':'unavailable'}`}
          onClick={()=>openLocker(item)} aria-haspopup="dialog" aria-label={`Abrir detalhes do armário ${item.number}`}>
          <span className="tile-top"><strong>№ {item.number}</strong><span className="badge">{stateLabels[itemState]}</span></span>
          <span className="tile-meta">{item.is_double?'Duplo · ':''}{sectors(item).join(', ')||'Sem setor'}</span>
          <span className="tile-people">{item.sector_occupant||item.occupants.length?item.sector_occupant||item.occupants.map(person=><span key={person.allocationId}>{person.name}<small>{person.registration?`Matrícula ${person.registration}`:'Sem matrícula'}</small></span>):item.destination||'Sem ocupante'}</span>
          <span className="tile-footer">{occupiedPositions(item)}/{item.capacity} {item.capacity===1?'posição ocupada':'posições ocupadas'}{availablePositions(item)>0&&` · ${availablePositions(item)} ${availablePositions(item)===1?'vaga disponível':'vagas disponíveis'}`}</span>
          {item.key_copy_available===false&&<span className="tile-key"><KeyRound size={13} aria-hidden="true"/> Sem cópia da chave</span>}
          {itemState==='pendente'&&<span className="tile-pending"><CircleAlert size={13} aria-hidden="true"/> Conferência necessária</span>}
        </button>;})}</div>:<div className="table-wrap locker-table"><table><thead><tr><th>Armário</th><th>Setor</th><th>Situação</th><th>Ocupante / matrícula</th><th>Ocupação</th><th>Vagas disponíveis</th><th>Cópia da chave</th><th><span className="sr-only">Ação</span></th></tr></thead><tbody>{filtered.map(item=><tr key={item.id}><td><strong>№ {item.number}</strong></td><td>{sectors(item).join(', ')||'Sem setor'}</td><td><span className={`badge state-${state(item)}`}>{stateLabels[state(item)]}</span></td><td>{item.sector_occupant||item.occupants.length?item.sector_occupant||item.occupants.map(person=><span className="table-person" key={person.allocationId}>{person.name}<small>{person.registration?`Matrícula ${person.registration}`:'Sem matrícula'}</small></span>):'Sem ocupante'}</td><td>{occupiedPositions(item)} de {item.capacity}</td><td>{availablePositions(item)}</td><td>{item.key_copy_available===null?'Não informada':item.key_copy_available?'Sim':'Não'}</td><td><button type="button" className="table-detail" onClick={()=>openLocker(item)}>Ver detalhes <ArrowRight size={15} aria-hidden="true"/></button></td></tr>)}</tbody></table></div>}
    </section>
    {locker&&<div className="locker-modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setSelected(null);}}>
      <section className="locker-modal" role="dialog" aria-modal="true" aria-labelledby="locker-dialog-title" onKeyDown={modalKeyDown}>
        <div className="section-head"><div><h2 id="locker-dialog-title">Armário {locker.number}{locker.is_double?' · Duplo':''}</h2>
          <p>{locker.occupants.length||locker.sector_occupant?'Ocupado':'Sem ocupante'} · {conditionName[locker.condition]??'Situação não informada'} · {branchName}</p></div>
            <div className="row-actions"><button ref={closeRef} type="button" onClick={()=>setSelected(null)}>Fechar</button></div></div>
        <div className="locker-detail-summary"><div className="detail-availability"><small>Vagas disponíveis</small><strong>{availablePositions(locker)}</strong><span>{availablePositions(locker)===0?'Nenhuma posição liberada para nova ocupação.':'Em armário disponível e conferido.'}</span></div><div><small>Capacidade física</small><strong>{locker.capacity} {locker.capacity===1?'posição':'posições'}</strong></div><div><small>Posições ocupadas</small><strong>{occupiedPositions(locker)}</strong></div><div><small>Cópia da chave</small><strong>{locker.key_copy_available===null?'Não informada':locker.key_copy_available?'Sim':'Não'}</strong></div></div>
        {locker.migration_status==='inconclusivo'&&<p className="warning">Ocupação pendente de conferência. Novas entradas estão bloqueadas.</p>}
        {locker.sector_occupant&&<p><strong>Setor ocupante:</strong> {locker.sector_occupant}</p>}
        {locker.occupants.length>0&&<div className="list"><h3>Ocupantes</h3>{locker.occupants.map(occupant=><div className="list-row" key={occupant.allocationId}>
          <div><strong>{occupant.name}</strong><small>{occupant.registration?`Matrícula ${occupant.registration}`:'Sem matrícula'}{occupant.department?` · ${occupant.department}`:''}</small></div>
          {!readonly&&<button type="button" disabled={busy} onClick={()=>release(occupant)}>Registrar saída</button>}</div>)}</div>}
        {!admin&&<div className="locker-key"><label>Cópia da chave<select value={keyCopy} onChange={event=>setKeyCopy(event.target.value)} disabled={readonly} aria-required="true">
          <option value="sim">Sim</option><option value="nao">Não</option></select></label>
          {!readonly&&<button type="button" disabled={busy||!keyCopy||keyCopy===(locker.key_copy_available===false?'nao':'sim')} onClick={saveKey}>Salvar situação da chave</button>}</div>}
        {admin&&!readonly&&<form className="pending-editor" onSubmit={saveLocker}><h3>Editar dados do armário</h3>
          <p>Se a matrícula constar na base atual, o cadastro oficial será usado para o ocupante.</p>
          <div className="form-grid"><div><small>Número do armário (fixo)</small><strong className="fixed-locker-number">{locker.number}</strong></div>
            <label className="check"><input type="checkbox" checked={edit.isDouble} onChange={event=>{
              if(!event.target.checked&&createOccupant&&locker.occupants.length)toggleCreateOccupant(locker,false);
              setEdit(current=>({...current,isDouble:event.target.checked}));
            }}/>Armário duplo</label>
            <label>Situação<select value={edit.condition} onChange={event=>setEdit({...edit,condition:event.target.value})}>
              <option value="disponivel">Disponível</option><option value="manutencao">Manutenção</option><option value="bloqueado">Bloqueado</option></select></label>
            <label>Existe cópia da chave?<select value={edit.keyCopy} onChange={event=>setEdit({...edit,keyCopy:event.target.value})}>
              <option value="sim">Sim</option><option value="nao">Não</option></select></label>
            {locker.occupants.length>1&&<label>Ocupante a corrigir<select value={editOccupantId} onChange={event=>chooseEditOccupant(locker,event.target.value)}>
              {locker.occupants.map(item=><option key={item.allocationId} value={item.allocationId}>{item.name} · {item.registration??'Sem matrícula'}</option>)}</select></label>}
            {(locker.occupants.length===0||edit.isDouble&&locker.occupants.length<2)&&<label className="check"><input type="checkbox" checked={createOccupant} onChange={event=>toggleCreateOccupant(locker,event.target.checked)}/>
              {locker.occupants.length?'Adicionar segundo ocupante':'Cadastrar ocupante'}</label>}
            {editOccupant||createOccupant?<>
              <RegistrationInput id="dashboard-occupant-registration" value={edit.registration} options={registrations} onChange={changeRegistration}/>
              <label>Nome<input value={edit.name} disabled={officialFieldsLocked} onChange={event=>setEdit({...edit,name:event.target.value})}/></label>
              <label>Setor<input value={edit.department} disabled={officialFieldsLocked} onChange={event=>setEdit({...edit,department:event.target.value})}/></label>
              <label>Função<input value={edit.functionName} disabled={officialFieldsLocked} onChange={event=>setEdit({...edit,functionName:event.target.value})}/></label>
            </>:<label>Setor ocupante<input value={edit.sectorOccupant} onChange={event=>setEdit({...edit,sectorOccupant:event.target.value})} placeholder="Ex.: Restaurante FC"/></label>}
          </div>
          {officialFieldsLocked&&<p className="muted">Nome, setor e função vêm da base atual de colaboradores.</p>}
          <button className="primary" disabled={busy||(createOccupant&&!edit.name.trim()&&!edit.registration.trim())}>Salvar dados do armário</button>
        </form>}
        {canEnter&&<form className="locker-entry" onSubmit={assign}><h3>Cadastrar pessoa neste armário</h3>
          {admin&&<label>Cópia da chave ao atribuir<select value={keyCopy} onChange={event=>setKeyCopy(event.target.value)}>
            <option value="sim">Sim</option><option value="nao">Não</option></select></label>}
          <label>Pesquisar pessoa por nome ou matrícula<input value={personQuery} onChange={event=>{setPersonQuery(event.target.value);setPersonId('');}} placeholder="Digite nome ou matrícula"/></label>
          <label>Pessoas cadastradas<select required size={Math.min(7,Math.max(3,matches.length+1))} value={personId} onChange={event=>setPersonId(event.target.value)}>
            <option value="">Selecione uma pessoa</option>{matches.map(person=><option key={person.person_id} value={person.person_id}>
              {person.name}{person.registration?` · ${person.registration}`:''}{person.number?` · armário ${person.number}`:''}</option>)}</select></label>
          {chosen&&source?.id===locker.id&&<p className="warning">{chosen.name} já ocupa este armário.</p>}
          {chosen&&source&&source.id!==locker.id&&<p className="action-summary"><strong>Transferência</strong> · {chosen.name}, armário {source.number} → {locker.number}, filial {branchName}. A ocupação anterior será encerrada.</p>}
          {chosen&&!source&&<p className="action-summary"><strong>Atribuição</strong> · {chosen.name} receberá o armário {locker.number}, filial {branchName}.</p>}
          {chosen&&source&&source.id!==locker.id&&<label>Motivo da transferência<input required minLength={3} value={transferReason} onChange={event=>setTransferReason(event.target.value)}/></label>}
          <label>Observação (opcional)<input value={note} onChange={event=>setNote(event.target.value)}/></label>
          {needsSharing&&<><label>Motivo do compartilhamento<input required value={sharingReason} onChange={event=>setSharingReason(event.target.value)}/></label>
            <label>Previsão de encerramento do compartilhamento<input type="date" required value={sharingDue} onChange={event=>setSharingDue(event.target.value)}/></label></>}
          <button className="primary" disabled={busy||!personId||!keyCopy||source?.id===locker.id||!!source&&transferReason.trim().length<3}>
            {source?'Transferir para este armário':'Cadastrar neste armário'}</button>
        </form>}
      </section>
    </div>}
    </>}
  </>;
}
