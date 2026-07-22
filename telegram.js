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

      let chatId = null;
      if (event.message.peerId) {
        chatId = event.message.peerId.userId || 
                 event.message.peerId.chatId || 
                 event.message.peerId.channelId;
      }
      if (!chatId && event.message.chatId) chatId = event.message.chatId;
      if (!chatId && event.message.fromId) chatId = event.message.fromId.userId;
      if (!chatId && event.message.chat) chatId = event.message.chat.id;

      if (!chatId) return;
      if (chatId < 0) {
        console.log(`⏭️ Skipping group ${chatId}`);
        return;
      }

      console.log(`📩 Private chat from ${chatId}`);

      let text = null;
      if (event.message.text) text = event.message.text;
      else if (event.message.message) text = event.message.message;
      else if (event.message.rawText) text = event.message.rawText;
      else if (event.message.caption) text = event.message.caption;

      if (!text && event.message.media) {
        if (event.message.media.caption) text = event.message.media.caption;
        else if (event.message.media.text) text = event.message.media.text;
      }
      if (!text && event.message.media) {
        text = 'وسائط';
      }
      if (!text) return;

      console.log(`📝 Text: "${text.substring(0, 30)}..."`);
      await messageHandler(event, client, chatId, text);
    } catch(e) {
      console.error('Handler error:', e);
    }
  });
  logger.info('👂 Listening for private messages');
}

export function getClient() { if(!client) throw new Error('Client not ready'); return client; }

// ✅ إرسال مع محاولة إعادة المحاولة عند فشل 403
export async function sendMsg(chatId, text, opts={}) {
  const c = getClient();
  try {
    return await c.sendMessage(chatId, { message: text, ...opts });
  } catch(e) {
    if (e.message && e.message.includes('403')) {
      console.log('⚠️ 403 error, retrying with different method...');
      // محاولة بديلة: إرسال كـ reply إذا كان هناك replyTo
      if (opts.replyTo) {
        return await c.sendMessage(chatId, { message: text, replyTo: opts.replyTo });
      } else {
        return await c.sendMessage(chatId, { message: text });
      }
    }
    throw e;
  }
}

export async function replyMsg(chatId, replyTo, text, opts={}) {
  return sendMsg(chatId, text, { replyTo, ...opts });
}

async function messageHandler(event, client, chatId, text) {
  const msg = event.message;
  const msgId = msg.id;

  if (text.startsWith('/')) {
    await handleCommand(text, chatId, msgId);
    return;
  }

  try {
    await sendTyping(chatId);
    const results = await extra.multiSearch(text);
    let reply = '🔍 نتائج البحث:\n';
    let found = false;
    for (const r of results) {
      if (r.answer) {
        reply += `\n*${r.provider}*: ${r.answer.substring(0, 800)}`;
        found = true;
        break;
      }
    }
    if (!found) {
      reply = 'عذراً، لم أجد إجابة لسؤالك. جرب /search, /image, /models, /voice';
    }
    await replyMsg(chatId, msgId, reply.slice(0, 4000));
  } catch(e) {
    console.error('AI error:', e);
    // ✅ رسالة ودودة بدون ذكر الذكاء الاصطناعي
    const friendlyError = 'عذراً، واجهت صعوبة في الرد حالياً. حاول مرة أخرى بعد قليل.';
    await replyMsg(chatId, msgId, friendlyError);
  }
}

async function handleCommand(text, chatId, msgId) {
  const parts = text.split(' ');
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1).join(' ');

  try {
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
  } catch(e) {
    console.error(`Command ${cmd} error:`, e);
    // ✅ رسالة ودودة بدون ذكر الذكاء الاصطناعي
    await replyMsg(chatId, msgId, 'عذراً، حدث تأخير في الرد. حاول مرة أخرى.');
  }
}

async function sendTyping(chatId) {
  try {
    await client.sendMessage(chatId, { action: 'typing' });
  } catch(e) {}
}

export default { initTelegram, getClient, sendMsg, replyMsg };
