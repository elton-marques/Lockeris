const CACHE='lockeris-shell-v2';
self.addEventListener('install',event=>{event.waitUntil((async()=>{const cache=await caches.open(CACHE);const response=await fetch('/');const html=await response.clone().text();const assets=[...html.matchAll(/(?:src|href)="(\/[^\"]+)"/g)].map(match=>match[1]);await cache.addAll([...new Set(['/',...assets,'/manifest.webmanifest','/icon.svg'])]);})());self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))));self.clients.claim();});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==location.origin||url.pathname.startsWith('/api')) return;
  if(event.request.mode==='navigate') event.respondWith(fetch(event.request).catch(()=>caches.match('/')));
  else event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}return response;})));
});
