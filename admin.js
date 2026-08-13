import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import input from 'input';
import dotenv from 'dotenv';
import path from 'path';
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

📊 *الحالة:* ${cfg.dxnOnly ? '🟢 وضع DXN فقط مفعّل' : '🔴 وضع مفتوح'}`, 
    buttons: [
      [btnRow('🎨 الشخصية والردود', 'menu:personality')],
      [btnRow('📝 تعديل الرسائل', 'menu:messages')],
      [btnRow('👮 إدارة الأدمنز', 'menu:admins')],
      [btnRow('⚙️ الإعدادات', 'menu:settings')],
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

function buildMenu(id) {
  switch (id) {
    case 'personality': return buildPersonalityMenu();
    case 'messages': return buildMessagesMenu();
    case 'admins': return buildAdminsMenu();
    case 'settings': return buildSettingsMenu();
    case 'status': return buildStatusMenu();
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
    const userId = event.userId ? parseInt(event.userId) : null;
    if (!userId) return;
    if (!isAdmin(userId)) {
      try {
        await client.invoke(new Api.MessagesSetBotCallbackAnswer({ queryId: event.queryId, cacheTime: 0, message: 'غير مصرح' }));
      } catch (e) {}
      return;
    }
    const data = event.data ? Buffer.from(event.data).toString() : '';
    const msgId = event.msgId || event.messageId || null;

    if (data.startsWith('menu:')) {
      await showMenu(userId, data.split(':')[1], msgId);
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
    let userId = null, text = null;
    if (event.userId) {
      userId = parseInt(event.userId);
      text = event.message || event.text;
    } else if (msg.peerId && msg.peerId.userId) {
      userId = msg.peerId.userId;
      text = msg.text || msg.message;
    }
    if (!userId) return;
    if (!text || typeof text !== 'string') return;

    if (!isAdmin(userId)) {
      await client.sendMessage(userId, { message: '⛔ أنت غير مصرح لك باستخدام لوحة التحكم.' });
      return;
    }

    if (text === '/start' || text === 'قائمة' || text === 'رجوع') {
      await showMenu(userId, 'main');
      return;
    }

    const pending = pendingEdit.get(userId);
    if (pending) {
      pendingEdit.delete(userId);
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
    return null;
  }
  try {
    client = new TelegramClient(new StringSession(''), API_ID, API_HASH, TELEGRAM_OPTIONS);
    await client.start({ botAuthToken: ADMIN_BOT_TOKEN });
    logger.info('🎛️ Admin control bot connected');
    client.addEventHandler(handleCallback, new Api.UpdateBotCallbackQuery());
    client.addEventHandler(handleMessage);
    return client;
  } catch (e) {
    logger.errorWithContext('Admin bot init failed', e);
    throw e;
  }
}

export function getAdminClient() { return client; }
export default { initAdminBot, getAdminClient };
