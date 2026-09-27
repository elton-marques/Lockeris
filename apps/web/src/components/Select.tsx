import {useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {Check,ChevronDown} from 'lucide-react';

export type SelectOption={value:string;label:string;disabled?:boolean};

export type MenuPosition={top?:number;bottom?:number;left:number;right?:number;minWidth:number;maxHeight:number};

const menuGap=6,menuEdge=10;

export function placeMenu(trigger:HTMLElement):MenuPosition{
  const rect=trigger.getBoundingClientRect();
  const below=window.innerHeight-rect.bottom-menuGap-menuEdge;
  const above=rect.top-menuGap-menuEdge;
  const openUp=below<170&&above>below;
  const maxHeight=Math.max(150,openUp?above:below);
  const left=Math.max(menuEdge,Math.min(rect.left,window.innerWidth-rect.width-menuEdge));
  const position:MenuPosition=openUp
    ?{bottom:window.innerHeight-rect.top+menuGap,left,minWidth:rect.width,maxHeight}
    :{top:rect.bottom+menuGap,left,minWidth:rect.width,maxHeight};
  if(trigger.closest('.branch-select'))position.right=Math.max(menuEdge,window.innerWidth-rect.right);
  return position;
}

type SelectProps={
  value:string;
  onChange:(value:string)=>void;
  options:SelectOption[];
  ariaLabel:string;
  placeholder?:string;
  className?:string;
  disabled?:boolean;
};

export function Select({value,onChange,options,ariaLabel,placeholder='Selecione',className='',disabled=false}:SelectProps){
  const [open,setOpen]=useState(false),[active,setActive]=useState(0),[position,setPosition]=useState<MenuPosition|null>(null);
  const rootRef=useRef<HTMLDivElement>(null),triggerRef=useRef<HTMLButtonElement>(null),menuRef=useRef<HTMLUListElement>(null);
  const listId=useId();
  const selected=options.find(option=>option.value===value);
  const activeId=`${listId}-option-${active}`;

  useLayoutEffect(()=>{
    if(!open||!position)return;
    const menu=menuRef.current,trigger=triggerRef.current;
    if(!menu||!trigger)return;
    const width=menu.offsetWidth;
    if(!width)return;
    const maxOffset=Math.max(menuEdge,window.innerWidth-width-menuEdge);
    if(position.right!==undefined){
      const right=Math.min(Math.max(position.right,menuEdge),maxOffset);
      if(right!==position.right)setPosition({...position,right});
      return;
    }
    const rect=trigger.getBoundingClientRect();
    const overflows=position.left+width>window.innerWidth-menuEdge;
    const left=Math.min(Math.max(overflows?rect.right-width:position.left,menuEdge),maxOffset);
    if(left!==position.left)setPosition({...position,left});
  },[open,position]);

  function openMenu(){
    if(disabled)return;
    const trigger=triggerRef.current;
    if(trigger)setPosition(placeMenu(trigger));
    const current=options.findIndex(option=>option.value===value);
    setActive(current<0?0:current);
    setOpen(true);
  }
  function close(focus=true){setOpen(false);if(focus)triggerRef.current?.focus();}
  function pick(option:SelectOption){if(option.disabled)return;onChange(option.value);close();}

  useEffect(()=>{
    if(!open)return;
    const onPointer=(event:PointerEvent)=>{if(!rootRef.current?.contains(event.target as Node))setOpen(false);};
    const onScroll=(event:Event)=>{if(!(event.target instanceof Node)||!rootRef.current?.contains(event.target))setOpen(false);};
    const onResize=()=>{const trigger=triggerRef.current;if(trigger)setPosition(placeMenu(trigger));};
    const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'&&rootRef.current?.contains(document.activeElement??null)){event.preventDefault();close();}};
    document.addEventListener('pointerdown',onPointer);
    window.addEventListener('scroll',onScroll,true);
    window.addEventListener('resize',onResize);
    document.addEventListener('keydown',onKey);
    return()=>{
      document.removeEventListener('pointerdown',onPointer);
      window.removeEventListener('scroll',onScroll,true);
      window.removeEventListener('resize',onResize);
      document.removeEventListener('keydown',onKey);
    };
  },[open]);

  function onTriggerKeyDown(event:React.KeyboardEvent<HTMLButtonElement>){
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();
      if(!open){openMenu();return;}
      if(!options.length)return;
      const step=event.key==='ArrowDown'?1:-1;
      setActive(current=>{
        let next=current;
        do{next=(next+step+options.length)%options.length;}while(options[next]?.disabled&&next!==current);
        return next;
      });
      return;
    }
    if(event.key==='Enter'||event.key===' '){
      event.preventDefault();
      if(!open){openMenu();return;}
      const option=options[active];
      if(option)pick(option);
      return;
    }
    if(event.key==='Home'&&open){event.preventDefault();setActive(0);}
    if(event.key==='End'&&open){event.preventDefault();setActive(options.length-1);}
    if(event.key==='Escape'&&open){event.preventDefault();event.stopPropagation();close();return;}
    if(event.key==='Tab')setOpen(false);
  }

  return <div ref={rootRef} className={`select ${className}`.trim()}>
    <button ref={triggerRef} type="button" className="select-trigger" role="combobox" aria-label={ariaLabel}
      aria-expanded={open} aria-haspopup="listbox" aria-controls={open?listId:undefined}
      aria-activedescendant={open&&options.length?activeId:undefined} disabled={disabled}
      onClick={()=>open?setOpen(false):openMenu()} onKeyDown={onTriggerKeyDown}>
      <span className={selected?'select-value':'select-value is-placeholder'}>{selected?.label??placeholder}</span>
      <ChevronDown size={15} className="select-chevron" aria-hidden="true"/>
    </button>
    {open&&<ul id={listId} role="listbox" aria-label={ariaLabel} className="select-menu" ref={menuRef}
      style={{position:'fixed',top:position?.top,bottom:position?.bottom,
        left:position&&position.right===undefined?position.left:undefined,right:position?.right,
        minWidth:position?.minWidth,maxHeight:position?.maxHeight}}>
      {options.length?options.map((option,index)=>
        <li key={option.value} id={`${listId}-option-${index}`} role="option" aria-selected={option.value===value}
          aria-disabled={option.disabled||undefined}
          className={index===active?'select-option active':'select-option'}
          onMouseEnter={()=>setActive(index)} onMouseDown={event=>event.preventDefault()} onClick={()=>pick(option)}>
          <span>{option.label}</span>
          {option.value===value&&<Check size={14} aria-hidden="true"/>}
        </li>):<li className="select-empty">Nenhuma opção disponível</li>}
    </ul>}
  </div>;
}

type SelectFieldProps=Omit<SelectProps,'ariaLabel'>&{label:string};

export function SelectField({label,className='',...props}:SelectFieldProps){
  return <div className={`select-field ${className}`.trim()}>
    <label className="select-field-label">{label}</label>
    <Select {...props} ariaLabel={label}/>
  </div>;
}
