/** Ignore visual separators in numeric matriculas without losing leading zeros. */
export function registrationKey(value:string):string{
  const trimmed=value.trim();
  return /^[\d\s.\-/]+$/.test(trimmed)?trimmed.replace(/[\s.\-/]/g,''):trimmed.toLocaleUpperCase('pt-BR');
}
