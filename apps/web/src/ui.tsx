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
  return <svg width={size} height={size} viewBox="0 0 192 192" role={label?'img':undefined} aria-label={label} aria-hidden={label?undefined:true} focusable="false">
    <rect width="192" height="192" rx="38" fill="#2E1065"/>
    <path d="M31 53 96 26l65 27-65 27z" fill="#7C3AED"/>
    <path d="M31 53 96 80v83l-65-27z" fill="#FFFFFF"/>
    <path d="M96 80 161 53v83l-65 27z" fill="#34D399"/>
    <path d="m45 79 36 15v48l-36-15z" fill="#E9D5FF" stroke="#7C3AED" strokeWidth="3" strokeLinejoin="round"/>
    <path d="m111 94 36-15v48l-36 15z" fill="#2E1065" fillOpacity=".18" stroke="#2E1065" strokeOpacity=".38" strokeWidth="3" strokeLinejoin="round"/>
    <path d="M31 53 96 80l65-27M96 80v83" fill="none" stroke="#2E1065" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round"/>
    <path d="m72 105 5 2v17l-5-2zm43 2 5-2v17l-5 2z" fill="#2E1065"/>
  </svg>;
}

export const roleName:Record<string,string>={geral:'Administração geral',filial_admin:'Administração da filial',operador:'Operação',consulta:'Consulta'};
export const conditionName:Record<string,string>={disponivel:'Disponível',manutencao:'Em manutenção',bloqueado:'Bloqueado'};
