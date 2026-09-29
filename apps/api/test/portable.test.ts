import { afterEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { registerPortableWeb } from '../src/portable.js';

let app: FastifyInstance | undefined;
let directory: string | undefined;
afterEach(async () => {
  await app?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe('frontend portátil', () => {
  it('serve site e SPA junto do Swagger sem converter erros da API ou arquivos ausentes em HTML', async () => {
    directory = await mkdtemp(join(tmpdir(), 'lockeris-web-'));
    await writeFile(join(directory, 'index.html'), '<!doctype html><title>Lockeris</title>');
    await writeFile(join(directory, 'app.js'), 'console.log("Lockeris");');
    app = Fastify();
    await app.register(swagger, { openapi: { info: { title: 'Teste', version: '1' } } });
    await app.register(swaggerUI, { routePrefix: '/api/docs' });
    app.get('/api/health', async () => ({ ok: true }));
    await registerPortableWeb(app, directory);
    expect((await app.inject('/')).body).toContain('<title>Lockeris</title>');
    for (const method of ['GET', 'HEAD'] as const) {
      const response = await app.inject({ method, url: '/colaboradores/consulta?filial=1', headers: { accept: 'text/html' } });
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
    }
    expect((await app.inject('/app.js')).headers['content-type']).toContain('javascript');
    expect((await app.inject('/api/health')).json()).toEqual({ ok: true });
    expect((await app.inject('/api/docs/')).statusCode).toBe(200);
    for (const url of ['/api', '/api/inexistente', '/arquivo.js', '/assets/inexistente.css']) {
      const response = await app.inject({ url, headers: { accept: 'text/html' } });
      expect(response.statusCode).toBe(404);
      expect(response.headers['content-type']).toContain('application/json');
    }
    expect((await app.inject({ method: 'POST', url: '/colaboradores', headers: { accept: 'text/html' } })).statusCode).toBe(404);
    expect((await app.inject({ url: '/colaboradores', headers: { accept: 'application/json' } })).statusCode).toBe(404);
  });
});
