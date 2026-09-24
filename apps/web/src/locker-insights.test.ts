import {describe,expect,it} from 'vitest';
import {availablePositions,occupiedPositions,pendingLockerIds,requiresReview,type InsightLocker} from './locker-insights';

const locker=(overrides:Partial<InsightLocker>={}):InsightLocker=>({
  id:'101',number:'101',capacity:2,sector_occupant:null,condition:'disponivel',migration_status:'conferido',
  key_copy_available:true,occupants:[],...overrides
});

describe('indicadores de armários da filial',()=>{
  it('separa capacidade física, ocupação e vagas de um armário duplo parcialmente ocupado',()=>{
    const item=locker({occupants:[{name:'Ana',registration:'0001',department:'Loja'}]});
    expect(item.capacity).toBe(2);
    expect(occupiedPositions(item)).toBe(1);
    expect(availablePositions(item)).toBe(1);
  });

  it('não oferece vagas em armários bloqueados, inconclusivos ou reservados a um setor',()=>{
    expect(availablePositions(locker({condition:'bloqueado'}))).toBe(0);
    expect(availablePositions(locker({migration_status:'inconclusivo'}))).toBe(0);
    const sector=locker({sector_occupant:'Restaurante'});
    expect(occupiedPositions(sector)).toBe(2);
    expect(availablePositions(sector)).toBe(0);
    expect(requiresReview(locker({migration_status:'inconclusivo'}))).toBe(true);
  });

  it('conta cada armário com pendência aberta apenas uma vez',()=>{
    const ids=pendingLockerIds([
      {kind:'migracao_inconclusiva',state:'aberta',pending_locker_id:'101'},
      {kind:'identificacao_conflitante',state:'aberta',pending_locker_id:'101'},
      {kind:'migracao_inconclusiva',state:'concluida',pending_locker_id:'102'},
      {kind:'ausente_ti',state:'aberta',pending_locker_id:null}
    ]);
    expect([...ids]).toEqual(['101']);
  });
});
