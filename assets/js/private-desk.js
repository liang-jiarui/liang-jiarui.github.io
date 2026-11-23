import { STORAGE_KEY, openVault, prepareVault, readVault, sealVault, writeVault } from './private-desk-storage.js';

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
const editorGroups = ['link', 'bulk', 'assign', 'note', 'folder', 'restore'];

const minimumPasswordLength = 6;
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
}

function configureGate() {
  const firstUse = raw === null;
  byId('gate-title').textContent = firstUse ? 'Create your vault' : 'Unlock your vault';
  byId('gate-description').textContent = firstUse
    ? `Choose a password with at least ${minimumPasswordLength} characters. Keep it somewhere safe to access your encrypted links and notes.`
    : 'Enter your password to view the encrypted links in this browser.';
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
  byId('list-title').textContent = 'All links';
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
  for (const id of ['gate-submit', 'restore', 'lock', 'dialog-submit', 'dialog-delete', 'dialog-cancel']) {
    byId(id).disabled = value;
  }
  gateForm.setAttribute('aria-busy', String(value));
  editorForm.setAttribute('aria-busy', String(value));
}

function refreshVault() {
  let saved;
  try {
    saved = readVault();
  } catch {
    return false;
  }
  if (saved === raw) return false;
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
    if (!departing && !refreshVault()) {
      const message = error.name === 'QuotaExceededError'
        ? 'Your browser ran out of storage. This change could not be saved.'
        : fallback;
      status(feedback, message, true);
    }
  } finally {
    setBusy(false);
    if (!departing) refreshVault();
  }
}

function folderName(folder) {
  if (folder === allFolders) return 'All links';
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
  const { folders, links } = session.records;
  const counts = new Map();
  for (const { folder } of links) {
    counts.set(folder, (counts.get(folder) ?? 0) + 1);
  }

  const options = [allFolders, unfiled, ...folders.map(({ id }) => id)];
  let selectedButton;
  folderList.replaceChildren(...options.map((folder) => {
    const item = document.createElement('li');
    const button = element('button', 'folder-button', '');
    const count = folder === allFolders ? links.length : counts.get(folder) ?? 0;
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
  renderLinks();
  if (focusFolder) selectedButton?.focus();
}

function renderLinks() {
  const query = search.value.trim().toLocaleLowerCase();
  const { links } = session.records;
  const matches = links.filter((link) =>
    (selectedFolder === allFolders || link.folder === selectedFolder) &&
    [link.title, link.url, link.note].some((value) => value.toLocaleLowerCase().includes(query))
  );
  byId('list-title').textContent = folderName(selectedFolder);
  byId('list-count').textContent = `${matches.length} ${matches.length === 1 ? 'link' : 'links'}`;
  linkList.replaceChildren(...matches.map(linkCard));
  byId('empty-state').hidden = matches.length > 0;
  byId('empty-title').textContent = query ? 'No matching links' : 'No links yet';
  byId('empty-detail').textContent = query ? 'Try a different search.' : 'Add a single link or paste a list of URLs.';
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

function showEditor(mode, record = null) {
  dialogMode = mode;
  editing = record;
  editorForm.reset();
  status(dialogStatus);

  const groups = {
    link: ['link', 'assign', 'note'],
    bulk: ['bulk', 'assign'],
    folder: ['folder'],
    restore: ['restore'],
    'delete-link': [],
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

  const titles = {
    link: record ? 'Edit link' : 'Add link',
    bulk: 'Add links in bulk',
    folder: record ? 'Manage folder' : 'New folder',
    restore: 'Restore from backup',
    'delete-link': 'Delete link',
    'delete-folder': 'Delete folder',
  };
  const details = {
    bulk: 'Enter one full HTTP or HTTPS URL per line. Duplicate URLs are skipped.',
    restore: raw === null
      ? 'Choose an encrypted backup and enter its password.'
      : 'Restoring a backup replaces the vault in this browser. You can unlock and export your current vault first.',
    'delete-link': record ? `Delete “${record.title}” from your vault?` : '',
    'delete-folder': record ? `Delete “${record.name}”? Its links will move to Unfiled.` : '',
  };
  const submitLabels = {
    bulk: 'Add links',
    restore: raw === null ? 'Restore vault' : 'Replace and restore',
    'delete-link': 'Delete link',
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

async function saveRecords(records, message, folder = selectedFolder) {
  const updated = await sealVault(session.key, session.salt, records);
  await writeVault(updated, raw);
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
    if (file.size > 8 * 1024 * 1024) {
      status(dialogStatus, 'The backup file is too large to restore in this browser.', true);
      return;
    }
    const backup = await file.text();
    const unlocked = await openVault(backupPassword, backup);
    validateRecords(unlocked.records);
    await writeVault(backup, raw);
    raw = backup;
    editor.close();
    showDesk(unlocked);
    status(workspaceStatus, 'Backup restored.');
    return;
  }

  const { folders, links } = session.records;
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
  const moved = links.map((link) => link.folder === editing.id ? { ...link, folder: unfiled } : link);
  await saveRecords({ folders: remaining, links: moved }, 'Folder deleted.', unfiled);
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
      const records = { folders: [], links: [] };
      const created = await prepareVault(password.value, records);
      await writeVault(created.raw, raw);
      raw = created.raw;
      showDesk({ key: created.key, salt: created.salt, records });
    } else {
      const unlocked = await openVault(password.value, raw);
      validateRecords(unlocked.records);
      if (!departing && !refreshVault()) showDesk(unlocked);
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
byId('dialog-cancel').addEventListener('click', () => editor.close());
byId('dialog-delete').addEventListener('click', () => showEditor('delete-folder', editing));
search.addEventListener('input', renderLinks);

byId('export').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
  const download = document.createElement('a');
  download.href = url;
  download.download = 'private-desk-' + new Date().toISOString().slice(0, 10) + '.json';
  download.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  status(workspaceStatus, 'Encrypted backup exported. Keep your password to restore it.');
});

window.addEventListener('storage', (event) => {
  if (!busy && !departing && (!event.key || event.key === STORAGE_KEY)) refreshVault();
});
window.addEventListener('pagehide', () => {
  departing = true;
  lockDesk(false);
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) location.reload();
});

try {
  if (!window.isSecureContext || !crypto.subtle) throw new Error('Secure context required');
  raw = readVault();
  configureGate();
} catch {
  byId('gate-description').textContent = 'Open this page over HTTPS and allow local storage in your browser.';
}
