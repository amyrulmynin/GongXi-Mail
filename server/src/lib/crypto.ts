import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_ROUNDS = 10;

/**
 * Derive the encryption key from the environment variable
 */
function getEncryptionKey(): Buffer {
    return createHash('sha256').update(env.ENCRYPTION_KEY).digest();
}

/**
 * AES-256-GCM encrypt
 */
export function encrypt(text: string): string {
    const iv = randomBytes(IV_LENGTH);
    const key = getEncryptionKey();
    const cipher = createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * AES-256-GCM decrypt
 */
export function decrypt(encryptedText: string): string {
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
        throw new Error('Invalid encrypted format');
    }

    const [ivHex, authTagHex, encrypted] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const key = getEncryptionKey();

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}

/**
 * Hash a password
 */
export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a password
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
}

/**
 * Generate an API Key
 */
export function generateApiKey(): { key: string; prefix: string; hash: string } {
    const randomPart = randomBytes(24).toString('base64url');
    const key = `sk_${randomPart}`;
    const prefix = key.substring(0, 7);
    const hash = createHash('sha256').update(key).digest('hex');

    return { key, prefix, hash };
}

/**
 * Hash an API Key (used for validation)
 */
export function hashApiKey(key: string): string {
    return createHash('sha256').update(key).digest('hex');
}
