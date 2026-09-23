import type {FastifySchema} from 'fastify';
import {z} from 'zod';
import {branchInput,lockerInput,personInput,personUpdateInput,occupyInput,releaseInput,transferInput,operation,id} from '@armarios/contracts';

const withOperation=<T extends z.ZodRawShape>(shape:T)=>z.object({operationId:id,...shape});
const writeBodies:{match:RegExp;schema:z.ZodType;summary:string}[]=[
  {match:/^POST \/api\/auth\/login$/,schema:z.object({username:z.string(),password:z.string()}),summary:'Entrar'},
  {match:/^POST \/api\/auth\/password$/,schema:z.object({oldPassword:z.string(),newPassword:z.string().min(12)}),summary:'Trocar senha'},
  {match:/^POST \/api\/branches$/,schema:branchInput.and(operation),summary:'Criar filial'},
  {match:/^POST \/api\/branches\/:branchId\/people$/,schema:personInput.safeExtend({operationId:id,personId:id.optional()}),summary:'Cadastrar pessoa'},
  {match:/^PATCH \/api\/branches\/:branchId\/people\/:itemId$/,schema:personUpdateInput,summary:'Alterar pessoa'},
  {match:/^POST \/api\/branches\/:branchId\/people\/:itemId\/status$/,schema:withOperation({expectedVersion:z.number().int().positive(),status:z.enum(['ativo','encerrado'])}),summary:'Encerrar ou reativar atuação'},
  {match:/^POST \/api\/branches\/:branchId\/people\/:itemId\/exception$/,schema:withOperation({expectedVersion:z.number().int().positive(),reason:z.string()}),summary:'Justificar exceção de armário'},
  {match:/^POST \/api\/branches\/:branchId\/people\/archive$/,schema:withOperation({all:z.boolean(),membershipIds:z.array(id)}),summary:'Remover colaboradores da base ativa'},
  {match:/^POST \/api\/branches\/:branchId\/lockers$/,schema:lockerInput.and(operation),summary:'Criar armário'},
  {match:/^PATCH \/api\/branches\/:branchId\/lockers\/:itemId$/,schema:lockerInput.partial().and(operation).and(z.object({expectedVersion:z.number().int().positive()})),summary:'Alterar armário'},
  {match:/^POST \/api\/branches\/:branchId\/allocations\/occupy$/,schema:occupyInput,summary:'Registrar ocupação'},
  {match:/^POST \/api\/branches\/:branchId\/allocations\/release$/,schema:releaseInput,summary:'Registrar saída'},
  {match:/^POST \/api\/branches\/:branchId\/allocations\/transfer$/,schema:transferInput,summary:'Transferir ocupação'},
  {match:/^POST \/api\/branches\/:branchId\/allocations\/:itemId\/due$/,schema:withOperation({expectedVersion:z.number().int().positive(),dueAt:z.iso.datetime(),reason:z.string()}),summary:'Prorrogar previsão sazonal'},
  {match:/^POST \/api\/branches\/:branchId\/allocations\/:itemId\/effective$/,schema:withOperation({expectedVersion:z.number().int().positive(),reason:z.string()}),summary:'Efetivar alocação sazonal'},
  {match:/^POST \/api\/branches\/:branchId\/sharings\/:itemId\/renew$/,schema:withOperation({expectedVersion:z.number().int().positive(),dueAt:z.iso.datetime(),reason:z.string()}),summary:'Renovar compartilhamento'},
  {match:/^POST \/api\/branches\/:branchId\/pending\/:itemId\/resolve$/,schema:withOperation({expectedVersion:z.number().int().positive(),resolution:z.string()}),summary:'Resolver pendência'},
  {match:/^POST \/api\/branches\/:branchId\/imports\/:importId\/confirm$/,schema:withOperation({acknowledgeComplete:z.literal(true),sameDateCorrection:z.boolean().optional(),resolutions:z.record(z.string(),z.string()).optional()}),summary:'Confirmar base de colaboradores'},
  {match:/^POST \/api\/branches\/:branchId\/imports\/migration\/:importId\/confirm$/,schema:withOperation({acknowledgeReviewed:z.literal(true)}),summary:'Confirmar carga inicial de armários'},
  {match:/^POST \/api\/branches\/:branchId\/users$/,schema:withOperation({username:z.string(),role:z.enum(['filial_admin','operador','consulta']),temporaryPassword:z.string()}),summary:'Criar usuário'},
  {match:/^POST \/api\/branches\/:branchId\/users\/:itemId\/reset$/,schema:withOperation({expectedVersion:z.number().int().positive(),temporaryPassword:z.string()}),summary:'Redefinir senha temporária'},
  {match:/^POST \/api\/branches\/:branchId\/devices$/,schema:withOperation({label:z.string()}),summary:'Autorizar navegador offline'},
  {match:/^POST \/api\/branches\/:branchId\/devices\/:itemId\/revoke$/,schema:withOperation({expectedVersion:z.number().int().positive()}),summary:'Revogar navegador offline'}
];
export function documentRoute({schema,url,route}:{schema:FastifySchema;url:string;route:{method:string|string[]}}):{schema:FastifySchema;url:string}{
  const method=(Array.isArray(route.method)?route.method[0]:route.method).toUpperCase();
  const match=writeBodies.find(x=>x.match.test(`${method} ${url}`));
  const domain=url.includes('/auth/')?'Acesso':url.includes('/imports/')?'Importações':url.includes('/allocations/')||url.includes('/sharings/')?'Movimentações':url.includes('/pending/')?'Pendências':url.includes('/people')?'Pessoas':url.includes('/lockers')?'Armários':'Administração';
  const result:FastifySchema={...schema,tags:[domain],summary:match?.summary??`${method} ${url}`};
  if(match)result.body=z.toJSONSchema(match.schema) as FastifySchema['body'];
  return {schema:result,url};
}
