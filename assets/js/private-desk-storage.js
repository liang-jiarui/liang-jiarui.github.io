export const STORAGE_KEY = 'private-desk-v1';

const VERSION = 1;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const ITERATIONS = 600000;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

function toBase64(bytes) {
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32768)));
  }
  return btoa(chunks.join(''));
}

function fromBase64(value) {
  if (typeof value !== 'string' || value.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error('Invalid vault encoding');
  }
  const decoded = atob(value);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
}

async function deriveKey(password, salt) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export function readVault() {
  return localStorage.getItem(STORAGE_KEY);
}

export async function writeVault(raw, expectedRaw) {
  const write = () => {
    if (readVault() !== expectedRaw) {
      const error = new Error('The saved vault changed in another tab');
      error.name = 'VaultConflictError';
      throw error;
    }
    localStorage.setItem(STORAGE_KEY, raw);
  };

  if (globalThis.navigator?.locks) {
    await navigator.locks.request(STORAGE_KEY, write);
  } else {
    write();
  }
}

export async function sealVault(key, salt, records) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const plaintext = encoder.encode(JSON.stringify(records));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return JSON.stringify({
    version: VERSION,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext))
  });
}

export async function prepareVault(password, records) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const key = await deriveKey(password, salt);
  const raw = await sealVault(key, salt, records);
  return { key, salt, raw };
}

export async function openVault(password, raw) {
  const envelope = JSON.parse(raw);
  if (envelope === null || typeof envelope !== 'object' || Array.isArray(envelope) ||
    Object.keys(envelope).length !== 4 || envelope.version !== VERSION) {
    throw new Error('Invalid vault envelope');
  }

  const salt = fromBase64(envelope.salt);
  const iv = fromBase64(envelope.iv);
  const ciphertext = fromBase64(envelope.ciphertext);
  if (salt.length !== SALT_LENGTH || iv.length !== IV_LENGTH || ciphertext.length <= 16) {
    throw new Error('Invalid vault parameters');
  }

  const key = await deriveKey(password, salt);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return { key, salt, records: JSON.parse(decoder.decode(plaintext)) };
}
