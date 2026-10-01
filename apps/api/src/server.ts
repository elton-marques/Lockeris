import Fastify,{LogController} from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import { ZodError } from 'zod';
import { pool, transaction } from './db.js';
import { authRoutes } from './auth.js';
import { catalogRoutes } from './catalog.js';
import { movementRoutes } from './movements.js';
import { importRoutes } from './imports.js';
import { managementRoutes } from './management.js';
import { migrationRoutes } from './migration.js';
import { notificationRoutes } from './notifications.js';
import { sanitationRoutes } from './sanitation.js';
import { custodyRoutes } from './custody.js';
import { refreshPending } from './pending.js';
import { documentRoute } from './openapi.js';
import { registerPortableWeb } from './portable.js';

export const app=Fastify({logController:new LogController({disableRequestLogging:true}),logger:{redact:['req.headers.cookie','req.headers.authorization','req.headers.x-csrf-token','req.body','res.body']},bodyLimit:11*1024*1024});
await app.register(cookie);
await app.register(rateLimit,{global:false});
await app.register(multipart,{limits:{fileSize:10*1024*1024,files:1,fields:12}});
await app.register(swagger,{openapi:{info:{title:'Gestão de Armários API',version:'1.0.0'},servers:[{url:'/'}],components:{securitySchemes:{cookieAuth:{type:'apiKey',in:'cookie',name:'armarios_session'}}}},transform:documentRoute});
await app.register(swaggerUI,{routePrefix:'/api/docs'});
app.setErrorHandler((error,request,reply)=>{
  const err=error as Error & {statusCode?:number;code?:string};
  const issue=error instanceof ZodError;
  const conflict=['23505','23503','40P01','40001'].includes(err.code??'');
  const status=issue?422:conflict?409:(typeof err.statusCode==='number'?err.statusCode:500);
  const code=issue?'VALIDACAO':conflict?'CONFLITO':status===500?'INTERNO':String(err.code??'ERRO');
  const message=status===500?'Erro interno. Informe o identificador técnico ao suporte.':issue?'Dados inválidos':conflict?'Conflito de dados; revise a operação e tente novamente':err.message;
  if(status===500) request.log.error({code:err.code??'UNEXPECTED',requestId:request.id},'Erro técnico');
  reply.status(status).send({error:{code,message,details:issue?error.issues.map(x=>({path:x.path,message:x.message})):undefined,requestId:request.id}});
});
app.get('/api/health',async()=>{
  try{await pool.query('SELECT 1');return {ok:true,db:true};}
  catch{throw Object.assign(new Error('Banco de dados indisponível'),{statusCode:503});}
});
app.addHook('onResponse',async(request,reply)=>{
  if(request.method==='GET'||request.method==='HEAD')return;
  request.log.info({method:request.method,url:request.url,status:reply.statusCode},'escrita_registrada');
});
export async function runPeriodicCleanup():Promise<{sessions:number;operations:number}>{
  const sessions=await pool.query('DELETE FROM sessions WHERE expires_at<now()');
  const operations=await pool.query("DELETE FROM operations WHERE created_at<now()-interval '30 days'");
  return {sessions:sessions.rowCount??0,operations:operations.rowCount??0};
}
if(process.env.COOKIE_SECURE==='false') app.log.warn('COOKIE_SECURE=false: os cookies da sessão vão sem o flag Secure. Em produção, sirva a aplicação por HTTPS (proxy com TLS) e defina COOKIE_SECURE=true.');
await authRoutes(app);
await catalogRoutes(app);
await movementRoutes(app);
await importRoutes(app);
await migrationRoutes(app);
await managementRoutes(app);
await notificationRoutes(app);
await sanitationRoutes(app);
await custodyRoutes(app);
if(process.env.PORTABLE_MODE==='true') await registerPortableWeb(app);

const timer=setInterval(async()=>{
  try {
    const {rows}=await pool.query<{id:string}>("SELECT id FROM branches WHERE status='active'");
    for(const row of rows) await transaction(client=>refreshPending(client,row.id));
  } catch(error) { app.log.error({err:error},'Falha ao atualizar pendências'); }
},60*60*1000);
timer.unref();
const cleanupTimer=setInterval(()=>{
  runPeriodicCleanup().then(result=>{if(result.sessions||result.operations)app.log.info(result,'limpeza_periodica');})
    .catch(error=>app.log.error({err:error},'Falha na limpeza periódica'));
},24*60*60*1000);
cleanupTimer.unref();
app.addHook('onClose',async()=>{clearInterval(timer);clearInterval(cleanupTimer);await pool.end();});
if(process.env.NODE_ENV!=='test') await app.listen({host:process.env.PORTABLE_MODE==='true'?'127.0.0.1':'0.0.0.0',port:Number(process.env.PORT??3001)});
