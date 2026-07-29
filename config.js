import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

console.log('📌 config.js: FIREBASE_KEY =', process.env.FIREBASE_KEY ? 'موجود' : 'مفقود');
console.log('📌 config.js: EXTRA_ACCESS_TOKEN =', process.env.EXTRA_ACCESS_TOKEN ? 'موجود' : 'مفقود');

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
  firebaseKey: process.env.FIREBASE_KEY,
  extraAccessToken: process.env.EXTRA_ACCESS_TOKEN,
  nodeEnv: process.env.NODE_ENV || 'development',
};

export function validateEnv() {
  const required = ['apiId', 'apiHash', 'phone', 'firebaseKey', 'extraAccessToken'];
  const missing = required.filter(key => !config[key]);
  if (missing.length) throw new Error('Missing env: ' + missing.join(', '));
  return true;
}

export function getSystemPrompt() {
  return "أنت مساعد ذكي متخصص في منتجات وخدمات DXN.";
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
