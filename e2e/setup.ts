import {Pool} from 'pg';
import argon2 from 'argon2';
const connectionString=process.env.E2E_DATABASE_URL??'postgres://armarios:armarios@localhost:5432/armarios_e2e';
export default async function setup(){
  if(!connectionString.includes('armarios_e2e'))throw new Error('Banco E2E separado é obrigatório');
  const pool=new Pool({connectionString});
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query('TRUNCATE branches,people,users CASCADE');
    const branch=(await client.query<{id:string}>("INSERT INTO branches(name,timezone) VALUES('Caruaru Demonstração','America/Fortaleza') RETURNING id")).rows[0];
    const admin=(await client.query<{id:string}>("INSERT INTO users(username,password_hash,role,branch_id,must_change_password) VALUES($1,$2,'filial_admin',$3,false) RETURNING id",['e2e',await argon2.hash('Testing-Password-123',{type:argon2.argon2id}),branch.id])).rows[0];
    const shared=(await client.query<{id:string}>("INSERT INTO lockers(branch_id,number,size,capacity,modality) VALUES($1,'102','padrao',2,'fixo') RETURNING id",[branch.id])).rows[0];
    await client.query("INSERT INTO lockers(branch_id,number,size,capacity,modality) VALUES($1,'101','padrao',1,'fixo')",[branch.id]);
    await client.query("INSERT INTO lockers(branch_id,number,size,capacity,modality,sector_occupant) VALUES($1,'12','padrao',1,'rotativo','Restaurante FC')",[branch.id]);
    for(const [name,registration] of [['Ana Exemplo','0001'],['Bia Fictícia','0002']]){
      const person=(await client.query<{id:string}>('INSERT INTO people(name) VALUES($1) RETURNING id',[name])).rows[0];
      await client.query("INSERT INTO memberships(person_id,branch_id,category,origin,registration,needs_fixed,ti_present) VALUES($1,$2,'colaborador','ti',$3,true,true)",[person.id,branch.id,registration]);
      await client.query("INSERT INTO allocations(branch_id,locker_id,person_id,modality,started_at,started_by) VALUES($1,$2,$3,'fixo',now(),$4)",[branch.id,shared.id,person.id,admin.id]);
    }
    await client.query("INSERT INTO sharings(locker_id,reason,due_at,authorized_by) VALUES($1,'Cobertura temporária',now()+interval '30 days',$2)",[shared.id,admin.id]);
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();await pool.end();}
}
