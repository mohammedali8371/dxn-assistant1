import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import fs from 'fs-extra';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const API_ID = parseInt(process.env.API_ID, 10);
const API_HASH = process.env.API_HASH;
const PHONE = process.env.PHONE;
const CODE = process.env.CODE;
const STATE_FILE = 'login_state.json';

const state = fs.readJsonSync(STATE_FILE);
const client = new TelegramClient(new StringSession(state.partialSession), API_ID, API_HASH, {
  connectionRetries: 3, timeout: 15, deviceModel: 'DXN Assistant VPS', dc: 1, port: 443
});
await client.connect();

try {
  const result = await client.invoke(new Api.auth.SignIn({
    phoneNumber: PHONE,
    phoneCodeHash: state.phoneCodeHash,
    phoneCode: CODE
  }));
  if (result.user) {
    const sessionString = client.session.save();
    console.log('LOGIN_SUCCESS userId=' + result.user.id);
    console.log('SESSION_STRING=' + sessionString);
    fs.writeJsonSync('new_session.json', { sessionString, userId: result.user.id, at: new Date().toISOString() });
    console.log('Saved to new_session.json');
  }
} catch (e) {
  if (e.message && (e.message.includes('SessionPasswordNeeded') || e.errorMessage === 'SESSION_PASSWORD_NEEDED')) {
    console.log('2FA_REQUIRED');
  } else {
    console.log('ERROR: ' + e.message);
  }
}
process.exit(0);
