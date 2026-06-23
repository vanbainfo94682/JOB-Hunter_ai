import crypto from 'crypto';

const algorithm = 'aes-256-gcm';
// Provide a static fallback key so development server restarts don't invalidate all saved cookies
const ENCRYPTION_KEY = process.env.COOKIE_ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'.slice(0, 64);

export function encryptString(text: string): string {
  if (!text) return text;
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return JSON.stringify({ iv: iv.toString('hex'), encrypted, authTag });
  } catch (err) {
    console.error('Encryption error:', err);
    return text;
  }
}

export function decryptString(encryptedObjStr: string): string {
  if (!encryptedObjStr || !encryptedObjStr.startsWith('{')) return encryptedObjStr;
  try {
    const { iv, encrypted, authTag } = JSON.parse(encryptedObjStr);
    const decipher = crypto.createDecipheriv(algorithm, Buffer.from(ENCRYPTION_KEY, 'hex'), Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('Decryption error:', err);
    return encryptedObjStr;
  }
}
