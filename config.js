import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

// المفتاح مضمن في الكود مباشرةً لتجنب مشاكل قراءة المتغيرات
const FIREBASE_KEY = 'AIzaSyA27E7jUV8osRY7NzwP2fZwGoTkp5gJhZw';

export const config = {
  apiId: parseInt(process.env.API_ID, 10),
  apiHash: process.env.API_HASH,
  phone: process.env.PHONE,
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  mongoUri: process.env.MONGO_URI,
  assistantName: process.env.ASSISTANT_NAME || 'مساعد DXN',
  temperature: parseFloat(process.env.TEMPERATURE) || 0.7,
  topK: parseInt(process.env.TOP_K, 10) || 5,
  chunkSize: parseInt(process.env.CHUNK_SIZE, 10) || 1000,
  dashboardPassword: process.env.DASHBOARD_PASSWORD || 'admin123',
  port: parseInt(process.env.PORT, 10) || 3000,
  firebaseKey: FIREBASE_KEY,
  extraAccessToken: process.env.EXTRA_ACCESS_TOKEN || '',
  nodeEnv: process.env.NODE_ENV || 'development',
};

console.log('✅ FIREBASE_KEY loaded (length):', config.firebaseKey.length);

export function validateEnv() {
  const required = ['apiId', 'apiHash', 'phone'];
  const missing = required.filter(key => !config[key]);
  if (missing.length) throw new Error('Missing env: ' + missing.join(', '));
  return true;
}

export function getSystemPrompt() {
  return "أنت مساعد ذكي متخصص في منتجات وخدمات DXN. اسمك " + config.assistantName + ".\n" +
    "- تتحدث باللهجة اليمنية، ودود، محترم.\n" +
    "- لا تذكر أنك ذكاء اصطناعي إلا إذا سُئلت.\n" +
    "- إذا لم تجد المعلومة: 'المعلومة هذه غير موجودة عندي حالياً.'\n" +
    "- إذا كان السؤال خارج DXN: 'أعتذر، اختصاصي يقتصر على المعلومات المتوفرة لدي حول DXN.'\n" +
    "- استخدم السياق (آخر 20 رسالة) للرد.\n" +
    "DXN: شركة ماليزية متخصصة في المنتجات الصحية (ريشي، سبيرولينا، فيتامينات).";
}

export function generateId() { return randomUUID(); }
export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
export async function retry(fn, tries, delay) {
  tries = tries || 3;
  delay = delay || 1000;
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch(e) { last = e; if (i < tries - 1) await sleep(delay * (i + 1)); }
  }
  throw last;
}

export default { config, validateEnv, getSystemPrompt, generateId, sleep, retry };
