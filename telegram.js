import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import input from 'input';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const API_ID = parseInt(process.env.API_ID, 10);
const API_HASH = process.env.API_HASH;
const PHONE = process.env.PHONE;

if (!API_ID || !API_HASH || !PHONE) {
  console.error('❌ API_ID, API_HASH, PHONE must be set in .env');
  process.exit(1);
}

console.log('✅ API_ID:', API_ID);
console.log('✅ API_HASH:', API_HASH);
console.log('✅ PHONE:', PHONE);

import { logger } from './logger.js';
import extra from './extra.js';

// ذاكرة مؤقتة (بدون قاعدة بيانات)
const usersCache = new Map();
const messagesCache = new Map();

function getUser(telegramId) {
  if (!usersCache.has(telegramId)) {
    usersCache.set(telegramId, { 
      _id: telegramId, 
      telegramId, 
      username: '', 
      firstName: '', 
      lastName: ''
    });
  }
  return usersCache.get(telegramId);
}

function addMessage(userId, chatId, role, content) {
  const key = `${userId}_${chatId}`;
  if (!messagesCache.has(key)) messagesCache.set(key, []);
  const msgs = messagesCache.get(key);
  msgs.push({ role, content, timestamp: new Date() });
  if (msgs.length > 20) msgs.shift();
}

const SESSION_DIR = path.join(process.cwd(), 'sessions');
fs.ensureDirSync(SESSION_DIR);
let client = null;

export async function initTelegram() {
  try {
    const sessionString = process.env.SESSION_STRING || '';
    if (!sessionString) console.log('⚠️ No SESSION_STRING, will request code');
    const session = new StringSession(sessionString);
    client = new TelegramClient(session, API_ID, API_HASH, { connectionRetries:5, useWSS:true });
    await client.start({
      phoneNumber: async()=>PHONE,
      password: async()=>{ logger.info('🔐 2FA'); return await input.text('Password: '); },
      phoneCode: async()=>{ logger.info('📱 Code sent'); return await input.text('Code: '); },
      onError: (e)=>{ logger.error('Start error: '+e.message); throw e; }
    });
    await fs.writeFile(path.join(SESSION_DIR, 'session.txt'), client.session.save());
    const me = await client.getMe();
    logger.info(`👤 Logged as ${me.firstName} (${me.id})`);
    setupListener();
    return client;
  } catch(e) { logger.errorWithContext('Telegram init failed', e); throw e; }
}

function setupListener() {
  if(!client) throw new Error('No client');
  client.addEventHandler(async (event) => {
    try {
      if(!event.message) return;
      if(event.message.fromId?.isBot) return;
      console.log(`📩 Received from ${event.message.chatId}`);
      await messageHandler(event, client);
    } catch(e) {
      console.error('Handler error:', e);
    }
  });
  logger.info('👂 Listening');
}

export function getClient() { if(!client) throw new Error('Client not ready'); return client; }
export async function sendMsg(chatId, text, opts={}) { return getClient().sendMessage(chatId, { message:text, ...opts }); }
export async function replyMsg(chatId, replyTo, text, opts={}) { return getClient().sendMessage(chatId, { message:text, replyTo, ...opts }); }

async function messageHandler(event, client) {
  const msg = event.message;
  const chatId = msg.chatId;
  const userId = msg.fromId?.userId || chatId;
  const msgId = msg.id;

  let text = msg.text || '';
  if (!text) {
    if (msg.media) text = 'وسائط';
    else if (msg.forwardedFrom) text = 'رسالة معاد توجيهها';
    else return replyMsg(chatId, msgId, 'نوع غير مدعوم');
  }

  getUser(userId);
  addMessage(userId, chatId, 'user', text);

  if (text.startsWith('/')) {
    await handleCommand(text, chatId, msgId, userId);
    return;
  }

  const reply = 'مرحباً! أنا مساعد DXN. استخدم الأوامر:\n/search, /image, /models, /voice';
  addMessage(userId, chatId, 'assistant', reply);
  await replyMsg(chatId, msgId, reply);
}

async function handleCommand(text, chatId, msgId, userId) {
  const parts = text.split(' ');
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1).join(' ');

  switch(cmd) {
    case '/search': {
      if(!args) return replyMsg(chatId, msgId, 'استخدم: /search <سؤالك>');
      const results = await extra.multiSearch(args);
      let reply = '🔍 نتائج البحث:\n';
      for(const r of results) reply += `\n*${r.provider}*: ${r.answer||'❌ '+r.error}`;
      await replyMsg(chatId, msgId, reply.slice(0,4000));
      break;
    }
    case '/image': {
      if(!args) return replyMsg(chatId, msgId, 'استخدم: /image <وصف>');
      const result = await extra.generateImage(args);
      if(result.success) await sendMsg(chatId, '✅ صورة:', { file: result.filePath });
      else await replyMsg(chatId, msgId, 'فشل توليد الصورة');
      break;
    }
    case '/models': {
      if(!args) return replyMsg(chatId, msgId, 'استخدم: /models <سؤالك>');
      const results = await extra.chatWithModels(args);
      let reply = '🤖 ردود النماذج:\n';
      for(const r of results) reply += `\n*${r.model}*: ${r.answer||'❌ '+r.error}`;
      await replyMsg(chatId, msgId, reply.slice(0,4000));
      break;
    }
    case '/voice': {
      if(!args) return replyMsg(chatId, msgId, 'استخدم: /voice <نص>');
      const result = await extra.textToSpeech(args);
      if(result.success) await sendMsg(chatId, '🎵 صوت:', { file: result.filePath });
      else await replyMsg(chatId, msgId, 'فشل تحويل النص');
      break;
    }
    default: await replyMsg(chatId, msgId, 'الأوامر: /search, /image, /models, /voice');
  }
}

export default { initTelegram, getClient, sendMsg, replyMsg };
