const crypto = require('crypto');
const ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'.slice(0, 64);
const algorithm = 'aes-256-gcm';
function decryptString(encryptedObjStr) {
  try {
    const { iv, encrypted, authTag } = JSON.parse(encryptedObjStr);
    const decipher = crypto.createDecipheriv(algorithm, Buffer.from(ENCRYPTION_KEY, 'hex'), Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    return 'ERROR: ' + err.message;
  }
}
const s1 = '{"iv":"4d9fffe6410454ab69649b5c2a1e355c","encrypted":"9d82f7c00e62058b29cce2bc3a4a7cf5ee6c11","authTag":"5313d4b68e925c0406859345d47e4f3a"}';
const s2 = '{"iv":"064215f7ebde2ec0ea0df08b4af77764","encrypted":"542d9ef78fffc7c9e07dc0e5cf9efb1049c66cc571cdafb1ec4633722a4bbbdba0ab9504a79df3f5fa97f6c310433e1ba0a249ff1fce453bf5","authTag":"56b820e1d51a6602d33454a86f7ec00e"}';
console.log('1:', decryptString(s1));
console.log('2:', decryptString(s2));
