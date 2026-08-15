// ============================================================================
// extra.js — محرك الإجابات الذكية (الـ AI)
// ----------------------------------------------------------------------------
// - مسؤول عن جلب إجابات الأسئلة من خدمات الذكاء الاصطناعي الخارجية
// - chatWithModels: يجرب عدة نماذج بالترتيب ويأخذ أول إجابة ناجحة
// - chatWithChatX: نموذج بديل عبر EXTRA_ACCESS_TOKEN
// - getFirebaseToken: يحصل على توكن Firebase (يستخدمه بعض النماذج)
// - يحتاج من .env: FIREBASE_KEY و EXTRA_ACCESS_TOKEN
// ============================================================================
import axios from 'axios';
import { logger } from './logger.js';
import { generateId } from './config.js';
import * as cheerio from 'cheerio';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const FIREBASE_KEY = process.env.FIREBASE_KEY;
const EXTRA_ACCESS_TOKEN = process.env.EXTRA_ACCESS_TOKEN;

console.log('🔑 extra.js - FIREBASE_KEY:', FIREBASE_KEY ? 'موجود' : 'مفقود');
console.log('🔑 extra.js - EXTRA_ACCESS_TOKEN:', EXTRA_ACCESS_TOKEN ? 'موجود' : 'مفقود');

// ===== multiSearch (مهلة 5 ثوانٍ فقط) =====
let firebaseToken = null, tokenExpiry = 0;
async function getFirebaseToken() {
  if (firebaseToken && Date.now() < tokenExpiry-60000) return firebaseToken;
  if (!FIREBASE_KEY) throw new Error('FIREBASE_KEY missing');
  const resp = await axios.post(
    'https://www.googleapis.com/identitytoolkit/v3/relyingparty/signupNewUser',
    { clientType: 'CLIENT_TYPE_ANDROID' },
    { params: { key: FIREBASE_KEY }, headers: {
      'User-Agent':'Dalvik/2.1.0 (Linux; U; Android 16; 2311DRK48G)',
      'Content-Type':'application/json',
      'X-Android-Package':'com.lmtechstudio.aimultisearch',
      'X-Android-Cert':'5D08264B44E0E53FBCCC70B4F016474CC6C5AB5C'
    }, timeout: 4000 }
  );
  const data = resp.data;
  firebaseToken = 'Bearer '+data.idToken;
  tokenExpiry = Date.now() + parseInt(data.expiresIn)*1000;
  return firebaseToken;
}

const SEARCH_CFG = {
  perplexity: { app_version:'1.2.8', search_id:'825a35c5-aac2-49d7-8317-5b7a68ae6cae' },
  openai: { app_version:'DEV_TEST', search_id:'f0a6705c-e33e-4288-a3ef-c91cd6564b59' },
  deepseek: { app_version:'1.2.8', search_id:'f0a6705c-e33e-4288-a3ef-c91cd6564b59' },
  gemini: { app_version:'1.2.8', search_id:'b2ed082e-5793-4de0-9e42-c8c7fb57b5d5' },
};

export async function multiSearch(query) {
  const token = await getFirebaseToken();
  const results = [];
  for (const [provider, cfg] of Object.entries(SEARCH_CFG)) {
    const payload = { provider, prompt: query, plan:'ULTRA', app_version:cfg.app_version };
    try {
      const resp = await axios.post('https://ai-multi-search-backend-321697147922.europe-west6.run.app/ask', payload, {
        headers: { 'authorization':token, 'x-plan':'ULTRA', 'x-app-version':cfg.app_version, 'x-search-id':cfg.search_id, 'content-type':'application/json' },
        timeout: 5000
      });
      const data = resp.data;
      results.push({ provider, answer: data.ok ? data.answer : null, error: data.ok ? null : data.message });
    } catch(e) { results.push({ provider, answer:null, error:e.message }); }
  }
  return results;
}

// ===== chatWithModels (مهلة 6 ثوانٍ فقط) =====
const MODELS = [
  'openai/gpt-5-mini',
  'google/gemini-2.5-flash-lite',
  'qwen/qwen-coder-32b',
];

export async function chatWithModels(query, systemPrompt = null) {
  if (!EXTRA_ACCESS_TOKEN) throw new Error('EXTRA_ACCESS_TOKEN missing');
  const results = [];
  const headers = {
    'User-Agent':'okhttp/4.12.0',
    'Accept':'text/event-stream',
    'Content-Type':'application/json',
    'x-app-id':'ai-seek',
    'x-access-token':EXTRA_ACCESS_TOKEN,
    'x-device-info':'appIdentifier=ai.chatbot.ask.chat.deep.seek.assistant.search.free;appVersion=2.7.1-26042486;deviceType=android;deviceCountry=EG;local=ar_EG;brand=POCO;model=2311DRK48G'
  };
  const sessionId = '019def83-b582-7410-95dd-b747cc648582';
  const userMsgId = generateId();
  const finalText = systemPrompt ? `${systemPrompt}\n\n${query}` : query;

  for (const model of MODELS) {
    const payload = {
      sessionId,
      userMessageId: userMsgId,
      aiMessageId: generateId(),
      model,
      text: finalText,
      restrictedType: 'FREE_USER',
      sessionType: 'NORMAL'
    };
    try {
      const resp = await axios.post('https://ai-seek.thebetter.ai/v4/chat/send', payload, { headers, responseType:'stream', timeout: 6000 });
      let answer = '';
      await new Promise((res, rej) => {
        const timeout = setTimeout(() => { resp.data.destroy(); rej(new Error('Timeout')); }, 5000);
        resp.data.on('data', chunk => {
          const lines = chunk.toString().split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const j = JSON.parse(line.slice(6));
                if (j.content) answer += j.content;
              } catch(e) {}
            }
          }
        });
        resp.data.on('end', () => { clearTimeout(timeout); res(); });
        resp.data.on('error', (e) => { clearTimeout(timeout); rej(e); });
      });
      results.push({ model, answer: answer.trim() || null, source: 'ai-seek' });
    } catch(e) {
      results.push({ model, answer: null, error: e.message, source: 'ai-seek' });
    }
  }
  return results;
}

// ===== chatWithChatX (سريع) =====
export async function chatWithChatX(query, model = 'gemini') {
  const s = axios.create({ withCredentials: true, timeout: 6000 });
  try {
    const home = await s.get('https://chatx.ai', {
      headers: { 'User-Agent':'Mozilla/5.0 (Linux; Android 10; K) Chrome/139.0.0.0 Mobile Safari/537.36', 'Accept':'text/html', 'sec-ch-ua-mobile':'?1' },
      timeout: 4000
    });
    const $ = cheerio.load(home.data);
    const csrf = $('meta[name="csrf-token"]').attr('content');
    const cookies = home.headers['set-cookie'] || [];
    let xsrf='', laravel='';
    for (const c of cookies) {
      if (c.startsWith('XSRF-TOKEN=')) xsrf = c.split(';')[0].split('=')[1];
      if (c.startsWith('laravel_session=')) laravel = c.split(';')[0].split('=')[1];
    }
    const chatRes = await s.post('https://chatx.ai/openconversions',
      { _token: csrf, id: '45745489', page: '1' },
      { headers: { 'x-csrf-token': csrf, 'x-requested-with':'XMLHttpRequest', 'Cookie': `XSRF-TOKEN=${xsrf}; laravel_session=${laravel}` }, timeout: 4000 }
    );
    const chatId = chatRes.data.chats?.id || '45745489';
    const userId = chatRes.data.chats?.user_id || '406994163226';
    const sendRes = await s.post('https://chatx.ai/sendchat',
      { _token: csrf, user_id: userId, chats_id: chatId, prompt: query, current_model: model, is_web:'0', is_youtube:'0' },
      { headers: { 'x-csrf-token': csrf, 'x-requested-with':'XMLHttpRequest', 'Cookie': `XSRF-TOKEN=${xsrf}; laravel_session=${laravel}` }, timeout: 4000 }
    );
    const convId = sendRes.data.conversions_id;
    const assConvId = sendRes.data.ass_conversions_id;
    const streamRes = await s.get('https://chatx.ai/chats_stream', {
      params: { user_id: userId, chats_id: chatId, current_model: model, conversions_id: convId, ass_conversions_id: assConvId },
      headers: { 'User-Agent':'Mozilla/5.0 (Linux; Android 10; K) Chrome/139.0.0.0 Mobile Safari/537.36', 'Accept':'text/event-stream', 'Cookie': `XSRF-TOKEN=${xsrf}; laravel_session=${laravel}` },
      responseType: 'stream',
      timeout: 5000
    });
    let full = '';
    await new Promise((res, rej) => {
      const timeout = setTimeout(() => { streamRes.data.destroy(); rej(new Error('Timeout')); }, 4000);
      streamRes.data.on('data', chunk => {
        const lines = chunk.toString().split('\n');
        for (const line of lines) {
          if (line && line.startsWith('data: ') && line.slice(6) !== 'end') {
            try {
              const o = JSON.parse(line.slice(6));
              if (o.type === 'response.output_text.delta') full += o.delta || '';
            } catch(e) {}
          }
        }
      });
      streamRes.data.on('end', () => { clearTimeout(timeout); res(); });
      streamRes.data.on('error', (e) => { clearTimeout(timeout); rej(e); });
    });
    return { answer: full.trim(), model, source: 'chatx' };
  } catch(e) {
    return { answer: null, model, source: 'chatx', error: e.message };
  }
}

export async function generateImage(prompt) { throw new Error('Not implemented'); }
export async function textToSpeech(text) { throw new Error('Not implemented'); }

export default { multiSearch, chatWithModels, chatWithChatX, generateImage, textToSpeech };
