export type User={id:string;role:'geral'|'filial_admin'|'operador'|'consulta';branchId:string|null;mustChangePassword:boolean};
export const op=()=>crypto.randomUUID();
export function csrf():string {return document.cookie.split('; ').find(x=>x.startsWith('armarios_csrf='))?.split('=')[1]??'';}
export async function api<T>(path:string,init:RequestInit={}):Promise<T> {
  const headers=new Headers(init.headers);
  if(init.body&&!(init.body instanceof FormData)) headers.set('content-type','application/json');
  if(init.method&&init.method!=='GET') headers.set('x-csrf-token',csrf());
  const response=await fetch(`/api${path}`,{...init,headers,credentials:'include'});
  const result=await response.json().catch(()=>({}));
  if(!response.ok) throw Object.assign(new Error(result.error?.message??'Falha na solicitação'),{status:response.status,code:result.error?.code,details:result.error?.details});
  return result as T;
}
export const post=<T>(path:string,value:unknown)=>api<T>(path,{method:'POST',body:JSON.stringify(value)});
export const patch=<T>(path:string,value:unknown)=>api<T>(path,{method:'PATCH',body:JSON.stringify(value)});
