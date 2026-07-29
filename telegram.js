import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import input from 'input';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import MARWAN_PROMPT from './prompts/marwan.js';

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
const entityCache = new Map();

const TELEGRAM_OPTIONS = {
  connectionRetries: 4,
  useWSS: true,
  dc: 1,
  timeout: 12,
};

const PDF_FILES = {
  products: 'كتالوج المنتجات مع الفوائد.pdf',
  financial: 'DXN الخط المالية لشركة .pdf',
  marketing: 'الخطة التسويقية 2026.pdf',
  intro: 'البرنامج التعريفي الشامل ل DXN.pdf',
};

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
  } catch (e) {
    return null;
  }
}

function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF.,?!:;()\-\n]/g, '')
    .trim();
}

function formatReply(text) {
  if (!text) return '';
  text = text.replace(/هذه المعلومات مأخوذة من ملفات DXN/gi, '');
  text = text.replace(/من ملفات DXN/gi, '');
  text = text.replace(/^مروان:\s*/gi, '');
  const lines = text.split('\n');
  let formatted = '';
  let inList = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { inList = false; formatted += '\n'; continue; }
    if (trimmed.length < 40 && !trimmed.match(/^[•\-–—★▪▫◆◇○\d]/) && !trimmed.match(/^[أ-ي]/)) {
      inList = false;
      formatted += '\n*' + trimmed + '*\n';
      continue;
    }
    if (trimmed.match(/^\d+[\.\)]\s*/) || trimmed.match(/^[•\-–—★▪▫◆◇○]\s*/)) {
      inList = true;
      formatted += trimmed + '\n';
      continue;
    }
    if (inList) { inList = false; }
    formatted += trimmed + '\n';
  }
  return formatted.trim();
}

async function sendPDF(userId, fileKey, caption, replyToMsgId = null) {
  const pdfDir = path.join(process.cwd(), 'knowledge', 'pdfs');
  const fileName = PDF_FILES[fileKey];
  if (!fileName) {
    console.log(`⚠️ مفتاح الملف غير صحيح: ${fileKey}`);
    return false;
  }
  const filePath = path.join(pdfDir, fileName);
  if (!await fs.pathExists(filePath)) {
    console.log(`⚠️ الملف غير موجود: ${filePath}`);
    return false;
  }
  try {
    const entity = await getCachedEntity(userId);
    const options = { file: filePath, caption: caption || `📄 ${fileName}` };
    if (replyToMsgId) options.replyTo = replyToMsgId;
    await client.sendMessage(entity, options);
    console.log(`✅ تم إرسال الملف: ${fileName}`);
    return true;
  } catch (e) {
    console.error(`❌ فشل إرسال الملف ${fileName}:`, e.message);
    return false;
  }
}

async function sendLongMessage(userId, text, replyToMsgId = null) {
  if (!text) return false;
  text = cleanText(text);
  text = formatReply(text);
  if (!text) return false;

  const MAX_LENGTH = 4000;
  let parts = [];
  if (text.length <= MAX_LENGTH) {
    parts.push(text);
  } else {
    const paragraphs = text.split(/\n\s*\n/);
    let current = '';
    for (const p of paragraphs) {
      if (p.length > MAX_LENGTH) {
        const sentences = p.split(/(?<=[.!?])\s+/);
        for (const s of sentences) {
          if ((current + s).length > MAX_LENGTH && current.length > 0) {
            parts.push(current.trim());
            current = s;
          } else {
            current += (current ? ' ' : '') + s;
          }
        }
      } else {
        if ((current + p).length > MAX_LENGTH && current.length > 0) {
          parts.push(current.trim());
          current = p;
        } else {
          current += (current ? '\n\n' : '') + p;
        }
      }
    }
    if (current.trim()) parts.push(current.trim());
  }

  const finalParts = [];
  for (let part of parts) {
    while (part.length > MAX_LENGTH) {
      let idx = part.lastIndexOf(' ', MAX_LENGTH);
      if (idx === -1) idx = MAX_LENGTH;
      finalParts.push(part.substring(0, idx).trim());
      part = part.substring(idx).trim();
    }
    if (part) finalParts.push(part);
  }

  console.log(`📨 إرسال ${finalParts.length} جزء (إجمالي ${text.length} حرف)`);
  let sent = false;
  for (let i = 0; i < finalParts.length; i++) {
    const part = finalParts[i];
    const isFirst = (i === 0);
    try {
      const entity = await getCachedEntity(userId);
      const options = { message: part, parse_mode: 'Markdown' };
      if (isFirst && replyToMsgId) options.replyTo = replyToMsgId;
      await client.sendMessage(entity, options);
      console.log(`✅ تم إرسال الجزء ${i+1}/${finalParts.length}`);
      sent = true;
    } catch (e) {
      console.error(`❌ فشل إرسال الجزء ${i+1}:`, e.message);
    }
    if (i < finalParts.length - 1) {
      console.log(`⏳ انتظار 40 ثانية قبل إرسال الجزء التالي...`);
      await new Promise(resolve => setTimeout(resolve, 40000));
    }
  }
  return sent;
}

function normalizeText(text) {
  let normalized = text.normalize('NFKD').replace(/[\u064B-\u065F\u0617-\u061A\u06D6-\u06ED]/g, '');
  normalized = normalized.replace(/[أإآ]/g, 'ا');
  normalized = normalized.replace(/ة/g, 'ه');
  normalized = normalized.replace(/[،؛؟!\.\-\"\']/g, ' ');
  normalized = normalized.replace(/\s+/g, ' ');
  return normalized.trim().toLowerCase();
}

// ===== التحية والتشجيع (رسالتان منفصلتان) =====
function isGreeting(text) {
  const greetings = ['السلام عليكم', 'سلام', 'مرحبا', 'أهلا', 'هلا', 'الو', 'هلو', 'صباح الخير', 'مساء الخير', 'يا هلا', 'هاي', 'كيفك', 'كيف حالك', 'كيف الحال', 'اخبارك', 'شو اخبارك', 'شحالك', 'وشحالك'];
  const normalized = normalizeText(text);
  for (const g of greetings) {
    if (normalized.includes(normalizeText(g))) return true;
  }
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
  if (lower.includes('كيفك') || lower.includes('كيف حالك') || lower.includes('كيف الحال') || lower.includes('شحالك') || lower.includes('وشحالك')) {
    return 'بخير الحمد لله';
  }
  if (lower.includes('اخبارك') || lower.includes('شو اخبارك')) return 'الحمد لله بخير';
  return 'أهلاً بك';
}

function getPromptMessage() {
  const prompts = [
    'أي سؤال أو استفسار تفضل، أنا هنا لمساعدتك.',
    'كيف يمكنني مساعدتك اليوم؟ تفضل بطرح سؤالك.',
    'أخبرني ماذا تريد معرفته عن DXN، سأكون سعيداً بمساعدتك.',
    'تفضل، اسأل عن أي شيء يخص DXN وأنا هنا للإجابة.'
  ];
  return prompts[Math.floor(Math.random() * prompts.length)];
}

const conversationMemory = new Map();
const lastReplyCache = new Map();

function getMemory(userId) {
  if (!conversationMemory.has(userId)) {
    conversationMemory.set(userId, []);
  }
  return conversationMemory.get(userId);
}

function addToMemory(userId, role, content) {
  const mem = getMemory(userId);
  mem.push({ role, content });
  if (mem.length > 25) mem.shift();
}

function getContext(userId) {
  return getMemory(userId).slice(-25);
}

function getLastReply(userId) {
  return lastReplyCache.get(userId) || null;
}
function setLastReply(userId, reply) {
  lastReplyCache.set(userId, reply);
}

function detectPDFRequest(text) {
  const lower = text.toLowerCase();
  if (lower.includes('منتج') || lower.includes('كتالوج') || lower.includes('المنتجات')) {
    return { key: 'products', topic: 'المنتجات' };
  }
  if (lower.includes('خطة مالية') || lower.includes('الخطة المالية') || lower.includes('مالية') || lower.includes('أرباح') || lower.includes('عمولة') || lower.includes('دخل')) {
    return { key: 'financial', topic: 'الخطة المالية' };
  }
  if (lower.includes('خطة تسويقية') || lower.includes('الخطة التسويقية') || lower.includes('تسويق') || lower.includes('استراتيجية')) {
    return { key: 'marketing', topic: 'الخطة التسويقية' };
  }
  const companyKeywords = [
    'تعريف', 'الشركة', 'دي اكس ان', 'دي إكس ان', 'dxn', 'برنامج تعريفي',
    'عن dxn', 'عن دي اكس ان', 'ما هي dxn', 'ما هو dxn',
    'ما هي دي اكس ان', 'ما هو دي اكس ان', 'ما هي شركة', 'ما هو شركة',
    'تعرف', 'تعرف على', 'تعريف بالشركة', 'نبذة عن', 'معلومات عن'
  ];
  for (const kw of companyKeywords) {
    if (lower.includes(kw)) {
      return { key: 'intro', topic: 'شركة DXN' };
    }
  }
  return null;
}

async function getFastReply(question, contextStr) {
  let reply = null;
  try {
    console.log('⚡ Trying chatWithModels (fast)...');
    const results = await extra.chatWithModels(question, MARWAN_PROMPT.replace(/{context}/g, contextStr || 'لا يوجد سياق سابق').replace(/{question}/g, question));
    for (const r of results) {
      if (r.answer && r.answer.trim().length > 0) {
        reply = r.answer;
        console.log(`✅ Got reply from ${r.model}`);
        break;
      }
    }
  } catch (e) {
    console.log('⏳ chatWithModels error:', e.message);
  }
  if (!reply) {
    try {
      console.log('⚡ Trying chatWithChatX (fast)...');
      const result = await extra.chatWithChatX(question, 'gemini');
      if (result.answer && result.answer.trim().length > 0) {
        reply = result.answer;
        console.log('✅ Got reply from ChatX');
      }
    } catch (e) {
      console.log('⏳ chatWithChatX error:', e.message);
    }
  }
  if (!reply) {
    try {
      console.log('⚡ Falling back to multiSearch (fast)...');
      const results = await extra.multiSearch(question);
      for (const r of results) {
        if (r.answer && r.answer.trim().length > 0) {
          reply = r.answer;
          console.log('✅ Got reply from multiSearch');
          break;
        }
      }
    } catch (e) {
      console.log('⏳ multiSearch error:', e.message);
    }
  }
  if (!reply) reply = 'عذراً، لم أستطع معالجة سؤالك حالياً. يرجى إعادة صياغته.';
  return reply;
}

async function getReply(userId, question, msgId) {
  const context = getContext(userId);
  const contextStr = context.map(m => `${m.role}: ${m.content}`).join('\n');
  const lastReply = getLastReply(userId);

  const pdfRequest = detectPDFRequest(question);
  if (pdfRequest) {
    console.log(`📄 تم الكشف عن طلب ملف: ${pdfRequest.topic}`);
  }

  let reply = await getFastReply(question, contextStr);
  reply = cleanText(reply);
  reply = reply.replace(/[#*_|~`>+=]/g, '');
  reply = reply.replace(/هذه المعلومات مأخوذة من ملفات DXN/gi, '');
  reply = reply.replace(/من ملفات DXN/gi, '');
  reply = reply.replace(/وفقاً للمعلومات/gi, '');
  reply = reply.replace(/^مروان:\s*/gi, '');

  if (pdfRequest) {
    reply = reply + `\n\n📄 *سأرسل لك ملفاً يحتوي على تفاصيل أكثر عن ${pdfRequest.topic}. يمكنك الاطلاع عليه للمزيد.*`;
  }

  if (lastReply && reply === lastReply) {
    const alternatives = [
      'هل هناك تفاصيل إضافية تود معرفتها؟',
      'أخبرني ما الذي تريد معرفة المزيد عنه.',
      'هل لديك أي استفسار آخر؟'
    ];
    reply = alternatives[Math.floor(Math.random() * alternatives.length)];
  }

  await sendLongMessage(userId, reply, msgId);

  if (pdfRequest) {
    await sendPDF(userId, pdfRequest.key, `📄 ${pdfRequest.topic}`, msgId);
  }

  setLastReply(userId, reply);
  return null;
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
      if (chatId < 0) {
        console.log(`⏭️ Skipping group ${chatId}`);
        return;
      }
      if (!text) text = 'وسائط';

      console.log(`📩 Private chat from ${userId}`);
      console.log(`📝 Raw text: "${text}"`);

      addToMemory(userId, 'user', text);

      if (isGreeting(text)) {
        // 1. إرسال رد التحية
        const greeting = getGreetingReply(text);
        console.log(`✅ Greeting reply: "${greeting}"`);
        addToMemory(userId, 'assistant', greeting);
        await sendLongMessage(userId, greeting, msg.id);

        // 2. إرسال رسالة التشجيع
        const promptMsg = getPromptMessage();
        console.log(`✅ Prompt message: "${promptMsg}"`);
        addToMemory(userId, 'assistant', promptMsg);
        await sendLongMessage(userId, promptMsg, null); // بدون replyTo

        return;
      }

      const startTime = Date.now();
      console.log('⚡ Getting fast reply...');
      await getReply(userId, text, msg.id);
      console.log(`⚡ Total time: ${Date.now() - startTime}ms`);

    } catch(e) {
      console.error('Handler error:', e);
    }
  });
  logger.info('👂 Listening (ultra fast mode)');
}

export function getClient() { return client; }
export default { initTelegram, getClient };
