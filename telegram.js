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

const PDF_FILES = {
  products: 'كتالوج المنتجات مع الفوائد.pdf',
  products_alt: 'ملف المنتجات روعة .pdf',
  financial: 'DXN الخط المالية لشركة .pdf',
  marketing: 'الخطة التسويقية 2026.pdf',
  intro: 'البرنامج التعريفي الشامل ل DXN.pdf',
  price_list: 'قائمة أسعار المنتجات 2026.pdf',
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

async function sendPDF(userId, fileKey, caption, replyToMsgId = null) {
  const pdfDir = path.join(process.cwd(), 'knowledge', 'pdfs');
  const fileName = PDF_FILES[fileKey];
  if (!fileName) return false;
  const filePath = path.join(pdfDir, fileName);
  if (!await fs.pathExists(filePath)) return false;
  try {
    const entity = await getCachedEntity(userId);
    const options = { file: filePath, caption: caption || '📄 ' + fileName };
    if (replyToMsgId) options.replyTo = replyToMsgId;
    await client.sendMessage(entity, options);
    return true;
  } catch (e) { console.error('❌ PDF:', e.message); return false; }
}

async function sendLongMessage(userId, text, replyToMsgId = null) {
  if (!text) return false;
  text = cleanText(text);
  text = formatReply(text);
  if (!text) return false;
  const MAX_LENGTH = 4096;
  let parts = [];
  if (text.length <= MAX_LENGTH) { parts.push(text); } 
  else {
    const lines = text.split('\n');
    let current = '';
    for (const line of lines) {
      if ((current + line).length > MAX_LENGTH && current.length > 0) {
        parts.push(current.trim());
        current = line;
      } else { current += (current ? '\n' : '') + line; }
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
  return `السلام عليكم ورحمة الله وبركاته. أهلاً وسهلاً بك. سعيد بتواصلك معنا.

قبل ما أشرح لك فكرة المشروع، أحب أفهم وضعك أكثر عشان أقدر أقدّم لك معلومات تناسبك.

أول سؤال، إيش هدفك الأساسي من البحث عن الفرصة هذي؟ دخل إضافي؟ مشروع أكبر؟ ولا مجرد استكشاف لمعرفة الخيارات؟

وسؤالي الثاني، هل أنت حالياً موظف، طالب، صاحب عمل، أو ما إيش وضعك الحالي تقريباً؟

وثالث شي، كم ساعة تقريباً تقدر تخصص أسبوعياً لو قررت تبدأ أي مشروع؟

إذا تجاوبني على هذي الأسئلة، بقدّم لك شرح يناسب وضعك بالضبط بدون أي تشتيت. يناسبك؟`;
}

function getPromptMessage() {
  const prompts = ['أي سؤال أو استفسار تفضل، أنا هنا لمساعدتك.', 'كيف يمكنني مساعدتك اليوم؟', 'أخبرني ماذا تريد معرفته عن DXN.'];
  return prompts[Math.floor(Math.random() * prompts.length)];
}

const conversationMemory = new Map();
const lastReplyCache = new Map();
const sentFilesCache = new Map();

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

function hasSentFile(userId, fileType) {
  const userSent = sentFilesCache.get(userId) || {};
  return userSent[fileType] || false;
}
function markFileSent(userId, fileType) {
  const userSent = sentFilesCache.get(userId) || {};
  userSent[fileType] = true;
  sentFilesCache.set(userId, userSent);
}

function isStartupQuery(text) {
  const lower = text.toLowerCase().trim();
  const keywords = [
    'بدء', 'بدا', 'بدأ', 'بداية', 'بدايه', 'ابتداء', 'ابتدأ', 'مبتدأ', 'مبتدئ',
    'انطلاقة', 'انطلاق', 'منطلق', 'البدء', 'البدايه', 'البداية', 'ابدا', 'أبدا',
    'كيف ابدا', 'كيف أبدا', 'كيف ابدأ', 'كيف أبدأ', 'طريقة البدء', 'خطوات البدء',
    'سجل', 'سجلي', 'سجلوا', 'تسجيل', 'تسجلي', 'تسجيلك', 'تسجيله', 'تسجيلهم',
    'اشتراك', 'اشترك', 'اشتركت', 'اشتراكك', 'اشتراكه', 'تسجل', 'تسجّل',
    'انضم', 'انضمام', 'انضمي', 'انضموا', 'الانضمام', 'العضوية', 'عضوية',
    'كيف اسجل', 'كيف أسجل', 'كيف اشترك', 'كيف أشترك', 'طريقة التسجيل',
    'رابط التسجيل', 'رابط الاشتراك', 'رابط العضوية',
    'لقاء', 'لقاءات', 'اجتماع', 'اجتماعات', 'اللقاء', 'الاجتماع',
    'اللقاء الاسبوعي', 'اللقاء التعريفي', 'meet', 'google meet',
    'الاحد', 'الأحد', 'موعد اللقاء', 'رابط اللقاء',
    'بداية المشوار', 'انطلاقك', 'خطوتك الأولى', 'الانطلاقة',
    'التسجيل في DXN', 'الانضمام لـ DXN', 'كيف أكون عضو',
    'أريد التسجيل', 'أرغب بالتسجيل', 'اريد التسجيل',
    'كيفية التسجيل', 'طريقة الاشتراك', 'خطوات الاشتراك'
  ];
  for (const kw of keywords) {
    if (lower.includes(kw)) {
      console.log(`🔍 detected startup keyword: "${kw}"`);
      return true;
    }
  }
  const rootPatterns = [
    /ب[دأا][ءأ]?/,
    /س[جج]ل/,
    /ا[نن]ضم/,
    /ا[شش]ترك/,
    /لق[اء]/,
    /اجتم[اع]/
  ];
  for (const pattern of rootPatterns) {
    if (pattern.test(lower)) {
      console.log(`🔍 detected root pattern: ${pattern}`);
      return true;
    }
  }
  return false;
}

function getStartupReply() {
  return `📘 *كيف تبدأ مع DXN؟*

مرحباً! للانضمام إلى DXN والبدء في تحقيق دخل، الخطوات كالتالي:

1. **التسجيل**: سجل الآن عبر الرابط الرسمي (سيتم إرسال الرابط في رسالة منفصلة).
2. **الدورات التدريبية**: بعد التسجيل، نوفر لك دورات تدريبية مجانية عبر الإنترنت لتعلم أساسيات التسويق الشبكي، وكيفية استخدام المنتجات، وطرق بناء فريقك.
3. **الدعم**: فريقنا يقدم لك متابعة مستمرة عبر مجموعات واتساب وتلغرام، بالإضافة إلى مواد تدريبية مسجلة.
4. **اللقاء التعريفي الأسبوعي**: ندعوك لحضور لقاء عبر Google Meet (سيتم إرسال الرابط في رسالة منفصلة).
5. **البدء بالربح**: ابدأ ببيع المنتجات أو بناء فريق واستفد من العمولات. كلما زاد فريقك، زاد دخلك.

🔹 *للحصول على شرح مفصل يناسب وضعك الخاص، أجب على الأسئلة التي طرحتها سابقاً (هدفك، وضعك الحالي، الوقت المتاح) وسأقدم لك خطة مخصصة.*

📄 *يمكنك أيضاً تحميل الملفات المرفقة لمزيد من المعلومات.*`;
}

function detectPDFRequest(text) {
  const lower = text.toLowerCase();
  if (lower.includes('ارسل الملف') || lower.includes('الملفات') || lower.includes('أرسل الملف') || lower.includes('اعادة ارسال')) {
    return { keys: ['price_list', 'products'], multi: true, forceResend: true };
  }
  if (lower.includes('سعر') || lower.includes('اسعار') || lower.includes('منتج') || lower.includes('المنتجات') || lower.includes('كتالوج') || lower.includes('قائمة') || lower.includes('فوائد')) {
    return { keys: ['price_list', 'products'], multi: true, forceResend: false };
  }
  if (lower.includes('خطة مالية') || lower.includes('الخطة المالية') || lower.includes('مالية') || lower.includes('أرباح')) {
    return { keys: ['financial'], multi: false, forceResend: false };
  }
  if (lower.includes('خطة تسويقية') || lower.includes('الخطة التسويقية') || lower.includes('تسويق')) {
    return { keys: ['marketing'], multi: false, forceResend: false };
  }
  const companyKeywords = ['تعريف', 'الشركة', 'دي اكس ان', 'دي إكس ان', 'dxn', 'برنامج تعريفي', 'عن dxn', 'ما هي dxn', 'ما هو dxn', 'ما هي دي اكس ان', 'ما هو دي اكس ان', 'ما هي شركة', 'ما هو شركة', 'تعرف', 'تعرف على', 'نبذة عن'];
  for (const kw of companyKeywords) {
    if (lower.includes(kw)) return { keys: ['intro'], multi: false, forceResend: false };
  }
  return null;
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

  if (isStartupQuery(question)) {
    console.log(`✅ Startup query detected for user ${userId}`);
    const reply = getStartupReply();
    await sendLongMessage(userId, reply, msgId);
    
    // إرسال الروابط في رسائل منفصلة
    await sendLongMessage(userId, '🔗 *رابط التسجيل الرسمي:*\nhttps://old.eworldglobal.com/s/accreg/ar/145229981');
    await sendLongMessage(userId, '🔗 *رابط اللقاء الأسبوعي:*\nhttps://meet.google.com/bod-qpsj-esg');
    
    if (!hasSentFile(userId, 'intro')) {
      await sendPDF(userId, 'intro', '📄 البرنامج التعريفي الشامل ل DXN', msgId);
      markFileSent(userId, 'intro');
    }
    setLastReply(userId, reply);
    return;
  }

  const pdfRequest = detectPDFRequest(question);
  if (pdfRequest) {
    console.log('📄 طلب ملفات:', pdfRequest.keys);
  }

  let reply = await getFastReply(question, contextStr);
  reply = cleanText(reply);
  reply = reply.replace(/[#*_|~`>+=]/g, '');
  reply = reply.replace(/هذه المعلومات مأخوذة من ملفات DXN/gi, '');
  reply = reply.replace(/^مروان:\s*/gi, '');

  let shouldSendFiles = true;
  let alreadySentMessage = '';

  if (pdfRequest && !pdfRequest.forceResend) {
    const sentPrice = hasSentFile(userId, 'price_list');
    const sentCatalog = hasSentFile(userId, 'products');
    if (sentPrice && sentCatalog) {
      shouldSendFiles = false;
      alreadySentMessage = '\n\n📌 *تم إرسال الملفات مسبقاً. اكتب "أرسل الملف" لإعادة الإرسال.*';
    }
  }

  if (pdfRequest) {
    if (pdfRequest.multi) {
      reply = reply + `\n\n📄 *سأرسل لك ملفين PDF يحتويان على الأسعار والفوائد وأنواع المنتجات.*${alreadySentMessage}`;
    } else {
      reply = reply + `\n\n📄 *سأرسل لك ملفاً يحتوي على تفاصيل أكثر.*${alreadySentMessage}`;
    }
  }

  if (lastReply && reply === lastReply) {
    const alts = ['هل هناك تفاصيل إضافية؟', 'أخبرني ماذا تريد معرفة المزيد عنه.', 'هل لديك أي استفسار آخر؟'];
    reply = alts[Math.floor(Math.random() * alts.length)];
  }

  await sendLongMessage(userId, reply, msgId);

  if (pdfRequest && shouldSendFiles) {
    for (const key of pdfRequest.keys) {
      const caption = pdfRequest.multi ? `📄 ${key === 'price_list' ? 'قائمة الأسعار' : 'كتالوج المنتجات'}` : '📄 الملف';
      await sendPDF(userId, key, caption, msgId);
      markFileSent(userId, key);
    }
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
      if (chatId < 0) return;
      if (!text) text = 'وسائط';
      console.log(`📩 Private chat from ${userId}`);
      console.log(`📝 Raw text: "${text}"`);
      addToMemory(userId, 'user', text);
      if (isGreeting(text)) {
        const greeting = getGreetingReply(text);
        addToMemory(userId, 'assistant', greeting);
        await sendLongMessage(userId, greeting, msg.id);
        return;
      }
      const startTime = Date.now();
      await getReply(userId, text, msg.id);
      console.log(`⚡ Total time: ${Date.now() - startTime}ms`);
    } catch(e) { console.error('Handler error:', e); }
  });
  logger.info('👂 Listening...');
}

export function getClient() { return client; }
export default { initTelegram, getClient };
// إعادة نشر لإصلاح الروابط
