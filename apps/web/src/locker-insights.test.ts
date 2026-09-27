import {describe,expect,it} from 'vitest';
import {availablePositions,doubleLockerBreakdown,effectiveCapacity,lockerExceptions,lockersWithoutSectorOrRegistration,occupancyByCategory,occupancyBySector,occupiedPositions,occupancySummary,pendingAlertLevel,pendingLockerIds,requiresReview,showsLockerPositions,type InsightLocker} from './locker-insights';

const locker=(overrides:Partial<InsightLocker>={}):InsightLocker=>({
  id:'101',number:'101',capacity:2,is_double:true,sector_occupant:null,condition:'disponivel',migration_status:'conferido',
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

  it('não mostra posição para armário simples e não oferece compartilhamento restrito',()=>{
    const simple=locker({capacity:1,is_double:false});
    expect(showsLockerPositions(simple)).toBe(false);
    expect(availablePositions(simple)).toBe(1);

    const restricted=locker({occupants:[{name:'Ana',registration:'0001',department:'LIMPEZA'}]});
    expect(effectiveCapacity(restricted)).toBe(1);
    expect(occupiedPositions(restricted)).toBe(1);
    expect(availablePositions(restricted)).toBe(0);
    expect(availablePositions(locker({occupants:[{name:'Bia',registration:'0002',department:'Manutenção'}]}))).toBe(0);
    expect(availablePositions(locker({occupants:[{name:'Caio',registration:'0003',department:'MANUTENCAO INFRAESTRUTURA'}]}))).toBe(0);
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

describe('indicadores executivos do painel',()=>{
  it('separa os armários duplos em 0/2, 1/2 e 2/2 e calcula a utilização',()=>{
    const lockers=[
      locker({id:'1',number:'1'}),
      locker({id:'2',number:'2',occupants:[{name:'Ana',registration:'0001',department:'Loja'}]}),
      locker({id:'3',number:'3',occupants:[{name:'Ana',registration:'0001',department:'Loja'},{name:'Bia',registration:'0002',department:'Loja'}]}),
      locker({id:'4',number:'4',capacity:1,is_double:false,occupants:[{name:'Caio',registration:'0003',department:'Loja'}]})
    ];
    expect(doubleLockerBreakdown(lockers)).toEqual({total:3,free:1,partial:1,full:1,positions:6,filled:3,utilization:50});
    expect(doubleLockerBreakdown([locker({id:'9',capacity:1,is_double:false})])).toEqual({total:0,free:0,partial:0,full:0,positions:0,filled:0,utilization:0});
  });

  it('agrupa a ocupação por categoria de vínculo',()=>{
    const rows=occupancyByCategory([
      locker({id:'1',occupants:[{name:'Ana',registration:'0001',department:'Loja',category:'colaborador'}]}),
      locker({id:'2',occupants:[{name:'Bia',registration:'0002',department:'Loja',category:'colaborador'}]}),
      locker({id:'3',occupants:[{name:'Caio',registration:'0003',department:'Loja',category:'terceirizado'}]}),
      locker({id:'4',sector_occupant:'Restaurante',capacity:1,is_double:false}),
      locker({id:'5',occupants:[{name:'Duda',registration:null,department:'Loja'}]})
    ]);
    expect(rows.find(row=>row.key==='colaborador')).toMatchObject({label:'Colaborador FC',count:2,percent:40});
    expect(rows.find(row=>row.key==='promotor_fixo')).toMatchObject({count:0,percent:0});
    expect(rows.find(row=>row.key==='terceirizado')).toMatchObject({count:1,percent:20});
    expect(rows.find(row=>row.key==='roteirista')).toMatchObject({count:0});
    expect(rows.find(row=>row.key==='sem_vinculo')).toMatchObject({label:'Ocupação por setor',count:1,percent:20});
    expect(rows.find(row=>row.key==='sem_categoria')).toMatchObject({label:'Sem categoria de vínculo',count:1,percent:20});
    expect(rows.reduce((sum,row)=>sum+row.count,0)).toBe(5);
  });

  it('marca a ocupação sem setor como anomalia no ranking de setores',()=>{
    const rows=occupancyBySector([
      locker({id:'1',occupants:[{name:'Ana',registration:'0001',department:'Loja'}]}),
      locker({id:'2',occupants:[{name:'Bia',registration:'0002',department:'Loja'},{name:'Caio',registration:'0003',department:'Loja'}]}),
      locker({id:'3',occupants:[{name:'Duda',registration:'0004',department:null}]}),
      locker({id:'4',sector_occupant:'Restaurante',capacity:1,is_double:false})
    ]);
    expect(rows[0]).toMatchObject({name:'Loja',count:3,anomaly:false});
    expect(rows.find(row=>row.name==='Sem setor')).toMatchObject({count:1,anomaly:true});
    expect(rows.filter(row=>row.anomaly).map(row=>row.name)).toEqual(['Sem setor']);
  });

  it('classifica o nível de alerta das pendências abertas',()=>{
    expect(pendingAlertLevel(0)).toBe('ok');
    expect(pendingAlertLevel(1)).toBe('atencao');
    expect(pendingAlertLevel(10)).toBe('atencao');
    expect(pendingAlertLevel(11)).toBe('critico');
  });

  it('conta armários ocupados sem setor ou com ocupante sem matrícula',()=>{
    expect(lockersWithoutSectorOrRegistration([
      locker({id:'1',occupants:[{name:'Ana',registration:'0001',department:'Loja'}]}),
      locker({id:'2'}),
      locker({id:'3',occupants:[{name:'Bia',registration:null,department:'Loja'}]}),
      locker({id:'4',occupants:[{name:'Caio',registration:'0003',department:null}]}),
      locker({id:'5',sector_occupant:'Restaurante'})
    ])).toBe(2);
  });

  it('agrupa exceções físicas de manutenção, bloqueio e cópia de chave',()=>{
    expect(lockerExceptions([
      locker({id:'1'}),
      locker({id:'2',condition:'manutencao'}),
      locker({id:'3',condition:'bloqueado',key_copy_available:false}),
      locker({id:'4',key_copy_available:false})
    ])).toEqual({total:3,blocked:2,noKey:2});
  });

  it('resume capacidade, ocupação, vagas imediatas e percentual da filial',()=>{
    expect(occupancySummary([
      locker({id:'1'}),
      locker({id:'2',capacity:1,is_double:false,occupants:[{name:'Ana',registration:'0001',department:'Loja'}]})
    ])).toMatchObject({physical:2,capacity:3,occupied:1,available:2,percent:33});
  });
});
