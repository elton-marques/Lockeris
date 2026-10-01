import {ArrowLeftRight,Boxes,ClipboardCheck,ClipboardList,FileClock,LayoutDashboard,PackageSearch,ShieldCheck,Upload,UsersRound} from 'lucide-react';
export type Tab={key:string;label:string;icon:typeof LayoutDashboard;group:string};
export const tabs=[
  {key:'resumo',label:'Dashboard',icon:LayoutDashboard,group:'Operação'},
  {key:'painel',label:'Armários',icon:Boxes,group:'Operação'},
  {key:'pessoas',label:'Colaboradores',icon:UsersRound,group:'Operação'},
  {key:'pendencias',label:'Pendências',icon:ClipboardCheck,group:'Operação'},
  {key:'movimentacoes',label:'Transferências',icon:ArrowLeftRight,group:'Operação'},
  {key:'achados',label:'Achados e Perdidos',icon:PackageSearch,group:'Operação'},
  {key:'auditorias',label:'Auditorias',icon:ClipboardList,group:'Operação'},
  {key:'importacao',label:'Importações',icon:Upload,group:'Gestão'},
  {key:'historico',label:'Histórico',icon:FileClock,group:'Gestão'},
  {key:'administracao',label:'Administração',icon:ShieldCheck,group:'Gestão'}
] as const;
export type TabKey=(typeof tabs)[number]['key'];
export const tabKeys=new Set<string>(tabs.map(item=>item.key));
export const adminOnlyTabs=new Set<string>(['administracao','importacao','historico']);
export type HashResolution={kind:'none'}|{kind:'page';page:string}|{kind:'notfound';path:string};
export function resolveHashPage(hash:string,role?:string):HashResolution{
  const path=hash.replace(/^#/,'');
  if(!path.startsWith('/'))return {kind:'none'};
  const key=path.slice(1).split(/[?#/]/)[0]??'';
  if(!tabKeys.has(key))return {kind:'notfound',path:key};
  if(adminOnlyTabs.has(key)&&role!=='geral'&&role!=='filial_admin')return {kind:'page',page:'painel'};
  return {kind:'page',page:key};
}
