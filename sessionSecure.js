import crypto from 'node:crypto';

const ALGO = 'aes-256-gcm';

export function deriveKey(key) {
  return crypto.createHash('sha256').update(String(key)).digest();
}

export function encryptSession(sessionString, key) {
  const keyBytes = deriveKey(key);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, keyBytes, iv);
  const enc = Buffer.concat([cipher.update(sessionString, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function decryptSession(encrypted, key) {
  const parts = String(encrypted).split(':');
  if (parts.length !== 3) throw new Error('SESSION_ENC format invalid');
  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const keyBytes = deriveKey(key);
  const decipher = crypto.createDecipheriv(ALGO, keyBytes, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString('utf8');
}

export function resolveSessionString(env) {
  const enc = env.SESSION_ENC || env.SESSION_ENCRYPTED;
  const key = env.SESSION_KEY || env.SESSION_DECRYPT_KEY;
  if (enc && key) return decryptSession(enc, key);
  return env.SESSION_STRING || '';
}
