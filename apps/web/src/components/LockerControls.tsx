import {useId} from 'react';
import type {LucideIcon} from 'lucide-react';

export type FieldIconType=LucideIcon;

export function FieldIcon({icon:Icon}:{icon:FieldIconType}){
  return <Icon size={14} className="field-glyph" aria-hidden="true"/>;
}

type ToggleSwitchProps={
  label:string;
  checked:boolean;
  onChange:(checked:boolean)=>void;
  disabled?:boolean;
  hint?:string;
};

export function ToggleSwitch({label,checked,onChange,disabled=false,hint}:ToggleSwitchProps){
  const hintId=useId();
  return <div className="toggle-field">
    <label className="toggle">
      <input type="checkbox" role="switch" checked={checked} disabled={disabled}
        aria-describedby={hint?hintId:undefined} onChange={event=>onChange(event.target.checked)}/>
      <span className="toggle-track" aria-hidden="true"><span className="toggle-thumb"/></span>
      <span className="toggle-text">{label}</span>
    </label>
    {hint&&<small className="toggle-hint" id={hintId}>{hint}</small>}
  </div>;
}

export type SegmentOption={value:string;label:string;icon?:FieldIconType};

type SegmentedControlProps={
  label:string;
  value:string;
  options:SegmentOption[];
  onChange:(value:string)=>void;
  disabled?:boolean;
};

export function SegmentedControl({label,value,options,onChange,disabled=false}:SegmentedControlProps){
  const groupId=useId();
  return <div className="segmented-field">
    <span className="segmented-caption" id={groupId}>{label}</span>
    <div className="segmented" role="radiogroup" aria-labelledby={groupId}>
      {options.map(option=>{
        const Icon=option.icon;
        return <label key={option.value} className={option.value===value?'segmented-option selected':'segmented-option'}>
          <input type="radio" name={groupId} value={option.value} checked={option.value===value}
            disabled={disabled} onChange={()=>onChange(option.value)}/>
          {Icon&&<Icon size={14} aria-hidden="true"/>}
          <span>{option.label}</span>
        </label>;})}
    </div>
  </div>;
}
