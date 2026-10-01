import { z } from 'zod';

export const id = z.uuid();
export const operation = z.object({ operationId: id });
export const version = z.object({ expectedVersion: z.number().int().positive() });
export const category = z.enum(['colaborador', 'promotor_fixo', 'roteirista', 'terceirizado', 'vinculo_nao_identificado']);
export const role = z.enum(['geral', 'filial_admin', 'operador', 'consulta']);
export const personInput = z.object({
  name: z.string().trim().min(2).max(200),
  category,
  registration: z.string().trim().max(80).nullish(),
  company: z.string().trim().max(200).nullish(),
  department: z.string().trim().max(200).nullish(),
  functionName: z.string().trim().max(200).nullish(),
  needsFixed: z.boolean(),
  origin: z.enum(['manual', 'ti', 'migracao']).default('manual')
}).superRefine((value, ctx) => {
  if (['colaborador', 'promotor_fixo'].includes(value.category) && !value.registration) ctx.addIssue({ code: 'custom', path: ['registration'], message: 'Matrícula obrigatória' });
  if (value.category === 'vinculo_nao_identificado' && value.registration) ctx.addIssue({ code: 'custom', path: ['category'], message: 'Valide a matrícula antes de definir o vínculo' });
});
export const personUpdateInput = z.object(personInput.shape).omit({ origin: true }).partial().extend({ operationId: id, expectedVersion: z.number().int().positive() });
export const lockerInput = z.object({ number: z.string().trim().min(1).max(40), size: z.enum(['padrao', 'grande']), capacity: z.number().int().positive(), isDouble: z.boolean().default(false), modality: z.literal('fixo'), destination: z.string().max(300).nullish(), sectorOccupant: z.string().trim().min(1).max(200).nullish(), condition: z.enum(['disponivel', 'manutencao', 'bloqueado']).default('disponivel') });
export const occupyInput = operation.extend({ personId: id, lockerId: id, expectedVersion: z.number().int().positive(), modality: z.literal('fixo'), seasonal: z.boolean().default(false), dueAt: z.iso.datetime().nullish(), reason: z.string().max(500).nullish(), note: z.string().max(2000).nullish(), keyCopyAvailable: z.boolean().optional(), sharingReason: z.string().trim().min(3).max(500).nullish(), sharingDueAt: z.iso.datetime().nullish() }).superRefine((value, ctx) => {
  if (value.seasonal && !value.dueAt) ctx.addIssue({ code: 'custom', path: ['dueAt'], message: 'Previsão obrigatória' });
});
export const retainedItemInput = z.object({
  category: z.enum(['roupa','calcado','celular','relogio','oculos','outro']),
  customCategory: z.string().trim().max(200).nullish(),
  foundAt: z.iso.datetime().optional(),
  finderId: id.nullish(),
  finderName: z.string().trim().min(1).max(200),
  foundLocation: z.string().trim().min(1).max(300),
  description: z.string().trim().min(1).max(2000)
}).superRefine((value,ctx)=>{
  if(value.category==='outro'&&!value.customCategory)ctx.addIssue({code:'custom',path:['customCategory'],message:'Informe a categoria'});
});
export const releaseInput = operation.extend({ allocationId: id, expectedVersion: z.number().int().positive(), note: z.string().max(2000).nullish(), retainedItem: retainedItemInput.optional() });
export const transferInput = operation.extend({ allocationId: id, expectedAllocationVersion: z.number().int().positive(), destinationLockerId: id, sourceVersion: z.number().int().positive(), destinationVersion: z.number().int().positive(), reason: z.string().trim().min(3).max(500), note: z.string().max(2000).nullish(), keyCopyAvailable: z.boolean().optional(), sharingReason: z.string().max(500).nullish(), sharingDueAt: z.iso.datetime().nullish() });
export const branchInput = z.object({ name: z.string().trim().min(2).max(120) });
const keywordList = z.array(z.string().trim().toLowerCase().min(2).max(80)).max(30).default([]);
export const linkRulesShape = { apprentice: keywordList, promoter: keywordList, thirdParty: keywordList };
export const linkRulesInput = z.object(linkRulesShape).refine(value => Object.values(value).some(list => list.length > 0), { message: 'Informe ao menos uma palavra-chave' });
export const keyLoanInput = operation.extend({ personId: id, notes: z.string().trim().max(2000).nullish() });
export const keyLoanReturnInput = z.object({ operationId: id, notes: z.string().trim().max(2000).nullish() });
