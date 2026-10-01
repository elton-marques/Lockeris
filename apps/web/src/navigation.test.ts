import {describe,expect,it} from 'vitest';
import {adminOnlyTabs,resolveHashPage,tabKeys,tabs} from './navigation';

describe('resolução de rotas por hash',()=>{
  it('mapeia cada aba para uma rota #/chave válida e única',()=>{
    const keys=tabs.map(item=>`#/${item.key}`);
    expect(new Set(keys).size).toBe(tabs.length);
    for(const item of tabs)expect(resolveHashPage(`#/${item.key}`,'geral')).toEqual({kind:'page',page:item.key});
  });
  it('ignora hashes que não são rotas (skip-link, âncoras e hash vazio)',()=>{
    expect(resolveHashPage('','operador').kind).toBe('none');
    expect(resolveHashPage('#main-content','operador').kind).toBe('none');
    expect(resolveHashPage('#secao','operador').kind).toBe('none');
  });
  it('marca rotas desconhecidas como não encontradas',()=>{
    expect(resolveHashPage('#/nao-existe','operador')).toEqual({kind:'notfound',path:'nao-existe'});
  });
  it('encaminha abas administrativas de não administradores para o painel',()=>{
    for(const key of adminOnlyTabs)expect(resolveHashPage(`#/${key}`,'operador')).toEqual({kind:'page',page:'painel'});
    expect(resolveHashPage('#/administracao','geral')).toEqual({kind:'page',page:'administracao'});
    expect(resolveHashPage('#/administracao','filial_admin')).toEqual({kind:'page',page:'administracao'});
  });
  it('aceita parâmetros e barra final na rota',()=>{
    expect(resolveHashPage('#/pessoas?sem-armario=1','operador')).toEqual({kind:'page',page:'pessoas'});
    expect(resolveHashPage('#/pendencias/','operador')).toEqual({kind:'page',page:'pendencias'});
  });
  it('declara todas as chaves esperadas do menu',()=>{
    expect([...tabKeys].sort()).toEqual(['achados','administracao','auditorias','historico','importacao','movimentacoes','painel','pendencias','pessoas','resumo']);
  });
});
