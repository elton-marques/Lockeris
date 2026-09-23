export type RegistrationOption={registration:string;name:string;department:string|null;functionName:string|null;lockerNumber:string|null};

export const registrationKey=(value:string)=>/^[\d\s.\-/]+$/.test(value.trim())?value.trim().replace(/[\s.\-/]/g,''):value.trim().toLocaleUpperCase('pt-BR');
export const findRegistration=(items:RegistrationOption[],value:string)=>value.trim()
  ?items.find(item=>registrationKey(item.registration)===registrationKey(value)):undefined;

export function RegistrationInput({id,value,options,onChange}:{id:string;value:string;options:RegistrationOption[];
  onChange:(value:string,match:RegistrationOption|undefined)=>void}){
  const match=findRegistration(options,value);
  return <>
    <label>Matrícula<input list={`${id}-options`} value={value} onChange={event=>{
      const next=event.target.value;onChange(next,findRegistration(options,next));
    }} placeholder="Digite ou escolha uma matrícula" autoComplete="off"/></label>
    <datalist id={`${id}-options`}>{options.map(item=><option key={item.registration} value={item.registration}
      label={`${item.name}${item.department?` · ${item.department}`:''}${item.lockerNumber?` · armário ${item.lockerNumber}`:''}`}/>)}</datalist>
    {match&&<p className="muted registration-match">Base atual: {match.name}{match.department?` · ${match.department}`:''}{match.lockerNumber?` · armário ${match.lockerNumber}`:''}</p>}
  </>;
}
