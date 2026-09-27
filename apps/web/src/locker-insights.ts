export type LockerOccupant={name:string;registration:string|null;department:string|null;category?:string|null};
export type InsightLocker={id:string;number:string;capacity:number;is_double:boolean;sector_occupant:string|null;condition:string;migration_status:string;key_copy_available:boolean|null;occupants:LockerOccupant[]};
export type InsightPending={kind:string;state:string;pending_locker_id:string|null};
export type LockerPreset={status?:string;sector?:string;key?:string;pendingKind?:string;double?:boolean};

export const pendingKindLabels:Record<string,string>={
  ausente_ti:'Matrícula não encontrada na base atual',
  sem_armario:'Pessoa precisa de armário',
  atuacao_encerrada:'Cadastro encerrado com armário',
  sazonal_vencida:'Prazo de ocupação vencido',
  compartilhamento_vencido:'Prazo de compartilhamento vencido',
  migracao_inconclusiva:'Dados do armário a conferir',
  dados_alterados:'Dados cadastrais alterados',
  identificacao_conflitante:'Identificação conflitante'
};

const restrictedSharingDepartments=new Set(['limpeza','manutencao','manutencao infraestrutura']);
const normalizedDepartment=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLocaleLowerCase('pt-BR');
export function hasRestrictedSharingOccupant(locker:InsightLocker){return locker.is_double&&locker.occupants.some(person=>person.department&&restrictedSharingDepartments.has(normalizedDepartment(person.department)));}
export function showsLockerPositions(locker:InsightLocker){return locker.is_double;}
export function effectiveCapacity(locker:InsightLocker){return hasRestrictedSharingOccupant(locker)?1:locker.capacity;}
export function occupiedPositions(locker:InsightLocker){return locker.sector_occupant?effectiveCapacity(locker):locker.occupants.length;}
export function availablePositions(locker:InsightLocker){
  if(locker.condition!=='disponivel'||locker.migration_status!=='conferido'||locker.sector_occupant||hasRestrictedSharingOccupant(locker))return 0;
  return Math.max(0,effectiveCapacity(locker)-locker.occupants.length);
}
export function requiresReview(locker:InsightLocker){return locker.condition!=='disponivel'||locker.migration_status==='inconclusivo';}
export function lockerSectors(locker:InsightLocker){return [...new Set([locker.sector_occupant,...locker.occupants.map(person=>person.department)].filter((value):value is string=>!!value))];}
export function openLockerPending(items:InsightPending[]){return items.filter(item=>item.state==='aberta'&&!!item.pending_locker_id);}
export function pendingLockerIds(items:InsightPending[]){return new Set(openLockerPending(items).map(item=>item.pending_locker_id));}
export function openPendingCount(items:InsightPending[],kind?:string){return items.filter(item=>item.state==='aberta'&&(!kind||item.kind===kind)).length;}
export function openPendingWithLocker(items:InsightPending[],kind:string){return openLockerPending(items).filter(item=>item.kind===kind).length;}

export const categoryLabels:Record<string,string>={
  colaborador:'Colaborador FC',
  promotor_fixo:'Promotor Fixo',
  terceirizado:'Terceirizado',
  roteirista:'Roteirista'
};
export const canonicalCategories=['colaborador','promotor_fixo','terceirizado','roteirista'] as const;
export const unlinkedCategoryLabel='Ocupação por setor';
export const unknownCategoryLabel='Sem categoria de vínculo';
export const missingSectorLabel='Sem setor';

export type AlertLevel='ok'|'atencao'|'critico';
export function pendingAlertLevel(count:number):AlertLevel{return count===0?'ok':count<=10?'atencao':'critico';}
export const alertLevelLabels:Record<AlertLevel,string>={ok:'Sob controle',atencao:'Atenção',critico:'Crítico'};

export type DoubleBreakdown={total:number;free:number;partial:number;full:number;positions:number;filled:number;utilization:number};
export function doubleLockerBreakdown(lockers:InsightLocker[]):DoubleBreakdown{
  let total=0,free=0,partial=0,full=0,positions=0,filled=0;
  for(const locker of lockers){
    if(!locker.is_double)continue;
    const capacity=Math.max(1,locker.capacity);
    const occupied=Math.max(0,Math.min(capacity,occupiedPositions(locker)));
    total+=1;positions+=capacity;filled+=occupied;
    if(occupied===0)free+=1;
    else if(occupied>=capacity)full+=1;
    else partial+=1;
  }
  return {total,free,partial,full,positions,filled,utilization:positions?Math.round(filled/positions*100):0};
}

export type CategoryShare={key:string;label:string;count:number;percent:number};
export function occupancyByCategory(lockers:InsightLocker[]):CategoryShare[]{
  const counts=new Map<string,number>();
  let total=0;
  for(const locker of lockers){
    if(locker.sector_occupant){
      const value=effectiveCapacity(locker);
      counts.set('sem_vinculo',(counts.get('sem_vinculo')??0)+value);total+=value;continue;
    }
    for(const person of locker.occupants){
      const key=person.category?.trim()||'sem_categoria';
      counts.set(key,(counts.get(key)??0)+1);total+=1;
    }
  }
  const extras=[...counts.keys()].filter(key=>!(canonicalCategories as readonly string[]).includes(key)).sort((a,b)=>a.localeCompare(b,'pt-BR'));
  return [...canonicalCategories,...extras].map(key=>({
    key,
    label:categoryLabels[key]??(key==='sem_vinculo'?unlinkedCategoryLabel:key==='sem_categoria'?unknownCategoryLabel:key),
    count:counts.get(key)??0,
    percent:total?Math.round(((counts.get(key)??0)/total)*100):0
  }));
}

export type SectorShare={name:string;count:number;anomaly:boolean};
export function occupancyBySector(lockers:InsightLocker[]):SectorShare[]{
  const counts=new Map<string,number>();
  for(const locker of lockers){
    if(locker.sector_occupant){
      counts.set(locker.sector_occupant,(counts.get(locker.sector_occupant)??0)+effectiveCapacity(locker));continue;
    }
    for(const person of locker.occupants){
      const sector=person.department?.trim()||missingSectorLabel;
      counts.set(sector,(counts.get(sector)??0)+1);
    }
  }
  return [...counts].map(([name,count])=>({name,count,anomaly:name===missingSectorLabel}))
    .sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'pt-BR'));
}

export function lockersWithoutSectorOrRegistration(lockers:InsightLocker[]){
  return lockers.filter(locker=>{
    if(!locker.occupants.length&&occupiedPositions(locker)===0)return false;
    return lockerSectors(locker).length===0||locker.occupants.some(person=>!person.registration?.trim());
  }).length;
}

export type PhysicalExceptions={total:number;blocked:number;noKey:number};
export function lockerExceptions(lockers:InsightLocker[]):PhysicalExceptions{
  let total=0,blocked=0,noKey=0;
  for(const locker of lockers){
    const inMaintenance=locker.condition!=='disponivel';
    const missingKey=locker.key_copy_available===false;
    if(inMaintenance)blocked+=1;
    if(missingKey)noKey+=1;
    if(inMaintenance||missingKey)total+=1;
  }
  return {total,blocked,noKey};
}

export type OccupancySummary={physical:number;capacity:number;occupied:number;available:number;percent:number};
export function occupancySummary(lockers:InsightLocker[]):OccupancySummary{
  const capacity=lockers.reduce((sum,locker)=>sum+effectiveCapacity(locker),0);
  const occupied=lockers.reduce((sum,locker)=>sum+occupiedPositions(locker),0);
  return {physical:lockers.length,capacity,occupied,
    available:lockers.reduce((sum,locker)=>sum+availablePositions(locker),0),
    percent:capacity?Math.round((occupied/capacity)*100):0};
}
