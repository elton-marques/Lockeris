import {useEffect,useRef,useState} from 'react';
import {Eye,EyeOff,KeyRound} from 'lucide-react';
import {post} from '../api';

type Reveal='current'|'next'|'confirmation';
type FieldProps={label:string;ariaLabel:string;value:string;onChange:(value:string)=>void;autoComplete:string;
  reveal:boolean;onReveal:()=>void;minLength?:number;hint?:string};

function PasswordField({label,ariaLabel,value,onChange,autoComplete,reveal,onReveal,minLength,hint}:FieldProps){
  return <label className="password-field">{label}
    <span className="password-control">
      <input type={reveal?'text':'password'} aria-label={ariaLabel} autoComplete={autoComplete} minLength={minLength} required value={value} onChange={event=>onChange(event.target.value)}/>
      <button type="button" className="password-toggle" aria-pressed={reveal} title={reveal?'Ocultar senha':'Mostrar senha'} onClick={onReveal}>
        <span className="sr-only">{reveal?'Ocultar senha':'Mostrar senha'}</span>
        <span className="password-toggle-icon">{reveal?<EyeOff size={20} strokeWidth={2} aria-hidden="true"/>:<Eye size={20} strokeWidth={2} aria-hidden="true"/>}</span>
      </button>
    </span>
    {hint&&<small>{hint}</small>}
  </label>;
}

export function ChangePasswordModal({onClose,onChanged}:{onClose:()=>void;onChanged:(message:string)=>void}){
  const [currentPassword,setCurrentPassword]=useState(''),[newPassword,setNewPassword]=useState(''),[confirmation,setConfirmation]=useState('');
  const [revealed,setRevealed]=useState<Record<Reveal,boolean>>({current:false,next:false,confirmation:false});
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  const dialogRef=useRef<HTMLElement|null>(null);
  const closeRef=useRef(onClose);
  useEffect(()=>{closeRef.current=onClose;},[onClose]);
  useEffect(()=>{
    dialogRef.current?.focus();
    const onKeyDown=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.stopPropagation();closeRef.current();}};
    window.addEventListener('keydown',onKeyDown);
    return()=>window.removeEventListener('keydown',onKeyDown);
  },[]);
  const reveal=(key:Reveal)=>setRevealed(current=>({...current,[key]:!current[key]}));
  async function submit(event:React.FormEvent){
    event.preventDefault();
    if(newPassword!==confirmation){setError('As senhas não conferem.');return;}
    setBusy(true);setError('');
    try{await post('/auth/change-password',{currentPassword,newPassword});onChanged('Senha alterada com sucesso. As outras sessões abertas foram encerradas.');}
    catch(e){setError(e instanceof Error?e.message:'Não foi possível alterar a senha.');}
    finally{setBusy(false);}
  }
  return <div className="app-dialog-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <section className="app-dialog password-dialog" role="dialog" aria-modal="true" aria-labelledby="change-password-title" ref={dialogRef} tabIndex={-1}>
      <div className="app-dialog-heading">
        <span className="eyebrow">Segurança da conta</span>
        <button type="button" className="app-dialog-close" onClick={onClose} aria-label="Fechar alteração de senha">×</button>
      </div>
      <h2 id="change-password-title"><KeyRound size={20} strokeWidth={2} aria-hidden="true"/> Alterar senha</h2>
      <p className="dialog-intro">Informe a sua senha atual para definir uma nova. As outras sessões abertas nesta conta serão encerradas.</p>
      <form onSubmit={submit}>
        <PasswordField label="Senha atual" ariaLabel="Senha atual" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" reveal={revealed.current} onReveal={()=>reveal('current')}/>
        <PasswordField label="Nova senha" ariaLabel="Nova senha" value={newPassword} onChange={setNewPassword} autoComplete="new-password" minLength={12} reveal={revealed.next} onReveal={()=>reveal('next')} hint="Mínimo de 12 caracteres e diferente da senha atual."/>
        <PasswordField label="Confirmar nova senha" ariaLabel="Confirmar nova senha" value={confirmation} onChange={setConfirmation} autoComplete="new-password" minLength={12} reveal={revealed.confirmation} onReveal={()=>reveal('confirmation')}/>
        {error&&<p className="field-error" role="alert">{error}</p>}
        <div className="app-dialog-actions">
          <button type="submit" className="primary" disabled={busy}>{busy?'Salvando…':'Salvar nova senha'}</button>
          <button type="button" onClick={onClose}>Cancelar</button>
        </div>
      </form>
    </section>
  </div>;
}
