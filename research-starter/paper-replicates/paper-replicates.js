"use strict";

const form = document.querySelector("#replicate-controls");
const query = document.querySelector("#replicate-query");
const status = document.querySelector("#replicate-status");
const source = document.querySelector("#replicate-source");
const count = document.querySelector("#replicate-count");
const empty = document.querySelector("#replicate-empty");
const normalize = value => value.normalize("NFKC").toLocaleLowerCase().trim();
const projects = Array.from(document.querySelectorAll("#replicate-grid .replicate-card"), card => ({
  card,
  status: card.dataset.status,
  sources: card.dataset.sources.split(" "),
  text: normalize([card.id, card.textContent].join(" ")),
}));

function filterProjects() {
  const words = normalize(query.value).split(/\s+/).filter(Boolean);
  let visible = 0;
  for (const project of projects) {
    const matches = (!status.value || status.value === project.status)
      && (!source.value || project.sources.includes(source.value))
      && words.every(word => project.text.includes(word));
    project.card.hidden = !matches;
    if (matches) visible += 1;
  }
  count.textContent = `Showing ${visible} of ${projects.length} ${projects.length === 1 ? "project" : "projects"}`;
  empty.hidden = visible !== 0;
}

if (projects.length) {
  form.addEventListener("submit", event => event.preventDefault());
  query.addEventListener("input", filterProjects);
  status.addEventListener("change", filterProjects);
  source.addEventListener("change", filterProjects);
  form.hidden = false;
}
