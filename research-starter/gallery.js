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
