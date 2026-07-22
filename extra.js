import axios from 'axios';
import { logger } from './logger.js';
import { generateId } from './config.js';
import * as cheerio from 'cheerio';
import fs from 'fs-extra';
import path from 'path';

// ✅ المفتاح مضمن هنا مباشرةً لتجنب أي مشكلة في الاستيراد
const FIREBASE_KEY = 'AIzaSyA27E7jUV8osRY7NzwP2fZwGoTkp5gJhZw';
console.log('✅ extra.js - FIREBASE_KEY embedded (length):', FIREBASE_KEY.length);

// ===== 1. البحث المتعدد =====
let firebaseToken = null, tokenExpiry = 0;
async function getFirebaseToken() {
  if (firebaseToken && Date.now() < tokenExpiry-60000) return firebaseToken;
  
  if (!FIREBASE_KEY) {
    console.error('❌ FIREBASE_KEY is missing!');
    throw new Error('FIREBASE_KEY is missing');
  }
  
  console.log('🔄 Getting Firebase token...');
  const resp = await axios.post(
    'https://www.googleapis.com/identitytoolkit/v3/relyingparty/signupNewUser',
    { clientType: 'CLIENT_TYPE_ANDROID' },
    { 
      params: { key: FIREBASE_KEY },
      headers: {
        'User-Agent':'Dalvik/2.1.0 (Linux; U; Android 16; 2311DRK48G)',
        'Content-Type':'application/json',
        'X-Android-Package':'com.lmtechstudio.aimultisearch',
        'X-Android-Cert':'5D08264B44E0E53FBCCC70B4F016474CC6C5AB5C'
      }
    }
  );
  const data = resp.data;
  firebaseToken = 'Bearer '+data.idToken;
  tokenExpiry = Date.now() + parseInt(data.expiresIn)*1000;
  console.log('✅ Firebase token obtained');
  return firebaseToken;
}

const SEARCH_CFG = {
  perplexity: { app_version:'1.2.8', search_id:'825a35c5-aac2-49d7-8317-5b7a68ae6cae' },
  claude: { app_version:'1.2.8', search_id:'825a35c5-aac2-49d7-8317-5b7a68ae6cae' },
  openai: { app_version:'DEV_TEST', search_id:'f0a6705c-e33e-4288-a3ef-c91cd6564b59' },
  deepseek: { app_version:'1.2.8', search_id:'f0a6705c-e33e-4288-a3ef-c91cd6564b59' },
  gemini: { app_version:'1.2.8', search_id:'b2ed082e-5793-4de0-9e42-c8c7fb57b5d5' },
  llama: { app_version:'1.2.8', search_id:'b2ed082e-5793-4de0-9e42-c8c7fb57b5d5' }
};

export async function multiSearch(query) {
  console.log('🔍 multiSearch called with query:', query.substring(0, 30) + '...');
  const token = await getFirebaseToken();
  console.log('✅ Firebase token ready');
  
  const results = [];
  for (const [provider, cfg] of Object.entries(SEARCH_CFG)) {
    const payload = { provider, prompt: query, plan:'ULTRA', app_version:cfg.app_version };
    try {
      const resp = await axios.post('https://ai-multi-search-backend-321697147922.europe-west6.run.app/ask', payload, {
        headers: { 
          'authorization':token, 
          'x-plan':'ULTRA', 
          'x-app-version':cfg.app_version, 
          'x-search-id':cfg.search_id, 
          'content-type':'application/json' 
        },
        timeout:30000
      });
      const data = resp.data;
      results.push({ provider, answer: data.ok ? data.answer : null, error: data.ok ? null : data.message });
    } catch(e) { 
      results.push({ provider, answer:null, error:e.message }); 
    }
  }
  console.log('✅ multiSearch completed with', results.length, 'results');
  return results;
}

// ===== 2. توليد الصور =====
async function getChatXTokens() {
  const home = await axios.get('https://chatx.ai', {
    headers: { 'User-Agent':'Mozilla/5.0 (Linux; Android 10; K) Chrome/139.0.0.0 Mobile Safari/537.36', 'Accept':'text/html', 'sec-ch-ua-mobile':'?1' }
  });
  const $ = cheerio.load(home.data);
  const csrf = $('meta[name="csrf-token"]').attr('content');
  const cookies = home.headers['set-cookie']||[];
  let xsrf='', laravel='';
  for(const c of cookies) {
    if(c.startsWith('XSRF-TOKEN=')) xsrf = c.split(';')[0].split('=')[1];
    if(c.startsWith('laravel_session=')) laravel = c.split(';')[0].split('=')[1];
  }
  return { csrf, xsrf, laravel };
}

export async function generateImage(prompt) {
  const { csrf, xsrf, laravel } = await getChatXTokens();
  const uid = '406994163' + String(Math.floor(Math.random()*900)+100);
  const cid = '45745' + String(Math.floor(Math.random()*900)+100);
  const payload = { _token:csrf, user_id:uid, chats_id:cid, prompt, current_model:'gpt3', images:'', mask_image:'', image_size:'auto', image_quality:'auto', image_type:'jpeg', image_transparency:'auto', gpt_image_model:'nano', nano_aspect_ratio:'1:1' };
  const resp = await axios.post('https://chatx.ai/generateImage', new URLSearchParams(payload), {
    headers: {
      'User-Agent':'Mozilla/5.0 (Linux; Android 10; K) Chrome/139.0.0.0 Mobile Safari/537.36',
      'x-csrf-token':csrf, 'x-requested-with':'XMLHttpRequest',
      'Cookie':`XSRF-TOKEN=${xsrf}; laravel_session=${laravel}`,
      'Content-Type':'application/x-www-form-urlencoded'
    }
  });
  const data = resp.data;
  if(data.response && data.image_url) {
    const img = await axios.get(data.image_url, { responseType:'arraybuffer' });
    const filename = path.join(process.cwd(), 'media', `${generateId()}.jpg`);
    await fs.ensureDir(path.dirname(filename));
    await fs.writeFile(filename, img.data);
    return { success:true, filePath:filename, url:data.image_url };
  }
  throw new Error('Image generation failed');
}

// ===== 3. محادثة مع نماذج متعددة =====
const MODELS = ['qwen/qwen-coder-32b','openai/gpt-5-mini','deepseek/deepseek-chat','grok/grok-4-fast','qwen/qwen3-32b','google/gemini-2.5-flash-lite'];

export async function chatWithModels(query) {
  if(!process.env.EXTRA_ACCESS_TOKEN) throw new Error('EXTRA_ACCESS_TOKEN missing');
  const results = [];
  const headers = {
    'User-Agent':'okhttp/4.12.0', 'Accept':'text/event-stream', 'Content-Type':'application/json',
    'x-app-id':'ai-seek', 'x-access-token':process.env.EXTRA_ACCESS_TOKEN,
    'x-device-info':'appIdentifier=ai.chatbot.ask.chat.deep.seek.assistant.search.free;appVersion=2.7.1-26042486;deviceType=android;deviceCountry=EG;local=ar_EG;brand=POCO;model=2311DRK48G'
  };
  const sessionId = '019def83-b582-7410-95dd-b747cc648582';
  const userMsgId = generateId();
  for(const model of MODELS) {
    const payload = { sessionId, userMessageId:userMsgId, aiMessageId:generateId(), model, text:query, restrictedType:'FREE_USER', sessionType:'NORMAL' };
    try {
      const resp = await axios.post('https://ai-seek.thebetter.ai/v4/chat/send', payload, { headers, responseType:'stream', timeout:120000 });
      let answer='';
      await new Promise((res,rej) => {
        resp.data.on('data', chunk => {
          const lines = chunk.toString().split('\n');
          for(const line of lines) {
            if(line.startsWith('data: ')) try { const j=JSON.parse(line.slice(6)); if(j.content) answer+=j.content; } catch(e){}
          }
        });
        resp.data.on('end', res);
        resp.data.on('error', rej);
      });
      results.push({ model, answer: answer.trim()||null });
    } catch(e) { results.push({ model, answer:null, error:e.message }); }
  }
  return results;
}

// ===== 4. تحويل النص لصوت =====
export async function textToSpeech(text) {
  const { csrf, xsrf, laravel } = await getChatXTokens();
  const payload = { text, model:'tts-1-hd', voice:'alloy', current_model:'gpt54_mini', response_format:'pcm' };
  const resp = await axios.post('https://chatx.ai/audio_speech', payload, {
    headers: {
      'User-Agent':'Mozilla/5.0 (Linux; Android 10; K) Chrome/147.0.0.0 Mobile Safari/537.36',
      'x-csrf-token':csrf, 'Content-Type':'application/json',
      'Cookie':`XSRF-TOKEN=${xsrf}; laravel_session=${laravel}`
    },
    responseType:'arraybuffer'
  });
  if(resp.status===200 && resp.headers['content-type']?.startsWith('audio/')) {
    const pcm = resp.data;
    const filename = path.join(process.cwd(), 'media', `speech_${Date.now()}.wav`);
    await fs.ensureDir(path.dirname(filename));
    const wav = Buffer.alloc(44);
    wav.write('RIFF',0); wav.writeUInt32LE(36+pcm.length,4); wav.write('WAVE',8);
    wav.write('fmt ',12); wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20);
    wav.writeUInt16LE(1,22); wav.writeUInt32LE(22050,24); wav.writeUInt32LE(22050*2,28);
    wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34); wav.write('data',36); wav.writeUInt32LE(pcm.length,40);
    await fs.writeFile(filename, Buffer.concat([wav, pcm]));
    return { success:true, filePath:filename };
  }
  throw new Error('TTS failed');
}

export default { multiSearch, generateImage, chatWithModels, textToSpeech };
