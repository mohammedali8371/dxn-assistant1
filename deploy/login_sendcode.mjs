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
const STATE_FILE = 'login_state.json';

const client = new TelegramClient(new StringSession(''), API_ID, API_HASH, {
  connectionRetries: 3, timeout: 15, deviceModel: 'DXN Assistant VPS', dc: 1, port: 443
});
await client.connect();

const result = await client.invoke(new Api.auth.SendCode({
  phoneNumber: PHONE,
  apiId: API_ID,
  apiHash: API_HASH,
  settings: new Api.CodeSettings({})
}));

fs.writeJsonSync(STATE_FILE, {
  partialSession: client.session.save(),
  phoneCodeHash: result.phoneCodeHash,
  type: result.type ? result.type.className : 'unknown'
});
console.log('CODE_SENT phoneCodeHash=' + result.phoneCodeHash);
console.log('Code type: ' + (result.type ? result.type.className : 'unknown'));
process.exit(0);
