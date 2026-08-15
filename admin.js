import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { NewMessage } from 'telegram/events/index.js';
import { CallbackQuery } from 'telegram/events/CallbackQuery.js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';
import { getConfig, saveConfig, isAdmin, addAdmin, removeAdmin } from './configStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const API_ID = parseInt(process.env.API_ID, 10);
const API_HASH = process.env.API_HASH;
const ADMIN_BOT_TOKEN = process.env.ADMIN_BOT_TOKEN;

const TELEGRAM_OPTIONS = { connectionRetries: 2, useWSS: true, timeout: 5 };

let client = null;
const pendingEdit = new Map(); // userId -> field name being edited
let lastSeen = { userId: null, text: null, at: null, isAdmin: null };
let connState = { ok: false, error: null, connectedAt: null };

// ========== أدوات ==========
function truncate(text, max) {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + '…' : text;
}

function btnRow(text, data) {
  return new Api.KeyboardButtonCallback({ text, data: Buffer.from(data) });
}

// ========== بناء القوائم ==========
function buildMainMenu() {
  const cfg = getConfig();
  return {
    message: `🎛️ *لوحة تحكم DXN Assistant*

أهلاً بك في لوحة تحكم البوت 👋

اختر من الأزرار أدناه:

🎨 *الشخصية والردود* — تعديل كيف يرد البوت
📝 *الرسائل* — تعديل نصوص الردود الثابتة
👮 *الأدمنز* — إدارة المطورين
⚙️ *الإعدادات* — تفعيل وضع DXN فقط
🗂️ *الملفات* — عرض وتعديل ملفات الكود

📊 *الحالة:* ${cfg.dxnOnly ? '🟢 وضع DXN فقط مفعّل' : '🔴 وضع مفتوح'}`, 
    buttons: [
      [btnRow('🎨 الشخصية والردود', 'menu:personality')],
      [btnRow('📝 تعديل الرسائل', 'menu:messages')],
      [btnRow('👮 إدارة الأدمنز', 'menu:admins')],
      [btnRow('⚙️ الإعدادات', 'menu:settings')],
      [btnRow('🗂️ الملفات', 'menu:files')],
      [btnRow('📊 حالة البوت', 'menu:status')]
    ]
  };
}

function buildPersonalityMenu() {
  const cfg = getConfig();
  return {
    message: `🎨 *الشخصية والردود*

📌 *الشخصية الحالية:*
${truncate(cfg.personalityPrompt, 400)}

اختر ما تريد تعديله:`,
    buttons: [
      [btnRow('🤖 تعديل الشخصية', 'edit:personality')],
      [btnRow('👋 الرد على "كيف حالك"', 'edit:howAreYou')],
      [btnRow('🔙 رجوع', 'menu:main')]
    ]
  };
}

function buildMessagesMenu() {
  const cfg = getConfig();
  return {
    message: `📝 *تعديل الرسائل الثابتة*

📘 *رسالة البداية (كيف تبدأ مع DXN):*
${truncate(cfg.startupText, 150)}

👋 *رسالة الترحيب الأولى:*
${truncate(cfg.greetingText, 120)}

😊 *رد الترحيب المختصر:*
${truncate(cfg.simpleGreetingText, 80)}

🚫 *الرد على الأسئلة غير المرتبطة بـ DXN:*
${truncate(cfg.nonDxnReply, 80)}

اختر الرسالة لتعديلها:`,
    buttons: [
      [btnRow('📘 رسالة البداية', 'edit:startupText')],
      [btnRow('👋 رسالة الترحيب الأولى', 'edit:greetingText')],
      [btnRow('😊 الترحيب المختصر', 'edit:simpleGreetingText')],
      [btnRow('🚫 رد غير المرتبط بـ DXN', 'edit:nonDxnReply')],
      [btnRow('🔙 رجوع', 'menu:main')]
    ]
  };
}

function buildAdminsMenu() {
  const cfg = getConfig();
  const adminList = cfg.admins.length
    ? cfg.admins.map(a => `• \`${a}\``).join('\n')
    : 'لا يوجد أدمنز';
  return {
    message: `👮 *إدارة الأدمنز*

الأدمنز الحاليون:
${adminList}

لإضافة أدمن جديد: اضغط الزر وأرسل رقم ID للمطور لرفعه.
لإزالة أدمن: اضغط إزالة وأرسل رقم ID.`,
    buttons: [
      [btnRow('➕ إضافة أدمن', 'addadmin')],
      [btnRow('➖ إزالة أدمن', 'deladmin')],
      [btnRow('🔙 رجوع', 'menu:main')]
    ]
  };
}

function buildSettingsMenu() {
  const cfg = getConfig();
  return {
    message: `⚙️ *الإعدادات*

🔒 *وضع DXN فقط:* ${cfg.dxnOnly ? '🟢 مفعّل (يرد على أسئلة DXN فقط)' : '🔴 مفتوح (يرد على كل شيء)'}

عند تفعيله، أي سؤال غير مرتبط بـ DXN يحصل على رد التحويل التالي:
"${truncate(cfg.nonDxnReply, 80)}"`,
    buttons: [
      [btnRow(cfg.dxnOnly ? '🔴 تعطيل وضع DXN فقط' : '🟢 تفعيل وضع DXN فقط', 'toggle:dxnOnly')],
      [btnRow('🔙 رجوع', 'menu:main')]
    ]
  };
}

function buildStatusMenu() {
  const cfg = getConfig();
  return {
    message: `📊 *حالة البوت*

🟢 البوت الرئيسي: يعمل
🎛️ لوحة التحكم: متصلة
🔒 وضع DXN فقط: ${cfg.dxnOnly ? 'مفعّل' : 'معطّل'}
👮 عدد الأدمنز: ${cfg.admins.length}
💬 محادثات في الذاكرة: تعمل

*الروابط:*
📱 [تيليجرام](https://t.me/k_i_i8) • 📞 [واتساب](https://wa.me/967776383577)`,
    buttons: [
      [btnRow('🔄 تحديث الحالة', 'menu:status')],
      [btnRow('🔙 رجوع', 'menu:main')]
    ]
  };
}

// ========== الملفات ==========
const EXCLUDE_DIRS = ['node_modules', '.git', '.gitlab', 'sessions', 'tmp'];
const EDITABLE_EXT = ['.js', '.json', '.mjs', '.cjs', '.md', '.txt', '.env', '.yml', '.yaml', '.render', '.config'];

function getProjectFiles() {
  const root = path.resolve(__dirname);
  const files = [];
  const walk = (dir, depth) => {
    if (depth > 3) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const ent of entries) {
      if (ent.name.startsWith('.')) continue;
      if (ent.isDirectory()) {
        if (EXCLUDE_DIRS.includes(ent.name)) continue;
        walk(path.join(dir, ent.name), depth + 1);
      } else if (ent.isFile()) {
        const ext = path.extname(ent.name).toLowerCase();
        if (EDITABLE_EXT.includes(ext)) files.push(path.relative(root, path.join(dir, ent.name)).split(path.sep).join('/'));
      }
    }
  };
  walk(root, 0);
  return files;
}

function buildFilesMenu() {
  const files = getProjectFiles();
  const list = files.length
    ? files.map((f, i) => `${i + 1}. \`${f}\``).join('\n')
    : 'لا توجد ملفات قابلة للتعديل';
  const buttons = [];
  const perRow = 3;
  for (let i = 0; i < files.length; i += perRow) {
    buttons.push(files.slice(i, i + perRow).map((f, j) => btnRow(String(i + j + 1), `file:view:${files[i + j]}`)));
  }
  buttons.push([btnRow('🔙 رجوع', 'menu:main')]);
  return {
    message: `🗂️ *الملفات*

الملفات القابلة للتعديل (حتى ملفات الكود):
${list}

اضغط على رقم الملف لعرضه وتعديله.`,
    buttons
  };
}

async function showFileContent(userId, fileRel, msgId = null) {
  const filePath = path.join(__dirname, fileRel);
  if (!fs.existsSync(filePath)) {
    await client.sendMessage(userId, { message: `❌ الملف \`${fileRel}\` غير موجود.`, parse_mode: 'Markdown' });
    return;
  }
  let content;
  try { content = fs.readFileSync(filePath, 'utf8'); } catch (e) { content = '⚠️ تعذر قراءة الملف: ' + e.message; }
  const preview = truncate(content, 900);
  const fileButtons = [
    [btnRow('✏️ تعديل', `file:edit:${fileRel}`)],
    [btnRow('📋 عرض كامل', `file:viewfull:${fileRel}`)],
    [btnRow('🔙 الملفات', 'menu:files')]
  ];
  const entity = await client.getEntity(userId);
  if (msgId) {
    try {
      await client.editMessage(entity, { message: msgId, text: `🗂️ *${fileRel}* (${content.length} حرف)\n\n\`\`\`\n${truncate(preview, 2500)}\n\`\`\``, parse_mode: 'Markdown', buttons: fileButtons });
      return;
    } catch (e) {}
  }
  await client.sendMessage(entity, {
    message: `🗂️ *${fileRel}* (${content.length} حرف)\n\n\`\`\`\n${preview}\n\`\`\``,
    parse_mode: 'Markdown',
    buttons: fileButtons
  });
}

function buildMenu(id) {
  switch (id) {
    case 'personality': return buildPersonalityMenu();
    case 'messages': return buildMessagesMenu();
    case 'admins': return buildAdminsMenu();
    case 'settings': return buildSettingsMenu();
    case 'status': return buildStatusMenu();
    case 'files': return buildFilesMenu();
    default: return buildMainMenu();
  }
}

async function showMenu(userId, menuId, msgId = null) {
  const menu = buildMenu(menuId);
  const entity = await client.getEntity(userId);
  if (msgId) {
    try {
      await client.editMessage(entity, { message: msgId, text: menu.message, parse_mode: 'Markdown', buttons: menu.buttons });
      return msgId;
    } catch (e) {}
  }
  const sent = await client.sendMessage(entity, {
    message: menu.message,
    parse_mode: 'Markdown',
    buttons: menu.buttons
  });
  return sent.id;
}

const fieldLabels = {
  personality: 'الشخصية',
  howAreYou: 'ردود "كيف حالك"',
  startupText: 'رسالة البداية',
  greetingText: 'رسالة الترحيب الأولى',
  simpleGreetingText: 'الترحيب المختصر',
  nonDxnReply: 'الرد غير المرتبط بـ DXN'
};

// ========== معالج الأزرار ==========
async function handleCallback(event) {
  try {
    if (!event || !event.query) return;
    const userId = event.query.userId ? parseInt(event.query.userId) : null;
    if (!userId) return;
    if (!isAdmin(userId)) {
      try {
        await event.answer({ message: 'غير مصرح', alert: false });
      } catch (e) {}
      return;
    }
    const data = event.query.data ? Buffer.from(event.query.data).toString() : '';
    const msgId = event.messageId || null;

    if (data.startsWith('menu:')) {
      await showMenu(userId, data.split(':')[1], msgId);
    } else if (data.startsWith('file:view:')) {
      const fileRel = data.slice('file:view:'.length);
      await showFileContent(userId, fileRel, msgId);
    } else if (data.startsWith('file:viewfull:')) {
      const fileRel = data.slice('file:viewfull:'.length);
      const filePath = path.join(__dirname, fileRel);
      const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '⚠️ غير موجود';
      const parts = [];
      for (let i = 0; i < content.length; i += 3500) parts.push(content.slice(i, i + 3500));
      for (const part of parts) {
        await client.sendMessage(userId, { message: part, parse_mode: 'Markdown' });
      }
    } else if (data.startsWith('file:edit:')) {
      const fileRel = data.slice('file:edit:'.length);
      pendingEdit.set(userId, `file:${fileRel}`);
      await client.editMessage(await client.getEntity(userId), {
        message: msgId, text: `✏️ *تعديل ${fileRel}*\n\nأرسل المحتوى الجديد كاملاً. اضغط "رجوع" للإلغاء.`, parse_mode: 'Markdown'
      });
    } else if (data.startsWith('edit:')) {
      const field = data.split(':')[1];
      pendingEdit.set(userId, field);
      const hint = field === 'howAreYou'
        ? 'اكتب الردود، كل رد في سطر منفصل، ثم أرسلها.'
        : 'اكتب النص الجديد ثم أرسله. (يدعم Markdown)';
      await client.editMessage(await client.getEntity(userId), {
        message: msgId, text: `✏️ *تعديل ${fieldLabels[field] || field}*\n\n${hint}`, parse_mode: 'Markdown'
      });
    } else if (data === 'addadmin') {
      pendingEdit.set(userId, 'addAdmin');
      await client.editMessage(await client.getEntity(userId), {
        message: msgId, text: '👮 *إضافة أدمن*\n\nأرسل رقم ID الخاص بالمطور الجديد.', parse_mode: 'Markdown'
      });
    } else if (data === 'deladmin') {
      pendingEdit.set(userId, 'delAdmin');
      await client.editMessage(await client.getEntity(userId), {
        message: msgId, text: '➖ *إزالة أدمن*\n\nأرسل رقم ID الذي تريد إزالته.', parse_mode: 'Markdown'
      });
    } else if (data === 'toggle:dxnOnly') {
      const cfg = getConfig();
      saveConfig({ dxnOnly: !cfg.dxnOnly });
      await showMenu(userId, 'settings', msgId);
    }
  } catch (e) {
    console.error('❌ Admin callback:', e.message);
  }
}

// ========== معالج الرسائل ==========
async function handleMessage(event) {
  try {
    if (!event || !event.message) return;
    const msg = event.message;
    const userId = msg.senderId ? parseInt(msg.senderId) : null;
    const text = typeof msg.text === 'string' ? msg.text : (typeof msg.message === 'string' ? msg.message : null);
    if (!userId) return;
    if (!text) return;

    lastSeen = { userId, text: text.slice(0, 80), at: new Date().toISOString(), isAdmin: isAdmin(userId) };
    console.log(`👀 Admin bot msg from ${userId} (${isAdmin(userId) ? 'ADMIN' : 'NOT-ADMIN'}): ${text.slice(0, 50)}`);

    if (!isAdmin(userId)) {
      await client.sendMessage(userId, { message: `⛔ أنت غير مصرح لك باستخدام لوحة التحكم.\nمعرّفك الحالي: \`${userId}\``, parse_mode: 'Markdown' });
      return;
    }

    if (text === '/start' || text === 'قائمة' || text === 'رجوع') {
      await showMenu(userId, 'main');
      return;
    }

    const pending = pendingEdit.get(userId);
    if (pending) {
      pendingEdit.delete(userId);
      if (pending.startsWith('file:')) {
        const fileRel = pending.slice('file:'.length);
        const filePath = path.join(__dirname, fileRel);
        if (!filePath.startsWith(__dirname + path.sep) && filePath !== __dirname) {
          await client.sendMessage(userId, { message: '⛔ مسار خارج مجلد المشروع مرفوض.' });
          return;
        }
        try {
          fs.ensureDirSync(path.dirname(filePath));
          fs.writeFileSync(filePath, text, 'utf8');
          await client.sendMessage(userId, { message: `✅ تم حفظ الملف \`${fileRel}\` بنجاح.\n\n⚠️ ملاحظة: تعديلات الكود تتطلب إعادة تشغيل لتفعيلها، وعند النشر تتجاوزها نسخة المستودع.`, parse_mode: 'Markdown' });
        } catch (e) {
          await client.sendMessage(userId, { message: `❌ فشل حفظ الملف: ${e.message}` });
        }
        return;
      }
      if (pending === 'addAdmin') {
        const id = parseInt(text.trim(), 10);
        if (id && addAdmin(id)) {
          await client.sendMessage(userId, { message: `✅ تمت إضافة \`${id}\` كأدمن بنجاح.`, parse_mode: 'Markdown' });
        } else {
          await client.sendMessage(userId, { message: '⚠️ الرقم غير صالح أو مضاف مسبقاً.' });
        }
        await showMenu(userId, 'admins');
        return;
      }
      if (pending === 'delAdmin') {
        const id = parseInt(text.trim(), 10);
        if (id && removeAdmin(id)) {
          await client.sendMessage(userId, { message: `🗑️ تمت إزالة \`${id}\` من الأدمنز.`, parse_mode: 'Markdown' });
        } else {
          await client.sendMessage(userId, { message: '⚠️ الرقم غير صالح أو غير موجود.' });
        }
        await showMenu(userId, 'admins');
        return;
      }
      // تعديل نص/ردود
      const cfg = getConfig();
      if (pending === 'personality') {
        saveConfig({ personalityPrompt: text });
      } else if (pending === 'howAreYou') {
        const replies = text.split('\n').map(r => r.trim()).filter(Boolean);
        if (replies.length) saveConfig({ howAreYouReplies: replies });
        else {
          await client.sendMessage(userId, { message: '⚠️ لم يصل أي رد، اكتب سطراً واحداً على الأقل.' });
          pendingEdit.set(userId, pending);
          return;
        }
      } else if (pending === 'startupText') {
        saveConfig({ startupText: text });
      } else if (pending === 'greetingText') {
        saveConfig({ greetingText: text });
      } else if (pending === 'simpleGreetingText') {
        saveConfig({ simpleGreetingText: text });
      } else if (pending === 'nonDxnReply') {
        saveConfig({ nonDxnReply: text });
      }
      await client.sendMessage(userId, { message: `✅ تم حفظ *${fieldLabels[pending] || pending}* بنجاح.`, parse_mode: 'Markdown' });
      await showMenu(userId, 'main');
      return;
    }

    // أي رسالة عادية من مطور → عرض القائمة
    await showMenu(userId, 'main');
  } catch (e) {
    console.error('❌ Admin message:', e.message);
  }
}

export async function initAdminBot() {
  if (!ADMIN_BOT_TOKEN) {
    console.log('⚠️ ADMIN_BOT_TOKEN غير مضبوط، تخطي بوت التحكم');
    connState = { ok: false, error: 'ADMIN_BOT_TOKEN missing', connectedAt: null };
    return null;
  }
  const tryConnect = async () => {
    try {
      client = new TelegramClient(new StringSession(''), API_ID, API_HASH, TELEGRAM_OPTIONS);
      await client.start({ botAuthToken: ADMIN_BOT_TOKEN });
      connState = { ok: true, error: null, connectedAt: new Date().toISOString() };
      logger.info('🎛️ Admin control bot connected');
      client.addEventHandler(handleCallback, new CallbackQuery({}));
      client.addEventHandler(handleMessage, new NewMessage({}));
      notifyAdminsOnConnect();
      return client;
    } catch (e) {
      connState = { ok: false, error: e.message, connectedAt: null };
      const m = e.message || '';
      const waitMatch = m.match(/wait of (\d+) seconds is required/i);
      if (waitMatch) {
        const waitSec = parseInt(waitMatch[1], 10) + 10;
        logger.info(`⏳ Admin bot: انتظار ${waitSec}s قبل إعادة محاولة الاتصال`);
        setTimeout(tryConnect, waitSec * 1000);
        return null;
      }
      logger.errorWithContext('Admin bot init failed', e);
      return null;
    }
  };
  return tryConnect();
}

export function getAdminClient() { return client; }

async function notifyAdminsOnConnect() {
  try {
    const admins = getConfig().admins;
    for (const id of admins) {
      try {
        await client.sendMessage(id, { message: '🟢 *لوحة تحكم DXN Assistant متصلة الآن!*\n\nأهلاً بك! أرسل /start لفتح اللوحة.', parse_mode: 'Markdown' });
        console.log('✅ رسالة الترحيب أُرسلت للمطور', id);
      } catch (e) {
        console.error('❌ فشل إرسال الترحيب للمطور', id, ':', e.message);
      }
    }
  } catch (e) {
    console.error('❌ notifyAdminsOnConnect:', e.message);
  }
}

export function getAdminStatus() {
  return {
    connState,
    connected: connState.ok,
    admins: getConfig().admins,
    dxnOnly: getConfig().dxnOnly,
    lastSeen
  };
}

export default { initAdminBot, getAdminClient, getAdminStatus };
