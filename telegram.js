import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import input from 'input';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';
import extra from './extra.js';
import * as rag from './rag.js';

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

const SESSION_DIR = path.join(process.cwd(), 'sessions');
fs.ensureDirSync(SESSION_DIR);
let client = null;
const entityCache = new Map();

const TELEGRAM_OPTIONS = { connectionRetries: 2, useWSS: true, dc: 1, timeout: 5 };

async function getCachedEntity(userId) {
  if (entityCache.has(userId)) return entityCache.get(userId);
  try {
    const dialogs = await client.getDialogs();
    for (const dialog of dialogs) {
      if (dialog.entity && dialog.entity.id === userId) {
        entityCache.set(userId, dialog.entity);
        return dialog.entity;
      }
    }
  } catch (e) {}
  try {
    const entity = await client.getEntity(userId);
    entityCache.set(userId, entity);
    return entity;
  } catch (e) { return null; }
}

function cleanText(text) {
  if (!text) return '';
  return text.replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
             .replace(/\s+/g, ' ')
             .replace(/[^\w\s\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF.,?!:;()\-\n]/g, ' ')
             .trim();
}

function formatReply(text) {
  if (!text) return '';
  text = text.replace(/هذه المعلومات مأخوذة من ملفات DXN/gi, '');
  text = text.replace(/من ملفات DXN/gi, '');
  text = text.replace(/^مروان:\s*/gi, '');
  return text.trim();
}

async function sendLongMessage(userId, text, replyToMsgId = null) {
  if (!text) return false;
  text = cleanText(text);
  text = formatReply(text);
  if (!text) return false;
  const MAX_LENGTH = 4000;
  let parts = [];
  if (text.length <= MAX_LENGTH) { parts.push(text); } 
  else {
    const paragraphs = text.split(/\n\s*\n/);
    let current = '';
    for (const p of paragraphs) {
      if ((current + p).length > MAX_LENGTH && current.length > 0) {
        parts.push(current.trim());
        current = p;
      } else { current += (current ? '\n\n' : '') + p; }
    }
    if (current.trim()) parts.push(current.trim());
  }
  let sent = false;
  for (let i = 0; i < parts.length; i++) {
    try {
      const entity = await getCachedEntity(userId);
      const options = { message: parts[i], parse_mode: 'Markdown' };
      if (i === 0 && replyToMsgId) options.replyTo = replyToMsgId;
      await client.sendMessage(entity, options);
      sent = true;
    } catch (e) { console.error('❌ إرسال:', e.message); }
    if (i < parts.length - 1) await new Promise(r => setTimeout(r, 2000));
  }
  return sent;
}

function normalizeText(text) {
  let normalized = text.normalize('NFKD').replace(/[\u064B-\u065F\u0617-\u061A\u06D6-\u06ED]/g, '');
  normalized = normalized.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/[،؛؟!\.\-\"\']/g, ' ');
  normalized = normalized.replace(/\s+/g, ' ');
  return normalized.trim().toLowerCase();
}

function isGreeting(text) {
  const greetings = ['السلام عليكم', 'سلام', 'مرحبا', 'أهلا', 'هلا', 'الو', 'هلو', 'صباح الخير', 'مساء الخير', 'يا هلا', 'هاي', 'كيفك', 'كيف حالك', 'كيف الحال', 'اخبارك', 'شو اخبارك', 'شحالك', 'وشحالك'];
  const normalized = normalizeText(text);
  for (const g of greetings) if (normalized.includes(normalizeText(g))) return true;
  return false;
}

function getGreetingReply(text) {
  const lower = normalizeText(text);
  if (lower.includes('السلام عليكم')) return 'وعليكم السلام ورحمة الله وبركاته';
  if (lower.includes('سلام')) return 'وعليكم السلام';
  if (lower.includes('مرحبا') || lower.includes('أهلا') || lower.includes('هلا')) return 'أهلاً بك';
  if (lower.includes('هاي') || lower.includes('الو') || lower.includes('هلو')) return 'أهلاً';
  if (lower.includes('صباح الخير')) return 'صباح النور';
  if (lower.includes('مساء الخير')) return 'مساء النور';
  if (lower.includes('كيفك') || lower.includes('كيف حالك') || lower.includes('كيف الحال') || lower.includes('شحالك') || lower.includes('وشحالك')) return 'بخير الحمد لله';
  if (lower.includes('اخبارك') || lower.includes('شو اخبارك')) return 'الحمد لله بخير';
  return 'أهلاً بك';
}

function getPromptMessage() {
  const prompts = ['أي سؤال أو استفسار تفضل، أنا هنا لمساعدتك.', 'كيف يمكنني مساعدتك اليوم؟', 'أخبرني ماذا تريد معرفته عن DXN.'];
  return prompts[Math.floor(Math.random() * prompts.length)];
}

const conversationMemory = new Map();
const lastReplyCache = new Map();

function getMemory(userId) {
  if (!conversationMemory.has(userId)) conversationMemory.set(userId, []);
  return conversationMemory.get(userId);
}
function addToMemory(userId, role, content) {
  const mem = getMemory(userId);
  mem.push({ role, content });
  if (mem.length > 25) mem.shift();
}
function getContext(userId) { return getMemory(userId).slice(-25); }
function getLastReply(userId) { return lastReplyCache.get(userId) || null; }
function setLastReply(userId, reply) { lastReplyCache.set(userId, reply); }

function isPriceQuery(text) {
  const keywords = ['سعر', 'اسعار', 'السعر', 'الاسعار', 'ثمن', 'أثمان', 'تكلفة', 'نقاط', 'النقاط', 'P.V', 'pv', 'سعر العضو', 'سعر غير العضو', 'قائمة الأسعار', 'المنتجات', 'منتج'];
  const normalized = normalizeText(text);
  return keywords.some(kw => normalized.includes(normalizeText(kw)));
}

async function handlePriceQuery(userId, question, msgId) {
  let products = await rag.loadPriceList();
  if (!products || products.length === 0) {
    await sendLongMessage(userId, '⚠️ عذراً، لا تتوفر قائمة الأسعار حالياً.', msgId);
    return;
  }
  const results = rag.searchPriceList(question);
  if (!results || results.length === 0) {
    await sendLongMessage(userId, '🔍 لم أجد منتجات تطابق بحثك.', msgId);
    return;
  }

  // 1. إنشاء وإرسال الصورة
  try {
    const imageBuffer = await rag.generatePriceImage(results, question);
    if (imageBuffer) {
      const entity = await getCachedEntity(userId);
      await client.sendMessage(entity, {
        file: imageBuffer,
        caption: `📊 *نتائج البحث عن: "${question}"*`
      });
    } else {
      // بديل: إرسال نص
      let reply = `📊 *نتائج البحث عن: "${question}"*\n\n`;
      for (const p of results) {
        reply += `🔹 *${p.en}*\n   ${p.ar}\n   🟢 العضو: ${p.dp.toFixed(2)}$ | 🔴 غير عضو: ${p.rp.toFixed(2)}$ | ⭐ النقاط: ${p.pv.toFixed(2)} P.V\n\n`;
      }
      await sendLongMessage(userId, reply, msgId);
    }
  } catch (e) {
    console.error('❌ خطأ في الصورة:', e);
    await sendLongMessage(userId, '⚠️ حدث خطأ في إنشاء الصورة، لكن يمكنك الاطلاع على الملف PDF المرفق.', msgId);
  }

  // 2. إرسال رسالة تأكيدية
  await sendLongMessage(userId, `📎 *جاري إرسال ملف PDF الآن لتطلع على القائمة الكاملة...*`);

  // 3. إرسال ملف PDF
  const sent = await rag.sendPriceListPDF(userId, client);
  if (!sent) {
    await sendLongMessage(userId, '⚠️ تعذر إرسال ملف PDF، لكن يمكنك طلب المساعدة من الإدارة.', null);
  }
}

async function getFastReply(question, contextStr) {
  let reply = null;
  try {
    const results = await extra.chatWithModels(question, contextStr);
    for (const r of results) if (r.answer && r.answer.trim()) { reply = r.answer; break; }
  } catch(e) {}
  if (!reply) {
    try { const res = await extra.chatWithChatX(question, 'gemini'); if (res.answer) reply = res.answer; } catch(e) {}
  }
  if (!reply) reply = 'عذراً، لم أستطع معالجة سؤالك حالياً.';
  return reply;
}

async function getReply(userId, question, msgId) {
  const context = getContext(userId);
  const contextStr = context.map(m => `${m.role}: ${m.content}`).join('\n');
  const lastReply = getLastReply(userId);
  if (isPriceQuery(question)) {
    await handlePriceQuery(userId, question, msgId);
    return;
  }
  let reply = await getFastReply(question, contextStr);
  reply = cleanText(reply);
  reply = reply.replace(/[#*_|~`>+=]/g, '');
  reply = reply.replace(/هذه المعلومات مأخوذة من ملفات DXN/gi, '');
  reply = reply.replace(/^مروان:\s*/gi, '');
  if (lastReply && reply === lastReply) {
    const alts = ['هل هناك تفاصيل إضافية؟', 'أخبرني ماذا تريد معرفة المزيد عنه.', 'هل لديك أي استفسار آخر؟'];
    reply = alts[Math.floor(Math.random() * alts.length)];
  }
  await sendLongMessage(userId, reply, msgId);
  setLastReply(userId, reply);
}

export async function initTelegram() {
  try {
    const sessionString = process.env.SESSION_STRING || '';
    const session = new StringSession(sessionString);
    client = new TelegramClient(session, API_ID, API_HASH, TELEGRAM_OPTIONS);
    await client.start({
      phoneNumber: async()=>PHONE,
      password: async()=>{ logger.info('🔐 2FA'); return await input.text('Password: '); },
      phoneCode: async()=>{ logger.info('📱 Code sent'); return await input.text('Code: '); },
      onError: (e)=>{ logger.error('Start error: '+e.message); throw e; }
    });
    await fs.writeFile(path.join(SESSION_DIR, 'session.txt'), client.session.save());
    const me = await client.getMe();
    logger.info(`👤 Logged as ${me.firstName} (${me.id})`);
    await rag.loadPriceList();
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
      const msg = event.message;
      let userId = null, chatId = null, text = null;
      if (event.userId) {
        userId = parseInt(event.userId);
        chatId = userId;
        text = event.message || event.text;
      } else if (msg.chatId) {
        chatId = msg.chatId;
        userId = msg.fromId?.userId || chatId;
        text = msg.text || msg.message;
      } else if (msg.peerId) {
        userId = msg.peerId.userId || msg.peerId.chatId;
        chatId = userId;
        text = msg.text || msg.message;
      } else if (msg.fromId) {
        userId = msg.fromId.userId;
        chatId = userId;
        text = msg.text || msg.message;
      }
      if (!userId || !chatId) return;
      if (chatId < 0) return;
      if (!text) text = 'وسائط';
      console.log(`📩 Private chat from ${userId}`);
      console.log(`📝 Raw text: "${text}"`);
      addToMemory(userId, 'user', text);
      if (isGreeting(text)) {
        const greeting = getGreetingReply(text);
        addToMemory(userId, 'assistant', greeting);
        await sendLongMessage(userId, greeting, msg.id);
        await sendLongMessage(userId, getPromptMessage(), null);
        return;
      }
      const startTime = Date.now();
      await getReply(userId, text, msg.id);
      console.log(`⚡ Total time: ${Date.now() - startTime}ms`);
    } catch(e) { console.error('Handler error:', e); }
  });
  logger.info('👂 Listening for messages');
}

export function getClient() { return client; }
export default { initTelegram, getClient };
