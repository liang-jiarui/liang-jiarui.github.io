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
  byId('gate-title').textContent = firstUse ? '创建私人资料库' : '解锁私人资料库';
  byId('gate-description').textContent = firstUse
    ? '设置至少 12 个字符的密码。链接和备注会加密保存在此浏览器，密码无法找回。'
    : '输入密码查看此浏览器中加密保存的链接。';
  byId('gate-submit').textContent = firstUse ? '创建资料库' : '解锁';
  byId('confirm-field').hidden = !firstUse;
  confirmPassword.disabled = !firstUse;
  confirmPassword.required = firstUse;
  password.autocomplete = firstUse ? 'new-password' : 'current-password';
  password.minLength = firstUse ? 12 : 0;
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
  byId('list-title').textContent = '全部链接';
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
  status(gateStatus, '另一个标签页更新了资料库，请重新解锁。', true);
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
        ? '浏览器存储空间不足，本次更改未保存。'
        : fallback;
      status(feedback, message, true);
    }
  } finally {
    setBusy(false);
    if (!departing) refreshVault();
  }
}

function folderName(folder) {
  if (folder === allFolders) return '全部链接';
  if (folder === unfiled) return '未归档';
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
  byId('list-count').textContent = matches.length + ' 条链接';
  linkList.replaceChildren(...matches.map(linkCard));
  byId('empty-state').hidden = matches.length > 0;
  byId('empty-title').textContent = query ? '没有匹配的链接' : '这里还没有链接';
  byId('empty-detail').textContent = query ? '试试其他关键词。' : '添加单个网址，或粘贴一组网址。';
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
  const edit = element('button', 'button button-quiet', '编辑');
  const remove = element('button', 'button button-quiet button-danger', '删除');
  edit.type = remove.type = 'button';
  edit.setAttribute('aria-label', '编辑 ' + link.title);
  remove.setAttribute('aria-label', '删除 ' + link.title);
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
    const options = [new Option('未归档', unfiled)];
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
    link: record ? '编辑链接' : '添加链接',
    bulk: '批量添加链接',
    folder: record ? '管理文件夹' : '新建文件夹',
    restore: '从备份恢复',
    'delete-link': '删除链接',
    'delete-folder': '删除文件夹',
  };
  const details = {
    bulk: '每行输入一个完整的 HTTP 或 HTTPS 网址。已有网址会跳过。',
    restore: raw === null
      ? '选择之前导出的加密备份，并输入备份使用的密码。'
      : '恢复备份将替换此浏览器中当前的资料库。确认前可以先解锁并导出当前资料。',
    'delete-link': record ? '将从资料库删除「' + record.title + '」。' : '',
    'delete-folder': record ? '将删除文件夹「' + record.name + '」，其中的链接会移到「未归档」。' : '',
  };
  const submitLabels = {
    bulk: '添加链接',
    restore: raw === null ? '恢复资料库' : '替换并恢复',
    'delete-link': '删除链接',
    'delete-folder': '删除文件夹',
  };
  const detail = byId('dialog-detail');
  detail.textContent = details[mode] ?? '';
  detail.hidden = !detail.textContent;
  byId('dialog-title').textContent = titles[mode];
  byId('dialog-delete').hidden = mode !== 'folder' || record === null;
  const submit = byId('dialog-submit');
  const destructive = mode.startsWith('delete-') || (mode === 'restore' && raw !== null);
  submit.textContent = submitLabels[mode] ?? '保存';
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
      status(dialogStatus, '备份文件过大，无法在此浏览器恢复。', true);
      return;
    }
    const backup = await file.text();
    const unlocked = await openVault(backupPassword, backup);
    validateRecords(unlocked.records);
    await writeVault(backup, raw);
    raw = backup;
    editor.close();
    showDesk(unlocked);
    status(workspaceStatus, '已恢复加密备份。');
    return;
  }

  const { folders, links } = session.records;
  if (dialogMode === 'link') {
    const url = normalizeUrl(byId('link-url').value.trim());
    if (!url) {
      status(dialogStatus, '请输入有效的 HTTP 或 HTTPS 网址。', true);
      byId('link-url').focus();
      return;
    }
    const revised = linkFromUrl(url, folderSelect.value, byId('link-title').value.trim(),
      byId('link-note').value.trim(), editing?.id);
    const updated = editing ? links.map((link) => link.id === revised.id ? revised : link) : [revised, ...links];
    await saveRecords({ folders, links: updated }, editing ? '链接已更新。' : '已添加链接。');
    return;
  }

  if (dialogMode === 'bulk') {
    const lines = byId('bulk-urls').value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const urls = lines.map(normalizeUrl);
    const invalid = urls.findIndex((url) => !url);
    if (!lines.length || invalid >= 0) {
      status(dialogStatus, lines.length ? '请检查此网址：' + lines[invalid] : '请输入至少一个网址。', true);
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
      status(dialogStatus, '这些网址已经在资料库中。', true);
      return;
    }
    const skipped = urls.length - added.length;
    const message = '已添加 ' + added.length + ' 条链接。' + (skipped ? '跳过 ' + skipped + ' 个重复网址。' : '');
    await saveRecords({ folders, links: [...added, ...links] }, message);
    return;
  }

  if (dialogMode === 'folder') {
    const name = byId('folder-name').value.trim();
    if (!name || folders.some((folder) => folder.id !== editing?.id &&
        folder.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      status(dialogStatus, name ? '已存在同名文件夹。' : '请输入文件夹名称。', true);
      byId('folder-name').focus();
      return;
    }
    const revised = { id: editing?.id ?? crypto.randomUUID(), name };
    const updated = editing ? folders.map((folder) => folder.id === revised.id ? revised : folder) : [...folders, revised];
    await saveRecords({ folders: updated, links }, editing ? '文件夹已更新。' : '文件夹已创建。', revised.id);
    return;
  }

  if (dialogMode === 'delete-link') {
    await saveRecords({ folders, links: links.filter((link) => link.id !== editing.id) }, '链接已删除。');
    return;
  }

  const remaining = folders.filter((folder) => folder.id !== editing.id);
  const moved = links.map((link) => link.folder === editing.id ? { ...link, folder: unfiled } : link);
  await saveRecords({ folders: remaining, links: moved }, '文件夹已删除。', unfiled);
}

gateForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const firstUse = raw === null;
  if (firstUse && password.value.length < 12) {
    status(gateStatus, '请输入至少 12 个字符的密码。', true);
    return;
  }
  if (firstUse && password.value !== confirmPassword.value) {
    status(gateStatus, '两次输入的密码不一致。', true);
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
  }, gateStatus, firstUse ? '无法创建资料库，请检查浏览器存储设置。' : '密码不正确，或浏览器中的资料无法读取。');
});

editorForm.addEventListener('submit', (event) => {
  event.preventDefault();
  operate(submitEditor, dialogStatus, dialogMode === 'restore'
    ? '无法恢复备份，请检查文件和密码。'
    : '无法保存更改，请检查浏览器存储设置。');
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
  status(workspaceStatus, '已导出加密备份。恢复时需要资料库密码。');
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
  byId('gate-description').textContent = '请通过 HTTPS 打开此页，并允许浏览器使用本地存储。';
}
