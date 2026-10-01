import { pool } from './db.js';

export type LinkRules = { apprentice: string[]; promoter: string[]; thirdParty: string[] };
/** Palavras-chave usadas quando a filial não definiu regras próprias (comportamento histórico). */
export const defaultLinkRules: LinkRules = { apprentice: ['aprendiz'], promoter: ['promotor'], thirdParty: ['delta', 'climatiza', 'terceiriz'] };
/** Grupos sem lista própria voltam ao padrão histórico. */
export function effectiveRules(stored: LinkRules | null | undefined): LinkRules {
  return {
    apprentice: stored?.apprentice?.length ? stored.apprentice : defaultLinkRules.apprentice,
    promoter: stored?.promoter?.length ? stored.promoter : defaultLinkRules.promoter,
    thirdParty: stored?.thirdParty?.length ? stored.thirdParty : defaultLinkRules.thirdParty
  };
}
export async function storedRules(branchId: string): Promise<LinkRules | null> {
  const row = (await pool.query<{ link_rules: LinkRules }>('SELECT link_rules FROM branch_settings WHERE branch_id=$1', [branchId])).rows[0];
  return row?.link_rules ?? null;
}
const containsKeyword = (value: string | null | undefined, keywords: string[]) => {
  if (!value) return false;
  const text = value.toLocaleLowerCase('pt-BR');
  return keywords.some(keyword => text.includes(keyword));
};
type LinkMember = { name: string; category: string | null; department: string | null; function_name: string | null; company: string | null };
/**
 * Classificação de vínculo para o painel "Pessoas por vínculo", em ordem de
 * precedência: aprendiz → Colaborador; promotor → Promotor(a); palavras de
 * terceirização → Terceirizado; sem setor/cargo/empresa → Pendência Cadastral;
 * por fim a categoria gravada no cadastro.
 */
export function classifyLink(member: LinkMember, rules: LinkRules): 'colaborador' | 'promotor_fixo' | 'terceirizado' | 'vinculo_nao_identificado' | null {
  if (containsKeyword(member.department, rules.apprentice) || containsKeyword(member.function_name, rules.apprentice) || containsKeyword(member.name, rules.apprentice)) return 'colaborador';
  if (member.category === 'promotor_fixo' || containsKeyword(member.department, rules.promoter) || containsKeyword(member.function_name, rules.promoter)) return 'promotor_fixo';
  if (member.category === 'terceirizado' || containsKeyword(member.company, rules.thirdParty) || containsKeyword(member.department, rules.thirdParty)) return 'terceirizado';
  if (!member.department?.trim() && !member.function_name?.trim() && !member.company?.trim()) return 'vinculo_nao_identificado';
  if (member.category === 'colaborador') return 'colaborador';
  if (member.category === 'vinculo_nao_identificado') return 'vinculo_nao_identificado';
  return null;
}
