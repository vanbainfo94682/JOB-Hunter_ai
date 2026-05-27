"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptString = encryptString;
exports.decryptString = decryptString;
const crypto_1 = __importDefault(require("crypto"));
const algorithm = 'aes-256-gcm';
const ENCRYPTION_KEY = process.env.COOKIE_ENCRYPTION_KEY || crypto_1.default.randomBytes(32).toString('hex');
function encryptString(text) {
    if (!text)
        return text;
    try {
        const iv = crypto_1.default.randomBytes(16);
        const cipher = crypto_1.default.createCipheriv(algorithm, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag().toString('hex');
        return JSON.stringify({ iv: iv.toString('hex'), encrypted, authTag });
    }
    catch (err) {
        console.error('Encryption error:', err);
        return text;
    }
}
function decryptString(encryptedObjStr) {
    if (!encryptedObjStr || !encryptedObjStr.startsWith('{'))
        return encryptedObjStr;
    try {
        const { iv, encrypted, authTag } = JSON.parse(encryptedObjStr);
        const decipher = crypto_1.default.createDecipheriv(algorithm, Buffer.from(ENCRYPTION_KEY, 'hex'), Buffer.from(iv, 'hex'));
        decipher.setAuthTag(Buffer.from(authTag, 'hex'));
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
    catch (err) {
        console.error('Decryption error:', err);
        return encryptedObjStr;
    }
}
