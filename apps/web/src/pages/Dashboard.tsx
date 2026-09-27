import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeftRight,ArrowRight,Briefcase,Building2,CircleAlert,Check,Grid2X2,Gauge,Hash,KeyRound,List,Lock,MapPin,MessageSquare,PencilLine,Plus,Search,SlidersHorizontal,User,UserPlus,Users,Wrench,X} from 'lucide-react';
import {api,op,post} from '../api';
import type {PageProps} from '../App';
import {conditionName,DataState,EmptyState,Skeleton} from '../ui';
import {RegistrationInput,findRegistration,registrationKey} from '../RegistrationInput';
import type {RegistrationOption} from '../RegistrationInput';
import {TermoResponsabilidade} from '../components/TermoResponsabilidade';
import {FieldIcon,SegmentedControl,ToggleSwitch} from '../components/LockerControls';
import {SelectField} from '../components/Select';
import {sectorSelectOptions} from '../sectors';
import {availablePositions,effectiveCapacity,lockerSectors,occupiedPositions,pendingKindLabels,pendingLockerIds,requiresReview,showsLockerPositions,type LockerPreset} from '../locker-insights';

type Occupant={allocationId:string;allocationVersion:number;personId:string;membershipId:string;membershipVersion:number;origin:string;name:string;registration:string|null;department:string|null;functionName:string|null;dueAt:string|null};
type Locker={id:string;number:string;sector_occupant:string|null;capacity:number;is_double:boolean;key_copy_available:boolean|null;
  modality:string;destination:string|null;condition:string;migration_status:string;version:number;occupants:Occupant[]};
type Person={person_id:string;name:string;registration:string|null;department:string|null;status:string;locker_id:string|null;number:string|null};
type Pending={pending_locker_id:string|null;state:string;kind:string};
type PrintData={nome:string;matricula:string;setor:string;numeroArmario:string;tipoUsuario:'colaborador';possuiCopia:boolean;filial:string};
type LockerState='livre'|'ocupado'|'pendente'|'indisponivel';
type OccupantDraft={name:string;registration:string;department:string;functionName:string};
type OccupantEdit={slot:number;allocationId:string|null};
const emptyDraft:OccupantDraft={name:'',registration:'',department:'',functionName:''};
const stateLabels:Record<LockerState,string>={livre:'Livre',ocupado:'Ocupado',pendente:'Pendente',indisponivel:'Indisponível'};
const numeric=new Intl.Collator('pt-BR',{numeric:true,sensitivity:'base'});
const lower=(value:string)=>value.toLocaleLowerCase('pt-BR');
const sectors=lockerSectors;

export function Dashboard({branchId,branchName,readonly,refresh,notice,askConfirm,admin=false,preset}:PageProps&{preset?:LockerPreset}){
  const [lockers,setLockers]=useState<Locker[]>([]),[people,setPeople]=useState<Person[]>([]),[registrations,setRegistrations]=useState<RegistrationOption[]>([]),[pending,setPending]=useState<Pending[]>([]);
  const [query,setQuery]=useState(''),[statusFilter,setStatusFilter]=useState(preset?.status??''),[sectorFilter,setSectorFilter]=useState(preset?.sector??''),[keyFilter,setKeyFilter]=useState(preset?.key??''),[pendingKindFilter,setPendingKindFilter]=useState(preset?.pendingKind??''),[doubleOnly,setDoubleOnly]=useState(preset?.double??false);
  const [view,setView]=useState<'cards'|'table'>('cards');
  const [selected,setSelected]=useState<string|null>(null),closeRef=useRef<HTMLButtonElement>(null);
  const [personQuery,setPersonQuery]=useState(''),[personId,setPersonId]=useState(''),[keyCopy,setKeyCopy]=useState(''),[note,setNote]=useState(''),[transferReason,setTransferReason]=useState('');
  const [sharingReason,setSharingReason]=useState(''),[sharingDue,setSharingDue]=useState(''),[busy,setBusy]=useState(false);
  const [printData,setPrintData]=useState<PrintData|null>(null);
  const [edit,setEdit]=useState({condition:'disponivel',sectorOccupant:'',keyCopy:'sim'});
  const [occupantEdit,setOccupantEdit]=useState<OccupantEdit|null>(null),[draft,setDraft]=useState<OccupantDraft>(emptyDraft);
  const [loading,setLoading]=useState(true),[loadError,setLoadError]=useState('');

  async function load(){
    setLoading(true);setLoadError('');
    try{
    const [l,p,items,roster]=await Promise.all([api<Locker[]>(`/branches/${branchId}/lockers`),api<Person[]>(`/branches/${branchId}/people`),
      api<Pending[]>(`/branches/${branchId}/pending`),
      api<RegistrationOption[]>(`/branches/${branchId}/people/registrations`)]);
    setLockers(l);setPeople(p);setPending(items);setRegistrations(roster);
    }catch(error){setLoadError(error instanceof Error?error.message:'Confira a conexão e tente novamente.');throw error;}
    finally{setLoading(false);}
  }
  useEffect(()=>{load().catch(()=>{});},[branchId]);
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
    doubleOnly&&{label:'Duplos',clear:()=>setDoubleOnly(false)}
  ].filter((item):item is {label:string;clear:()=>void}=>!!item);
  const quickFilters=[
    {label:'Com vaga',active:statusFilter==='com_vaga',apply:()=>{setStatusFilter(statusFilter==='com_vaga'?'':'com_vaga');setPendingKindFilter('');}},
    {label:'Livres',active:statusFilter==='livre',apply:()=>{setStatusFilter(statusFilter==='livre'?'':'livre');setPendingKindFilter('');}},
    {label:'Pendentes',active:statusFilter==='pendente',apply:()=>setStatusFilter(statusFilter==='pendente'?'':'pendente')},
    {label:'Duplos',active:doubleOnly,apply:()=>setDoubleOnly(current=>!current)}
  ];
  function clearFilters(){setQuery('');setStatusFilter('');setSectorFilter('');setKeyFilter('');setPendingKindFilter('');setDoubleOnly(false);}
  const locker=lockers.find(item=>item.id===selected);
  const editingOccupant=occupantEdit&&occupantEdit.allocationId&&locker?locker.occupants.find(item=>item.allocationId===occupantEdit.allocationId):undefined;
  const creatingOccupant=!!occupantEdit&&!editingOccupant;
  const showSecondSlot=!!locker&&(locker.is_double||locker.occupants.length>1);
  const canEditOccupants=admin&&!readonly;
  const officialEdit=findRegistration(registrations,draft.registration);
  const officialFieldsLocked=!!officialEdit||!!editingOccupant&&editingOccupant.origin==='ti'&&
    registrationKey(draft.registration)===registrationKey(editingOccupant.registration??'');
  const matches=people.filter(person=>person.status==='ativo'&&(!personQuery||[person.name,person.registration??''].some(value=>lower(value).includes(lower(personQuery)))))
    .sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
  const chosen=people.find(person=>person.person_id===personId);
  const source=lockers.find(item=>item.occupants.some(occupant=>occupant.personId===personId));
  const sourceAllocation=source?.occupants.find(occupant=>occupant.personId===personId);
  const needsSharing=!!locker&&locker.occupants.length>0&&!locker.is_double;
  const canEnter=!!locker&&locker.modality==='fixo'&&!readonly&&availablePositions(locker)>0;

  function openLocker(item:Locker){
    setPersonQuery('');setPersonId('');setNote('');setTransferReason('');setSharingReason('');setSharingDue('');
    setKeyCopy(item.key_copy_available===false?'nao':'sim');
    setOccupantEdit(null);setDraft(emptyDraft);fillEdit(item);setSelected(item.id);
  }
  function fillEdit(item:Locker){setEdit({condition:item.condition,
    sectorOccupant:item.sector_occupant??'',keyCopy:item.key_copy_available===false?'nao':'sim'});}
  function startOccupantEdit(item:Locker,slot:number){
    const occupant=item.occupants[slot];
    setOccupantEdit({slot,allocationId:occupant?.allocationId??null});
    setDraft({name:occupant?.name??'',registration:occupant?.registration??'',department:occupant?.department??'',functionName:occupant?.functionName??''});
  }
  function cancelOccupantEdit(){setOccupantEdit(null);setDraft(emptyDraft);}
  function changeRegistration(value:string,match:RegistrationOption|undefined){
    const replacingOfficial=editingOccupant?.origin==='ti'&&registrationKey(value)!==registrationKey(editingOccupant.registration??'');
    setDraft(current=>({...current,registration:value,name:match?.name??(replacingOfficial?'':current.name),
      department:match?.department??(replacingOfficial?'':current.department),functionName:match?.functionName??(replacingOfficial?'':current.functionName)}));
  }
  async function act<T>(callback:()=>Promise<T>,message:string|((result:T)=>string),close=false,onSuccess?:()=>void){
    setBusy(true);
    try{const result=await callback();try{await load();refresh();}catch{notice('A ação foi concluída, mas a lista não foi atualizada. Tente recarregar antes de agir novamente.');return;}
      notice(typeof message==='string'?message:message(result));onSuccess?.();if(close)setSelected(null);}
    catch(error){notice(error instanceof Error?error.message:'Falha na operação');}
    finally{setBusy(false);}
  }
  function saveKey(){if(!locker||!keyCopy)return;act(()=>post(`/branches/${branchId}/lockers/${locker.id}/key-copy`,
    {operationId:op(),expectedVersion:locker.version,available:keyCopy==='sim'}),'Situação da cópia da chave atualizada.');}
  function handlePrint(){
    const root=document.documentElement,body=document.body;
    const hadRootDark=root.classList.contains('dark');
    const hadBodyDark=body.classList.contains('dark');
    const themeWasDark=root.getAttribute('data-theme')==='dark';
    if(hadRootDark)root.classList.remove('dark');
    if(hadBodyDark)body.classList.remove('dark');
    if(themeWasDark)root.removeAttribute('data-theme');
    window.setTimeout(()=>{
      window.print();
      if(hadRootDark)root.classList.add('dark');
      if(hadBodyDark)body.classList.add('dark');
      if(themeWasDark)root.setAttribute('data-theme','dark');
    },150);
  }
  function printOccupantTerm(item:Locker,occupant:Occupant){
    setPrintData({nome:occupant.name,matricula:occupant.registration??'',setor:occupant.department??'',numeroArmario:item.number,
      tipoUsuario:'colaborador',possuiCopia:item.key_copy_available===true,filial:branchName});
    handlePrint();
  }
  function saveLocker(event:React.FormEvent|undefined,scope:'attributes'|'occupant'='attributes',sectorConfirmed=false){
    event?.preventDefault();if(!locker||!admin)return;
    const withOccupant=scope==='occupant'&&!!occupantEdit&&!!(editingOccupant||creatingOccupant);
    if(withOccupant&&editingOccupant&&!draft.name.trim()&&!draft.registration.trim()){
      notice('Use “Desocupar armário” para remover o ocupante existente.');return;
    }
    if(withOccupant&&creatingOccupant&&!draft.name.trim()&&!draft.registration.trim()){
      notice('Informe o nome ou uma matrícula da base oficial.');return;
    }
    if(!withOccupant&&!sectorConfirmed&&edit.sectorOccupant.trim()&&!locker.sector_occupant&&!locker.occupants.length){
      void askConfirm(`Confirmar a ocupação do armário ${locker.number} pelo setor ${edit.sectorOccupant.trim()}?`).then(ok=>{if(ok)saveLocker(event,scope,true);});return;
    }
    act(()=>post<{officialName:string|null}>(`/branches/${branchId}/lockers/${locker.id}/revise`,{operationId:op(),expectedLockerVersion:locker.version,
      isDouble:locker.is_double,condition:edit.condition,keyCopyAvailable:edit.keyCopy==='sim',
      sectorOccupant:withOccupant&&creatingOccupant?null:edit.sectorOccupant.trim()||null,
      occupant:withOccupant?{allocationId:editingOccupant?.allocationId,membershipId:editingOccupant?.membershipId,
        expectedMembershipVersion:editingOccupant?.membershipVersion,name:draft.name.trim(),registration:draft.registration.trim()||null,
        department:draft.department.trim()||null,functionName:draft.functionName.trim()||null}:null}),
    result=>`Dados do armário atualizados.${result.officialName?` Dados oficiais de ${result.officialName} aplicados.`:''}`,scope==='attributes',cancelOccupantEdit);}
  async function assign(event:React.FormEvent){
    event.preventDefault();if(!locker||!chosen||!keyCopy||!canEnter||source?.id===locker.id)return;
    if(!await askConfirm(`${source?`Transferir ${chosen.name} do armário ${source.number} para o ${locker.number}`:`Atribuir o armário ${locker.number} a ${chosen.name}`} na filial ${branchName}?${source?' A ocupação anterior será encerrada.':''}`))return;
    const keyCopyAvailable=keyCopy==='sim';
    const assignmentPrintData:PrintData={nome:chosen.name,matricula:chosen.registration??'',setor:chosen.department??'',numeroArmario:locker.number,tipoUsuario:'colaborador',possuiCopia:keyCopyAvailable,filial:branchName};
    const offerPrint=()=>{setPrintData(assignmentPrintData);notice(`${source?`${chosen.name} transferido para o armário ${locker.number}`:`${chosen.name} cadastrado no armário ${locker.number}`}.`,{label:'Imprimir Termo',onClick:handlePrint});};
    if(source&&sourceAllocation){
      if(transferReason.trim().length<3)return;
      act(()=>post(`/branches/${branchId}/allocations/transfer`,{operationId:op(),allocationId:sourceAllocation.allocationId,
        expectedAllocationVersion:sourceAllocation.allocationVersion,destinationLockerId:locker.id,sourceVersion:source.version,destinationVersion:locker.version,
        reason:transferReason.trim(),note:note.trim()||null,keyCopyAvailable,sharingReason:sharingReason.trim()||null,
        sharingDueAt:sharingDue?new Date(`${sharingDue}T12:00:00`).toISOString():null}),`${chosen.name} transferido para o armário ${locker.number}.`,true,offerPrint);
      return;
    }
    act(()=>post(`/branches/${branchId}/allocations/occupy`,{operationId:op(),personId:chosen.person_id,lockerId:locker.id,
      expectedVersion:locker.version,modality:locker.modality,seasonal:false,note:note.trim()||null,keyCopyAvailable,
      sharingReason:sharingReason.trim()||null,sharingDueAt:sharingDue?new Date(`${sharingDue}T12:00:00`).toISOString():null}),
    `${chosen.name} cadastrado no armário ${locker.number}.`,true,offerPrint);
  }
  async function release(occupant:Occupant){
    if(!locker||!await askConfirm(`Desocupar o armário ${locker.number} e encerrar a ocupação de ${occupant.name}?`))return;
    act(()=>post(`/branches/${branchId}/allocations/release`,{operationId:op(),allocationId:occupant.allocationId,
      expectedVersion:occupant.allocationVersion}),'Armário desocupado.');
  }
  function modalKeyDown(event:React.KeyboardEvent<HTMLElement>){
    if(event.key==='Escape'){event.preventDefault();setSelected(null);return;}
    if(event.key!=='Tab')return;
    const elements=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)'));
    if(!elements.length)return;
    if(event.shiftKey&&document.activeElement===elements[0]){event.preventDefault();elements.at(-1)?.focus();}
    else if(!event.shiftKey&&document.activeElement===elements.at(-1)){event.preventDefault();elements[0].focus();}
  }

  function DashboardSkeleton(){
    return <section className="card locker-list-panel" aria-label="Carregando armários">
      <div className="locker-list-heading"><div><Skeleton variant="title"/><Skeleton variant="text"/></div></div>
      <div className="loading-grid">{Array.from({length:8},(_,index)=><Skeleton key={index} variant="card" label={`Carregando armário ${index+1}`}/>)}</div>
    </section>;
  }

  return <>
    <div className="hide-on-print">
    <DataState loading={loading} error={loadError} onRetry={()=>{load().catch(()=>{});}}/>
    {loading&&!loadError&&<DashboardSkeleton/>}
    {!loading&&!loadError&&<>
    <div className="operational-intro"><div><h1>Armários</h1><p>Consulte os armários e seus ocupantes em {branchName}.</p></div><span>{lockers.length} armários físicos</span></div>
    <section className="card locker-list-panel" aria-label="Consulta de armários">
      <div className="locker-list-heading"><div><h2>Registros</h2><p>Busque por número, nome ou matrícula e combine os filtros.</p></div><div className="view-switch" role="group" aria-label="Modo de visualização"><button type="button" aria-pressed={view==='cards'} className={view==='cards'?'selected':''} onClick={()=>setView('cards')}><Grid2X2 size={17} aria-hidden="true"/> Cards</button><button type="button" aria-pressed={view==='table'} className={view==='table'?'selected':''} onClick={()=>setView('table')}><List size={17} aria-hidden="true"/> Tabela</button></div></div>
      <div className="filters locker-filters">
        <label className="filter-search">Buscar armário, nome ou matrícula
          <span className="filter-input"><Search size={15} aria-hidden="true"/>
            <input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Número, nome ou matrícula"/>
          </span>
        </label>
        <SelectField label="Situação" value={statusFilter} placeholder="Todas"
          onChange={value=>{setStatusFilter(value);if(value!=='pendente')setPendingKindFilter('');}}
          options={[{value:'',label:'Todas'},{value:'com_vaga',label:'Com vaga'},{value:'livre',label:'Livres'},
            {value:'ocupado',label:'Ocupados'},{value:'pendente',label:'Com pendência'},{value:'indisponivel',label:'Bloqueados / revisão'}]}/>
        <SelectField label="Setor" value={sectorFilter} placeholder="Todos"
          onChange={setSectorFilter}
          options={[{value:'',label:'Todos'},...sectorOptions.map(sector=>({value:sector,label:sector==='__none__'?'Sem setor':sector}))]}/>
        <SelectField label="Filtrar por cópia da chave" value={keyFilter} placeholder="Todas"
          onChange={setKeyFilter}
          options={[{value:'',label:'Todas'},{value:'sim',label:'Com cópia'},{value:'nao',label:'Sem cópia'}]}/>
      </div>
      <div className="quick-filters">
        <span>Atalhos</span>
        <div className="chip-group" role="group" aria-label="Filtros rápidos">
          {quickFilters.map(filter=><button key={filter.label} type="button" className={filter.active?'quick-filter active':'quick-filter'} aria-pressed={filter.active} onClick={filter.apply}>{filter.label}</button>)}
        </div>
      </div>
      <div className="filter-summary"><div className="filter-summary-left"><SlidersHorizontal size={16} aria-hidden="true"/><strong aria-live="polite">{filtered.length} {filtered.length===1?'resultado':'resultados'}</strong>{activeFilters.length?<div className="active-filter-list">{activeFilters.map(item=><button key={item.label} type="button" onClick={item.clear} aria-label={`Remover filtro ${item.label}`}>{item.label}<X size={13} aria-hidden="true"/></button>)}</div>:<span>Todos os registros da filial</span>}</div>{activeFilters.length>0&&<button type="button" className="clear-filters" onClick={clearFilters}>Limpar filtros</button>}</div>
      {!filtered.length?<EmptyState title={lockers.length?'Nenhum armário encontrado':'Nenhum armário cadastrado'} description={lockers.length?'Revise a busca ou limpe os filtros para ver outros armários.':'Cadastre armários em Administração ou confira a carga inicial.'} action={activeFilters.length>0?<button type="button" onClick={clearFilters}>Limpar filtros</button>:undefined}/>:view==='cards'?<div className="locker-grid">{filtered.map(item=>{const itemState=state(item);
        return <button key={item.id} className={`locker-tile ${itemState==='pendente'?'has-pending':itemState==='ocupado'?'occupied':itemState==='livre'?'free':'unavailable'}`}
          onClick={()=>openLocker(item)} aria-haspopup="dialog" aria-label={`Abrir detalhes do armário ${item.number}`}>
          <span className="tile-top"><strong className="tile-number">№ {item.number}</strong><span className="tile-badges">{item.is_double&&<span className="double-badge">Duplo</span>}<span className="badge">{stateLabels[itemState]}</span></span></span>
          {itemState==='livre'?<span className="tile-free" aria-hidden="true"></span>:<>
          <span className="tile-meta"><Building2 size={12} aria-hidden="true"/><span>{item.is_double?'Duplo · ':''}{sectors(item).join(', ')||'Sem setor'}</span></span>
          <span className="tile-people">{item.sector_occupant?item.sector_occupant:item.occupants.length?item.occupants.map(person=><span key={person.allocationId} className="tile-person"><span className="tile-person-name">{person.name}</span><small><Hash size={11} aria-hidden="true"/>{person.registration?`Matrícula ${person.registration}`:'Sem matrícula'}</small></span>):<span className="tile-empty">{item.destination||'Sem ocupante'}</span>}</span>
          <span className="tile-footer">{showsLockerPositions(item)?`${occupiedPositions(item)}/${effectiveCapacity(item)} ${effectiveCapacity(item)===1?'posição ocupada':'posições ocupadas'}`:occupiedPositions(item)>0?'Ocupado':'Livre'}{availablePositions(item)>0&&` · ${availablePositions(item)} ${availablePositions(item)===1?'vaga disponível':'vagas disponíveis'}`}</span>
          {item.key_copy_available===false&&<span className="tile-key"><KeyRound size={13} aria-hidden="true"/> Sem cópia da chave</span>}
          {itemState==='pendente'&&<span className="tile-pending"><CircleAlert size={13} aria-hidden="true"/> Conferência necessária</span>}</>}
        </button>;})}</div>:<div className="table-wrap locker-table"><table><thead><tr><th>Armário</th><th>Setor</th><th>Situação</th><th>Ocupante / matrícula</th><th>Ocupação</th><th>Vagas disponíveis</th><th>Cópia da chave</th><th><span className="sr-only">Ação</span></th></tr></thead><tbody>{filtered.map(item=><tr key={item.id}><td><strong>№ {item.number}</strong>{item.is_double&&<span className="double-badge table-badge">Duplo</span>}</td><td>{sectors(item).join(', ')||'Sem setor'}</td><td><span className={`badge state-${state(item)}`}>{stateLabels[state(item)]}</span></td><td>{item.sector_occupant||item.occupants.length?item.sector_occupant||item.occupants.map(person=><span className="table-person" key={person.allocationId}>{person.name}<small>{person.registration?`Matrícula ${person.registration}`:'Sem matrícula'}</small></span>):'Sem ocupante'}</td><td>{showsLockerPositions(item)?`${occupiedPositions(item)} de ${effectiveCapacity(item)}`:occupiedPositions(item)>0?'Ocupado':'Livre'}</td><td>{availablePositions(item)}</td><td>{item.key_copy_available===null?'Não informada':item.key_copy_available?'Sim':'Não'}</td><td><button type="button" className="table-detail" onClick={()=>openLocker(item)}>Ver detalhes <ArrowRight size={15} aria-hidden="true"/></button></td></tr>)}</tbody></table></div>}
    </section>
    {locker&&<div className="locker-modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setSelected(null);}}>
      <section className="locker-modal" role="dialog" aria-modal="true" aria-labelledby="locker-dialog-title" onKeyDown={modalKeyDown}>
        <div className="section-head"><div className="locker-title"><span className="eyebrow">Detalhes do armário</span>
          <h2 id="locker-dialog-title">Armário Nº {locker.number}</h2>
          <div className="locker-title-badges"><span className="badge locker-branch-badge"><MapPin size={13} aria-hidden="true"/>{branchName}</span>
            {locker.is_double&&<span className="double-badge">Duplo</span>}</div>
          <p className="locker-title-sub">{locker.occupants.length||locker.sector_occupant?'Ocupado':'Sem ocupante'} · {conditionName[locker.condition]??'Situação não informada'}</p></div>
            <div className="row-actions"><button ref={closeRef} type="button" onClick={()=>setSelected(null)}>Fechar</button></div></div>
        <section className="locker-card locker-card--status" aria-labelledby="locker-status-title">
          <div className="locker-card-head"><h3 id="locker-status-title"><span className="card-icon"><Gauge size={16} aria-hidden="true"/></span>Status do armário</h3>
            <span className={`badge state-${state(locker)}`}>{stateLabels[state(locker)]}</span></div>
          <div className="locker-detail-summary">
            <div className="detail-availability"><small>Vagas disponíveis</small><strong>{availablePositions(locker)===0?'0 vagas':`${availablePositions(locker)} ${availablePositions(locker)===1?'vaga':'vagas'}`}</strong>
              <span>{availablePositions(locker)===0?'Nenhuma vaga liberada para nova ocupação.':`${availablePositions(locker)} ${availablePositions(locker)===1?'vaga disponível':'vagas disponíveis'} para nova ocupação.`}</span></div>
            <div><small>Situação</small><strong>{conditionName[locker.condition]??'Não informada'}</strong></div>
            {showsLockerPositions(locker)&&<><div><small>Capacidade operacional</small><strong>{effectiveCapacity(locker)} {effectiveCapacity(locker)===1?'posição':'posições'}</strong></div>
              <div><small>Posições ocupadas</small><strong>{occupiedPositions(locker)}</strong></div></>}
            <div><small>Cópia da chave</small><strong>{locker.key_copy_available===null?'Não informada':locker.key_copy_available?'Sim':'Não'}</strong></div>
          </div>
          {locker.migration_status==='inconclusivo'&&<p className="warning locker-warning"><CircleAlert size={15} aria-hidden="true"/><span>Ocupação pendente de conferência. Novas entradas estão bloqueadas.</span></p>}
          {locker.sector_occupant&&<p className="locker-sector-note"><Building2 size={15} aria-hidden="true"/><span><strong>Setor ocupante:</strong> {locker.sector_occupant}</span></p>}
        </section>
        <section className="locker-card" aria-labelledby="locker-occupants-title">
          <div className="locker-card-head"><h3 id="locker-occupants-title"><span className="card-icon"><Users size={16} aria-hidden="true"/></span>Ocupantes</h3>
            {locker.occupants.length>0&&<span className="badge">{locker.occupants.length} {locker.occupants.length===1?'pessoa':'pessoas'}</span>}</div>
          {canEditOccupants?<div className="occupant-slots">
            <OccupantSlot slot={0} occupant={locker.occupants[0]} draft={draft} editing={occupantEdit?.slot===0}
              creating={occupantEdit?.slot===0&&creatingOccupant} busy={busy} officialLocked={officialFieldsLocked}
              registrations={registrations} onDraft={setDraft} onRegistration={changeRegistration}
              onEdit={()=>startOccupantEdit(locker,0)} onCancel={cancelOccupantEdit} onSave={()=>saveLocker(undefined,'occupant')}
              onAdd={()=>startOccupantEdit(locker,0)} onPrint={occupant=>printOccupantTerm(locker,occupant)} onRelease={release}/>
            {showSecondSlot&&<OccupantSlot slot={1} occupant={locker.occupants[1]} draft={draft} editing={occupantEdit?.slot===1}
              creating={occupantEdit?.slot===1&&creatingOccupant} busy={busy} officialLocked={officialFieldsLocked} blocked={locker.occupants.length===0}
              registrations={registrations} onDraft={setDraft} onRegistration={changeRegistration}
              onEdit={()=>startOccupantEdit(locker,1)} onCancel={cancelOccupantEdit} onSave={()=>saveLocker(undefined,'occupant')}
              onAdd={()=>startOccupantEdit(locker,1)} onPrint={occupant=>printOccupantTerm(locker,occupant)} onRelease={release}/>}
          </div>
          :locker.occupants.length>0?<div className="list">{locker.occupants.map(occupant=><div className="list-row" key={occupant.allocationId}>
            <div className="occupant-copy"><strong>{occupant.name}</strong>
              <small><span><Hash size={12} aria-hidden="true"/>{occupant.registration?`Matrícula ${occupant.registration}`:'Sem matrícula'}</span>
                <span><Building2 size={12} aria-hidden="true"/>{occupant.department||'Setor não informado'}</span>
                {occupant.functionName&&<span><Briefcase size={12} aria-hidden="true"/>{occupant.functionName}</span>}</small></div>
            <div className="row-actions occupant-actions"><button type="button" className="btn-action" onClick={()=>printOccupantTerm(locker,occupant)}>Imprimir Termo</button>
              {!readonly&&<button type="button" disabled={busy} onClick={()=>release(occupant)}>Desocupar armário</button>}</div></div>)}</div>
            :<p className="locker-empty"><Users size={16} aria-hidden="true"/>{locker.sector_occupant?'Ocupação por setor, sem pessoa identificada.':'Nenhuma pessoa ocupando este armário no momento.'}</p>}
        </section>
        {!admin&&<section className="locker-card" aria-labelledby="locker-key-title">
          <div className="locker-card-head"><h3 id="locker-key-title"><span className="card-icon"><KeyRound size={16} aria-hidden="true"/></span>Configurações da chave</h3></div>
          <div className="toggle-row">
            <ToggleSwitch label="Existe cópia da chave?" hint="Informe se existe uma cópia física disponível para este armário."
              checked={keyCopy==='sim'} disabled={readonly} onChange={checked=>setKeyCopy(checked?'sim':'nao')}/>
            {!readonly&&<button type="button" disabled={busy||!keyCopy||keyCopy===(locker.key_copy_available===false?'nao':'sim')} onClick={saveKey}>Salvar situação da chave</button>}
          </div>
        </section>}
        {admin&&!readonly&&<form className="locker-card locker-editor" onSubmit={event=>saveLocker(event,'attributes')} aria-labelledby="locker-editor-title">
          <div className="locker-card-head"><h3 id="locker-editor-title"><span className="card-icon"><PencilLine size={16} aria-hidden="true"/></span>Edição e configurações</h3></div>
          <p className="locker-card-note">Somente atributos físicos e operacionais do armário. O número é fixo; matrícula e cadastro dos ocupantes são editados no cartão Ocupantes.</p>
          <div className="form-grid"><div className="control-cell">
              <span className="static-caption">Tipo de armário</span>
              <strong className="static-value">{locker.is_double?<span className="double-badge">Duplo</span>:'Padrão'}</strong>
              <small className="static-hint">Atributo físico fixo: a troca entre Padrão e Duplo é feita em Administração.</small></div>
            <div className="control-cell">
              <ToggleSwitch label="Existe cópia da chave?" hint="Indique se há cópia disponível para este armário." checked={edit.keyCopy==='sim'} disabled={busy}
                onChange={checked=>setEdit(current=>({...current,keyCopy:checked?'sim':'nao'}))}/></div>
            <div className="control-cell control-span">
              <SegmentedControl label="Situação" value={edit.condition} disabled={busy}
                options={[{value:'disponivel',label:'Disponível',icon:Check},{value:'manutencao',label:'Manutenção',icon:Wrench},{value:'bloqueado',label:'Bloqueado',icon:Lock}]}
                onChange={value=>setEdit(current=>({...current,condition:value}))}/></div>
            <div className="control-cell control-span">
              <SelectField label="Setor ocupante" value={edit.sectorOccupant} placeholder="Sem setor ocupante"
                onChange={value=>setEdit(current=>({...current,sectorOccupant:value}))}
                options={sectorSelectOptions(people,lockers,edit.sectorOccupant)}/></div>
          </div>
          <button className="primary" disabled={busy}>Salvar dados do armário</button>
        </form>}
        {canEnter&&<form className="locker-card locker-entry" onSubmit={assign} aria-labelledby="locker-entry-title">
          <div className="locker-card-head"><h3 id="locker-entry-title"><span className="card-icon"><UserPlus size={16} aria-hidden="true"/></span>Cadastrar pessoa neste armário</h3></div>
          {admin&&<div className="control-cell"><ToggleSwitch label="Cópia da chave ao atribuir" hint="Situação da cópia registrada junto com a ocupação."
            checked={keyCopy==='sim'} onChange={checked=>setKeyCopy(checked?'sim':'nao')}/></div>}
          <label className="field-icon"><FieldIcon icon={Search}/>Pesquisar pessoa por nome ou matrícula<input value={personQuery} onChange={event=>{setPersonQuery(event.target.value);setPersonId('');}} placeholder="Digite nome ou matrícula"/></label>
          <label>Pessoas cadastradas<select required size={Math.min(7,Math.max(3,matches.length+1))} value={personId} onChange={event=>setPersonId(event.target.value)}>
            <option value="">Selecione uma pessoa</option>{matches.map(person=><option key={person.person_id} value={person.person_id}>
              {person.name}{person.registration?` · ${person.registration}`:''}{person.number?` · armário ${person.number}`:''}</option>)}</select></label>
          {chosen&&source?.id===locker.id&&<p className="warning">{chosen.name} já ocupa este armário.</p>}
          {chosen&&source&&source.id!==locker.id&&<p className="action-summary"><strong>Transferência</strong> · {chosen.name}, armário {source.number} → {locker.number}, filial {branchName}. A ocupação anterior será encerrada.</p>}
          {chosen&&!source&&<p className="action-summary"><strong>Atribuição</strong> · {chosen.name} receberá o armário {locker.number}, filial {branchName}.</p>}
          {chosen&&source&&source.id!==locker.id&&<label className="field-icon"><FieldIcon icon={ArrowLeftRight}/>Motivo da transferência<input required minLength={3} value={transferReason} onChange={event=>setTransferReason(event.target.value)}/></label>}
          <label className="field-icon"><FieldIcon icon={MessageSquare}/>Observação (opcional)<input value={note} onChange={event=>setNote(event.target.value)}/></label>
          {needsSharing&&<><label>Motivo do compartilhamento<input required value={sharingReason} onChange={event=>setSharingReason(event.target.value)}/></label>
            <label>Previsão de encerramento do compartilhamento<input type="date" required value={sharingDue} onChange={event=>setSharingDue(event.target.value)}/></label></>}
          <button className="primary" disabled={busy||!personId||!keyCopy||source?.id===locker.id||!!source&&transferReason.trim().length<3}>
            {source?'Transferir para este armário':'Cadastrar neste armário'}</button>
        </form>}
      </section>
    </div>}
    </>}
    </div>
  {printData&&<TermoResponsabilidade dados={printData}/>}</>;
}

type OccupantSlotProps={
  slot:number;
  occupant?:Occupant;
  draft:OccupantDraft;
  editing:boolean;
  creating:boolean;
  busy:boolean;
  officialLocked:boolean;
  blocked?:boolean;
  registrations:RegistrationOption[];
  onDraft:React.Dispatch<React.SetStateAction<OccupantDraft>>;
  onRegistration:(value:string,match:RegistrationOption|undefined)=>void;
  onEdit:()=>void;
  onCancel:()=>void;
  onSave:()=>void;
  onAdd:()=>void;
  onPrint:(occupant:Occupant)=>void;
  onRelease:(occupant:Occupant)=>void;
};

function OccupantSlot({slot,occupant,draft,editing,busy,officialLocked,blocked=false,registrations,
  onDraft,onRegistration,onEdit,onCancel,onSave,onAdd,onPrint,onRelease}:OccupantSlotProps){
  const number=slot+1;
  const head=(occupied:boolean)=><div className="occupant-slot-head">
    <span className="slot-index" aria-hidden="true">{number}</span>
    <strong>Ocupante {number}</strong>
    <span className={occupied?'badge slot-state':'badge slot-state slot-state--free'}>{occupied?'Ocupado':'Vago'}</span>
  </div>;

  if(editing)return <article className="list-row occupant-slot occupant-slot--editing" aria-label={`Ocupante ${number}`}>
    {head(!!occupant)}
    <form className="occupant-form" onSubmit={event=>{event.preventDefault();onSave();}}>
      <RegistrationInput id={`occupant-slot-${slot}`} value={draft.registration} options={registrations} onChange={onRegistration}/>
      <label className="field-icon"><FieldIcon icon={User}/>Nome<input value={draft.name} disabled={officialLocked}
        onChange={event=>onDraft(current=>({...current,name:event.target.value}))}/></label>
      <label className="field-icon"><FieldIcon icon={Building2}/>Setor<input value={draft.department} disabled={officialLocked}
        onChange={event=>onDraft(current=>({...current,department:event.target.value}))}/></label>
      <label className="field-icon"><FieldIcon icon={Briefcase}/>Função<input value={draft.functionName} disabled={officialLocked}
        onChange={event=>onDraft(current=>({...current,functionName:event.target.value}))}/></label>
      {officialLocked&&<p className="muted">Nome, setor e função vêm da base atual de colaboradores.</p>}
      <div className="row-actions occupant-actions">
        <button className="primary" type="submit" disabled={busy||(!draft.name.trim()&&!draft.registration.trim())}>Salvar ocupante</button>
        <button type="button" disabled={busy} onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  </article>;

  if(!occupant)return <article className="list-row occupant-slot" aria-label={`Ocupante ${number}`}>
    {head(false)}
    {blocked?<p className="locker-empty"><Users size={16} aria-hidden="true"/>Aguardando cadastro do 1º ocupante.</p>
      :<button type="button" className="add-occupant" disabled={busy} onClick={onAdd}>
        <Plus size={15} aria-hidden="true"/>{number===1?'Cadastrar ocupante':'Adicionar 2º ocupante'}</button>}
  </article>;

  return <article className="list-row occupant-slot" aria-label={`Ocupante ${number}`}>
    {head(true)}
    <div className="occupant-copy"><strong>{occupant.name}</strong>
      <small><span><Hash size={12} aria-hidden="true"/>{occupant.registration?`Matrícula ${occupant.registration}`:'Sem matrícula'}</span>
        <span><Building2 size={12} aria-hidden="true"/>{occupant.department||'Setor não informado'}</span>
        {occupant.functionName&&<span><Briefcase size={12} aria-hidden="true"/>{occupant.functionName}</span>}</small></div>
    <div className="row-actions occupant-actions">
      <button type="button" className="btn-action" disabled={busy} onClick={()=>onPrint(occupant)}>Imprimir Termo</button>
      <button type="button" disabled={busy} aria-label={`Editar ${occupant.name}`} onClick={onEdit}><PencilLine size={14} aria-hidden="true"/>Editar</button>
      <button type="button" disabled={busy} onClick={()=>onRelease(occupant)}>Desocupar armário</button>
    </div>
  </article>;
}
