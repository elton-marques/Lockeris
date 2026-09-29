import { describe, expect, it } from 'vitest';
import { parsePortableConfig, portableEnvironment } from './config.mjs';

describe('configuração local do pacote', () => {
  it('fixa rede local e modo portátil mesmo com URLs externas no arquivo', () => {
    const config = parsePortableConfig('PORT=3107\nPGPORT=15432\nPGDATABASE=lockeris\nPGPASSWORD="senha:@com/espacos 123"\nDATABASE_URL=postgres://externo/producao\nPORTABLE_MODE=false\nCOOKIE_SECURE=true');
    const env = portableEnvironment(config);
    expect(env.DATABASE_URL).toBe('postgres://postgres:senha%3A%40com%2Fespacos%20123@127.0.0.1:15432/lockeris');
    expect(env.PORTABLE_MODE).toBe('true');
    expect(env.COOKIE_SECURE).toBe('false');
    expect(env.PORT).toBe('3107');
  });
  it.each(['PORT=0', 'PORT=abc', 'PORT=65536', 'PORT=3001\nPGPORT=3001',
    'PGDATABASE=postgres', 'PGDATABASE=lockeris; DROP DATABASE postgres', 'PGUSER=outro',
    'PGPASSWORD=curta', 'BOOTSTRAP_USERNAME=admin espaço', 'BOOTSTRAP_PASSWORD=curta'])('recusa configuração inválida: %s', content => {
    expect(() => parsePortableConfig(content)).toThrow();
  });
});
