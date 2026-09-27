export type SectorPerson={department:string|null;status?:string};
export type SectorLocker={sector_occupant:string|null};

const normalize=(value:string|null|undefined)=>value?.trim()??'';

/**
 * Setores oficiais da filial: departamentos da base ativa de colaboradores,
 * setores já registrados em armários e o valor atual do campo, para que a
 * seleção nunca perca um setor já gravado.
 */
export function branchSectors(people:SectorPerson[],lockers:SectorLocker[],current?:string|null):string[]{
  const sectors=new Set<string>();
  people.forEach(person=>{
    if(person.status&&person.status!=='ativo')return;
    const department=normalize(person.department);
    if(department)sectors.add(department);
  });
  lockers.forEach(locker=>{
    const sector=normalize(locker.sector_occupant);
    if(sector)sectors.add(sector);
  });
  const currentValue=normalize(current);
  if(currentValue)sectors.add(currentValue);
  return [...sectors].sort((a,b)=>a.localeCompare(b,'pt-BR'));
}

export function sectorSelectOptions(people:SectorPerson[],lockers:SectorLocker[],current?:string|null,emptyLabel='Sem setor ocupante'){
  return [{value:'',label:emptyLabel},...branchSectors(people,lockers,current).map(sector=>({value:sector,label:sector}))];
}
