export const CHANGE_KEY = 'private-desk-vault-change';

const LEGACY_KEY = 'private-desk-v1';
const DATABASE_NAME = 'private-desk';
const VAULT_STORE = 'vault';
const ATTACHMENT_STORE = 'attachments';
const VAULT_ID = 'current';

let databasePromise;

function openDatabase() {
  if (databasePromise) return databasePromise;

  const opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    let blocked = false;

    request.onupgradeneeded = () => {
      request.result.createObjectStore(VAULT_STORE);
      request.result.createObjectStore(ATTACHMENT_STORE, { keyPath: 'id' });
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true;
      reject(new Error('Another tab is blocking the vault database'));
    };
    request.onsuccess = () => {
      const database = request.result;
      if (blocked) {
        database.close();
        return;
      }
      const clearConnection = () => {
        if (databasePromise === opening) databasePromise = null;
      };
      database.onversionchange = () => {
        database.close();
        clearConnection();
      };
      database.onclose = clearConnection;
      resolve(database);
    };
  });

  databasePromise = opening;
  opening.catch(() => {
    if (databasePromise === opening) databasePromise = null;
  });
  return opening;
}

async function withVault(mode, stores, operation) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(stores, mode, { durability: 'strict' });
    const vault = transaction.objectStore(VAULT_STORE);
    const request = vault.get(VAULT_ID);
    let result;
    let error;

    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () => reject(error ?? transaction.error ?? new Error('Vault transaction aborted'));
    request.onsuccess = () => {
      try {
        operation(request.result ?? null, vault, transaction, (value) => { result = value; });
      } catch (cause) {
        error = cause;
        transaction.abort();
      }
    };
  });
}

function readLegacyVault() {
  try {
    return localStorage.getItem(LEGACY_KEY);
  } catch {
    return null;
  }
}

async function migrateLegacyVault() {
  const legacy = readLegacyVault();
  const saved = await withVault('readwrite', [VAULT_STORE], (current, vault, _transaction, finish) => {
    if (current === null && legacy !== null) vault.put(legacy, VAULT_ID);
    finish(current ?? legacy);
  });

  // Keep the original ciphertext until IndexedDB commits the migration.
  if (legacy !== null && saved === legacy && readLegacyVault() === legacy) {
    try {
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      // The committed vault takes precedence if the browser prevents cleanup.
    }
  }
  return saved;
}

export async function readVault() {
  const saved = await withVault('readonly', [VAULT_STORE], (raw, _store, _transaction, finish) => finish(raw));
  if (saved !== null || readLegacyVault() === null) return saved;

  // Earlier versions use this lock when writing the original localStorage key.
  if (globalThis.navigator?.locks) return navigator.locks.request(LEGACY_KEY, migrateLegacyVault);
  return migrateLegacyVault();
}

function requireCurrentVault(current, expected) {
  if (current === expected) return;
  const error = new Error('The saved vault changed in another tab');
  error.name = 'VaultConflictError';
  throw error;
}

export async function writeVault(raw, expectedRaw, { put = [], remove = [], replace = false } = {}) {
  await withVault('readwrite', [VAULT_STORE, ATTACHMENT_STORE], (current, vault, transaction) => {
    requireCurrentVault(current, expectedRaw);
    const files = transaction.objectStore(ATTACHMENT_STORE);
    if (replace) files.clear();
    for (const id of remove) files.delete(id);
    for (const row of put) files.put(row);
    vault.put(raw, VAULT_ID);
  });

  try {
    localStorage.setItem(CHANGE_KEY, crypto.randomUUID());
  } catch {
    // Transactions still detect concurrent writes if the browser blocks notifications.
  }
}

function readFiles(expectedRaw, get) {
  return withVault('readonly', [VAULT_STORE, ATTACHMENT_STORE], (current, _vault, transaction, finish) => {
    requireCurrentVault(current, expectedRaw);
    const request = get(transaction.objectStore(ATTACHMENT_STORE));
    request.onsuccess = () => finish(request.result ?? null);
  });
}

export function readAttachment(id, expectedRaw) {
  return readFiles(expectedRaw, (files) => files.get(id));
}

export function readAttachments(expectedRaw) {
  return readFiles(expectedRaw, (files) => files.getAll());
}
