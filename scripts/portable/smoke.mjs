import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createConnection, createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { parsePortableConfig, portableEnvironment } from './config.mjs';

// Explicit acceptance test: requires a disposable, freshly generated package.
const root = resolve(process.argv[2] ?? 'dist-portable/Lockeris-Portable-Teste');
const configPath = join(root, 'config/.env.portable');
try {
  await access(join(root, 'data'));
  throw new Error('Use um pacote novo e descartável: o teste não aceita uma base existente.');
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const original = await readFile(configPath, 'utf8');
await writeFile(configPath, original.replace(/^PORT=.*$/m, 'PORT=3107').replace(/^PGPORT=.*$/m, 'PGPORT=15433'));
const env = { ...process.env, LOCKERIS_NO_BROWSER: '1', LOCKERIS_NO_PAUSE: '1', DATABASE_URL: 'postgres://invalid/should_never_be_used' };
const require = createRequire(join(root, 'app/apps/api/package.json'));
const { Pool } = require('pg');
const url = 'http://127.0.0.1:3107';

function batch(name, expected = 0) {
  return new Promise((resolve, reject) => {
    const child = spawn('cmd.exe', ['/d', '/c', name], { cwd: root, env, windowsHide: true });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('error', reject);
    child.once('exit', code => {
      if (code === expected) resolve(output);
      else reject(new Error(`${name}: código ${code}, esperado ${expected}. ${output}`));
    });
  });
}
async function waitControllerExit() { await delay(4500); }
async function blockedPort(port) {
  const blocker = createServer();
  await new Promise((resolve, reject) => { blocker.once('error', reject); blocker.listen(port, '127.0.0.1', resolve); });
  try {
    const output = await batch('INICIAR.bat', 1);
    assert.match(output, new RegExp(`Porta ${port} indisponível`));
    await assert.rejects(access(join(root, 'data')));
    assert.equal(blocker.listening, true);
    console.log(`PASS conflito na porta ${port}: nenhuma base criada, outro serviço preservado`);
  } finally {
    await new Promise(resolve => blocker.close(resolve));
    await waitControllerExit();
  }
}
let pool;
let failure;
let stalled;
try {
  await blockedPort(3107);
  await blockedPort(15433);
  await Promise.all([batch('INICIAR.bat'), batch('INICIAR.bat')]);
  const config = parsePortableConfig(await readFile(configPath, 'utf8'));
  pool = new Pool({ connectionString: portableEnvironment(config).DATABASE_URL });
  const initial = (await pool.query('SELECT count(*) AS count FROM users')).rows[0].count;
  assert.equal(initial, '1');
  assert.equal((await readFile(join(root, 'data/PG_VERSION'), 'utf8')).trim(), '17');
  assert.equal((await pool.query('SHOW server_encoding')).rows[0].server_encoding, 'UTF8');
  assert.equal((await pool.query('SHOW listen_addresses')).rows[0].listen_addresses, '127.0.0.1');
  const migrations = Number((await pool.query('SELECT count(*) FROM schema_migrations')).rows[0].count);
  assert.ok(migrations > 0);
  console.log(`PASS primeiro início concorrente: PostgreSQL 17 UTF-8 local, ${migrations} migrações, administrador único`);
  const index = await fetch(url);
  assert.equal(index.status, 200);
  const html = await index.text();
  assert.match(html, /<div id="root">/);
  for (const asset of [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(item => item[1])) {
    const response = await fetch(url + asset);
    assert.equal(response.status, 200);
    await response.arrayBuffer();
  }
  const spa = await fetch(url + '/colaboradores', { headers: { accept: 'text/html' } });
  assert.equal(spa.status, 200);
  assert.equal(spa.headers.get('cache-control'), 'no-store');
  await spa.text();
  assert.equal((await fetch(url + '/api/inexistente', { headers: { accept: 'text/html' } })).status, 404);
  assert.deepEqual(await (await fetch(url + '/api/health')).json(), { ok: true });
  const login = await fetch(url + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: config.username, password: config.bootstrapPassword }) });
  assert.equal(login.status, 200);
  const authenticated = await login.json();
  assert.equal(authenticated.user.mustChangePassword, true);
  const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const changedPassword = `${config.bootstrapPassword}-Changed`;
  const passwordResponse = await fetch(url + '/api/auth/password', { method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie, 'x-csrf-token': authenticated.csrf },
    body: JSON.stringify({ oldPassword: config.bootstrapPassword, newPassword: changedPassword }) });
  assert.equal(passwordResponse.status, 200);
  assert.match(await readFile(join(root, 'Lockeris.url'), 'utf8'), /localhost:3107/);
  console.log('PASS frontend, arquivos estáticos, SPA, API 404, login e troca obrigatória de senha');
  await pool.query('CREATE TABLE portable_smoke_fixture (value text PRIMARY KEY)');
  await pool.query("INSERT INTO portable_smoke_fixture VALUES ('persisted')");
  await pool.end();
  pool = undefined;
  stalled = createConnection(3107, '127.0.0.1');
  await new Promise((resolve, reject) => { stalled.once('connect', resolve); stalled.once('error', reject); });
  // A slow client leaves an incomplete HTTP request open during shutdown.
  stalled.write('GET / HTTP/1.1\r\nHost: localhost\r\n');
  const stopStarted = Date.now();
  await batch('PARAR.bat');
  assert.ok(Date.now() - stopStarted < 30000);
  stalled.destroy();
  await assert.rejects(fetch(url + '/api/health'));
  await batch('PARAR.bat');
  console.log('PASS parada segura com cliente HTTP pendente e parada repetida');
  await batch('INICIAR.bat');
  pool = new Pool({ connectionString: portableEnvironment(config).DATABASE_URL });
  assert.equal((await pool.query('SELECT value FROM portable_smoke_fixture')).rows[0].value, 'persisted');
  assert.equal(Number((await pool.query('SELECT count(*) FROM schema_migrations')).rows[0].count), migrations);
  assert.equal((await pool.query('SELECT count(*) FROM users')).rows[0].count, '1');
  const relogin = await fetch(url + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: config.username, password: changedPassword }) });
  assert.equal(relogin.status, 200);
  assert.equal((await relogin.json()).user.mustChangePassword, false);
  console.log('PASS reinício: registros, nova senha e migrações preservados');
} catch (error) {
  failure = error;
} finally {
  stalled?.destroy();
  await pool?.end();
  try { await batch('PARAR.bat'); } catch (error) {
    if (!failure) failure = error;
    else console.error(`Falha adicional durante a parada do pacote de teste: ${error.message}`);
  }
}
if (failure) throw failure;
