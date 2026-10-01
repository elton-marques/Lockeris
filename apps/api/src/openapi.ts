import type {FastifySchema} from 'fastify';
import {z} from 'zod';
import {branchInput,lockerInput,personInput,personUpdateInput,occupyInput,releaseInput,transferInput,operation,id,retainedItemInput} from '@armarios/contracts';

const withOperation=<T extends z.ZodRawShape>(shape:T)=>z.object({operationId:id,...shape});
const reviseInput=withOperation({
  expectedVersion:z.number().int().positive().optional(),
  expectedLockerVersion:z.number().int().positive(),
  isDouble:z.boolean(),sectorOccupant:z.string().nullable(),
  condition:z.enum(['disponivel','manutencao','bloqueado']).optional(),
  keyCopyAvailable:z.boolean().optional(),
  finalize:z.boolean().optional(),
  occupant:z.object({allocationId:id.optional(),membershipId:id.optional(),expectedMembershipVersion:z.number().int().positive().optional(),
    name:z.string().optional(),registration:z.string().nullable().optional(),department:z.string().nullable().optional(),functionName:z.string().nullable().optional()}).nullable().optional()
});
const writeBodies:{match:RegExp;schema:z.ZodType;summary:string}[]=[
  {match:/^POST \/api\/auth\/login$/,schema:z.object({username:z.string(),password:z.string()}),summary:'Entrar'},
  {match:/^POST \/api\/auth\/logout$/,schema:z.object({}),summary:'Encerrar sessão'},
  {match:/^POST \/api\/auth\/password$/,schema:z.object({oldPassword:z.string(),newPassword:z.string().min(12)}),summary:'Trocar senha'},
  {match:/^POST \/api\/auth\/change-password$/,schema:z.object({currentPassword:z.string(),newPassword:z.string().min(12)}),summary:'Alterar a própria senha'},
  {match:/^POST \/api\/branches$/,schema:branchInput.and(operation),summary:'Criar filial'},
  {match:/^DELETE \/api\/branches\/:branchId$/,schema:withOperation({expectedVersion:z.number().int().positive()}),summary:'Excluir filial em cascata'},
  {match:/^DELETE \/api\/branches\/:branchId\/history\/clear$/,schema:withOperation({}),summary:'Limpar histórico legado'},
  {match:/^POST \/api\/branches\/:branchId\/people$/,schema:personInput.safeExtend({operationId:id,personId:id.optional()}),summary:'Cadastrar pessoa'},
  {match:/^PATCH \/api\/branches\/:branchId\/people\/:itemId$/,schema:personUpdateInput,summary:'Alterar pessoa'},
  {match:/^POST \/api\/branches\/:branchId\/people\/:itemId\/status$/,schema:withOperation({expectedVersion:z.number().int().positive(),status:z.enum(['ativo','encerrado'])}),summary:'Excluir ou reativar cadastro'},
  {match:/^POST \/api\/branches\/:branchId\/people\/:itemId\/exception$/,schema:withOperation({expectedVersion:z.number().int().positive(),reason:z.string()}),summary:'Justificar exceção de armário'},
  {match:/^POST \/api\/branches\/:branchId\/people\/archive$/,schema:withOperation({all:z.boolean(),membershipIds:z.array(id)}),summary:'Excluir colaboradores da base ativa'},
  {match:/^POST \/api\/people\/bulk-purge$/,schema:withOperation({branchId:id,membershipIds:z.array(id)}),summary:'Excluir cadastros obsoletos em lote'},
  {match:/^POST \/api\/branches\/:branchId\/lockers$/,schema:lockerInput.and(operation),summary:'Criar armário'},
  {match:/^PATCH \/api\/branches\/:branchId\/lockers\/:itemId$/,schema:lockerInput.omit({number:true}).partial().and(operation).and(z.object({expectedVersion:z.number().int().positive()})),summary:'Alterar armário'},
  {match:/^POST \/api\/branches\/:branchId\/allocations\/occupy$/,schema:occupyInput,summary:'Registrar ocupação'},
  {match:/^POST \/api\/branches\/:branchId\/allocations\/release$/,schema:releaseInput,summary:'Desocupar armário'},
  {match:/^POST \/api\/branches\/:branchId\/allocations\/transfer$/,schema:transferInput,summary:'Transferir ocupação'},
  {match:/^POST \/api\/branches\/:branchId\/allocations\/:itemId\/due$/,schema:withOperation({expectedVersion:z.number().int().positive(),dueAt:z.iso.datetime(),reason:z.string()}),summary:'Prorrogar previsão sazonal'},
  {match:/^POST \/api\/branches\/:branchId\/allocations\/:itemId\/effective$/,schema:withOperation({expectedVersion:z.number().int().positive(),reason:z.string()}),summary:'Efetivar alocação sazonal'},
  {match:/^POST \/api\/branches\/:branchId\/sharings\/:itemId\/renew$/,schema:withOperation({expectedVersion:z.number().int().positive(),dueAt:z.iso.datetime(),reason:z.string()}),summary:'Renovar compartilhamento'},
  {match:/^POST \/api\/branches\/:branchId\/pending\/:itemId\/resolve$/,schema:withOperation({expectedVersion:z.number().int().positive(),resolution:z.string()}),summary:'Resolver pendência'},
  {match:/^POST \/api\/branches\/:branchId\/pending\/bulk-resolve$/,schema:withOperation({items:z.array(z.object({id,expectedVersion:z.number().int().positive()})),resolution:z.string()}),summary:'Resolver pendências em lote'},
  {match:/^POST \/api\/branches\/:branchId\/imports\/:importId\/confirm$/,schema:withOperation({acknowledgeComplete:z.literal(true),sameDateCorrection:z.boolean().optional(),resolutions:z.record(z.string(),z.string()).optional()}),summary:'Confirmar base de colaboradores'},
  {match:/^POST \/api\/branches\/:branchId\/imports\/migration\/:importId\/confirm$/,schema:withOperation({acknowledgeReviewed:z.literal(true)}),summary:'Confirmar carga inicial de armários'},
  {match:/^POST \/api\/branches\/:branchId\/users$/,schema:withOperation({username:z.string(),role:z.enum(['filial_admin','operador','consulta']),temporaryPassword:z.string()}),summary:'Criar usuário'},
  {match:/^PATCH \/api\/branches\/:branchId\/users\/:itemId$/,schema:withOperation({expectedVersion:z.number().int().positive(),role:z.enum(['filial_admin','operador','consulta']).optional(),active:z.boolean().optional()}),summary:'Alterar acesso'},
  {match:/^POST \/api\/branches\/:branchId\/users\/:itemId\/reset$/,schema:withOperation({expectedVersion:z.number().int().positive(),temporaryPassword:z.string()}),summary:'Redefinir senha temporária'},
  {match:/^DELETE \/api\/users\/:userId$/,schema:withOperation({expectedVersion:z.number().int().positive().optional()}),summary:'Excluir usuário'},
  {match:/^POST \/api\/branches\/:branchId\/lockers\/:itemId\/key-copy$/,schema:withOperation({expectedVersion:z.number().int().positive(),available:z.boolean()}),summary:'Atualizar cópia da chave'},
  {match:/^POST \/api\/branches\/:branchId\/pending\/:itemId\/revise$/,schema:reviseInput,summary:'Conferir pendência de armário'},
  {match:/^POST \/api\/branches\/:branchId\/lockers\/:itemId\/revise$/,schema:reviseInput,summary:'Conferir armário na carga inicial'},
  {match:/^POST \/api\/retained-items$/,schema:retainedItemInput.and(z.object({branchId:id,lockerId:id.nullish(),personId:id.nullish()})),summary:'Registrar item achado'},
  {match:/^PATCH \/api\/retained-items\/:id\/status$/,schema:z.object({status:z.enum(['devolvido','destinado']),notes:z.string().max(2000).nullish()}),summary:'Dar baixa de item achado'},
  {match:/^POST \/api\/branches\/:branchId\/audits$/,schema:z.object({auditorId:id}),summary:'Iniciar auditoria'},
  {match:/^DELETE \/api\/audits\/:id$/,schema:z.object({}),summary:'Excluir auditoria'},
  {match:/^POST \/api\/audits\/:id\/records$/,schema:z.object({lockerId:id,issueType:z.enum(['cadeado_fora_padrao','sem_cadeado','itens_fora_armario','mecanismo_avariado','outro']),notes:z.string().max(2000).nullish()}),summary:'Registrar irregularidade'},
  {match:/^PATCH \/api\/audits\/:id\/complete$/,schema:z.object({summaryNotes:z.string().max(2000).nullish()}),summary:'Concluir auditoria'},
];
export function documentRoute({schema,url,route}:{schema:FastifySchema;url:string;route:{method:string|string[]}}):{schema:FastifySchema;url:string}{
  const method=(Array.isArray(route.method)?route.method[0]:route.method).toUpperCase();
  const match=writeBodies.find(x=>x.match.test(`${method} ${url}`));
  const domain=url.includes('/auth/')?'Acesso':url.includes('/imports/')?'Importações':url.includes('/allocations/')||url.includes('/sharings/')?'Movimentações':url.includes('/pending/')?'Pendências':url.includes('/people')?'Pessoas':url.includes('/lockers')?'Armários':'Administração';
  const result:FastifySchema={...schema,tags:[domain],summary:match?.summary??`${method} ${url}`};
  if(match)result.body=z.toJSONSchema(match.schema) as FastifySchema['body'];
  return {schema:result,url};
}
