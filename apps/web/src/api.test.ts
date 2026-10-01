// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {api,post,readableError,setUnauthorizedHandler} from './api';

const jsonResponse=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});

afterEach(()=>{setUnauthorizedHandler(null);vi.unstubAllGlobals();});

describe('mensagens legíveis de erro',()=>{
  it('traduz 401 sem mensagem como sessão expirada e preserva mensagens da API',()=>{
    expect(readableError(401,{})).toBe('Sua sessão expirou. Faça login novamente.');
    expect(readableError(401,{error:{code:'CREDENCIAIS',message:'Credenciais inválidas'}})).toBe('Credenciais inválidas');
    expect(readableError(403,{error:{code:'PERMISSAO'}})).toContain('perfil não permite');
    expect(readableError(429,{})).toContain('Muitas tentativas');
    expect(readableError(500,{})).toContain('indisponível');
  });
});

describe('interceptador de sessão expirada',()=>{
  it('chama o handler em 401 fora do login e da validação de sessão',async()=>{
    const handler=vi.fn();setUnauthorizedHandler(handler);
    vi.stubGlobal('fetch',vi.fn(async()=>jsonResponse(401,{error:{code:'AUTENTICACAO',message:'Sessão expirada'}})));
    await expect(api('/branches')).rejects.toThrow('Sessão expirada');
    expect(handler).toHaveBeenCalledTimes(1);
    await expect(post('/branches',{operationId:'x'})).rejects.toThrow();
    expect(handler).toHaveBeenCalledTimes(2);
  });
  it('não chama o handler no próprio login nem na validação de sessão do boot',async()=>{
    const handler=vi.fn();setUnauthorizedHandler(handler);
    vi.stubGlobal('fetch',vi.fn(async()=>jsonResponse(401,{error:{code:'CREDENCIAIS',message:'Credenciais inválidas'}})));
    await expect(post('/auth/login',{username:'a',password:'b'})).rejects.toThrow('Credenciais inválidas');
    vi.stubGlobal('fetch',vi.fn(async()=>jsonResponse(401,{error:{code:'AUTENTICACAO',message:'Faça login'}})));
    await expect(api('/auth/me')).rejects.toThrow('Faça login');
    expect(handler).not.toHaveBeenCalled();
  });
  it('não chama o handler quando a resposta é de sucesso ou outro erro',async()=>{
    const handler=vi.fn();setUnauthorizedHandler(handler);
    vi.stubGlobal('fetch',vi.fn(async()=>jsonResponse(200,{user:{}})));
    await expect(api('/auth/me')).resolves.toEqual({user:{}});
    vi.stubGlobal('fetch',vi.fn(async()=>jsonResponse(403,{error:{code:'PERMISSAO',message:'Sem permissão'}})));
    await expect(api('/branches')).rejects.toThrow('perfil não permite');
    expect(handler).not.toHaveBeenCalled();
  });
});
