import argon2 from 'argon2';
import {pool} from '../db.js';

const username=process.env.RESET_USERNAME?.trim();
const password=process.env.RESET_PASSWORD;
if(!username||!password||password.length<12)throw new Error('Defina RESET_USERNAME e RESET_PASSWORD com 12 ou mais caracteres');

const client=await pool.connect();
try{
  await client.query('BEGIN');
  const updated=await client.query<{id:string}>(`UPDATE users SET password_hash=$1,must_change_password=true
    WHERE lower(username)=lower($2) AND active=true RETURNING id`,[await argon2.hash(password,{type:argon2.argon2id}),username]);
  if(updated.rowCount!==1)throw new Error('Usuário ativo não encontrado');
  await client.query('DELETE FROM sessions WHERE user_id=$1',[updated.rows[0].id]);
  await client.query('COMMIT');
  process.stdout.write('Senha redefinida. O usuário deverá trocá-la no próximo acesso.\n');
}catch(error){await client.query('ROLLBACK');throw error;}
finally{client.release();await pool.end();}
