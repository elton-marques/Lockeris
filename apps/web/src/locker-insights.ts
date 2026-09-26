export type LockerOccupant={name:string;registration:string|null;department:string|null};
export type InsightLocker={id:string;number:string;capacity:number;is_double:boolean;sector_occupant:string|null;condition:string;migration_status:string;key_copy_available:boolean|null;occupants:LockerOccupant[]};
export type InsightPending={kind:string;state:string;pending_locker_id:string|null};
export type LockerPreset={status?:string;sector?:string;key?:string;pendingKind?:string};

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
