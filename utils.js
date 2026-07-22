import fs from 'fs-extra';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import mime from 'mime-types';
import NodeCache from 'node-cache';
import { logger } from './logger.js';
import config from './config.js';

// ===== الملفات =====
export function ensureDir(p) { fs.ensureDirSync(p); return p; }
export function getExt(p) { return path.extname(p).toLowerCase(); }
export function getMime(p) { return mime.lookup(p) || 'application/octet-stream'; }
export function uniqueName(orig) { const e=path.extname(orig); return `${path.basename(orig,e)}-${uuidv4()}${e}`; }
export async function readText(p) { return fs.readFile(p,'utf-8'); }
export async function writeText(p,c) { ensureDir(path.dirname(p)); await fs.writeFile(p,c,'utf-8'); return true; }
export async function deleteFile(p) { if(await fs.pathExists(p)) await fs.unlink(p); return true; }
export async function listFiles(dir, exts=null) {
  const files=await fs.readdir(dir); const r=[];
  for(const f of files) { const full=path.join(dir,f); const stat=await fs.stat(full); if(stat.isFile() && (!exts || exts.includes(getExt(f)))) r.push(full); }
  return r;
}

// ===== النصوص =====
export function chunkText(text, size=config.chunkSize) {
  if(!text) return [];
  const s = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunks=[]; let cur='';
  for(const x of s) { if((cur+x).length>size && cur.length>0) { chunks.push(cur.trim()); cur=x; } else cur+=x; }
  if(cur.trim()) chunks.push(cur.trim());
  return chunks;
}
export function cleanText(t) { return t?t.replace(/\s+/g,' ').replace(/\n+/g,'\n').replace(/\t+/g,' ').trim():''; }
export function truncateText(t, max=100, suffix='...') { if(!t) return ''; return t.length<=max?t:t.substring(0,max)+suffix; }
export function isDXNRelated(t) {
  if(!t) return false;
  const kw = ['dxn','گانوديرما','غانوديرما','ريشي','سبيرولينا','فيتامين','مكمل','صحي','مناعة','طاقة','علاج','وقائي','عضوي','طبيعي','فطر','تخسيس','وزن','كولسترول','سكر','ضغط','مفاصل','بشرة','شعر','أظافر','نوم','توتر','ذاكرة','تركيز','كبد','كلى','قلب','شرايين'];
  return kw.some(k => t.toLowerCase().includes(k));
}

// ===== الكاش =====
let cache=null;
export function initCache(ttl=600) { if(!cache) { cache=new NodeCache({ stdTTL:ttl, checkperiod:120 }); logger.info('✅ Cache ready'); } return cache; }
export function getCache() { if(!cache) return initCache(); return cache; }
export function setCache(k,v,ttl=600) { return getCache().set(k,v,ttl); }
export function getCacheValue(k) { return getCache().get(k); }
export function delCache(k) { return getCache().del(k); }
export function flushCache() { getCache().flushAll(); logger.info('🗑️ Cache flushed'); }
export function getCacheStats() { const c=getCache(); return { keys:c.keys(), size:c.getStats().keys, hits:c.getStats().hits, misses:c.getStats().misses, hitRatio:c.getStats().hits/(c.getStats().hits+c.getStats().misses)||0 }; }

export default { ensureDir, getExt, getMime, uniqueName, readText, writeText, deleteFile, listFiles,
  chunkText, cleanText, truncateText, isDXNRelated,
  initCache, getCache, setCache, getCacheValue, delCache, flushCache, getCacheStats };
