const LEGACY_KEY = "fantasy-liga-studio-v1";
const DB_NAME = "FantasyLigaStudioDB";
const DB_VERSION = 1;
const STORE_NAME = "app";
const STATE_KEY = "state";
const LAST_GOOD_STATE_KEY = "state-last-good";
const IMAGE_PREFIX = "media:";



// V37: Große Fanvideos und Audiodateien werden als Blob in IndexedDB gespeichert.
// Im Karriere-Spielstand stehen nur kleine Metadaten/Schlüssel.
const fanMediaUrlCache=new Map();
function fanMediaKey(teamId,kind,id){return `fanmedia:team:${teamId}:${kind}:${id}`;}
async function saveFanMediaBlob(teamId,kind,file){
  const id=`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`;
  const key=fanMediaKey(teamId,kind,id);
  await idbSetKey(key,file);
  return {id,key,kind,name:file.name||kind,type:file.type||"application/octet-stream",size:Number(file.size||0)};
}
async function fanMediaUrl(item){
  if(!item?.key)return "";
  if(fanMediaUrlCache.has(item.key))return fanMediaUrlCache.get(item.key);
  const blob=await idbGetKey(item.key);
  if(!(blob instanceof Blob))return "";
  const url=URL.createObjectURL(blob);fanMediaUrlCache.set(item.key,url);return url;
}
async function deleteFanMediaItem(item){
  if(!item?.key)return;
  const old=fanMediaUrlCache.get(item.key);if(old){URL.revokeObjectURL(old);fanMediaUrlCache.delete(item.key)}
  await idbDeleteKey(item.key);
}
async function cleanupDeletedFanMedia(source){
  // Metadaten werden beim Löschen eines Teams explizit entfernt; diese Funktion bleibt als Erweiterungspunkt.
  return source;
}
let state = null;
let lastSaved = null;
let dbPromise = null;
let saveQueue = Promise.resolve();
let lastCommittedSnapshot = null;
let suppressAutomaticHistory = false;
let lastAutoBackupAt = 0;

const AUTO_BACKUP_PREFIX = "auto-backup-";
const AUTO_BACKUP_META = "auto-backup-meta";
const MAX_AUTO_BACKUPS = 2;
const AUTO_BACKUP_INTERVAL = 20 * 60 * 1000;
const undoStack = [];
const MAX_UNDO = 12;

// Runtime cache: images stay available for rendering, but are no longer copied
// into every career snapshot, undo entry or player save.
const imageMemory = new Map();
const persistedImageMemory = new Map();

function openDB(){
  if(dbPromise) return dbPromise;
  dbPromise = new Promise((resolve,reject)=>{
    if(!("indexedDB" in window)){
      resolve(null);
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if(!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB konnte nicht geöffnet werden"));
  });
  return dbPromise;
}

async function idbGetKey(key){
  const db=await openDB();
  if(!db)return null;
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE_NAME,"readonly");
    const request=tx.objectStore(STORE_NAME).get(key);
    request.onsuccess=()=>resolve(request.result ?? null);
    request.onerror=()=>reject(request.error||new Error("Daten konnten nicht gelesen werden"));
  });
}

async function idbSetKey(key,value){
  const db=await openDB();
  if(!db)throw new Error("IndexedDB ist nicht verfügbar");
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE_NAME,"readwrite");
    tx.objectStore(STORE_NAME).put(value,key);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error||new Error("Daten konnten nicht gespeichert werden"));
    tx.onabort=()=>reject(tx.error||new Error("Speichern wurde abgebrochen"));
  });
}

async function idbDeleteKey(key){
  const db=await openDB();
  if(!db)return;
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE_NAME,"readwrite");
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error||new Error("Daten konnten nicht gelöscht werden"));
  });
}

async function idbClear(){
  const db=await openDB();
  if(!db)return;
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE_NAME,"readwrite");
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error||new Error("Daten konnten nicht gelöscht werden"));
  });
}

function cloneSmall(value){
  return typeof structuredClone==="function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function imageKeysForTeam(team){
  return {
    logo:`${IMAGE_PREFIX}team:${team.id}:logo`,
    stadium:`${IMAGE_PREFIX}team:${team.id}:stadium`
  };
}

function managerImageKey(){ return `${IMAGE_PREFIX}manager:avatar`; }

// Deep-copy all career data while deliberately skipping the large image strings.
// This is the central V26 change: editing one rating no longer clones every stadium.
function snapshotWithoutImages(value){
  if(value===null || typeof value!=="object") return value;
  if(Array.isArray(value)) return value.map(snapshotWithoutImages);
  const out={};
  for(const [key,item] of Object.entries(value)){
    if(key==="logo" && typeof item==="string" && (item.startsWith("data:image/") || item==="")){
      out[key]="";
      continue;
    }
    if(key==="image" && typeof item==="string" && (item.startsWith("data:image/") || item==="")){
      out[key]="";
      continue;
    }
    if(key==="avatar" && typeof item==="string" && (item.startsWith("data:image/") || item==="")){
      out[key]="";
      continue;
    }
    out[key]=snapshotWithoutImages(item);
  }
  return out;
}

function sameState(a,b){
  try{return JSON.stringify(a)===JSON.stringify(b)}catch{return false}
}

function rememberRuntimeImages(source){
  for(const team of source?.teams||[]){
    const keys=imageKeysForTeam(team);
    if(typeof team.logo==="string") imageMemory.set(keys.logo,team.logo);
    if(typeof team.stadium?.image==="string") imageMemory.set(keys.stadium,team.stadium.image);
  }
  if(typeof source?.manager?.avatar==="string") imageMemory.set(managerImageKey(),source.manager.avatar);
}

function hydrateImagesFromMemory(target){
  for(const team of target?.teams||[]){
    const keys=imageKeysForTeam(team);
    team.logo=imageMemory.get(keys.logo)||"";
    team.stadium ||= {};
    team.stadium.image=imageMemory.get(keys.stadium)||"";
  }
  if(target?.manager) target.manager.avatar=imageMemory.get(managerImageKey())||target.manager.avatar||"";
  return target;
}

async function hydrateImagesFromDB(target){
  const jobs=[];
  for(const team of target?.teams||[]){
    const keys=imageKeysForTeam(team);
    jobs.push((async()=>{
      const logo=await idbGetKey(keys.logo);
      const stadium=await idbGetKey(keys.stadium);
      team.logo=typeof logo==="string"?logo:"";
      team.stadium ||= {};
      team.stadium.image=typeof stadium==="string"?stadium:"";
      imageMemory.set(keys.logo,team.logo);
      imageMemory.set(keys.stadium,team.stadium.image);
      persistedImageMemory.set(keys.logo,team.logo);
      persistedImageMemory.set(keys.stadium,team.stadium.image);
    })());
  }
  if(target?.manager){
    jobs.push((async()=>{
      const avatar=await idbGetKey(managerImageKey());
      if(typeof avatar==="string")target.manager.avatar=avatar;
      imageMemory.set(managerImageKey(),target.manager.avatar||"");
      persistedImageMemory.set(managerImageKey(),target.manager.avatar||"");
    })());
  }
  await Promise.all(jobs);
  return target;
}

async function persistChangedImages(source){
  const activeKeys=new Set();
  for(const team of source?.teams||[]){
    const keys=imageKeysForTeam(team);
    const entries=[[keys.logo,team.logo||""],[keys.stadium,team.stadium?.image||""]];
    for(const [key,value] of entries){
      activeKeys.add(key);
      imageMemory.set(key,value);
      if(persistedImageMemory.get(key)===value)continue;
      if(value)await idbSetKey(key,value); else await idbDeleteKey(key);
      persistedImageMemory.set(key,value);
    }
  }
  if(source?.manager){
    const key=managerImageKey(),value=source.manager.avatar||"";
    activeKeys.add(key);
    imageMemory.set(key,value);
    if(persistedImageMemory.get(key)!==value){
      if(value)await idbSetKey(key,value); else await idbDeleteKey(key);
      persistedImageMemory.set(key,value);
    }
  }
  // Remove media belonging to deleted teams from the in-memory maps.
  for(const key of [...imageMemory.keys()]){
    if(key.startsWith(IMAGE_PREFIX+"team:")&&!activeKeys.has(key)){
      imageMemory.delete(key);
      persistedImageMemory.delete(key);
      await idbDeleteKey(key);
    }
  }
}


async function requestPersistentStorage(){
  try{
    if(navigator.storage?.persist) await navigator.storage.persist();
  }catch(error){ console.warn("Dauerhafter Speicher konnte nicht angefordert werden:",error); }
}

async function compactStoredBackups(){
  try{
    const meta=(await idbGetKey(AUTO_BACKUP_META))||{items:[]};
    const items=(meta.items||[]).slice(0,MAX_AUTO_BACKUPS);
    for(const item of items){
      const backup=await idbGetKey(item.key);
      if(backup?.state) await idbSetKey(item.key,{...backup,state:snapshotWithoutImages(backup.state)});
    }
    for(const old of (meta.items||[]).slice(MAX_AUTO_BACKUPS)) await idbDeleteKey(old.key);
    meta.items=items;
    await idbSetKey(AUTO_BACKUP_META,meta);
  }catch(error){ console.warn("Alte Sicherungen konnten nicht bereinigt werden:",error); }
}

function migrateLegacy(){
  try{
    const raw=localStorage.getItem(LEGACY_KEY);
    if(!raw)return null;
    const parsed=JSON.parse(raw);
    localStorage.removeItem(LEGACY_KEY);
    return parsed;
  }catch{return null}
}


async function clearAutomaticBackupsForSpace(){
  try{
    const meta=(await idbGetKey(AUTO_BACKUP_META))||{items:[]};
    for(const item of meta.items||[])await idbDeleteKey(item.key);
    await idbDeleteKey(AUTO_BACKUP_META);
    lastAutoBackupAt=0;
  }catch(error){
    console.warn("Sicherungen konnten nicht für Speicherplatz bereinigt werden:",error);
  }
}

function isQuotaError(error){
  const name=String(error?.name||"");
  const message=String(error?.message||error||"");
  return name==="QuotaExceededError" || /quota|storage|space|speicher/i.test(message);
}

async function writeCareerStateSafely(snapshot){
  try{
    await idbSetKey(STATE_KEY,snapshot);
    await idbSetKey(LAST_GOOD_STATE_KEY,cloneSmall(snapshot));
  }catch(error){
    if(!isQuotaError(error))throw error;
    await clearAutomaticBackupsForSpace();
    await idbSetKey(STATE_KEY,snapshot);
    try{await idbSetKey(LAST_GOOD_STATE_KEY,cloneSmall(snapshot))}catch{}
  }
}

async function loadCareerStateSafely(){
  try{
    const primary=await idbGetKey(STATE_KEY);
    if(primary)return primary;
  }catch(error){
    console.warn("Hauptspielstand konnte nicht gelesen werden:",error);
  }
  try{
    const recovery=await idbGetKey(LAST_GOOD_STATE_KEY);
    if(recovery){
      queueMicrotask(()=>window.dispatchEvent(new CustomEvent("flm:recovered")));
      return recovery;
    }
  }catch(error){
    console.warn("Rettungsspielstand konnte nicht gelesen werden:",error);
  }
  return null;
}

export async function initStore(){
  await requestPersistentStorage();
  state=await loadCareerStateSafely();

  if(!state)state=migrateLegacy();
  if(!state){
    state=await fetch("./seed.json").then(r=>{
      if(!r.ok)throw new Error("Startdaten konnten nicht geladen werden");
      return r.json();
    });
  }

  // One-time migration from V25: capture embedded images before stripping them.
  rememberRuntimeImages(state);
  const hadEmbeddedImages=(state.teams||[]).some(t=>t.logo||t.stadium?.image)||Boolean(state.manager?.avatar);
  if(hadEmbeddedImages){
    await persistChangedImages(state);
    state=snapshotWithoutImages(state);
    hydrateImagesFromMemory(state);
    await writeCareerStateSafely(snapshotWithoutImages(state));
  }else{
    await hydrateImagesFromDB(state);
  }

  await compactStoredBackups();
  lastCommittedSnapshot=snapshotWithoutImages(state);
  try{
    const meta=await idbGetKey(AUTO_BACKUP_META);
    lastAutoBackupAt=Number(meta?.lastAt||0);
  }catch{}
  saveState({skipHistory:true});
  return state;
}

export function getState(){return state}

export function saveState(options={}){
  // No structuredClone of the image-heavy live state.
  const snapshot=snapshotWithoutImages(state);
  const skipHistory=Boolean(options.skipHistory)||suppressAutomaticHistory;

  if(!skipHistory&&lastCommittedSnapshot&&!sameState(lastCommittedSnapshot,snapshot)){
    const previous=undoStack[undoStack.length-1];
    if(!previous||!sameState(previous.snapshot,lastCommittedSnapshot)){
      undoStack.push({label:options.label||"Letzte Änderung",snapshot:cloneSmall(lastCommittedSnapshot)});
      if(undoStack.length>MAX_UNDO)undoStack.shift();
    }
  }

  saveQueue=saveQueue
    .catch(()=>{})
    .then(async()=>{
      if(options.persistMedia) await persistChangedImages(state);
      await writeCareerStateSafely(snapshot);
      const now=Date.now();
      if(now-lastAutoBackupAt>=AUTO_BACKUP_INTERVAL){
        try{
          await createAutomaticBackup(snapshot,now);
          lastAutoBackupAt=now;
        }catch(backupError){
          console.warn("Automatische Sicherung übersprungen:",backupError);
        }
      }
    })
    .then(()=>{
      lastCommittedSnapshot=cloneSmall(snapshot);
      lastSaved=Date.now();
      window.dispatchEvent(new CustomEvent("flm:saved",{detail:{at:lastSaved}}));
      return true;
    })
    .catch(error=>{
      console.error("Speichern fehlgeschlagen:",error);
      window.dispatchEvent(new CustomEvent("flm:save-error",{detail:{message:"Speichern ist fehlgeschlagen. Bitte erneut versuchen oder ein Backup exportieren."}}));
      if(options.throwOnError) throw error;
      return false;
    });

  return saveQueue;
}

async function createAutomaticBackup(snapshot,at=Date.now()){
  const meta=(await idbGetKey(AUTO_BACKUP_META))||{items:[]};
  const key=`${AUTO_BACKUP_PREFIX}${at}`;
  await idbSetKey(key,{at,state:cloneSmall(snapshot)});
  const oldItems=meta.items||[];
  meta.items=[{key,at},...oldItems].slice(0,MAX_AUTO_BACKUPS);
  meta.lastAt=at;
  const keep=new Set(meta.items.map(x=>x.key));
  for(const old of oldItems)if(!keep.has(old.key))await idbDeleteKey(old.key);
  await idbSetKey(AUTO_BACKUP_META,meta);
  window.dispatchEvent(new CustomEvent("flm:auto-backup",{detail:{at}}));
}

export async function createBackupNow(){
  const snapshot=snapshotWithoutImages(state);
  const at=Date.now();
  await createAutomaticBackup(snapshot,at);
  lastAutoBackupAt=at;
  return at;
}

export async function listAutomaticBackups(){
  const meta=(await idbGetKey(AUTO_BACKUP_META))||{items:[]};
  return meta.items||[];
}

export async function restoreLatestAutomaticBackup(){
  const items=await listAutomaticBackups();
  if(!items.length)return false;
  const backup=await idbGetKey(items[0].key);
  if(!backup?.state)return false;
  pushUndo("Backup wiederhergestellt");
  state=hydrateImagesFromMemory(cloneSmall(backup.state));
  suppressAutomaticHistory=true;
  await saveState({skipHistory:true});
  suppressAutomaticHistory=false;
  return backup.at;
}

export function pushUndo(label="Änderung"){
  const clean=snapshotWithoutImages(state);
  const previous=undoStack[undoStack.length-1];
  if(!previous||!sameState(previous.snapshot,clean))undoStack.push({label,snapshot:clean});
  if(undoStack.length>MAX_UNDO)undoStack.shift();
}

export function undoLast(){
  const item=undoStack.pop();
  if(!item)return false;
  state=hydrateImagesFromMemory(cloneSmall(item.snapshot));
  suppressAutomaticHistory=true;
  saveState({skipHistory:true}).finally(()=>{suppressAutomaticHistory=false});
  lastCommittedSnapshot=snapshotWithoutImages(state);
  return item.label;
}

export function getLastSaved(){return lastSaved}

export function setState(next){
  state=next;
  rememberRuntimeImages(state);
  saveState({persistMedia:true});
}

export async function resetState(){
  try{await idbClear()}catch(error){console.warn(error)}
  try{localStorage.removeItem(LEGACY_KEY)}catch{}
  location.reload();
}

export function exportState(){
  // Exports remain complete, including images, so the user retains a portable backup.
  const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download="fantasy-liga-studio-backup-v26.json";
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),500);
}

export async function importState(file){
  const parsed=JSON.parse(await file.text());
  if(!parsed.leagues||!parsed.teams)throw new Error("Ungültiges Backup");
  state=parsed;
  imageMemory.clear();
  persistedImageMemory.clear();
  rememberRuntimeImages(state);
  await saveState({skipHistory:true,persistMedia:true,throwOnError:true});
}
