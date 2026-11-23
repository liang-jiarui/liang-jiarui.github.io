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
  count.textContent = "显示 " + visible + " / " + modules.length + " 个子模块";
  empty.hidden = visible !== 0;
}

if (modules.length > 0) {
  controls.addEventListener("submit", event => event.preventDefault());
  query.addEventListener("input", filterModules);
  category.addEventListener("change", filterModules);
  controls.hidden = false;
  filterModules();
}

const copyStatus = document.querySelector("#copy-status");
const copyTimers = new WeakMap();

async function copyCommand(event) {
  const button = event.currentTarget;
  const code = button.closest(".command").querySelector("code");
  try {
    await navigator.clipboard.writeText(code.textContent);
    button.textContent = "已复制";
    copyStatus.textContent = "已复制命令。";
  } catch {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(code);
    selection.removeAllRanges();
    selection.addRange(range);
    button.textContent = "已选中";
    copyStatus.textContent = "已选中命令，按 Ctrl+C 或 ⌘C 复制。";
  }
  clearTimeout(copyTimers.get(button));
  copyTimers.set(button, setTimeout(() => {
    button.textContent = "复制";
  }, 2000));
}

for (const button of document.querySelectorAll("button[data-copy]")) {
  button.hidden = false;
  button.addEventListener("click", copyCommand);
}
