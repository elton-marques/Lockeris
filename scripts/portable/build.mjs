import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, cp, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const cache = join(root, '.portable-cache');
const distribution = join(root, 'dist-portable');
const options = Object.fromEntries(process.argv.slice(2).map(value => {
  const match = /^--(node-zip|postgres-zip|msvc-appx|output-dir)=(.+)$/.exec(value);
  if (!match) throw new Error(`Opção desconhecida: ${value}. Consulte PORTABLE_GUIDE.md.`);
  return [match[1], resolve(match[2])];
}));
const destination = options['output-dir'] ?? join(distribution, 'Lockeris-Portable');
const child = relative(distribution, destination);
if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('A saída deve estar dentro de dist-portable/.');
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Gere o pacote em Windows x64 para validar as dependências nativas.');
try {
  await access(destination);
  throw new Error(`A saída já existe: ${destination}. Preserve o pacote anterior e use --output-dir=dist-portable/OutroPacote.`);
} catch (error) { if (error.code !== 'ENOENT') throw error; }

const nodeVersion = '24.21.0';
const postgresVersion = '17.11-1';
const nodeName = `node-v${nodeVersion}-win-x64.zip`;
const postgresName = `postgresql-${postgresVersion}-windows-x64-binaries.zip`;
const stage = join(distribution, `.build-${randomUUID()}`);
await mkdir(cache, { recursive: true });
await mkdir(stage, { recursive: true });

function run(executable, args, cwd = root, env = process.env) {
  const result = spawnSync(executable, args, { cwd, env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${executable} terminou com código ${result.status}.`);
}
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Execute npm run build:portable na raiz do repositório.');

async function download(url, filename) {
  try { await access(filename); return; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  console.log(`Baixando ${url}`);
  const response = await fetch(url, { signal: AbortSignal.timeout(15 * 60 * 1000) });
  if (!response.ok || !response.body) throw new Error(`Download falhou (${response.status}). Posicione o ZIP conforme PORTABLE_GUIDE.md.`);
  const temporary = `${filename}.partial`;
  await pipeline(response.body, createWriteStream(temporary));
  await rename(temporary, filename);
}
async function sha256(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}
async function extract(zip, output, kind) {
  await mkdir(output, { recursive: true });
  // Paths are passed as environment values, never interpolated into shell source.
  run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
    join(root, 'scripts/portable/extract.ps1')], root,
  { ...process.env, LOCKERIS_ZIP: zip, LOCKERIS_EXTRACT: output, LOCKERIS_ZIP_KIND: kind });
  const entries = await readdir(output, { withFileTypes: true });
  if (kind === 'msvc') return output;
  if (entries.length !== 1 || !entries[0].isDirectory()) throw new Error(`Estrutura inesperada no ZIP: ${zip}`);
  return join(output, entries[0].name);
}

try {
  run(process.execPath, [npm, 'run', 'build']);
  const nodeZip = options['node-zip'] ?? join(cache, nodeName);
  const postgresZip = options['postgres-zip'] ?? join(cache, postgresName);
  const msvcAppx = options['msvc-appx'] ?? join(cache, 'Microsoft.VCLibs.x64.14.00.Desktop.appx');
  if (!options['node-zip']) await download(`https://nodejs.org/dist/v${nodeVersion}/${nodeName}`, nodeZip);
  if (!options['postgres-zip']) await download(`https://get.enterprisedb.com/postgresql/${postgresName}`, postgresZip);
  if (!options['msvc-appx']) await download('https://download.microsoft.com/download/4/7/c/47c6134b-d61f-4024-83bd-b9c9ea951c25/Microsoft.VCLibs.x64.14.00.Desktop.appx', msvcAppx);
  const nodeHash = await sha256(nodeZip);
  const expectedNodeHash = '158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541';
  if (nodeHash !== expectedNodeHash) throw new Error(`O ZIP do Node deve ser ${nodeName} e corresponder ao SHA-256 oficial.`);
  const postgresHash = await sha256(postgresZip);
  const msvcHash = await sha256(msvcAppx);
  if (msvcHash !== 'b56a9101f706f9d95f815f5b7fa6efbac972e86573d378b96a07cff5540c5961') throw new Error('O pacote Microsoft VCLibs não corresponde ao SHA-256 fixado. Consulte PORTABLE_GUIDE.md.');
  const nodeExtract = await extract(nodeZip, join(stage, 'extract-node'), 'node');
  const pgExtract = await extract(postgresZip, join(stage, 'extract-postgres'), 'postgres');
  const msvcExtract = await extract(msvcAppx, join(stage, 'extract-msvc'), 'msvc');
  await rename(nodeExtract, join(stage, 'node'));
  await mkdir(join(stage, 'postgres'));
  for (const directory of ['bin', 'lib', 'share']) await cp(join(pgExtract, directory), join(stage, 'postgres', directory), { recursive: true });
  for (const entry of await readdir(pgExtract)) {
    if (/license|copying|copyright/i.test(entry) && (await stat(join(pgExtract, entry))).isFile()) {
      await cp(join(pgExtract, entry), join(stage, 'postgres', entry));
    }
  }
  for (const entry of (await readdir(msvcExtract)).filter(name => name.endsWith('.dll'))) {
    await cp(join(msvcExtract, entry), join(stage, 'postgres/bin', entry));
    await cp(join(msvcExtract, entry), join(stage, 'node', entry));
  }
  await mkdir(join(stage, 'licenses/Microsoft-VC-Runtime'), { recursive: true });
  await cp(join(msvcExtract, 'AppxManifest.xml'), join(stage, 'licenses/Microsoft-VC-Runtime/AppxManifest.xml'));
  const portableNode = join(stage, 'node', 'node.exe');
  run(portableNode, ['--version']);
  const pgVersion = spawnSync(join(stage, 'postgres', 'bin', 'postgres.exe'), ['--version'], { encoding: 'utf8', windowsHide: true });
  if (pgVersion.status !== 0 || !/\b17\./.test(pgVersion.stdout ?? '')) throw new Error('O ZIP precisa conter PostgreSQL 17 x64 executável neste Windows.');

  const app = join(stage, 'app');
  await mkdir(app);
  for (const filename of ['package.json', 'package-lock.json']) await cp(join(root, filename), join(app, filename));
  for (const workspace of ['apps/api', 'apps/web', 'packages/contracts']) {
    await mkdir(join(app, workspace), { recursive: true });
    await cp(join(root, workspace, 'package.json'), join(app, workspace, 'package.json'));
    await cp(join(root, workspace, 'dist'), join(app, workspace, 'dist'), { recursive: true });
  }
  await cp(join(root, 'apps/api/migrations'), join(app, 'apps/api/migrations'), { recursive: true });
  // The optional print font has a system-font fallback; the offline copy must not fetch Google Fonts.
  const assets = join(app, 'apps/web/dist/assets');
  for (const filename of (await readdir(assets)).filter(name => name.endsWith('.css'))) {
    const source = await readFile(join(assets, filename), 'utf8');
    const offline = source.replace(/@import\s*(?:url\()?['"]https:\/\/fonts\.googleapis\.com\/[^'"]+['"]\)?\s*;/g, '');
    await writeFile(join(assets, filename), offline);
  }
  // Install only the API and contracts from the existing lockfile, using Windows Node.
  const installEnv = { ...process.env, PATH: `${join(stage, 'node')};${process.env.PATH}` };
  // npm run can export a user allow-scripts policy as a CLI setting, which npm ci rejects.
  for (const key of Object.keys(installEnv)) if (/^npm_config_allow_scripts$/i.test(key)) delete installEnv[key];
  run(portableNode, [join(stage, 'node/node_modules/npm/bin/npm-cli.js'), 'ci', '--omit=dev',
    '--workspace=@armarios/api', '--workspace=@armarios/contracts', '--include-workspace-root=false', '--ignore-scripts', '--no-audit', '--no-fund'], app,
  installEnv);
  // npm workspace junctions point at the build directory. Materialize contracts for relocation.
  for (const name of ['api', 'contracts']) await unlink(join(app, 'node_modules/@armarios', name));
  await cp(join(app, 'packages/contracts'), join(app, 'node_modules/@armarios/contracts'), { recursive: true });
  run(portableNode, ['--input-type=module', '-e',
    "import argon2 from 'argon2'; import pg from 'pg'; import '@armarios/contracts'; await argon2.hash('portable-build-validation'); if (!pg.Pool) throw new Error('pg indisponível');"], app);
  await cp(join(root, 'scripts/portable/launcher.mjs'), join(app, 'launcher.mjs'));
  await cp(join(root, 'scripts/portable/config.mjs'), join(app, 'portable-config.mjs'));
  await mkdir(join(stage, 'config'));
  await writeFile(join(stage, 'config/.env.portable'), '# Credenciais geradas no primeiro início. Não compartilhe após colocar em uso.\nPORT=3001\nPGPORT=15432\nPGDATABASE=lockeris\nPGUSER=postgres\nPGPASSWORD=\nBOOTSTRAP_USERNAME=admin\nBOOTSTRAP_PASSWORD=\nPORTABLE_MODE=true\nCOOKIE_SECURE=false\n', 'utf8');
  for (const [filename, command] of [['INICIAR.bat', 'start'], ['PARAR.bat', 'stop']]) {
    await writeFile(join(stage, filename), ['@echo off', 'setlocal', 'chcp 65001 >nul', 'cd /d "%~dp0"',
      'if not exist "node\\node.exe" (echo Node portatil nao encontrado. & pause & exit /b 1)',
      `"%~dp0node\\node.exe" "%~dp0app\\launcher.mjs" ${command}`, 'set "RESULT=%ERRORLEVEL%"',
      'if not "%LOCKERIS_NO_PAUSE%"=="1" pause', 'exit /b %RESULT%', ''].join('\r\n'), 'ascii');
  }
  await writeFile(join(stage, 'Lockeris.url'), '[InternetShortcut]\r\nURL=http://localhost:3001\r\n', 'ascii');
  await cp(join(root, 'PORTABLE_GUIDE.md'), join(stage, 'PORTABLE_GUIDE.md'));
  await writeFile(join(stage, 'BUILD_INFO.json'), JSON.stringify({ createdAt: new Date().toISOString(), platform: 'win32-x64',
    node: { version: nodeVersion, sha256: nodeHash }, postgres: { version: postgresVersion, sha256: postgresHash },
    msvc: { package: 'Microsoft.VCLibs.x64.14.00.Desktop.appx', sha256: msvcHash } }, null, 2));
  // Remove only extraction scratch under the newly created staging directory.
  const { rm } = await import('node:fs/promises');
  for (const directory of ['extract-node', 'extract-postgres', 'extract-msvc']) {
    const temporaryPath = resolve(stage, directory);
    if (dirname(temporaryPath) !== stage) throw new Error('Diretório temporário fora da área de build.');
    await rm(temporaryPath, { recursive: true });
  }
  await rename(stage, destination);
  console.log(`Pacote criado: ${destination}`);
} catch (error) {
  console.error(`Falha ao gerar o pacote: ${error.message}\nArtefatos parciais preservados em ${stage}. A saída final não foi substituída.`);
  process.exitCode = 1;
}
