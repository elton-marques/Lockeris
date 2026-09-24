export type User={id:string;role:'geral'|'filial_admin'|'operador'|'consulta';branchId:string|null;mustChangePassword:boolean};
export const op=()=>crypto.randomUUID();
export function csrf():string {return document.cookie.split('; ').find(x=>x.startsWith('armarios_csrf='))?.split('=')[1]??'';}
type ApiErrorBody={error?:{code?:string;message?:string;details?:unknown}};
export function readableError(status:number,body:ApiErrorBody):string{
  if(status>=500)return 'O serviço está indisponível no momento. Confira os dados antes de tentar novamente. Se continuar, procure o suporte.';
  if(status===429)return 'Muitas tentativas em pouco tempo. Aguarde um momento e tente novamente.';
  if(status===403&&body.error?.code==='PERMISSAO')return 'Seu perfil não permite esta ação. Procure a administração da filial se precisar de acesso.';
  if(status===403&&body.error?.code==='FILIAL')return 'Você não tem acesso a esta filial. Selecione uma filial autorizada.';
  if(status===409&&body.error?.code==='VERSAO')return 'Este registro mudou desde que você o abriu. Atualize os dados e confira antes de salvar.';
  if(status===409&&body.error?.code==='PREVIA_DESATUALIZADA')return 'A base mudou depois da prévia. Compare a planilha novamente antes de confirmar.';
  if(status===422&&body.error?.code==='VALIDACAO')return 'Confira os campos informados e tente novamente.';
  return body.error?.message?.trim()||'Não foi possível concluir a solicitação. Confira os dados e tente novamente.';
}
export async function api<T>(path:string,init:RequestInit={}):Promise<T> {
  const headers=new Headers(init.headers);
  if(init.body&&!(init.body instanceof FormData)) headers.set('content-type','application/json');
  if(init.method&&init.method!=='GET') headers.set('x-csrf-token',csrf());
  let response:Response;
  try{response=await fetch(`/api${path}`,{...init,headers,credentials:'include'});}
  catch{throw new Error(init.method&&init.method!=='GET'
    ?'Não foi possível confirmar o resultado. Consulte os dados antes de repetir a ação.'
    :'Sem conexão com o serviço. Verifique a rede e tente novamente.');}
  const result=await response.json().catch(()=>({})) as ApiErrorBody;
  if(!response.ok) throw Object.assign(new Error(readableError(response.status,result)),{status:response.status,code:result.error?.code});
  return result as T;
}
export const post=<T>(path:string,value:unknown)=>api<T>(path,{method:'POST',body:JSON.stringify(value)});
export const patch=<T>(path:string,value:unknown)=>api<T>(path,{method:'PATCH',body:JSON.stringify(value)});
