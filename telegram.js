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

const SESSION_DIR = path.join(process.cwd(), 'sessions');
fs.ensureDirSync(SESSION_DIR);
let client = null;

export async function initTelegram() {
  try {
    const sessionString = process.env.SESSION_STRING || '';
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

      let chatId = event.message.chatId || event.message.peerId?.userId || event.message.fromId?.userId;
      if (!chatId) return;
      if (chatId < 0) {
        console.log(`⏭️ Skipping group ${chatId}`);
        return;
      }

      console.log(`📩 Private chat from ${chatId}`);
      // ✅ رد ثابت للتأكد من أن الإرسال يعمل
      await client.sendMessage(chatId, { message: 'مرحباً! البوت يعمل ✅' });
    } catch(e) {
      console.error('Handler error:', e);
    }
  });
  logger.info('👂 Listening');
}

export function getClient() { return client; }
export default { initTelegram, getClient };
