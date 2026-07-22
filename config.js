import dotenv from 'dotenv';
dotenv.config();

// ===== الإعدادات =====
export const config = {
  apiId: parseInt(process.env.API_ID, 10),
  apiHash: process.env.API_HASH,
  phone: process.env.PHONE,
  openaiApiKey: process.env.OPENAI_API_KEY,
  mongoUri: process.env.MONGO_URI,
  assistantName: process.env.ASSISTANT_NAME || 'مساعد DXN',
  temperature: parseFloat(process.env.TEMPERATURE) || 0.7,
  topK: parseInt(process.env.TOP_K, 10) || 5,
  chunkSize: parseInt(process.env.CHUNK_SIZE, 10) || 1000,
  dashboardPassword: process.env.DASHBOARD_PASSWORD || 'admin123',
  port: parseInt(process.env.PORT, 10) || 3000,
  firebaseKey: process.env.FIREBASE_KEY || 'AIzaSyA27E7jUV8osRY7NzwP2fZwGoTkp5gJhZw',
  extraAccessToken: process.env.EXTRA_ACCESS_TOKEN || '',
};

export function validateEnv() {
  const required = ['apiId', 'apiHash', 'phone', 'openaiApiKey', 'mongoUri'];
  const missing = required.filter(k => !config[k]);
  if (missing.length) throw new Error(`Missing: ${missing.join(', ')}`);
  return true;
}

// ===== برامبت النظام =====
export function getSystemPrompt() {
  return `
أنت مساعد ذكي متخصص في منتجات وخدمات DXN. اسمك "${config.assistantName}".
- تتحدث باللهجة اليمنية، ودود، محترم.
- لا تذكر أنك ذكاء اصطناعي إلا إذا سُئلت.
- إذا لم تجد المعلومة: "المعلومة هذه غير موجودة عندي حالياً."
- إذا كان السؤال خارج DXN: "أعتذر، اختصاصي يقتصر على المعلومات المتوفرة لدي حول DXN."
- استخدم السياق (آخر 20 رسالة) للرد.
DXN: شركة ماليزية متخصصة في المنتجات الصحية (ريشي، سبيرولينا، فيتامينات).
`;
}

// ===== دوال مساعدة =====
import { randomUUID } from 'crypto';
export function generateId() { return randomUUID(); }
export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
export async function retry(fn, tries=3, delay=1000) {
  let last;
  for (let i=0; i<tries; i++) {
    try { return await fn(); } catch(e) { last=e; if(i<tries-1) await sleep(delay*(i+1)); }
  }
  throw last;
}

export default { config, validateEnv, getSystemPrompt, generateId, sleep, retry };
