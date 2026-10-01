// @vitest-environment jsdom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {useConnectionStatus} from './Header';

afterEach(()=>{cleanup();vi.unstubAllGlobals();});

describe('indicador de conexão',()=>{
  it('começa online no navegador conectado e cai para offline no evento',()=>{
    const {result}=renderHook(()=>useConnectionStatus());
    expect(result.current).toBe('online');
    act(()=>{window.dispatchEvent(new Event('offline'));});
    expect(result.current).toBe('offline');
  });
  it('mostra reconectando e confirma pela resposta do serviço',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({ok:true}),{status:200})));
    const {result}=renderHook(()=>useConnectionStatus());
    act(()=>{window.dispatchEvent(new Event('offline'));});
    expect(result.current).toBe('offline');
    await act(async()=>{window.dispatchEvent(new Event('online'));});
    expect(result.current).toBe('online');
    expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/health',{credentials:'include'});
  });
  it('volta para offline quando a verificação de retorno falha',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('rede caiu');}));
    const {result}=renderHook(()=>useConnectionStatus());
    await act(async()=>{window.dispatchEvent(new Event('online'));});
    expect(result.current).toBe('offline');
  });
});
