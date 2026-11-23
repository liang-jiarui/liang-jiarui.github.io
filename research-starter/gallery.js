"use strict";

const controls = document.querySelector("#module-controls");
const query = document.querySelector("#module-query");
const category = document.querySelector("#module-category");
const count = document.querySelector("#module-count");
const empty = document.querySelector("#module-empty");
const cards = Array.from(document.querySelectorAll("#module-grid .module-card"));

const normalize = value => value.normalize("NFKC").toLocaleLowerCase().trim();
const modules = cards.map(card => ({
  card,
  category: card.dataset.category,
  text: normalize(card.textContent + " " + (card.dataset.search || "")),
}));

const categories = new Map();
for (const module of modules) {
  const label = module.card.querySelector(".module-card__type")?.textContent.trim();
  if (module.category && label) {
    categories.set(module.category, label);
  }
}
for (const [key, label] of categories) {
  category.add(new Option(label, key));
}
category.parentElement.hidden = categories.size < 2;

function filterModules() {
  const keywords = normalize(query.value).split(/\s+/);
  let visible = 0;
  for (const module of modules) {
    const matchesCategory = !category.value || module.category === category.value;
    module.card.hidden = !matchesCategory || !keywords.every(word => module.text.includes(word));
    if (!module.card.hidden) {
      visible += 1;
    }
  }
  count.textContent = `Showing ${visible} of ${modules.length} ${modules.length === 1 ? "submodule" : "submodules"}`;
  empty.hidden = visible !== 0;
}

if (modules.length > 0) {
  controls.addEventListener("submit", event => event.preventDefault());
  query.addEventListener("input", filterModules);
  category.addEventListener("change", filterModules);
  controls.hidden = false;
  filterModules();
}

const catalogPageSize = 20;
const recentPageSize = 6;
const shortDate = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const changeLabels = { added: "Added", updated: "Updated", removed: "Removed" };

function galleryEntries(rows) {
  return rows.flatMap((row) => {
    if (!row || ![row.hub, row.type, row.title, row.url].every(value => typeof value === "string" && value.trim())) {
      return [];
    }
    try {
      const href = new URL(row.url, location.href);
      return href.origin === location.origin && ["http:", "https:"].includes(href.protocol)
        ? [{ ...row, href: href.href }] : [];
    } catch {
      return [];
    }
  });
}

function galleryListItem(row, recent = false) {
  const item = document.createElement("li");
  const metadata = document.createElement("p");
  metadata.className = "catalog-item-meta";
  metadata.textContent = [row.hub, row.type, recent && changeLabels[row.change]].filter(Boolean).join(" · ");
  if (recent) {
    const time = document.createElement("time");
    time.dateTime = row.date;
    time.textContent = shortDate.format(new Date(row.date));
    metadata.append(" · ", time);
  }
  const removed = recent && row.change === "removed";
  const title = document.createElement(removed ? "span" : "a");
  title.className = "catalog-item-title";
  title.textContent = row.title;
  if (!removed) title.href = row.href;
  item.append(metadata, title);
  if (removed) {
    const link = document.createElement("a");
    link.className = "catalog-hub-link";
    link.href = row.href;
    link.textContent = `View ${row.hub}`;
    item.append(link);
  }
  if (!recent && typeof row.description === "string" && row.description.trim()) {
    const description = document.createElement("p");
    description.className = "catalog-item-description";
    description.textContent = row.description;
    item.append(description);
  }
  return item;
}

function enableGallerySearch(status) {
  const form = document.querySelector("#gallery-controls");
  const search = document.querySelector("#gallery-query");
  const hub = document.querySelector("#gallery-hub");
  const type = document.querySelector("#gallery-type");
  const list = document.querySelector("#gallery-results");
  const more = document.querySelector("#gallery-more");
  let indexed = [];
  let matches = [];
  let shown = 0;
  let limit = catalogPageSize;

  function showResults() {
    const next = matches.slice(shown, limit);
    list.append(...next.map(row => galleryListItem(row)));
    shown += next.length;
    list.hidden = shown === 0;
    more.hidden = shown === matches.length;
    status.textContent = shown ? `Showing ${shown.toLocaleString()} of ${matches.length.toLocaleString()} matches.`
      : "No gallery entries match these filters.";
  }

  function searchEntries() {
    const words = normalize(search.value).split(/\s+/).filter(Boolean);
    const focusedLink = list.contains(document.activeElement) && document.activeElement.href;
    list.replaceChildren();
    shown = 0;
    if (!words.length && !hub.value && !type.value) {
      matches = [];
      more.hidden = true;
      list.hidden = true;
      status.textContent = indexed.length
        ? `${indexed.length.toLocaleString()} gallery ${indexed.length === 1 ? "entry" : "entries"}`
        : "No gallery entries are indexed yet.";
      return;
    }
    matches = indexed.filter(({ row, text }) => (!hub.value || row.hub === hub.value)
      && (!type.value || row.type === type.value) && words.every(word => text.includes(word))).map(({ row }) => row);
    showResults();
    if (focusedLink) [...list.querySelectorAll("a")].find(link => link.href === focusedLink)?.focus({ preventScroll: true });
  }

  function resetResults() {
    limit = catalogPageSize;
    searchEntries();
  }
  form.addEventListener("submit", event => event.preventDefault());
  search.addEventListener("input", resetResults);
  hub.addEventListener("change", resetResults);
  type.addEventListener("change", resetResults);
  more.addEventListener("click", () => {
    const firstNew = shown;
    limit += catalogPageSize;
    showResults();
    list.children[firstNew]?.querySelector("a")?.focus();
  });

  return entries => {
    indexed = entries.map(row => ({
      row,
      text: normalize([row.title, row.description, row.id, row.hub, row.type, row.keywords]
        .flat().filter(value => typeof value === "string").join(" ")),
    }));
    for (const [field, select] of [["hub", hub], ["type", type]]) {
      const selected = select.value;
      const options = [...new Set([selected, ...entries.map(row => row[field])].filter(Boolean))]
        .sort((a, b) => a.localeCompare(b));
      select.replaceChildren(select.options[0], ...options.map(option => new Option(option, option)));
      select.value = selected;
    }
    if (entries.length) form.hidden = false;
    searchEntries();
  };
}

function showRecentChanges(rows, status) {
  const changes = rows.filter(row => Object.hasOwn(changeLabels, row.change) && Number.isFinite(Date.parse(row.date)))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const list = document.querySelector("#recent-list");
  list.replaceChildren(...changes.slice(0, recentPageSize).map(row => galleryListItem(row, true)));
  list.hidden = changes.length === 0;
  status.textContent = "No recent gallery changes recorded.";
  status.hidden = changes.length > 0;
  const remaining = changes.slice(recentPageSize);
  const more = document.querySelector("#recent-more");
  more.hidden = remaining.length === 0;
  more.querySelector("ul").replaceChildren(...remaining.map(row => galleryListItem(row, true)));
  if (remaining.length) {
    more.querySelector("summary").textContent = `Show ${remaining.length.toLocaleString()} more`;
  }
}

function startGalleryIndex() {
  const status = document.querySelector("#gallery-status");
  const recentStatus = document.querySelector("#recent-status");
  status.textContent = "Loading gallery index…";
  recentStatus.textContent = "Loading recent updates…";
  status.hidden = false;
  recentStatus.hidden = false;
  const updateSearch = enableGallerySearch(status);
  let previousBody;
  let loading = false;

  async function refresh() {
    if (document.hidden || loading) return;
    loading = true;
    try {
      const response = await fetch("hub-index.json", { cache: "no-cache", signal: AbortSignal.timeout?.(15_000) });
      if (!response.ok) throw new Error("Missing gallery index");
      const body = await response.text();
      if (body === previousBody) return;
      const index = JSON.parse(body);
      if (index.schema_version !== 1 || !Array.isArray(index.entries) || !Array.isArray(index.recent)) {
        throw new Error("Unsupported gallery index");
      }
      updateSearch(galleryEntries(index.entries));
      showRecentChanges(galleryEntries(index.recent), recentStatus);
      previousBody = body;
    } catch {
      if (previousBody === undefined) {
        status.textContent = "Gallery search is unavailable. Open a gallery from the submodule directory.";
        recentStatus.textContent = "Recent gallery updates are unavailable.";
      }
    } finally {
      loading = false;
    }
  }
  refresh();
  document.addEventListener("visibilitychange", refresh);
  window.setInterval(refresh, 60_000);
}

startGalleryIndex();

const copyStatus = document.querySelector("#copy-status");
const copyTimers = new WeakMap();

async function copyCommand(event) {
  const button = event.currentTarget;
  const code = button.closest(".command").querySelector("code");
  try {
    await navigator.clipboard.writeText(code.textContent);
    button.textContent = "Copied";
    copyStatus.textContent = "Command copied.";
  } catch {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(code);
    selection.removeAllRanges();
    selection.addRange(range);
    button.textContent = "Selected";
    copyStatus.textContent = "Command selected. Press Ctrl+C or ⌘C to copy it.";
  }
  clearTimeout(copyTimers.get(button));
  copyTimers.set(button, setTimeout(() => {
    button.textContent = "Copy";
  }, 2000));
}

for (const button of document.querySelectorAll("button[data-copy]")) {
  button.hidden = false;
  button.addEventListener("click", copyCommand);
}
