import { openVault, prepareVault, sealVault } from './private-desk-storage.js';
import { CHANGE_KEY, readAttachment, readAttachments, readVault, writeVault } from './private-desk-database.js';
import {
  MAX_FILE_BYTES, MAX_TOTAL_FILE_BYTES, MAX_VAULT_BYTES, createBackup, openAttachment, readBackup, sealAttachment,
} from './private-desk-attachments.js';

const byId = (id) => document.getElementById(id);
const gate = byId('gate');
const gateForm = byId('gate-form');
const gateStatus = byId('gate-status');
const password = byId('password');
const confirmPassword = byId('confirm-password');
const workspace = byId('workspace');
const workspaceStatus = byId('workspace-status');
const folderList = byId('folder-list');
const linkList = byId('link-list');
const search = byId('search');
const editor = byId('editor');
const editorForm = byId('editor-form');
const dialogStatus = byId('dialog-status');
const folderSelect = byId('link-folder');
const editorGroups = ['link', 'bulk', 'assign', 'note', 'folder', 'restore', 'file-pick', 'file-name'];

const minimumPasswordLength = 6;
const fileSizeFormatter = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });
const allFolders = null;
const unfiled = '';
let raw = null;
let session = null;
let selectedFolder = allFolders;
let dialogMode;
let editing;
let busy = false;
let departing = false;

function status(element, message = '', isError = false) {
  element.textContent = message;
  element.classList.toggle('status-error', isError);
  element.hidden = !message;
}

function normalizeUrl(value) {
  if (value.length > 4096) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.href.length <= 4096 ? url : null;
  } catch {
    return null;
  }
}

function validText(value, maxLength) {
  return typeof value === 'string' && value.length <= maxLength;
}

function totalFileBytes(files) {
  return files.reduce((total, file) => total + file.size, 0);
}

function validateRecords(records) {
  if (!Array.isArray(records?.folders) || !Array.isArray(records.links)) {
    throw new Error('Invalid vault records');
  }

  const folderIds = new Set([unfiled]);
  for (const folder of records.folders) {
    if (!validText(folder?.id, 80) || folderIds.has(folder.id) ||
        !validText(folder.name, 80) || !folder.name.trim()) {
      throw new Error('Invalid folder');
    }
    folderIds.add(folder.id);
  }

  const linkIds = new Set();
  for (const link of records.links) {
    if (!validText(link?.id, 80) || !link.id || linkIds.has(link.id) ||
        !validText(link.title, 160) || !link.title.trim() ||
        !validText(link.url, 4096) || !normalizeUrl(link.url) ||
        !validText(link.note, 1200) || !folderIds.has(link.folder)) {
      throw new Error('Invalid link');
    }
    linkIds.add(link.id);
  }

  if (records.files === undefined) records.files = [];
  if (!Array.isArray(records.files)) throw new Error('Invalid file list');
  const fileIds = new Set();
  for (const file of records.files) {
    if (!validText(file?.id, 80) || !file.id || fileIds.has(file.id) ||
        !validText(file.name, 255) || !file.name.trim() || !folderIds.has(file.folder) ||
        !Number.isInteger(file.size) || file.size < 0 || file.size > MAX_FILE_BYTES) {
      throw new Error('Invalid file');
    }
    fileIds.add(file.id);
  }
  if (totalFileBytes(records.files) > MAX_TOTAL_FILE_BYTES) throw new Error('File storage limit exceeded');
}

function configureGate() {
  const firstUse = raw === null;
  byId('gate-title').textContent = firstUse ? 'Create your vault' : 'Unlock your vault';
  byId('gate-description').textContent = firstUse
    ? `Choose a password with at least ${minimumPasswordLength} characters. You’ll need it to access your encrypted files and links.`
    : 'Enter your password to access the encrypted files and links in this browser.';
  byId('gate-submit').textContent = firstUse ? 'Create vault' : 'Unlock';
  byId('confirm-field').hidden = !firstUse;
  confirmPassword.disabled = !firstUse;
  confirmPassword.required = firstUse;
  password.autocomplete = firstUse ? 'new-password' : 'current-password';
  password.minLength = firstUse ? minimumPasswordLength : 0;
  gateForm.hidden = false;
  byId('gate-footer').hidden = false;
}

function lockDesk(focus = true) {
  session = null;
  selectedFolder = allFolders;
  search.value = '';
  gateForm.reset();
  editorForm.reset();
  editing = null;
  if (editor.open) editor.close();
  folderList.replaceChildren();
  linkList.replaceChildren();
  folderSelect.replaceChildren();
  byId('dialog-detail').textContent = '';
  byId('list-title').textContent = 'All items';
  byId('list-count').textContent = '';
  status(dialogStatus);
  status(workspaceStatus);
  status(gateStatus);
  workspace.hidden = true;
  byId('workspace-actions').hidden = true;
  gate.hidden = false;
  configureGate();
  if (focus) password.focus();
}

function showDesk(unlocked) {
  if (departing) return;
  session = unlocked;
  gateForm.reset();
  gate.hidden = true;
  workspace.hidden = false;
  byId('workspace-actions').hidden = false;
  renderDesk();
  byId('workspace-title').focus();
}

function setBusy(value) {
  busy = value;
  for (const id of ['gate-submit', 'restore', 'lock', 'export', 'dialog-submit', 'dialog-delete', 'dialog-cancel']) {
    byId(id).disabled = value;
  }
  gateForm.setAttribute('aria-busy', String(value));
  editorForm.setAttribute('aria-busy', String(value));
}

async function refreshVault(allowBusy = false) {
  const before = raw;
  let saved;
  try {
    saved = await readVault();
  } catch {
    return false;
  }
  if (departing || (busy && !allowBusy) || before !== raw || saved === raw) return false;
  raw = saved;
  lockDesk();
  status(gateStatus, 'Your vault changed in another tab. Unlock it again to continue.', true);
  return true;
}

async function operate(action, feedback, fallback) {
  if (busy) return;
  setBusy(true);
  status(feedback);
  try {
    await action();
  } catch (error) {
    if (!departing && !(await refreshVault(true))) {
      const messages = {
        QuotaExceededError: 'Your browser ran out of storage. This change could not be saved.',
        VaultBackupSizeError: 'The backup file is too large to restore in this browser.',
      };
      const message = messages[error.name] ?? fallback;
      status(feedback, message, true);
    }
  } finally {
    if (!departing) await refreshVault(true);
    setBusy(false);
  }
}

function folderName(folder) {
  if (folder === allFolders) return 'All items';
  if (folder === unfiled) return 'Unfiled';
  return session.records.folders.find((entry) => entry.id === folder).name;
}

function element(tag, className, value) {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = value;
  return node;
}

function renderDesk(focusFolder = false) {
  const { folders, links, files } = session.records;
  const items = [...files, ...links];
  const counts = new Map();
  for (const { folder } of items) {
    counts.set(folder, (counts.get(folder) ?? 0) + 1);
  }

  const options = [allFolders, unfiled, ...folders.map(({ id }) => id)];
  let selectedButton;
  folderList.replaceChildren(...options.map((folder) => {
    const item = document.createElement('li');
    const button = element('button', 'folder-button', '');
    const count = folder === allFolders ? items.length : counts.get(folder) ?? 0;
    button.type = 'button';
    button.append(element('span', 'folder-label', folderName(folder)), element('span', 'folder-count', count));
    if (folder === selectedFolder) {
      button.setAttribute('aria-current', 'true');
      selectedButton = button;
    }
    button.addEventListener('click', () => {
      selectedFolder = folder;
      renderDesk(true);
    });
    item.append(button);
    return item;
  }));
  byId('manage-folder').hidden = !selectedFolder;
  renderItems();
  if (focusFolder) selectedButton?.focus();
}

function renderItems() {
  const query = search.value.trim().toLocaleLowerCase();
  const { links, files } = session.records;
  const inCurrentFolder = ({ folder }) => selectedFolder === allFolders || folder === selectedFolder;
  const matchesQuery = (value) => value.toLocaleLowerCase().includes(query);
  const matchingLinks = links.filter((link) =>
    inCurrentFolder(link) && [link.title, link.url, link.note].some(matchesQuery)
  );
  const matchingFiles = files.filter((file) => inCurrentFolder(file) && matchesQuery(file.name));
  const count = matchingLinks.length + matchingFiles.length;
  byId('list-title').textContent = folderName(selectedFolder);
  byId('list-count').textContent = `${count} ${count === 1 ? 'item' : 'items'}`;
  linkList.replaceChildren(...matchingFiles.map(fileCard), ...matchingLinks.map(linkCard));
  byId('empty-state').hidden = count > 0;
  byId('empty-title').textContent = query ? 'No matching items' : 'No items yet';
  byId('empty-detail').textContent = query ? 'Try a different search.' : 'Add a file or save a link.';
}

function linkCard(link) {
  const card = element('li', 'link-card', '');
  const url = normalizeUrl(link.url);
  const icon = element('div', 'link-icon', url.hostname.charAt(0).toUpperCase());
  icon.setAttribute('aria-hidden', 'true');

  const info = element('div', 'link-info', '');
  const title = element('a', 'link-title', link.title);
  title.href = url.href;
  title.target = '_blank';
  title.rel = 'noopener noreferrer';
  const meta = element('p', 'link-meta', url.host);
  meta.title = url.href;
  info.append(title, meta);
  if (link.note) info.append(element('p', 'link-note', link.note));

  const actions = element('div', 'card-actions', '');
  const edit = element('button', 'button button-quiet', 'Edit');
  const remove = element('button', 'button button-quiet button-danger', 'Delete');
  edit.type = remove.type = 'button';
  edit.setAttribute('aria-label', 'Edit ' + link.title);
  remove.setAttribute('aria-label', 'Delete ' + link.title);
  edit.addEventListener('click', () => showEditor('link', link));
  remove.addEventListener('click', () => showEditor('delete-link', link));
  actions.append(edit, remove);
  card.append(icon, info, actions);
  return card;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const unit = bytes < 1024 ** 2 ? 'KiB' : 'MiB';
  const divisor = unit === 'KiB' ? 1024 : 1024 ** 2;
  return `${fileSizeFormatter.format(bytes / divisor)} ${unit}`;
}

function fileCard(file) {
  const card = element('li', 'link-card file-card', '');
  const icon = element('div', 'link-icon', 'File');
  icon.setAttribute('aria-hidden', 'true');
  const info = element('div', 'link-info', '');
  info.append(element('span', 'link-title file-title', file.name), element('p', 'link-meta', formatBytes(file.size)));

  const actions = element('div', 'card-actions', '');
  const download = element('button', 'button button-quiet', 'Download');
  const edit = element('button', 'button button-quiet', 'Edit');
  const remove = element('button', 'button button-quiet button-danger', 'Delete');
  download.type = edit.type = remove.type = 'button';
  download.setAttribute('aria-label', `Download ${file.name}`);
  edit.setAttribute('aria-label', `Edit ${file.name}`);
  remove.setAttribute('aria-label', `Delete ${file.name}`);
  download.addEventListener('click', () => operate(async () => {
    const { key } = session;
    const stored = await readAttachment(file.id, raw);
    if (!stored) throw new Error('File missing from vault');
    const contents = await openAttachment(key, stored);
    if (!departing) downloadBlob(contents, file.name);
  }, workspaceStatus, 'Could not download this file.'));
  edit.addEventListener('click', () => showEditor('file-edit', file));
  remove.addEventListener('click', () => showEditor('delete-file', file));
  actions.append(download, edit, remove);
  card.append(icon, info, actions);
  return card;
}

function showEditor(mode, record = null) {
  dialogMode = mode;
  editing = record;
  editorForm.reset();
  status(dialogStatus);

  const groups = {
    link: ['link', 'assign', 'note'],
    bulk: ['bulk', 'assign'],
    'file-add': ['file-pick', 'assign'],
    'file-edit': ['file-name', 'assign'],
    folder: ['folder'],
    restore: ['restore'],
    'delete-link': [],
    'delete-file': [],
    'delete-folder': [],
  };
  for (const name of editorGroups) {
    const fieldset = byId(name + '-fields');
    fieldset.hidden = fieldset.disabled = !groups[mode].includes(name);
  }

  if (groups[mode].includes('assign')) {
    const options = [new Option('Unfiled', unfiled)];
    for (const folder of session.records.folders) options.push(new Option(folder.name, folder.id));
    folderSelect.replaceChildren(...options);
    folderSelect.value = record?.folder ?? selectedFolder ?? unfiled;
  }

  if (mode === 'link' && record) {
    byId('link-url').value = record.url;
    byId('link-title').value = record.title;
    byId('link-note').value = record.note;
  }
  if (mode === 'folder' && record) byId('folder-name').value = record.name;
  if (mode === 'file-edit') byId('file-name').value = record.name;

  const titles = {
    link: record ? 'Edit link' : 'Add link',
    bulk: 'Add links in bulk',
    'file-add': 'Add local files',
    'file-edit': 'Edit file',
    folder: record ? 'Manage folder' : 'New folder',
    restore: 'Restore from backup',
    'delete-link': 'Delete link',
    'delete-file': 'Delete file',
    'delete-folder': 'Delete folder',
  };
  const details = {
    bulk: 'Enter one full HTTP or HTTPS URL per line. Duplicate URLs are skipped.',
    restore: raw === null
      ? 'Choose an encrypted backup and enter its password.'
      : 'Restoring a backup replaces the vault in this browser. You can unlock and export your current vault first.',
    'delete-link': record ? `Delete “${record.title}” from your vault?` : '',
    'delete-file': record ? `Delete “${record.name}” from your vault?` : '',
    'delete-folder': record ? `Delete “${record.name}”? Its files and links will move to Unfiled.` : '',
  };
  const submitLabels = {
    bulk: 'Add links',
    'file-add': 'Add files',
    restore: raw === null ? 'Restore vault' : 'Replace and restore',
    'delete-link': 'Delete link',
    'delete-file': 'Delete file',
    'delete-folder': 'Delete folder',
  };
  const detail = byId('dialog-detail');
  detail.textContent = details[mode] ?? '';
  detail.hidden = !detail.textContent;
  byId('dialog-title').textContent = titles[mode];
  byId('dialog-delete').hidden = mode !== 'folder' || record === null;
  const submit = byId('dialog-submit');
  const destructive = mode.startsWith('delete-') || (mode === 'restore' && raw !== null);
  submit.textContent = submitLabels[mode] ?? 'Save';
  submit.classList.toggle('button-danger', destructive);
  submit.classList.toggle('button-primary', !destructive);

  if (!editor.open) editor.showModal();
  (editor.querySelector('fieldset:not([hidden]) :is(input, textarea)') ?? byId('dialog-cancel')).focus();
}

async function saveRecords(changes, message, folder = selectedFolder, attachments) {
  const records = { ...session.records, ...changes };
  const updated = await sealVault(session.key, session.salt, records);
  if (updated.length > MAX_VAULT_BYTES) {
    status(dialogStatus, 'This vault has reached its item storage limit.', true);
    return;
  }
  await writeVault(updated, raw, attachments);
  raw = updated;
  if (departing) return;
  session.records = records;
  selectedFolder = folder;
  editor.close();
  renderDesk();
  if (!workspace.contains(document.activeElement)) byId('new-link').focus();
  status(workspaceStatus, message);
}

function linkFromUrl(url, folder, title = '', note = '', id = crypto.randomUUID()) {
  return { id, title: title || url.hostname.slice(0, 160), url: url.href, folder, note };
}

async function submitEditor() {
  if (dialogMode === 'restore') {
    const file = byId('backup-file').files[0];
    const backupPassword = byId('backup-password').value;
    const backup = await readBackup(file);
    const unlocked = await openVault(backupPassword, backup.raw);
    validateRecords(unlocked.records);
    const files = new Map(unlocked.records.files.map((entry) => [entry.id, entry]));
    if (files.size !== backup.rows.length) throw new Error('File count does not match backup');
    for (const row of backup.rows) {
      const item = files.get(row.id);
      if (!item || row.ciphertext.size !== item.size + 16) throw new Error('File does not match backup');
      await openAttachment(unlocked.key, row);
    }
    if (departing) return;
    await writeVault(backup.raw, raw, { put: backup.rows, replace: true });
    raw = backup.raw;
    editor.close();
    showDesk(unlocked);
    status(workspaceStatus, 'Backup restored.');
    return;
  }

  const { folders, links, files } = session.records;
  if (dialogMode === 'file-add') {
    const chosen = Array.from(byId('local-files').files);
    const oversized = chosen.find((file) => file.size > MAX_FILE_BYTES);
    if (oversized) {
      status(dialogStatus, `“${oversized.name}” exceeds the ${formatBytes(MAX_FILE_BYTES)} limit per file.`, true);
      return;
    }
    if (totalFileBytes(files) + totalFileBytes(chosen) > MAX_TOTAL_FILE_BYTES) {
      status(dialogStatus, `This vault can store up to ${formatBytes(MAX_TOTAL_FILE_BYTES)} of files.`, true);
      return;
    }
    if (chosen.some((file) => !file.name.trim() || file.name.length > 255)) {
      status(dialogStatus, 'Choose files with names between 1 and 255 characters.', true);
      return;
    }
    const folder = folderSelect.value;
    const { key } = session;
    const records = [];
    const put = [];
    for (const file of chosen) {
      const id = crypto.randomUUID();
      put.push(await sealAttachment(key, id, file));
      if (departing) return;
      records.push({ id, name: file.name, folder, size: file.size });
    }
    const count = records.length;
    await saveRecords({ files: [...records, ...files] }, `Added ${count} ${count === 1 ? 'file' : 'files'}.`,
      selectedFolder, { put });
    return;
  }

  if (dialogMode === 'file-edit') {
    const name = byId('file-name').value.trim();
    if (!name) {
      status(dialogStatus, 'Enter a file name.', true);
      byId('file-name').focus();
      return;
    }
    const revised = { ...editing, name, folder: folderSelect.value };
    await saveRecords({ files: files.map((file) => file.id === revised.id ? revised : file) }, 'File updated.');
    return;
  }

  if (dialogMode === 'delete-file') {
    await saveRecords({ files: files.filter((file) => file.id !== editing.id) }, 'File deleted.',
      selectedFolder, { remove: [editing.id] });
    return;
  }
  if (dialogMode === 'link') {
    const url = normalizeUrl(byId('link-url').value.trim());
    if (!url) {
      status(dialogStatus, 'Enter a valid HTTP or HTTPS URL.', true);
      byId('link-url').focus();
      return;
    }
    const revised = linkFromUrl(url, folderSelect.value, byId('link-title').value.trim(),
      byId('link-note').value.trim(), editing?.id);
    const updated = editing ? links.map((link) => link.id === revised.id ? revised : link) : [revised, ...links];
    await saveRecords({ folders, links: updated }, editing ? 'Link updated.' : 'Link added.');
    return;
  }

  if (dialogMode === 'bulk') {
    const lines = byId('bulk-urls').value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const urls = lines.map(normalizeUrl);
    const invalid = urls.findIndex((url) => !url);
    if (!lines.length || invalid >= 0) {
      status(dialogStatus, lines.length ? `Check the URL “${lines[invalid]}”.` : 'Enter at least one URL.', true);
      byId('bulk-urls').focus();
      return;
    }
    const seen = new Set(links.map((link) => link.url));
    const added = [];
    for (const url of urls) {
      if (!seen.has(url.href)) {
        added.push(linkFromUrl(url, folderSelect.value));
        seen.add(url.href);
      }
    }
    if (!added.length) {
      status(dialogStatus, 'Your vault already contains these URLs.', true);
      return;
    }
    const skipped = urls.length - added.length;
    const message = `Added ${added.length} ${added.length === 1 ? 'link' : 'links'}.` +
      (skipped ? ` Skipped ${skipped} ${skipped === 1 ? 'duplicate' : 'duplicates'}.` : '');
    await saveRecords({ folders, links: [...added, ...links] }, message);
    return;
  }

  if (dialogMode === 'folder') {
    const name = byId('folder-name').value.trim();
    if (!name || folders.some((folder) => folder.id !== editing?.id &&
        folder.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      status(dialogStatus, name ? 'A folder with that name already exists.' : 'Enter a folder name.', true);
      byId('folder-name').focus();
      return;
    }
    const revised = { id: editing?.id ?? crypto.randomUUID(), name };
    const updated = editing ? folders.map((folder) => folder.id === revised.id ? revised : folder) : [...folders, revised];
    await saveRecords({ folders: updated, links }, editing ? 'Folder updated.' : 'Folder created.', revised.id);
    return;
  }

  if (dialogMode === 'delete-link') {
    await saveRecords({ folders, links: links.filter((link) => link.id !== editing.id) }, 'Link deleted.');
    return;
  }

  const remaining = folders.filter((folder) => folder.id !== editing.id);
  const moveToUnfiled = (item) => item.folder === editing.id ? { ...item, folder: unfiled } : item;
  await saveRecords({ folders: remaining, links: links.map(moveToUnfiled), files: files.map(moveToUnfiled) },
    'Folder deleted.', unfiled);
}

gateForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const firstUse = raw === null;
  if (firstUse && password.value.length < minimumPasswordLength) {
    status(gateStatus, `Use at least ${minimumPasswordLength} characters.`, true);
    return;
  }
  if (firstUse && password.value !== confirmPassword.value) {
    status(gateStatus, 'The passwords must match.', true);
    confirmPassword.focus();
    return;
  }
  operate(async () => {
    if (firstUse) {
      const records = { folders: [], links: [], files: [] };
      const created = await prepareVault(password.value, records);
      await writeVault(created.raw, raw);
      raw = created.raw;
      showDesk({ key: created.key, salt: created.salt, records });
    } else {
      const unlocked = await openVault(password.value, raw);
      validateRecords(unlocked.records);
      if (!departing && !(await refreshVault(true))) showDesk(unlocked);
    }
  }, gateStatus, firstUse
    ? 'Could not create your vault. Check your browser storage settings.'
    : 'Could not unlock your vault. Check your password.');
});

editorForm.addEventListener('submit', (event) => {
  event.preventDefault();
  operate(submitEditor, dialogStatus, dialogMode === 'restore'
    ? 'Could not restore the backup. Check the file and password.'
    : 'Could not save changes. Check your browser storage settings.');
});

editor.addEventListener('cancel', (event) => {
  if (busy) event.preventDefault();
});
editor.addEventListener('close', () => {
  if (editor.open) return;
  editorForm.reset();
  editing = null;
  status(dialogStatus);
  byId('dialog-detail').textContent = '';
});

byId('restore').addEventListener('click', () => showEditor('restore'));
byId('lock').addEventListener('click', () => lockDesk());
byId('new-folder').addEventListener('click', () => showEditor('folder'));
byId('manage-folder').addEventListener('click', () => {
  showEditor('folder', session.records.folders.find(({ id }) => id === selectedFolder));
});
byId('new-link').addEventListener('click', () => showEditor('link'));
byId('bulk-add').addEventListener('click', () => showEditor('bulk'));
byId('add-files').addEventListener('click', () => showEditor('file-add'));
byId('dialog-cancel').addEventListener('click', () => editor.close());
byId('dialog-delete').addEventListener('click', () => showEditor('delete-folder', editing));
search.addEventListener('input', renderItems);

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const download = document.createElement('a');
  download.href = url;
  download.download = filename;
  download.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

byId('export').addEventListener('click', () => operate(async () => {
  const snapshot = raw;
  const rows = await readAttachments(snapshot);
  if (departing) return;
  if (rows.length !== session.records.files.length) throw new Error('File count does not match vault');
  const backup = createBackup(snapshot, rows);
  const extension = rows.length ? 'vault' : 'json';
  downloadBlob(backup, `private-desk-${new Date().toISOString().slice(0, 10)}.${extension}`);
  status(workspaceStatus, 'Encrypted backup exported. Keep your password to restore it.');
}, workspaceStatus, 'Could not export the backup.'));

window.addEventListener('storage', (event) => {
  if (!busy && !departing && (!event.key || event.key === CHANGE_KEY)) refreshVault();
});
window.addEventListener('pagehide', () => {
  departing = true;
  lockDesk(false);
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) location.reload();
});

try {
  if (!window.isSecureContext || !crypto.subtle || !window.indexedDB) throw new Error('Secure storage required');
  raw = await readVault();
  configureGate();
} catch {
  byId('gate-description').textContent = 'Open this page over HTTPS and allow local storage in your browser.';
}
