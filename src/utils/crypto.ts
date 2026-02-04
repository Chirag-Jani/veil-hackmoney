/**
 * Cryptographic utilities for encryption/decryption using Web Crypto API
 */

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits for GCM
const SALT_LENGTH = 16;

/**
 * Derive a key from a password using PBKDF2
 */
async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt data using AES-GCM with a password
 */
export async function encrypt(
  data: string,
  password: string
): Promise<{ encrypted: string; salt: string; iv: string }> {
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(data);

  // Generate random salt and IV
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  // Derive key from password
  const key = await deriveKeyFromPassword(password, salt);

  // Encrypt
  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: iv },
    key,
    dataBytes
  );

  // Convert to base64 for storage
  return {
    encrypted: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    salt: btoa(String.fromCharCode(...salt)),
    iv: btoa(String.fromCharCode(...iv)),
  };
}

/**
 * Decrypt data using AES-GCM with a password
 */
export async function decrypt(
  encryptedData: string,
  salt: string,
  iv: string,
  password: string
): Promise<string> {
  // Convert from base64
  const encryptedBytes = Uint8Array.from(
    atob(encryptedData),
    (c) => c.charCodeAt(0)
  );
  const saltBytes = Uint8Array.from(atob(salt), (c) => c.charCodeAt(0));
  const ivBytes = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0));

  // Derive key from password
  const key = await deriveKeyFromPassword(password, saltBytes);

  // Decrypt
  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: ivBytes },
    key,
    encryptedBytes
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

/**
 * Generate a random seed for cryptographic operations
 */
export function generateRandomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}
