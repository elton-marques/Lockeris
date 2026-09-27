import type {ReactNode} from 'react';
import {AlertCircle, Inbox} from 'lucide-react';

type SkeletonVariant='text'|'title'|'circle'|'card';

export function Skeleton({variant='text',label='Carregando'}:{variant?:SkeletonVariant;label?:string}){
  return <span className={`skeleton skeleton--${variant}`} role="status" aria-label={label}/>;
}

export function EmptyState({title,description,action,icon:Icon=Inbox}:{title:string;description:string;action?:ReactNode;icon?:typeof Inbox}){
  return <div className="empty-state">
    <span className="empty-state-icon"><Icon size={26} strokeWidth={1.8} aria-hidden="true"/></span>
    <div className="empty-state-copy"><strong>{title}</strong><p>{description}</p></div>
    {action&&<div className="empty-state-action">{action}</div>}
  </div>;
}

export function DataState({loading,error,onRetry}:{loading:boolean;error:string;onRetry:()=>void}){
  if(loading)return <div className="data-state" role="status"><Skeleton variant="circle"/><div><strong>Carregando dados</strong><p>Aguarde um instante.</p></div></div>;
  if(error)return <div className="data-state error-state" role="alert"><AlertCircle size={20} aria-hidden="true"/><div><strong>Não foi possível carregar os dados.</strong><p>{error}</p></div><button type="button" onClick={onRetry}>Tentar novamente</button></div>;
  return null;
}

export function LockerisIcon({size=39,label}:{size?:number;label?:string}){
  return <img src="/icon.svg" width={size} height={size} alt={label??''}/>;
}

export const roleName:Record<string,string>={geral:'Administração geral',filial_admin:'Administração da filial',operador:'Operação',consulta:'Consulta'};
export const conditionName:Record<string,string>={disponivel:'Disponível',manutencao:'Em manutenção',bloqueado:'Bloqueado'};
