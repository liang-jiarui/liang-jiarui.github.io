export const MAX_FILE_BYTES = 25 * 1024 ** 2;
export const MAX_TOTAL_FILE_BYTES = 100 * 1024 ** 2;
export const MAX_VAULT_BYTES = 8 * 1024 ** 2;

const MAX_MANIFEST_BYTES = 16 * 1024 ** 2;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const MAGIC = encoder.encode('PDVAULT\x01');
const PREFIX_BYTES = MAGIC.length + 4;
const BINARY_TYPE = 'application/octet-stream';

function invalidBackup() {
  return new Error('Invalid vault backup');
}

function assertSize(size, maximum) {
  if (size <= maximum) return;
  const error = new Error('Vault file size limit exceeded');
  error.name = 'VaultBackupSizeError';
  throw error;
}

function validId(id) {
  return typeof id === 'string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id);
}

function assertRow(row) {
  if (!validId(row?.id) || !(row.iv instanceof Uint8Array) || row.iv.length !== IV_BYTES ||
      !(row.ciphertext instanceof Blob) || row.ciphertext.size < TAG_BYTES) {
    throw invalidBackup();
  }
  assertSize(row.ciphertext.size - TAG_BYTES, MAX_FILE_BYTES);
}

function encryptionParameters(id, iv) {
  return { name: 'AES-GCM', iv, additionalData: encoder.encode('private-desk-file-v1:' + id) };
}

export async function sealAttachment(key, id, file) {
  if (!validId(id) || !(file instanceof Blob)) throw new Error('Invalid local file');
  assertSize(file.size, MAX_FILE_BYTES);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(encryptionParameters(id, iv), key, await file.arrayBuffer());
  return { id, iv, ciphertext: new Blob([ciphertext]) };
}

export async function openAttachment(key, row) {
  assertRow(row);
  const bytes = await row.ciphertext.arrayBuffer();
  const plaintext = await crypto.subtle.decrypt(encryptionParameters(row.id, row.iv), key, bytes);
  return new Blob([plaintext], { type: BINARY_TYPE });
}

export function createBackup(raw, rows) {
  const vault = new Blob([raw], { type: 'application/json' });
  assertSize(vault.size, MAX_VAULT_BYTES);
  if (!rows.length) return vault;

  let total = 0;
  const ids = new Set();
  const files = rows.map((row) => {
    assertRow(row);
    if (ids.has(row.id)) throw invalidBackup();
    ids.add(row.id);
    total += row.ciphertext.size - TAG_BYTES;
    assertSize(total, MAX_TOTAL_FILE_BYTES);
    return { id: row.id, iv: [...row.iv], bytes: row.ciphertext.size };
  });
  const manifest = encoder.encode(JSON.stringify({ vault: raw, files }));
  assertSize(manifest.byteLength, MAX_MANIFEST_BYTES);

  // The prefix carries the format version and the big-endian manifest length.
  const prefix = new Uint8Array(PREFIX_BYTES);
  prefix.set(MAGIC);
  new DataView(prefix.buffer).setUint32(MAGIC.length, manifest.byteLength);
  return new Blob([prefix, manifest, ...rows.map((row) => row.ciphertext)], { type: BINARY_TYPE });
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw invalidBackup();
  }
}

function assertVault(raw) {
  if (typeof raw !== 'string') throw invalidBackup();
  assertSize(new Blob([raw]).size, MAX_VAULT_BYTES);
  const vault = parseJson(raw);
  if (vault?.version !== 1 || typeof vault.salt !== 'string' ||
      typeof vault.iv !== 'string' || typeof vault.ciphertext !== 'string' ||
      Object.keys(vault).length !== 4) {
    throw invalidBackup();
  }
}

export async function readBackup(file) {
  const prefix = new Uint8Array(await file.slice(0, PREFIX_BYTES).arrayBuffer());
  if (!MAGIC.every((byte, index) => prefix[index] === byte)) {
    assertSize(file.size, MAX_VAULT_BYTES);
    const raw = decoder.decode(await file.arrayBuffer());
    assertVault(raw);
    return { raw, rows: [] };
  }

  if (prefix.byteLength !== PREFIX_BYTES) throw invalidBackup();
  const manifestSize = new DataView(prefix.buffer).getUint32(MAGIC.length);
  assertSize(manifestSize, MAX_MANIFEST_BYTES);
  let offset = PREFIX_BYTES + manifestSize;
  if (!manifestSize || offset > file.size) throw invalidBackup();

  const manifestText = decoder.decode(await file.slice(PREFIX_BYTES, offset).arrayBuffer());
  const manifest = parseJson(manifestText);
  if (!Array.isArray(manifest?.files) || !manifest.files.length || Object.keys(manifest).length !== 2) {
    throw invalidBackup();
  }
  assertVault(manifest.vault);

  let total = 0;
  const ids = new Set();
  const rows = manifest.files.map((entry) => {
    if (!validId(entry?.id) || ids.has(entry.id) || !Array.isArray(entry.iv) ||
        entry.iv.length !== IV_BYTES || !entry.iv.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255) ||
        !Number.isSafeInteger(entry.bytes) || entry.bytes < TAG_BYTES || Object.keys(entry).length !== 3) {
      throw invalidBackup();
    }
    const size = entry.bytes - TAG_BYTES;
    assertSize(size, MAX_FILE_BYTES);
    total += size;
    assertSize(total, MAX_TOTAL_FILE_BYTES);
    if (offset + entry.bytes > file.size) throw invalidBackup();

    const ciphertext = file.slice(offset, offset + entry.bytes);
    offset += entry.bytes;
    ids.add(entry.id);
    return { id: entry.id, iv: Uint8Array.from(entry.iv), ciphertext };
  });
  if (offset !== file.size) throw invalidBackup();
  return { raw: manifest.vault, rows };
}
