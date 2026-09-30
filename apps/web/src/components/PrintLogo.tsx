import {useState} from 'react';
import './print-logo.css';

const placeholder='/logo-placeholder.svg';
const customLogo=import.meta.env.VITE_COMPANY_LOGO_URL?.trim() || '/logo-custom.png';

export function PrintLogo(){
  const [src,setSrc]=useState<string|null>(customLogo);
  return <div className="print-logo">
    {src?<img src={src} alt="Logo da empresa" onError={()=>setSrc(src===placeholder?null:placeholder)}/>
      :<span className="print-logo-text">SUA EMPRESA<br/><small>PREVENÇÃO DE PERDAS</small></span>}
  </div>;
}
