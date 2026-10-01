import { spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { closeSync, openSync } from 'node:fs';
import { access, mkdir, readdir, readFile, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createConnection, createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parsePortableConfig, portableEnvironment } from './portable-config.mjs';

const appDirectory = dirname(fileURLToPath(import.meta.url));
const root = await realpath(join(appDirectory, '..'));
const data = join(root, 'data');
const configPath = join(root, 'config/.env.portable');
const pgBin = join(root, 'postgres/bin');
const pipe = `\\\\.\\pipe\\lockeris-${createHash('sha256').update(root.toLowerCase()).digest('hex').slice(0, 24)}`;
const require = createRequire(join(appDirectory, 'apps/api/package.json'));

async function exists(path) {
  try { await access(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
function run(executable, args, allowed = [0]) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: root, env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('error', reject);
    child.once('exit', code => {
      if (allowed.includes(code)) resolve({ code, output });
      else {
        process.stderr.write(output);
        reject(new Error(`${executable.endsWith('node.exe') ? 'Etapa da aplicação' : executable.split(/[\\/]/).at(-1)} falhou (${code}). Consulte api.log e postgres.log.`));
      }
    });
  });
}
function control(command = 'status') {
  return new Promise((resolve, reject) => {
    const socket = createConnection(pipe);
    let result = '';
    socket.setTimeout(command === 'stop' ? 90000 : 15000);
    socket.once('connect', () => socket.write(`${command}\n`));
    socket.on('data', chunk => { result += chunk; });
    socket.once('end', () => {
      try { resolve(JSON.parse(result)); } catch { reject(new Error('Resposta inválida do controlador local.')); }
    });
    socket.once('timeout', () => socket.destroy(Object.assign(new Error('O controlador não respondeu. Consulte api.log.'), { code: 'ETIMEDOUT' })));
    socket.once('error', reject);
  });
}
async function status() {
  try { return await control(); } catch (error) {
    if (['ENOENT', 'ECONNREFUSED'].includes(error.code)) return null;
    throw error;
  }
}
async function assertFree(port) {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); })
    .catch(() => { throw new Error(`Porta ${port} indisponível (ocupada ou reservada pelo Windows). Ajuste config/.env.portable e tente novamente.`); });
  await new Promise(resolve => server.close(resolve));
}
async function pgRunning() {
  if (!await exists(join(data, 'PG_VERSION'))) return false;
  const version = (await readFile(join(data, 'PG_VERSION'), 'utf8')).trim();
  if (version !== '17') throw new Error('O diretório data pertence a outra versão do PostgreSQL. Preserve a base e consulte o guia.');
  return (await run(join(pgBin, 'pg_ctl.exe'), ['status', '-D', data], [0, 3])).code === 0;
}
async function stopPostgres() {
  if (await pgRunning()) await run(join(pgBin, 'pg_ctl.exe'), ['stop', '-D', data, '-m', 'fast', '-w', '-t', '60']);
}
const backupDirectory = join(root, 'backups');
const backupRetentionMs = 30 * 86400000;
async function runBackup(config) {
  await mkdir(backupDirectory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const target = join(backupDirectory, `lockeris-${stamp}.dump`);
  const environment = { ...process.env, PGPASSWORD: config.password };
  await new Promise((resolve, reject) => {
    const child = spawn(join(pgBin, 'pg_dump.exe'),
      ['-Fc', '-h', '127.0.0.1', '-p', String(config.pgPort), '-U', 'postgres', '-d', config.database, '-f', target],
      { cwd: root, env: environment, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let diagnostics = '';
    child.stderr.on('data', chunk => { diagnostics += chunk; });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`pg_dump falhou (${code}). ${diagnostics.trim()}`)));
  });
  for (const entry of await readdir(backupDirectory)) {
    if (!entry.endsWith('.dump')) continue;
    const full = join(backupDirectory, entry);
    if (Date.now() - (await stat(full)).mtimeMs > backupRetentionMs) await unlink(full);
  }
  return target;
}
async function initialize(config) {
  if (await exists(join(data, 'PG_VERSION'))) return;
  if (await exists(data)) throw new Error('A pasta data existe sem PG_VERSION. Preserve seu conteúdo antes de tentar novamente.');
  const temporary = join(root, `.data-init-${randomUUID()}`);
  const passwordFile = join(root, 'config', `.pg-password-${randomUUID()}`);
  await writeFile(passwordFile, config.password, { mode: 0o600 });
  try {
    await run(join(pgBin, 'initdb.exe'), ['-D', temporary, '-U', 'postgres', '--encoding=UTF8', '--locale=C',
      '--auth=scram-sha-256', `--pwfile=${passwordFile}`]);
    await rename(temporary, data);
  } finally { await unlink(passwordFile); }
}
async function loadConfig() {
  const text = await readFile(configPath, 'utf8');
  const config = parsePortableConfig(text);
  if (!config.password || !config.bootstrapPassword) {
    if (!config.password && await exists(join(data, 'PG_VERSION'))) throw new Error('Restaure PGPASSWORD de config/.env.portable; a base existente foi preservada.');
    let additions = '\n# Geradas automaticamente para esta instalação.\n';
    if (!config.password) { config.password = randomBytes(24).toString('hex'); additions += `PGPASSWORD=${config.password}\n`; }
    if (!config.bootstrapPassword) { config.bootstrapPassword = randomBytes(18).toString('hex'); additions += `BOOTSTRAP_PASSWORD=${config.bootstrapPassword}\n`; }
    const temporary = `${configPath}.new`;
    await writeFile(temporary, text + additions, { mode: 0o600 });
    await rename(temporary, configPath);
  }
  Object.assign(process.env, portableEnvironment(config));
  return config;
}
async function serve() {
  let state = { state: 'starting', port: null };
  let api;
  let config;
  let ownsPostgres = false;
  let shuttingDown = false;
  let backupTimer;
  const scheduleBackup = () => {
    runBackup(config).then(target => console.log(`Backup automático criado: ${target}`))
      .catch(error => console.error(`Backup automático falhou: ${error.message}`));
  };
  const shutdown = async () => {
    if (shuttingDown) throw new Error('Encerramento em andamento. Aguarde.');
    shuttingDown = true;
    state = { ...state, state: 'stopping' };
    if (backupTimer) clearInterval(backupTimer);
    if (api) {
      // Let requests finish, then release stalled HTTP connections; database hooks still drain normally.
      const watchdog = setTimeout(() => api.server.closeAllConnections(), 10000);
      watchdog.unref();
      try { await api.close(); } finally { clearTimeout(watchdog); }
    }
    if (ownsPostgres && config && await pgRunning()) {
      try { console.log(`Backup de encerramento criado: ${await runBackup(config)}`); }
      catch (error) { console.error(`Backup de encerramento falhou: ${error.message}`); }
    }
    if (ownsPostgres) await stopPostgres();
  };
  const server = createServer(socket => {
    socket.setTimeout(15000, () => socket.destroy());
    socket.once('error', () => {});
    socket.once('data', async chunk => {
      const command = chunk.toString().trim();
      if (command !== 'stop') { socket.end(JSON.stringify(state)); return; }
      if (state.state === 'starting') { socket.end(JSON.stringify({ error: 'Inicialização em andamento. Aguarde e tente PARAR novamente.' })); return; }
      try {
        socket.setTimeout(90000);
        await shutdown();
        socket.end(JSON.stringify({ state: 'stopped' }));
        server.close(() => process.exit(0));
      } catch (error) {
        shuttingDown = false;
        socket.end(JSON.stringify({ error: error.message }));
      }
    });
  });
  // The named pipe is the instance lock and identifies this package, without PID reuse or taskkill.
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(pipe, resolve); });
  } catch (error) { if (error.code === 'EADDRINUSE') return; throw error; }
  try {
    config = await loadConfig();
    state.port = config.port;
    await assertFree(config.port);
    const running = await pgRunning();
    if (running) {
      const lines = (await readFile(join(data, 'postmaster.pid'), 'utf8')).split(/\r?\n/);
      if (Number(lines[3]) !== config.pgPort) throw new Error('A base local está ativa em outra porta. Execute PARAR antes de alterar PGPORT.');
    } else {
      await assertFree(config.pgPort);
      await initialize(config);
    }
    ownsPostgres = true;
    if (!running) await run(join(pgBin, 'pg_ctl.exe'), ['start', '-D', data, '-l', join(root, 'postgres.log'),
      '-o', `-h 127.0.0.1 -p ${config.pgPort}`, '-w', '-t', '60']);
    const { Pool } = require('pg');
    const admin = new Pool({ connectionString: `postgres://postgres:${encodeURIComponent(config.password)}@127.0.0.1:${config.pgPort}/postgres`, connectionTimeoutMillis: 5000 });
    try {
      if (!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [config.database])).rowCount) {
        await admin.query(`CREATE DATABASE "${config.database}" ENCODING 'UTF8'`);
      }
    } finally { await admin.end(); }
    for (const cli of ['migrate', 'portable-bootstrap']) {
      const result = await run(process.execPath, [join(appDirectory, `apps/api/dist/cli/${cli}.js`)]);
      process.stdout.write(result.output);
    }
    ({ app: api } = await import(pathToFileURL(join(appDirectory, 'apps/api/dist/server.js')).href));
    await writeFile(join(root, 'Lockeris.url'), `[InternetShortcut]\r\nURL=http://localhost:${config.port}\r\n`);
    state = { state: 'ready', port: config.port };
    const firstBackup = setTimeout(scheduleBackup, 60000);firstBackup.unref();
    backupTimer = setInterval(scheduleBackup, 24 * 60 * 60 * 1000);backupTimer.unref();
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
      shutdown().then(() => server.close(() => process.exit(0))).catch(() => { process.exitCode = 1; });
    });
  } catch (error) {
    state = { ...state, state: 'failed', error: error.message };
    console.error(error.message);
    try { await shutdown(); } catch (stopError) { console.error(stopError.message); }
    state = { ...state, state: 'failed' };
    // Give the launching batch time to receive the failure before releasing the pipe.
    await delay(4000);
    server.close(() => process.exit(1));
  }
}
async function start() {
  let current = await status();
  if (!current) {
    // Validate syntax before spawning; no environment from the developer is required.
    parsePortableConfig(await readFile(configPath, 'utf8'));
    await mkdir(join(root, 'config'), { recursive: true });
    const log = openSync(join(root, 'api.log'), 'a');
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'serve'], {
      cwd: root, detached: true, windowsHide: true, stdio: ['ignore', log, log], env: process.env
    });
    child.once('error', error => { console.error(error.message); process.exitCode = 1; });
    child.unref();
    closeSync(log);
  }
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    try { current = await status(); } catch (error) {
      if (error.code !== 'ETIMEDOUT') throw error;
      // Cold loading native modules can temporarily delay pipe responses on Windows.
      await delay(500);
      continue;
    }
    if (current?.state === 'failed') throw new Error(current.error);
    if (current?.state === 'ready') {
      const url = `http://localhost:${current.port}`;
      console.log(`Lockeris disponível em ${url}\nPrimeiro acesso: consulte BOOTSTRAP_USERNAME e BOOTSTRAP_PASSWORD em config/.env.portable.`);
      if (process.env.LOCKERIS_NO_BROWSER !== '1') {
        const browser = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Start-Process $env:LOCKERIS_URL'],
          { env: { ...process.env, LOCKERIS_URL: url }, windowsHide: true, stdio: 'ignore' });
        browser.once('error', () => console.log(`Abra o navegador em ${url}.`));
        browser.unref();
      }
      return;
    }
    if (current?.state === 'stopping') throw new Error('A aplicação está encerrando. Aguarde antes de iniciar.');
    await delay(500);
  }
  throw new Error('Tempo de início excedido. Consulte api.log e execute PARAR antes de tentar novamente.');
}
try {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Este pacote requer Windows x64.');
  const command = process.argv[2];
  if (command === 'serve') await serve();
  else if (command === 'start') await start();
  else if (command === 'stop') {
    if (await status()) {
      const result = await control('stop');
      if (result.error) throw new Error(result.error);
    } else await stopPostgres(); // Recover the package's own PG after an interrupted Node process.
    console.log('Lockeris encerrado com segurança. Os dados locais foram preservados.');
  } else if (command === 'backup') {
    const config = await loadConfig();
    if (!await pgRunning()) throw new Error('O banco local não está em execução. Use INICIAR antes de executar o backup.');
    console.log(`Backup criado: ${await runBackup(config)}`);
  } else throw new Error('Use INICIAR.bat, PARAR.bat ou BACKUP.bat.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
