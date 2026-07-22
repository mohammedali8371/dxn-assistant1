import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import input from 'input';
import fs from 'fs-extra';
import path from 'path';
import config from './config.js';
import { logger } from './logger.js';
import { User, Knowledge, connectDB, getContext, addMessage } from './database.js';
import { chunkText, cleanText, isDXNRelated, ensureDir, listFiles } from './utils.js';
import { getSystemPrompt } from './config.js';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import xlsx from 'xlsx';
import chokidar from 'chokidar';
import extra from './extra.js';

// ===== المعرفة (بدون OpenAI) =====
const KNOWLEDGE_DIR = path.join(process.cwd(), 'knowledge');
const SUPPORTED = ['.pdf','.docx','.txt','.xlsx'];
ensureDir(KNOWLEDGE_DIR);

async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const buf = await fs.readFile(filePath);
  switch(ext) {
    case '.pdf': return (await pdfParse(buf)).text;
    case '.docx': return (await mammoth.extractRawText({ buffer:buf })).value;
    case '.txt': return buf.toString('utf-8');
    case '.xlsx': {
      const wb = xlsx.read(buf, { type:'buffer' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = xlsx.utils.sheet_to_json(sheet);
      return json.map(r=>Object.values(r).join(' ')).join('\n');
    }
    default: throw new Error(`Unsupported: ${ext}`);
  }
}

export async function processKnowledgeFile(filePath) {
  const name = path.basename(filePath);
  await Knowledge.deleteMany({ sourceFile: name });
  const full = cleanText(await extractText(filePath));
  if(!full.trim()) return 0;
  const chunks = chunkText(full, config.chunkSize);
  if(!chunks.length) return 0;
  // بدون تضمين (بدون OpenAI)
  const docs = chunks.map((c,i) => ({ content:c, embedding:[], sourceFile:name, fileType:path.extname(filePath).replace('.',''), chunkIndex:i, totalChunks:chunks.length }));
  await Knowledge.insertMany(docs);
  logger.info(`✅ ${docs.length} chunks for ${name}`);
  return docs.length;
}

export async function rebuildKnowledge() {
  await Knowledge.deleteMany({});
  const files = await listFiles(KNOWLEDGE_DIR);
  let total=0;
  for(const f of files) { if(SUPPORTED.includes(path.extname(f).toLowerCase())) total += await processKnowledgeFile(f); }
  logger.info(`✅ Knowledge rebuilt: ${total} chunks`);
  return total;
}

export function watchKnowledge() {
  const watcher = chokidar.watch(KNOWLEDGE_DIR, { ignored:/[\/\\]\./, persistent:true, ignoreInitial:true });
  watcher.on('add', async f => { try{ await processKnowledgeFile(f); } catch(e){ logger.errorWithContext('Watch add error',e); } });
  watcher.on('unlink', async f => { const name=path.basename(f); await Knowledge.deleteMany({ sourceFile:name }); logger.info(`🗑️ Removed ${name}`); });
  logger.info('👀 Watching knowledge');
  return watcher;
}

export async function getKnowledgeStats() {
  return { totalChunks: await Knowledge.countDocuments(), totalFiles: (await Knowledge.distinct('sourceFile')).length };
}

// ===== Telegram =====
const SESSION_DIR = path.join(process.cwd(), 'sessions');
ensureDir(SESSION_DIR);
let client = null;
const sessionPath = path.join(SESSION_DIR, 'session.txt');

export async function initTelegram() {
  try {
    let str = '';
    if(await fs.pathExists(sessionPath)) str = await fs.readFile(sessionPath,'utf-8');
    const session = new StringSession(str);
    client = new TelegramClient(session, config.apiId, config.apiHash, { connectionRetries:5, useWSS:true });
    await client.start({
      phoneNumber: async()=>config.phone,
      password: async()=>{ logger.info('🔐 2FA'); return await input.text('Password: '); },
      phoneCode: async()=>{ logger.info('📱 Code sent'); return await input.text('Code: '); },
      onError: (e)=>{ logger.error('Start error: '+e.message); throw e; }
    });
    await fs.writeFile(sessionPath, client.session.save());
    const me = await client.getMe();
    logger.info(`👤 Logged as ${me.firstName}`);
    setupListener();
    return client;
  } catch(e) { logger.errorWithContext('Telegram init failed', e); throw e; }
}

function setupListener() {
  if(!client) throw new Error('No client');
  client.addEventHandler(async (event) => {
    try {
      if(!event.message || event.message.fromId?.isBot) return;
      await messageHandler(event, client);
    } catch(e) { logger.errorWithContext('Handler error', e); }
  });
  logger.info('👂 Listening');
}

export function getClient() { if(!client) throw new Error('Client not ready'); return client; }
export async function sendMsg(chatId, text, opts={}) { return getClient().sendMessage(chatId, { message:text, ...opts }); }
export async function replyMsg(chatId, replyTo, text, opts={}) { return getClient().sendMessage(chatId, { message:text, replyTo, ...opts }); }
export async function sendTyping(chatId) { try { await getClient().sendMessage(chatId, { action:'typing' }); } catch(e){} }

// ===== معالج الرسائل (بدون OpenAI) =====
async function messageHandler(event, client) {
  const msg = event.message;
  const chatId = msg.chatId;
  const userId = msg.fromId?.userId || chatId;
  const msgId = msg.id;

  let user = await User.findOne({ telegramId: userId });
  if (!user) {
    user = new User({ telegramId: userId, username: msg.from?.username||'', firstName: msg.from?.firstName||'', lastName: msg.from?.lastName||'' });
    await user.save();
  }

  let text = msg.text || '';
  if (!text) {
    if (msg.media) text = 'وسائط';
    else if (msg.forwardedFrom) text = 'رسالة معاد توجيهها';
    else return replyMsg(chatId, msgId, 'نوع غير مدعوم');
  }

  await addMessage(user._id, chatId, 'user', text);

  // الأوامر
  if (text.startsWith('/')) {
    await handleCommand(text, chatId, msgId, user._id);
    return;
  }

  // ردود عادية (بدون ذكاء اصطناعي)
  const reply = 'مرحباً! أنا مساعد DXN. استخدم الأوامر التالية:\n/search, /image, /models, /voice';
  await addMessage(user._id, chatId, 'assistant', reply);
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

export default { initTelegram, getClient, sendMsg, replyMsg, sendTyping, processKnowledgeFile, rebuildKnowledge, watchKnowledge, getKnowledgeStats };
