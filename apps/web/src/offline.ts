/** Remove apenas as credenciais e a cópia legadas, preservando preferências locais. */
export function purgeOfflineCopy():Promise<void>{
  if(!('indexedDB' in window))return Promise.resolve();
  return new Promise(resolve=>{
    const request=indexedDB.open('armarios-offline',1);
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('state'))request.result.createObjectStore('state');};
    request.onerror=()=>resolve();
    request.onsuccess=()=>{
      const database=request.result;
      if(!database.objectStoreNames.contains('state')){database.close();resolve();return;}
      const tx=database.transaction('state','readwrite');
      tx.objectStore('state').delete('device');tx.objectStore('state').delete('copy');
      tx.oncomplete=tx.onerror=()=>{database.close();resolve();};
    };
  });
}
