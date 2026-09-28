export type LockerOccupant={name:string;registration:string|null;department:string|null;functionName?:string|null;category?:string|null};
export type InsightLocker={id:string;number:string;capacity:number;is_double:boolean;sector_occupant:string|null;condition:string;migration_status:string;key_copy_available:boolean|null;occupants:LockerOccupant[]};
export type InsightPending={kind:string;state:string;pending_locker_id:string|null};
export type LockerPreset={status?:string;sector?:string;key?:string;pendingKind?:string;double?:boolean};

export const pendingKindLabels:Record<string,string>={
  sem_matricula:'Pessoa sem matrícula validada',
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
/**
 * Setores que têm direito a um armário duplo individual (EPI e equipamentos):
 * TRANSPORTE PESADO, CONSERVAÇÃO E MANUTENÇÃO e as variações Conservação/Limpeza/Manutenção.
 * Com um único ocupante esses duplos são considerados 100% ocupados e entram na regra,
 * nunca na contagem de subutilizados.
 */
const exclusiveDoubleSectorKeywords=['transporte pesado','conservacao','limpeza','manutencao'];
const mentionsSector=(value:string|null|undefined,keywords:string[])=>{
  if(!value)return false;
  const text=normalizedDepartment(value);
  return keywords.some(keyword=>text.includes(keyword));
};
export function hasExclusiveDoubleRule(locker:InsightLocker){
  if(!locker.is_double||locker.occupants.length!==1)return false;
  return lockerSectors(locker).some(sector=>mentionsSector(sector,exclusiveDoubleSectorKeywords));
}
export function hasRestrictedSharingOccupant(locker:InsightLocker){return locker.is_double&&locker.occupants.some(person=>person.department&&restrictedSharingDepartments.has(normalizedDepartment(person.department)));}
export function showsLockerPositions(locker:InsightLocker){return locker.is_double;}
export function effectiveCapacity(locker:InsightLocker){return hasExclusiveDoubleRule(locker)||hasRestrictedSharingOccupant(locker)?1:locker.capacity;}
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
  colaborador:'Colaboradores FC',
  promotor_fixo:'Promotores Fixos',
  terceirizado:'Terceirizados',
  vinculo_nao_identificado:'Vínculo não identificado'
};
export const canonicalCategories=['colaborador','promotor_fixo','terceirizado','vinculo_nao_identificado'] as const;
export const missingSectorLabel='Sem setor';

/**
 * "Promotor" é cargo/função, nunca setor: a menção a promotor no setor ou na
 * função do ocupante define o vínculo da pessoa e retira o rótulo do ranking
 * de ocupação por setor.
 */
export function mentionsPromoter(value:string|null|undefined){return mentionsSector(value,['promotor']);}

export type AlertLevel='ok'|'atencao'|'critico';
export function pendingAlertLevel(count:number):AlertLevel{return count===0?'ok':count<=10?'atencao':'critico';}
export const alertLevelLabels:Record<AlertLevel,string>={ok:'Sob controle',atencao:'Atenção',critico:'Crítico'};

export type DoubleBreakdown={total:number;free:number;partial:number;full:number;positions:number;filled:number;utilization:number};
export function doubleLockerBreakdown(lockers:InsightLocker[]):DoubleBreakdown{
  let total=0,free=0,partial=0,full=0,positions=0,filled=0;
  for(const locker of lockers){
    if(!locker.is_double)continue;
    const capacity=Math.max(1,effectiveCapacity(locker));
    const occupied=Math.max(0,Math.min(capacity,occupiedPositions(locker)));
    total+=1;positions+=capacity;filled+=occupied;
    if(occupied===0)free+=1;
    else if(occupied>=capacity)full+=1;
    else partial+=1;
  }
  return {total,free,partial,full,positions,filled,utilization:positions?Math.round(filled/positions*100):0};
}

export type CategoryShare={key:string;label:string;count:number;percent:number};
export type CategoryLinks={colaborador:number;promotor_fixo:number;terceirizado:number;vinculo_nao_identificado:number;total:number};
/**
 * Monta as linhas de "Pessoas por vínculo" a partir da contagem agregada da
 * filial (`GET /api/branches/:id/dashboard`). A query conta todos os vínculos
 * ativos da filial — promotores inclusos — sem nenhum `LIMIT` de exibição.
 */
export function categoryShares(links:CategoryLinks):CategoryShare[]{
  const total=canonicalCategories.reduce((sum,key)=>sum+(links[key]??0),0);
  return canonicalCategories.map(key=>{
    const count=links[key]??0;
    return {key,label:categoryLabels[key],count,percent:total?Math.round((count/total)*100):0};
  });
}
export function sectorOccupiedPositions(lockers:InsightLocker[]):number{
  return lockers.reduce((sum,locker)=>sum+(locker.sector_occupant?effectiveCapacity(locker):0),0);
}

export type SectorShare={name:string;count:number;anomaly:boolean};
export function occupancyBySector(lockers:InsightLocker[]):SectorShare[]{
  const counts=new Map<string,number>();
  for(const locker of lockers){
    if(locker.sector_occupant){
      if(mentionsPromoter(locker.sector_occupant))continue;
      counts.set(locker.sector_occupant,(counts.get(locker.sector_occupant)??0)+effectiveCapacity(locker));continue;
    }
    for(const person of locker.occupants){
      const sector=person.department?.trim()||missingSectorLabel;
      if(sector!==missingSectorLabel&&mentionsPromoter(sector))continue;
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

export type KeyControlSummary={withoutKey:number;withKey:number;unreported:number};
export function keyControlSummary(lockers:InsightLocker[]):KeyControlSummary{
  let withoutKey=0,withKey=0,unreported=0;
  for(const locker of lockers){
    if(locker.key_copy_available===false)withoutKey+=1;
    else if(locker.key_copy_available===true)withKey+=1;
    else unreported+=1;
  }
  return {withoutKey,withKey,unreported};
}

export type OccupancySummary={physical:number;capacity:number;occupied:number;available:number;percent:number};
export function occupancySummary(lockers:InsightLocker[]):OccupancySummary{
  const capacity=lockers.reduce((sum,locker)=>sum+effectiveCapacity(locker),0);
  const occupied=lockers.reduce((sum,locker)=>sum+occupiedPositions(locker),0);
  return {physical:lockers.length,capacity,occupied,
    available:lockers.reduce((sum,locker)=>sum+availablePositions(locker),0),
    percent:capacity?Math.round((occupied/capacity)*100):0};
}
