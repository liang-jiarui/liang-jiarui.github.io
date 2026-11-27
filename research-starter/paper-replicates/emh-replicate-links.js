"use strict";

(() => {
  const data = document.getElementById("paper-replicate-links");
  const taskLinks = new Map(Object.entries(JSON.parse(data.textContent)));
  const detail = document.querySelector("#detailbody");
  const resultCount = document.querySelector("#resultcount");
  const scope = document.createElement("div");
  scope.className = "chips";
  scope.hidden = true;
  resultCount?.before(scope);

  function linksFor(tasks) {
    const projects = new Map(tasks.flatMap(task => taskLinks.get(task) || []).map(project => [project.url, project]));
    return Array.from(projects.values(), project => {
      const link = document.createElement("a");
      link.className = "chip";
      link.href = project.url;
      link.textContent = projects.size === 1 ? "View in Paper Replicates" : `Paper Replicates · ${project.title}`;
      return link;
    });
  }

  function showScope() {
    const selected = [...document.querySelectorAll('#tasktree button[data-pick="paper"].on')]
      .map(button => button.dataset.value);
    const query = new URLSearchParams(location.search).get("task");
    const links = linksFor([...selected, ...(query?.split("|") || [])]);
    scope.replaceChildren(...links);
    scope.hidden = links.length === 0;
  }

  function showCase() {
    if (!detail || detail.querySelector("[data-paper-replicate-case]")) return;
    const id = document.querySelector("tr.data.open")?.dataset.id || new URLSearchParams(location.search).get("case");
    const task = id?.match(/^@([^/]+)\//)?.[1];
    const links = linksFor(task ? [task] : []);
    if (!links.length) return;
    const panel = document.createElement("p");
    panel.className = "notes";
    panel.dataset.paperReplicateCase = "";
    panel.append(...links);
    detail.querySelector("h2")?.after(panel);
  }

  if (resultCount) new MutationObserver(showScope).observe(resultCount, { childList: true });
  if (detail) new MutationObserver(showCase).observe(detail, { childList: true });
  showScope();
  showCase();
})();
