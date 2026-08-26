const CACHE="fantasy-liga-v631-startfix";
const CORE=["./index.html","./styles.css?v=631","./app.js?v=631","./manifest.webmanifest","./playerUniverse.js","./managerWorld.js","./stabilityCareer.js","./store.js","./ui.js","./standings.js","./fixtures.js","./integrity.js","./icon-192.png","./icon-512.png"];
self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(async cache=>{
    for(const asset of CORE){try{await cache.add(new Request(asset,{cache:"reload"}))}catch(e){console.warn("cache skip",asset)}}
  }));
  self.skipWaiting();
});
self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&k.startsWith("fantasy-liga-")).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  const isAppShell=event.request.mode==="navigate" || /\.(js|css|json|webmanifest)$/.test(url.pathname);
  if(isAppShell){
    event.respondWith(fetch(event.request,{cache:"no-store"}).then(resp=>{
      if(resp && resp.ok){const clone=resp.clone();caches.open(CACHE).then(c=>c.put(event.request,clone));}
      return resp;
    }).catch(()=>caches.match(event.request).then(r=>r||caches.match("./index.html"))));
    return;
  }
  event.respondWith(caches.match(event.request).then(r=>r||fetch(event.request)));
});
