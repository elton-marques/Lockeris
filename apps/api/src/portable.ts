import staticFiles from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import { access } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function registerPortableWeb(app: FastifyInstance, root = fileURLToPath(new URL('../../web/dist/', import.meta.url))) {
  await access(join(root, 'index.html'));
  // Swagger already decorates reply.sendFile; its decorator also accepts another root.
  await app.register(staticFiles, { root, decorateReply: !app.hasReplyDecorator('sendFile'), index: ['index.html'] });
  app.setNotFoundHandler((request, reply) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const navigation = ['GET', 'HEAD'].includes(request.method) && request.headers.accept?.includes('text/html');
    if (navigation && pathname !== '/api' && !pathname.startsWith('/api/') && !extname(pathname)) {
      return reply.header('Cache-Control', 'no-store').sendFile('index.html', root, { cacheControl: false });
    }
    return reply.code(404).send({ error: { code: 'NAO_ENCONTRADO', message: 'Recurso não encontrado' } });
  });
}
