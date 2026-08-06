import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import input from 'input';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import MARWAN_PROMPT from './prompts/marwan.js';
import { generatePricePDF } from './rag.js';

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
  connectionRetries: 2,
  useWSS: true,
  dc: 1,
  timeout: 5,
};

// ✅ قائمة ملفات PDF المتاحة
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
  let fileName = PDF_FILES[fileKey];
  if (!fileName) {
    console.log('⚠️ مفتاح الملف غير صحيح:', fileKey);
    return false;
  }
  let filePath = path.join(pdfDir, fileName);
  console.log('📄 محاولة إرسال الملف:', fileName);
  console.log('📂 المسار الكامل:', filePath);

  if (!await fs.pathExists(filePath)) {
    if (fileKey === 'products' || fileKey === 'price_list') {
      console.log('⚠️ الملف غير موجود، سيتم إنشاء ملف ديناميكي.');
      const pdfBytes = await generatePricePDF();
      if (!pdfBytes) {
        console.log('❌ فشل إنشاء ملف PDF ديناميكي');
        return false;
      }
      const tempName = fileKey === 'price_list' ? 'قائمة_أسعار_DXN.pdf' : 'كتالوج_منتجات_DXN.pdf';
      const tempPath = path.join(pdfDir, tempName);
      await fs.writeFile(tempPath, pdfBytes);
      filePath = tempPath;
      fileName = tempName;
    } else {
      console.log('❌ الملف غير موجود ولا يوجد حل احتياطي:', fileKey);
      return false;
    }
  }

  try {
    const entity = await getCachedEntity(userId);
    const options = { file: filePath, caption: caption || '📄 ' + fileName };
    if (replyToMsgId) options.replyTo = replyToMsgId;
    await client.sendMessage(entity, options);
    console.log('✅ تم إرسال الملف:', fileName);
    return true;
  } catch (e) {
    console.error('❌ فشل إرسال الملف:', e.message);
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

  console.log('📨 إرسال', finalParts.length, 'جزء (إجمالي', text.length, 'حرف)');
  let sent = false;
  for (let i = 0; i < finalParts.length; i++) {
    const part = finalParts[i];
    const isFirst = (i === 0);
    try {
      const entity = await getCachedEntity(userId);
      const options = { message: part, parse_mode: 'Markdown' };
      if (isFirst && replyToMsgId) options.replyTo = replyToMsgId;
      await client.sendMessage(entity, options);
      console.log('✅ تم إرسال الجزء', i+1, '/', finalParts.length);
      sent = true;
    } catch (e) {
      console.error('❌ فشل إرسال الجزء', i+1, ':', e.message);
    }
    if (i < finalParts.length - 1) {
      console.log('⏳ انتظار 5 ثوانٍ قبل إرسال الجزء التالي...');
      await new Promise(resolve => setTimeout(resolve, 5000));
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

// ===== دوال التحية والترحيب المخصصة =====
const GREETING_TEMPLATE = `السلام عليكم ورحمة الله وبركاته. أهلاً وسهلاً بك. سعيد بتواصلك معنا.

قبل ما أشرح لك فكرة المشروع، أحب أفهم وضعك أكثر عشان أقدر أقدّم لك معلومات تناسبك.

أول سؤال، إيش هدفك الأساسي من البحث عن الفرصة هذي؟ دخل إضافي؟ مشروع أكبر؟ ولا مجرد استكشاف لمعرفة الخيارات؟

وسؤالي الثاني، هل أنت حالياً موظف، طالب، صاحب عمل، أو ما إيش وضعك الحالي تقريباً؟

وثالث شي، كم ساعة تقريباً تقدر تخصص أسبوعياً لو قررت تبدأ أي مشروع؟

إذا تجاوبني على هذي الأسئلة، بقدّم لك شرح يناسب وضعك بالضبط بدون أي تشتيت. يناسبك؟`;

function isGreeting(text) {
  const greetings = ['السلام عليكم', 'سلام', 'مرحبا', 'أهلا', 'هلا', 'الو', 'هلو', 'صباح الخير', 'مساء الخير', 'يا هلا', 'هاي', 'كيفك', 'كيف حالك', 'كيف الحال', 'اخبارك', 'شو اخبارك', 'شحالك', 'وشحالك'];
  const normalized = normalizeText(text);
  for (const g of greetings) {
    if (normalized.includes(normalizeText(g))) return true;
  }
  return false;
}

function getGreetingReply(text) {
  return GREETING_TEMPLATE;
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
const sentFilesCache = new Map();
const userStateCache = new Map(); // لتتبع مرحلة المحادثة (مثلاً انتظار إجابة الأسئلة)

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

// ===== دوال تتبع الملفات المرسلة =====
function hasSentFile(userId, fileType) {
  const userSent = sentFilesCache.get(userId) || {};
  return userSent[fileType] || false;
}

function markFileSent(userId, fileType) {
  const userSent = sentFilesCache.get(userId) || {};
  userSent[fileType] = true;
  sentFilesCache.set(userId, userSent);
}

function resetFileSent(userId, fileType) {
  const userSent = sentFilesCache.get(userId) || {};
  userSent[fileType] = false;
  sentFilesCache.set(userId, userSent);
}

// ===== كشف طلب الملفات =====
function detectPDFRequest(text) {
  const lower = text.toLowerCase();

  // طلب إعادة إرسال الملفات
  if (lower.includes('ارسل الملف') || lower.includes('الملفات') || lower.includes('أرسل الملف') || lower.includes('اعادة ارسال')) {
    return { keys: ['price_list', 'products'], topic: 'الأسعار والمنتجات', multi: true, forceResend: true };
  }

  // طلب الأسعار أو المنتجات
  if (
    lower.includes('سعر') || lower.includes('اسعار') ||
    lower.includes('منتج') || lower.includes('المنتجات') ||
    lower.includes('كتالوج') || lower.includes('قائمة') ||
    lower.includes('فوائد')
  ) {
    return {
      keys: ['price_list', 'products'],
      topic: 'الأسعار والمنتجات',
      multi: true,
      forceResend: false
    };
  }

  // طلب ملفات منفردة
  if (lower.includes('خطة مالية') || lower.includes('الخطة المالية') || lower.includes('مالية') || lower.includes('أرباح')) {
    return { keys: ['financial'], topic: 'الخطة المالية', multi: false, forceResend: false };
  }
  if (lower.includes('خطة تسويقية') || lower.includes('الخطة التسويقية') || lower.includes('تسويق')) {
    return { keys: ['marketing'], topic: 'الخطة التسويقية', multi: false, forceResend: false };
  }
  const companyKeywords = ['تعريف', 'الشركة', 'دي اكس ان', 'دي إكس ان', 'dxn', 'برنامج تعريفي', 'عن dxn', 'ما هي dxn', 'ما هو dxn', 'ما هي دي اكس ان', 'ما هو دي اكس ان', 'ما هي شركة', 'ما هو شركة', 'تعرف', 'تعرف على', 'نبذة عن'];
  for (const kw of companyKeywords) {
    if (lower.includes(kw)) {
      return { keys: ['intro'], topic: 'شركة DXN', multi: false, forceResend: false };
    }
  }
  return null;
}

// ===== كشف أسئلة البدء والتدريب =====
function isStartupQuery(text) {
  const lower = text.toLowerCase();
  const keywords = ['كيف أبدا', 'كيفية البدء', 'كيف اربح', 'كيف أبدأ', 'بدء', 'البداية', 'التسجيل', 'الدورات', 'تدريب', 'كيف اشترك', 'طريقة الانضمام', 'انضمام', 'عضو'];
  for (const kw of keywords) {
    if (lower.includes(kw)) return true;
  }
  return false;
}

function getStartupReply() {
  return `📘 *كيف تبدأ مع DXN؟*

مرحباً! للانضمام إلى DXN والبدء في تحقيق دخل، الخطوات كالتالي:

1. **التسجيل**: يمكنك التسجيل كعضو عبر موقع DXN الرسمي أو عن طريق أحد الموزعين المعتمدين. ستحتاج إلى تقديم بياناتك واختيار حزمة البداية المناسبة.

2. **الدورات التدريبية**: بعد التسجيل، نوفر لك دورات تدريبية مجانية عبر الإنترنت لتعلم أساسيات التسويق الشبكي، وكيفية استخدام المنتجات، وطرق بناء فريقك.

3. **الدعم**: فريقنا يقدم لك متابعة مستمرة عبر مجموعات واتساب وتلغرام، بالإضافة إلى مواد تدريبية مسجلة.

4. **البدء بالربح**: يمكنك البدء ببيع المنتجات للأصدقاء والمعارف، أو بناء فريق والاستفادة من العمولات. كلما زاد حجم فريقك، زاد دخلها.

🔹 *للحصول على شرح مفصل يناسب وضعك الخاص، يرجى الإجابة على الأسئلة التي طرحتها سابقاً (هدفك، وضعك الحالي، الوقت المتاح) وسأقدم لك خطة مخصصة.*

📄 *يمكنك أيضاً تحميل الملفات التالية لمزيد من المعلومات:*`;

  // يمكن إضافة روابط للملفات إذا رغبت
}

async function getFastReply(question, contextStr) {
  let reply = null;
  try {
    console.log('⚡ Trying chatWithModels (fast)...');
    const results = await extra.chatWithModels(question, MARWAN_PROMPT.replace(/{context}/g, contextStr || 'لا يوجد سياق سابق').replace(/{question}/g, question));
    for (const r of results) {
      if (r.answer && r.answer.trim().length > 0) {
        reply = r.answer;
        console.log('✅ Got reply from', r.model);
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

  // ===== معالجة طلب البدء والتدريب =====
  if (isStartupQuery(question)) {
    let reply = getStartupReply();
    // إضافة نص إضافي من الذكاء الاصطناعي اختياري
    try {
      const aiReply = await getFastReply(question, contextStr);
      if (aiReply && aiReply.length > 20) {
        reply += '\n\n' + aiReply;
      }
    } catch(e) {}
    await sendLongMessage(userId, reply, msgId);
    // إرسال الملفات التعريفية إذا لم ترسل من قبل
    if (!hasSentFile(userId, 'intro')) {
      await sendPDF(userId, 'intro', '📄 البرنامج التعريفي الشامل ل DXN', msgId);
      markFileSent(userId, 'intro');
    }
    setLastReply(userId, reply);
    return;
  }

  // ===== معالجة طلب الملفات (الأسعار والمنتجات) =====
  const pdfRequest = detectPDFRequest(question);
  if (pdfRequest) {
    console.log('📄 تم الكشف عن طلب ملفات:', pdfRequest.topic);
    console.log('🔑 المفاتيح:', pdfRequest.keys);
  }

  // الحصول على الرد العام
  let reply = await getFastReply(question, contextStr);
  reply = cleanText(reply);
  reply = reply.replace(/[#*_|~`>+=]/g, '');
  reply = reply.replace(/هذه المعلومات مأخوذة من ملفات DXN/gi, '');
  reply = reply.replace(/من ملفات DXN/gi, '');
  reply = reply.replace(/وفقاً للمعلومات/gi, '');
  reply = reply.replace(/^مروان:\s*/gi, '');

  // التحقق من الملفات المرسلة مسبقاً
  let shouldSendFiles = true;
  let alreadySentMessage = '';

  if (pdfRequest && !pdfRequest.forceResend) {
    const sentPrice = hasSentFile(userId, 'price_list');
    const sentCatalog = hasSentFile(userId, 'products');
    if (sentPrice && sentCatalog) {
      shouldSendFiles = false;
      alreadySentMessage = '\n\n📌 *تم إرسال الملفات مسبقاً. إذا كنت ترغب في إعادة استلامها، اكتب "أرسل الملف".*';
    }
  }

  if (pdfRequest) {
    if (pdfRequest.multi) {
      reply = reply + `\n\n📄 *سأرسل لك ملفين PDF يحتويان على الأسعار والفوائد وأنواع المنتجات. يمكنك الاطلاع عليهما للمزيد.*${alreadySentMessage}`;
    } else {
      reply = reply + `\n\n📄 *سأرسل لك ملفاً يحتوي على تفاصيل أكثر عن ${pdfRequest.topic}. يمكنك الاطلاع عليه للمزيد.*${alreadySentMessage}`;
    }
  }

  // منع التكرار
  if (lastReply && reply === lastReply) {
    const alternatives = [
      'هل هناك تفاصيل إضافية تود معرفتها؟',
      'أخبرني ما الذي تريد معرفة المزيد عنه.',
      'هل لديك أي استفسار آخر؟'
    ];
    reply = alternatives[Math.floor(Math.random() * alternatives.length)];
  }

  await sendLongMessage(userId, reply, msgId);

  // إرسال الملفات إذا لزم الأمر
  if (pdfRequest && shouldSendFiles) {
    for (const key of pdfRequest.keys) {
      const caption = pdfRequest.multi ? `📄 ${key === 'price_list' ? 'قائمة الأسعار' : 'كتالوج المنتجات'}` : `📄 ${pdfRequest.topic}`;
      const success = await sendPDF(userId, key, caption, msgId);
      if (success) {
        markFileSent(userId, key);
      }
    }
  } else if (pdfRequest && !shouldSendFiles) {
    console.log(`⏭️ تم تخطي إرسال الملفات لأنها أرسلت مسبقاً للمستخدم ${userId}`);
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

      // ===== معالجة التحية =====
      if (isGreeting(text)) {
        const greetingReply = getGreetingReply(text);
        console.log(`✅ Greeting reply sent.`);
        addToMemory(userId, 'assistant', greetingReply);
        await sendLongMessage(userId, greetingReply, msg.id);
        // لا نرسل رسالة إضافية (الترحيب يحتوي على أسئلة)
        return;
      }

      const startTime = Date.now();
      console.log('⚡ Getting reply...');
      await getReply(userId, text, msg.id);
      console.log(`⚡ Total time: ${Date.now() - startTime}ms`);

    } catch(e) {
      console.error('Handler error:', e);
    }
  });
  logger.info('👂 Listening...');
}

export function getClient() { return client; }
export default { initTelegram, getClient };
