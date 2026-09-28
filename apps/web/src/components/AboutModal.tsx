import {useEffect,useRef,useState} from 'react';
import {Atom,Braces,Container,Database,Server,ShieldCheck,CodeXml,X,GitCommit,Sparkles,Bug} from 'lucide-react';
import {LockerisIcon} from '../ui';
import {changelog} from '../data/changelog';

const VERSION='v1.0.0';
const stack=[
  {label:'React 19',icon:Atom},
  {label:'Fastify 5',icon:Server},
  {label:'PostgreSQL',icon:Database},
  {label:'Docker',icon:Container},
  {label:'TypeScript',icon:Braces}
] as const;

export function AboutModal({onClose}:{onClose:()=>void}){
  const [showVersions,setShowVersions]=useState(false);
  const dialogRef=useRef<HTMLElement|null>(null);
  const closeRef=useRef(onClose);
  useEffect(()=>{closeRef.current=onClose;},[onClose]);
  useEffect(()=>{
    dialogRef.current?.focus();
    const onKeyDown=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.stopPropagation();closeRef.current();}};
    window.addEventListener('keydown',onKeyDown);
    return()=>window.removeEventListener('keydown',onKeyDown);
  },[]);
  return <div className="app-dialog-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <section className="app-dialog about-dialog" role="dialog" aria-modal="true" aria-labelledby="about-dialog-title" ref={dialogRef} tabIndex={-1}>
      <header className="about-header">
        <span className="about-logo"><LockerisIcon size={46} label="Lockeris"/></span>
        <div className="about-header-copy">
          <span className="eyebrow">Plataforma Integrada de Armários</span>
          <h2 id="about-dialog-title"><ShieldCheck size={20} strokeWidth={2} aria-hidden="true"/> Sobre o Lockeris</h2>
        </div>
        <span className="about-version">{VERSION}</span>
      </header>

      <div className="about-author">
        <CodeXml size={18} strokeWidth={2} aria-hidden="true"/>
        <p>Sistema projetado e desenvolvido do zero por <strong>Elton Marques</strong> para a gestão operacional e Prevenção de Perdas.</p>
      </div>

      <div className="about-stack">
        <span className="about-stack-label">Stack tecnológica</span>
        <ul className="about-stack-list">
          {stack.map(item=>{const Icon=item.icon;return <li key={item.label}><Icon size={13} strokeWidth={2} aria-hidden="true"/>{item.label}</li>;})}
        </ul>
      </div>
      <button type="button" className="about-versions-toggle" onClick={()=>setShowVersions(value=>!value)} aria-expanded={showVersions} aria-controls="about-versions"><GitCommit size={16} aria-hidden="true"/> Novidades e Versões</button>
      {showVersions&&<section id="about-versions" className="about-versions" aria-label="Entregas do Lockeris">
        <h3>Entregas do Lockeris</h3>
        <ul className="about-versions-list">{changelog.map(item=>{
          const Icon=item.kind==='commit'?GitCommit:item.kind==='shield'?ShieldCheck:item.kind==='bug'?Bug:Sparkles;
          return <li key={item.title}><Icon size={16} aria-hidden="true"/><div className="about-release-copy"><strong>{item.title}</strong><p>{item.description}</p><ul className="about-release-items">{item.items.map(point=><li key={point}>{point}</li>)}</ul></div></li>;
        })}</ul>
      </section>}

      <div className="app-dialog-actions about-actions">
        <button type="button" className="primary" onClick={onClose}><X size={16} strokeWidth={2.2} aria-hidden="true"/> Fechar</button>
      </div>
    </section>
  </div>;
}
