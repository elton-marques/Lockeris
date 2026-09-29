import { parseEnv } from 'node:util';

export function parsePortableConfig(content) {
  const values = parseEnv(content);
  const port = Number(values.PORT ?? 3001);
  const pgPort = Number(values.PGPORT ?? 15432);
  for (const candidate of [port, pgPort]) {
    if (!Number.isInteger(candidate) || candidate < 1024 || candidate > 65535) throw new Error('As portas devem ser números entre 1024 e 65535.');
  }
  if (port === pgPort) throw new Error('API e PostgreSQL precisam de portas diferentes.');
  const database = values.PGDATABASE ?? 'lockeris';
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(database) || database === 'postgres' || database.startsWith('template')) throw new Error('Nome de banco local inválido.');
  if (values.PGUSER && values.PGUSER !== 'postgres') throw new Error('O usuário local deve ser postgres.');
  const username = values.BOOTSTRAP_USERNAME ?? 'admin';
  if (!/^[a-zA-Z0-9._-]{3,80}$/.test(username)) throw new Error('Usuário inicial inválido.');
  for (const key of ['PGPASSWORD', 'BOOTSTRAP_PASSWORD']) {
    if (values[key] && (values[key].length < 12 || /[\r\n]/.test(values[key]))) throw new Error(`${key} deve ter pelo menos 12 caracteres e ocupar uma linha.`);
  }
  // Deliberately ignore inherited/cloud DATABASE_URL and any network bind configuration.
  return { port, pgPort, database, username, password: values.PGPASSWORD ?? '', bootstrapPassword: values.BOOTSTRAP_PASSWORD ?? '' };
}

export function portableEnvironment(config) {
  return { NODE_ENV: 'production', PORTABLE_MODE: 'true', COOKIE_SECURE: 'false', PORT: String(config.port),
    DATABASE_URL: `postgres://postgres:${encodeURIComponent(config.password)}@127.0.0.1:${config.pgPort}/${config.database}`,
    BOOTSTRAP_USERNAME: config.username, BOOTSTRAP_PASSWORD: config.bootstrapPassword };
}
