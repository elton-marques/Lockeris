import {describe,expect,it} from 'vitest';
import {availablePositions,categoryShares,doubleLockerBreakdown,effectiveCapacity,hasExclusiveDoubleRule,keyControlSummary,lockersWithoutSectorOrRegistration,occupancyBySector,occupiedPositions,occupancySummary,pendingAlertLevel,pendingLockerIds,requiresReview,sectorOccupiedPositions,showsLockerPositions,type InsightLocker} from './locker-insights';

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

describe('regra de armário duplo por setor',()=>{
  it('trata duplo de TRANSPORTE PESADO com um ocupante como 100% ocupado, não subutilizado',()=>{
    const item=locker({occupants:[{name:'Téo',registration:'0010',department:'TRANSPORTE PESADO'}]});
    expect(hasExclusiveDoubleRule(item)).toBe(true);
    expect(effectiveCapacity(item)).toBe(1);
    expect(occupiedPositions(item)).toBe(1);
    expect(availablePositions(item)).toBe(0);
    expect(doubleLockerBreakdown([item])).toEqual({total:1,free:0,partial:0,full:1,positions:1,filled:1,utilization:100});
  });

  it('aplica a mesma regra para CONSERVAÇÃO E MANUTENÇÃO e suas variações',()=>{
    for(const department of ['CONSERVAÇÃO E MANUTENÇÃO','Conservação','Limpeza','MANUTENCAO','Manutenção Infraestrutura']){
      const item=locker({occupants:[{name:'Ana',registration:'0001',department}]});
      expect(hasExclusiveDoubleRule(item),department).toBe(true);
      expect(doubleLockerBreakdown([item]),department).toMatchObject({full:1,partial:0,free:0});
    }
  });

  it('mantém duplo de setor comum com um único ocupante como subutilizado',()=>{
    const item=locker({occupants:[{name:'Ana',registration:'0001',department:'Loja'}]});
    expect(hasExclusiveDoubleRule(item)).toBe(false);
    expect(effectiveCapacity(item)).toBe(2);
    expect(availablePositions(item)).toBe(1);
    expect(doubleLockerBreakdown([item])).toEqual({total:1,free:0,partial:1,full:0,positions:2,filled:1,utilization:50});
  });

  it('não aplica a regra sem ocupante, com dois ocupantes ou em armário simples',()=>{
    expect(hasExclusiveDoubleRule(locker({occupants:[]}))).toBe(false);
    expect(hasExclusiveDoubleRule(locker({occupants:[
      {name:'Ana',registration:'0001',department:'TRANSPORTE PESADO'},
      {name:'Bia',registration:'0002',department:'TRANSPORTE PESADO'}]}))).toBe(false);
    expect(hasExclusiveDoubleRule(locker({capacity:1,is_double:false,
      occupants:[{name:'Caio',registration:'0003',department:'CONSERVAÇÃO E MANUTENÇÃO'}]}))).toBe(false);
    expect(hasExclusiveDoubleRule(locker({sector_occupant:'LIMPEZA',occupants:[]}))).toBe(false);
  });

  it('resume a filial com duplo de setor especial em 100% de ocupação',()=>{
    expect(occupancySummary([
      locker({id:'1',occupants:[{name:'Téo',registration:'0010',department:'TRANSPORTE PESADO'}]}),
      locker({id:'2',capacity:1,is_double:false,occupants:[{name:'Ana',registration:'0001',department:'Loja'}]})
    ])).toMatchObject({physical:2,capacity:2,occupied:2,available:0,percent:100});
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

  it('conta a totalidade dos promotores da filial no card de vínculos, sem limite de exibição',()=>{
    const rows=categoryShares({colaborador:20,promotor_fixo:54,terceirizado:8,vinculo_nao_identificado:6,total:88});
    expect(rows.map(row=>row.key)).toEqual(['colaborador','promotor_fixo','terceirizado','vinculo_nao_identificado']);
    expect(rows.find(row=>row.key==='promotor_fixo')).toMatchObject({label:'Promotor(a)',count:54,percent:61});
    expect(rows.find(row=>row.key==='colaborador')).toMatchObject({label:'Colaborador',count:20,percent:23});
    expect(rows.find(row=>row.key==='vinculo_nao_identificado')).toMatchObject({label:'Pendência Cadastral',count:6,percent:7});
    expect(rows.reduce((sum,row)=>sum+row.count,0)).toBe(88);
  });

  it('zera contagem e percentual quando a filial não tem vínculos classificados',()=>{
    const rows=categoryShares({colaborador:0,promotor_fixo:0,terceirizado:0,vinculo_nao_identificado:0,total:0});
    expect(rows.map(row=>row.key)).toEqual(['colaborador','promotor_fixo','terceirizado','vinculo_nao_identificado']);
    expect(rows.every(row=>row.count===0&&row.percent===0)).toBe(true);
  });

  it('mantém posições setoriais separadas das pessoas identificadas',()=>{
    expect(sectorOccupiedPositions([
      locker({sector_occupant:'PROMOTOR(A)',capacity:1,is_double:false}),
      locker({sector_occupant:'Restaurante FC',capacity:1,is_double:false})
    ])).toBe(2);
    expect(sectorOccupiedPositions([locker({occupants:[{name:'Ana',registration:'0001',department:'Loja'}]})])).toBe(0);
  });

  it('mantém promotores fora do ranking de setores porque promotor é cargo',()=>{
    const rows=occupancyBySector([
      locker({id:'1',occupants:[{name:'Ana',registration:'0001',department:'Loja'}]}),
      locker({id:'2',occupants:[{name:'Eli',registration:'0005',department:'PROMOTOR(A)',functionName:'PROMOTOR(A)'}]}),
      locker({id:'3',sector_occupant:'PROMOTOR(A)',capacity:1,is_double:false}),
      locker({id:'4',sector_occupant:'Restaurante',capacity:1,is_double:false})
    ]);
    expect(rows.map(row=>row.name)).toEqual(['Loja','Restaurante']);
    expect(rows.some(row=>row.name.toLocaleLowerCase('pt-BR').includes('promotor'))).toBe(false);
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

  it('agrupa a situação da cópia das chaves sem contar status de manutenção ou bloqueio',()=>{
    expect(keyControlSummary([
      locker({id:'1'}),
      locker({id:'2',condition:'manutencao'}),
      locker({id:'3',condition:'bloqueado',key_copy_available:false}),
      locker({id:'4',key_copy_available:false}),
      locker({id:'5',key_copy_available:null})
    ])).toEqual({withoutKey:2,withKey:2,unreported:1});
  });

  it('resume capacidade, ocupação, vagas imediatas e percentual da filial',()=>{
    expect(occupancySummary([
      locker({id:'1'}),
      locker({id:'2',capacity:1,is_double:false,occupants:[{name:'Ana',registration:'0001',department:'Loja'}]})
    ])).toMatchObject({physical:2,capacity:3,occupied:1,available:2,percent:33});
  });
});
