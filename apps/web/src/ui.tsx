import type {ReactNode} from 'react';
import {AlertCircle, Inbox, LoaderCircle} from 'lucide-react';

export function EmptyState({title,description,action}:{title:string;description:string;action?:ReactNode}){
  return <div className="empty-state"><Inbox size={22} aria-hidden="true"/><strong>{title}</strong><p>{description}</p>{action}</div>;
}

export function DataState({loading,error,onRetry}:{loading:boolean;error:string;onRetry:()=>void}){
  if(loading)return <div className="data-state" role="status"><LoaderCircle size={20} aria-hidden="true"/><span>Carregando dados…</span></div>;
  if(error)return <div className="data-state error-state" role="alert"><AlertCircle size={20} aria-hidden="true"/><div><strong>Não foi possível carregar os dados.</strong><p>{error}</p></div><button type="button" onClick={onRetry}>Tentar novamente</button></div>;
  return null;
}

export const roleName:Record<string,string>={geral:'Administração geral',filial_admin:'Administração da filial',operador:'Operação',consulta:'Consulta'};
export const conditionName:Record<string,string>={disponivel:'Disponível',manutencao:'Em manutenção',bloqueado:'Bloqueado'};
