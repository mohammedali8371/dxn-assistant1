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
      if (!event || !event.message) return;
      if (event.message.fromId?.isBot) return;

      let chatId = event.message.chatId || 
                   event.message.peerId?.userId || 
                   event.message.peerId?.chatId || 
                   event.message.peerId?.channelId ||
                   event.message.fromId?.userId ||
                   event.message.chat?.id;

      if (!chatId) {
        console.log('❌ Could not extract chatId');
        return;
      }

      if (chatId < 0) {
        console.log(`⏭️ Skipping group/channel ${chatId}`);
        return;
      }

      console.log(`📩 Private chat from ${chatId}`);

      let text = event.message.text || event.message.message || event.message.rawText || event.message.caption;
      if (!text && event.message.media) {
        text = event.message.media.caption || event.message.media.text || 'وسائط';
      }
      if (!text) {
        console.log('❌ Empty message');
        return;
      }

      console.log(`📝 Text: "${text.substring(0, 30)}..."`);
      await messageHandler(event, client, chatId, text);
    } catch(e) {
      console.error('Handler error:', e);
    }
  });
  logger.info('👂 Listening only in private chats');
}

export function getClient() { 
  if(!client) throw new Error('Client not ready'); 
  return client; 
}

export async function sendMsg(chatId, text) {
  try {
    return await getClient().sendMessage(chatId, { message: text });
  } catch(e) {
    console.error('❌ Send error:', e.message);
    return null;
  }
}

async function messageHandler(event, client, chatId, text) {
  if (text.startsWith('/')) {
    await handleCommand(text, chatId);
    return;
  }

  try {
    const query = `أجب باللغة العربية الفصحى: ${text}`;
    const results = await extra.multiSearch(query);
    let reply = results.find(r => r.answer)?.answer || 'لم أجد إجابة، حاول مرة أخرى.';
    await sendMsg(chatId, reply.slice(0, 4000));
  } catch(e) {
    console.error('AI error:', e);
    await sendMsg(chatId, 'حدث خطأ، حاول مرة أخرى.');
  }
}

async function handleCommand(text, chatId) {
  const cmd = text.split(' ')[0].toLowerCase();
  const args = text.split(' ').slice(1).join(' ');

  try {
    switch(cmd) {
      case '/search': {
        if(!args) return sendMsg(chatId, 'استخدم: /search <سؤالك>');
        const results = await extra.multiSearch(args);
        let reply = '🔍 نتائج البحث:\n';
        for(const r of results) reply += `\n*${r.provider}*: ${r.answer||'❌ '+r.error}`;
        await sendMsg(chatId, reply.slice(0,4000));
        break;
      }
      case '/image': {
        if(!args) return sendMsg(chatId, 'استخدم: /image <وصف>');
        const result = await extra.generateImage(args);
        if(result.success) await sendMsg(chatId, '✅ تم توليد الصورة');
        else await sendMsg(chatId, 'فشل توليد الصورة');
        break;
      }
      case '/models': {
        if(!args) return sendMsg(chatId, 'استخدم: /models <سؤالك>');
        const results = await extra.chatWithModels(args);
        let reply = '🤖 ردود النماذج:\n';
        for(const r of results) reply += `\n*${r.model}*: ${r.answer||'❌ '+r.error}`;
        await sendMsg(chatId, reply.slice(0,4000));
        break;
      }
      case '/voice': {
        if(!args) return sendMsg(chatId, 'استخدم: /voice <نص>');
        const result = await extra.textToSpeech(args);
        if(result.success) await sendMsg(chatId, '🎵 تم تحويل النص');
        else await sendMsg(chatId, 'فشل تحويل النص');
        break;
      }
      default: await sendMsg(chatId, 'الأوامر: /search, /image, /models, /voice');
    }
  } catch(e) {
    console.error(`Command ${cmd} error:`, e);
    await sendMsg(chatId, 'حدث خطأ أثناء تنفيذ الأمر.');
  }
}

export default { initTelegram, getClient, sendMsg };
