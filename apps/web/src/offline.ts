export type OfflineCopy={issuedAt:string;expiresAt:string;branchId:string;branchName:string;userId:string;deviceId:string;lockers:unknown[];people:unknown[];pending:unknown[]};
function db():Promise<IDBDatabase> {return new Promise((resolve,reject)=>{const request=indexedDB.open('armarios-offline',1);request.onupgradeneeded=()=>request.result.createObjectStore('state');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
async function get<T>(key:string):Promise<T|undefined>{const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction('state','readonly'),request=tx.objectStore('state').get(key);request.onsuccess=()=>resolve(request.result as T);request.onerror=()=>reject(request.error);tx.oncomplete=()=>database.close();});}
async function put(key:string,value:unknown):Promise<void>{const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction('state','readwrite');tx.objectStore('state').put(value,key);tx.oncomplete=()=>{database.close();resolve();};tx.onerror=()=>reject(tx.error);});}
export const loadCopy=()=>get<OfflineCopy>('copy');
export const loadDevice=()=>get<string>('device');
export const saveCopy=(copy:OfflineCopy)=>put('copy',copy);
export const saveDevice=(secret:string)=>put('device',secret);
export async function clearOffline():Promise<void>{const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction('state','readwrite');tx.objectStore('state').delete('copy');tx.oncomplete=()=>{database.close();resolve();};tx.onerror=()=>reject(tx.error);});}
export async function clearAuthorization():Promise<void>{const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction('state','readwrite');tx.objectStore('state').clear();tx.oncomplete=()=>{database.close();resolve();};tx.onerror=()=>reject(tx.error);});}
