import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { id, operation, linkRulesShape } from '@armarios/contracts';
import { authenticate, adminAccess } from './auth.js';
import { pool, transaction, fail } from './db.js';
import { idempotent, event } from './operations.js';
import { effectiveRules, type LinkRules } from './link-rules.js';

const route = z.object({ branchId: id });

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/branches/:branchId/settings/link-rules', async request => {
    const actor = await authenticate(request);
    const { branchId } = route.parse(request.params);
    adminAccess(actor, branchId);
    const row = (await pool.query<{ link_rules: LinkRules; version: number }>('SELECT link_rules,version FROM branch_settings WHERE branch_id=$1', [branchId])).rows[0];
    return { ...effectiveRules(row?.link_rules ?? null), version: row?.version ?? 0 };
  });

  app.patch('/api/branches/:branchId/settings/link-rules', async request => {
    const actor = await authenticate(request);
    const { branchId } = route.parse(request.params);
    adminAccess(actor, branchId);
    const body = operation.extend({ expectedVersion: z.number().int().min(0), ...linkRulesShape }).parse(request.body);
    return transaction(client => idempotent(client, body.operationId, branchId, actor.id, body, async () => {
      const existing = await client.query<{ version: number }>('SELECT version FROM branch_settings WHERE branch_id=$1 FOR UPDATE', [branchId]);
      if ((existing.rows[0]?.version ?? 0) !== body.expectedVersion) fail(409, 'VERSAO', 'Regras alteradas; recarregue');
      const rules = { apprentice: body.apprentice, promoter: body.promoter, thirdParty: body.thirdParty };
      const updated = (await client.query(`INSERT INTO branch_settings(branch_id,link_rules,version) VALUES($1,$2,1)
        ON CONFLICT (branch_id) DO UPDATE SET link_rules=$2,version=branch_settings.version+1,updated_at=now() RETURNING version`, [branchId, JSON.stringify(rules)])).rows[0]!;
      await event(client, branchId, actor.id, 'regras_vinculo_atualizadas', 'branch', branchId, { rules }, { description: 'Regras de vínculo atualizadas' });
      return { ...effectiveRules(rules), version: updated.version };
    }));
  });
}
