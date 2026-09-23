import {pool,transaction} from '../db.js';
if(process.env.DEMO_SEED!=='true')throw new Error('Defina DEMO_SEED=true para criar apenas dados fictícios');
await transaction(async client=>{
  const found=await client.query('SELECT id FROM branches WHERE name=$1',['Caruaru Demonstração']);
  if(found.rows[0])throw new Error('Dados de demonstração já criados');
  const branch=(await client.query<{id:string}>("INSERT INTO branches(name,timezone) VALUES('Caruaru Demonstração','America/Fortaleza') RETURNING id")).rows[0];
  const lockers=[];
  for(const [number,capacity,modality,sector] of [['101',1,'fixo',null],['102',2,'fixo',null],['12',1,'rotativo','Restaurante FC']] as const){
    lockers.push((await client.query<{id:string}>('INSERT INTO lockers(branch_id,number,size,capacity,is_double,modality,sector_occupant) VALUES($1,$2,\'padrao\',$3,$4,$5,$6) RETURNING id',[branch.id,number,capacity,capacity===2,modality,sector])).rows[0]);
  }
  for(const [name,registration,category,needsFixed] of [['Ana Exemplo','00017','colaborador',true],['Bruno Fictício','00018','promotor_fixo',true],['Carla Demonstração',null,'roteirista',false]] as const){
    const person=(await client.query<{id:string}>('INSERT INTO people(name) VALUES($1) RETURNING id',[name])).rows[0];
    await client.query('INSERT INTO memberships(person_id,branch_id,category,origin,registration,needs_fixed,ti_present) VALUES($1,$2,$3,$4,$5,$6,$7)',[person.id,branch.id,category,category==='colaborador'?'ti':'manual',registration,needsFixed,category==='colaborador'?true:null]);
    if(name==='Ana Exemplo')await client.query("INSERT INTO allocations(branch_id,locker_id,person_id,modality,started_at) VALUES($1,$2,$3,'fixo',now())",[branch.id,lockers[0].id,person.id]);
  }
});
process.stdout.write('Dados fictícios criados.\n');
await pool.end();
