import {useEffect,useRef,useState} from 'react';
import {Hash} from 'lucide-react';
import {FieldIcon} from './components/LockerControls';
import {placeMenu,type MenuPosition} from './components/Select';

export type RegistrationOption={registration:string;name:string;department:string|null;functionName:string|null;lockerNumber:string|null};

export const registrationKey=(value:string)=>/^[\d\s.\-/]+$/.test(value.trim())?value.trim().replace(/[\s.\-/]/g,''):value.trim().toLocaleUpperCase('pt-BR');
export const findRegistration=(items:RegistrationOption[],value:string)=>value.trim()
  ?items.find(item=>registrationKey(item.registration)===registrationKey(value)):undefined;

const lower=(value:string)=>value.toLocaleLowerCase('pt-BR');
const limit=40;

function matches(item:RegistrationOption,query:string){
  if(!query)return true;
  const needle=lower(query);
  return lower(item.name).includes(needle)||lower(item.department??'').includes(needle)
    ||lower(item.registration).includes(needle)||registrationKey(item.registration)===registrationKey(query);
}

function Highlight({text,query}:{text:string;query:string}){
  if(!query)return <>{text}</>;
  const at=lower(text).indexOf(lower(query));
  if(at<0)return <>{text}</>;
  return <>{text.slice(0,at)}<mark>{text.slice(at,at+query.length)}</mark>{text.slice(at+query.length)}</>;
}

export function RegistrationInput({id,value,options,onChange}:{id:string;value:string;options:RegistrationOption[];
  onChange:(value:string,match:RegistrationOption|undefined)=>void}){
  const [open,setOpen]=useState(false),[active,setActive]=useState(0),[position,setPosition]=useState<MenuPosition|null>(null);
  const rootRef=useRef<HTMLDivElement>(null),inputRef=useRef<HTMLInputElement>(null);
  const listId=`${id}-list`;
  const match=findRegistration(options,value);
  const query=value.trim();
  const results=options.filter(item=>matches(item,query)).slice(0,limit);

  function openMenu(){
    const input=inputRef.current;
    if(input)setPosition(placeMenu(input));
    setOpen(true);
  }
  function choose(item:RegistrationOption){onChange(item.registration,item);setOpen(false);inputRef.current?.focus();}
  function move(step:number){
    if(!results.length)return;
    setActive(current=>{
      let next=current;
      do{next=(next+step+results.length)%results.length;}while(!results[next]&&next!==current);
      return next;
    });
  }

  useEffect(()=>{
    if(!open)return;
    const onPointer=(event:PointerEvent)=>{if(!rootRef.current?.contains(event.target as Node))setOpen(false);};
    const onScroll=(event:Event)=>{if(!(event.target instanceof Node)||!rootRef.current?.contains(event.target))setOpen(false);};
    const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'&&rootRef.current?.contains(document.activeElement??null)){event.preventDefault();setOpen(false);}};
    document.addEventListener('pointerdown',onPointer);
    window.addEventListener('scroll',onScroll,true);
    document.addEventListener('keydown',onKey);
    return()=>{document.removeEventListener('pointerdown',onPointer);window.removeEventListener('scroll',onScroll,true);document.removeEventListener('keydown',onKey);};
  },[open]);

  useEffect(()=>{setActive(0);},[value]);

  function onKeyDown(event:React.KeyboardEvent<HTMLInputElement>){
    if(event.key==='ArrowDown'){event.preventDefault();if(!open)openMenu();else move(1);return;}
    if(event.key==='ArrowUp'){event.preventDefault();if(!open)openMenu();else move(-1);return;}
    if(event.key==='Enter'&&open){
      const item=results[active];
      if(item){event.preventDefault();choose(item);}
      return;
    }
    if(event.key==='Escape'&&open){event.preventDefault();event.stopPropagation();setOpen(false);}
  }

  return <div className="combobox-field" ref={rootRef}>
    <label className="field-icon combobox-label" htmlFor={id}><FieldIcon icon={Hash}/>Matrícula</label>
    <div className="combobox-control">
      <input ref={inputRef} id={id} className="combobox-input" role="combobox" aria-label="Matrícula"
        aria-expanded={open} aria-controls={open?listId:undefined} aria-autocomplete="list"
        aria-activedescendant={open&&results.length?`${listId}-option-${active}`:undefined}
        value={value} autoComplete="off" placeholder="Digite ou escolha uma matrícula"
        onFocus={()=>openMenu()} onChange={event=>{
          const next=event.target.value;onChange(next,findRegistration(options,next));openMenu();
        }} onKeyDown={onKeyDown}/>
    </div>
    {open&&<ul id={listId} role="listbox" aria-label="Matrícula" className="combobox-menu"
      style={{position:'fixed',top:position?.top,bottom:position?.bottom,left:position?.left,
        minWidth:position?.minWidth,maxHeight:position?.maxHeight}}>
      {results.length?results.map((item,index)=>
        <li key={item.registration} id={`${listId}-option-${index}`} role="option" aria-selected={item.registration===value}
          className={index===active?'combobox-option active':'combobox-option'}
          onMouseEnter={()=>setActive(index)} onMouseDown={event=>event.preventDefault()} onClick={()=>choose(item)}>
          <span className="combobox-option-head">
            <strong><Highlight text={item.name} query={query}/></strong>
            <span><Highlight text={item.registration} query={query}/></span>
          </span>
          <small>
            {item.department&&<span><Highlight text={item.department} query={query}/></span>}
            {item.lockerNumber&&<span>armário {item.lockerNumber}</span>}
          </small>
        </li>):<li className="combobox-empty" role="presentation">Nenhuma matrícula encontrada{query?` para “${query}”.`:'.'}</li>}
    </ul>}
    {match&&<p className="muted registration-match">Base atual: {match.name}{match.department?` · ${match.department}`:''}{match.lockerNumber?` · armário ${match.lockerNumber}`:''}</p>}
  </div>;
}
