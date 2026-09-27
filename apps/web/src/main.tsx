import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import './style.css';
import './locker-status.css';
import './design-system.css';
import './operational-design.css';
import './locker-drawer.css';
import './theme.css';
import './select.css';
if('serviceWorker' in navigator) void navigator.serviceWorker.getRegistrations().then(registrations=>{
  registrations.filter(item=>item.active?.scriptURL.endsWith('/sw.js')).forEach(item=>{void item.unregister();});
}).catch(()=>{});
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
