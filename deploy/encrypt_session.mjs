import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { encryptSession } from '../sessionSecure.js';

// Reads the plain session string, produces SESSION_ENC + SESSION_KEY.
// Never prints the plain session. Usage: node deploy/encrypt_session.mjs [sessionFile] [keyFile]
const root = path.resolve(process.cwd());
const sessionFile = process.argv[2] || path.join(root, 'session_str.txt');
const keyFile = process.argv[3] || path.join(root, '.session_key');

if (!fs.existsSync(sessionFile)) {
  console.error(`❌ Session file not found: ${sessionFile}`);
  process.exit(1);
}
const sessionString = fs.readFileSync(sessionFile, 'utf8').trim();
if (!sessionString) { console.error('❌ Empty session'); process.exit(1); }

let key = '';
if (fs.existsSync(keyFile)) {
  key = fs.readFileSync(keyFile, 'utf8').trim();
}
if (!key) {
  key = crypto.randomBytes(32).toString('base64url');
  fs.writeFileSync(keyFile, key + '\n', { mode: 0o600 });
  console.log(`🔑 Generated new SESSION_KEY -> saved to ${keyFile}`);
} else {
  console.log(`🔑 Using existing SESSION_KEY from ${keyFile}`);
}

const enc = encryptSession(sessionString, key);
console.log('\n================ ADD TO RENDER ENV VARS ================');
console.log(`SESSION_ENC=${enc}`);
console.log(`SESSION_KEY=${key}`);
console.log('=========================================================\n');
