"use strict";

(() => {
  const form = document.querySelector("#replicate-controls");
  const query = document.querySelector("#replicate-query");
  const status = document.querySelector("#replicate-status");
  const source = document.querySelector("#replicate-source");
  const count = document.querySelector("#replicate-count");
  const empty = document.querySelector("#replicate-empty");
  const clear = document.querySelector("#replicate-clear");
  const views = document.querySelector("#replicate-views");
  const sidebar = document.querySelector("#replicate-facets");
  const tabs = Array.from(views.querySelectorAll("[data-gallery-view]"));
  const facets = Array.from(sidebar.querySelectorAll("[data-status-filter]"));
  const normalize = text => text.normalize("NFKC").toLocaleLowerCase().trim();
  const projects = Array.from(document.querySelectorAll("#replicate-grid .replicate-card"), card => ({
    card,
    status: card.dataset.status,
    sources: card.dataset.sources.split(" "),
    figure: card.dataset.figure === "true",
    text: normalize([card.id, card.textContent].join(" ")),
  }));
  let view = "projects";

  function anchorProject(hash) {
    try {
      const id = decodeURIComponent(hash.slice(1));
      return projects.find(project => project.card.id === id);
    } catch {
      return undefined;
    }
  }

  function route(nextView) {
    const url = new URL(window.location.href);
    const params = { view: nextView === "figures" ? nextView : "", q: query.value.trim(), status: status.value, source: source.value };
    for (const [key, value] of Object.entries(params)) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    const target = anchorProject(url.hash);
    if (target?.card.hidden || (target && nextView === "figures" && !target.figure)) url.hash = "";
    return url;
  }

  function update({ historyMethod, followHash = false } = {}) {
    document.body.dataset.view = view;
    const inView = projects.filter(project => view === "projects" || project.figure);
    const words = normalize(query.value).split(/\s+/).filter(Boolean);
    const scope = inView.filter(project => (!source.value || project.sources.includes(source.value))
      && words.every(word => project.text.includes(word)));
    const scoped = new Set(scope);
    const totals = new Map();
    let visible = 0;
    for (const project of projects) {
      const included = scoped.has(project);
      if (included) totals.set(project.status, (totals.get(project.status) || 0) + 1);
      const matches = included && (!status.value || status.value === project.status);
      project.card.hidden = !matches;
      if (matches) visible += 1;
    }
    for (const facet of facets) {
      const key = facet.dataset.statusFilter;
      const total = key ? totals.get(key) || 0 : scope.length;
      facet.setAttribute("aria-pressed", String(key === status.value));
      facet.querySelector(".rep-facet-count").textContent = total;
      facet.querySelector(".rep-facet-bar").style.setProperty("--fill", `${scope.length ? total * 100 / scope.length : 0}%`);
    }
    for (const tab of tabs) {
      if (tab.dataset.galleryView === view) tab.setAttribute("aria-current", "page");
      else tab.removeAttribute("aria-current");
      tab.href = route(tab.dataset.galleryView).href;
    }
    const label = `project${inView.length === 1 ? "" : "s"}${view === "figures" ? " with figures" : ""}`;
    count.textContent = `Showing ${visible} of ${inView.length} ${label}`;
    empty.textContent = inView.length ? "No projects match these filters."
      : view === "figures" ? "No figures are available yet." : "No projects are available yet.";
    empty.hidden = visible !== 0;
    clear.hidden = !query.value.trim() && !status.value && !source.value;

    if (historyMethod) {
      const url = route(view);
      if (url.href !== location.href) window.history[historyMethod](null, "", url);
    }
    if (followHash) {
      const anchor = anchorProject(window.location.hash);
      if (anchor && !anchor.card.hidden) requestAnimationFrame(() => anchor.card.scrollIntoView());
    }
  }

  function restore() {
    const params = new URLSearchParams(window.location.search);
    view = params.get("view") === "figures" ? "figures" : "projects";
    query.value = params.get("q") || "";
    status.value = params.get("status") || "";
    if (status.selectedIndex < 0) status.value = "";
    source.value = params.get("source") || "";
    if (source.selectedIndex < 0) source.value = "";
    update({ followHash: true });
  }

  const replace = () => update({ historyMethod: "replaceState" });
  form.addEventListener("submit", event => event.preventDefault());
  query.addEventListener("input", replace);
  source.addEventListener("change", replace);
  status.addEventListener("change", replace);
  for (const facet of facets) {
    facet.addEventListener("click", () => {
      status.value = facet.dataset.statusFilter;
      replace();
    });
  }
  for (const tab of tabs) {
    tab.addEventListener("click", event => {
      if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      event.preventDefault();
      view = tab.dataset.galleryView;
      update({ historyMethod: "pushState", followHash: true });
    });
  }
  clear.addEventListener("click", () => {
    form.reset();
    replace();
    query.focus();
  });
  window.addEventListener("popstate", restore);
  window.addEventListener("hashchange", restore);
  document.addEventListener("keydown", event => {
    if (event.key !== "/" || event.altKey || event.ctrlKey || event.metaKey || !projects.length) return;
    if (event.target instanceof HTMLElement && (event.target.matches("input, textarea, select") || event.target.isContentEditable)) return;
    event.preventDefault();
    query.focus();
  });
  form.hidden = sidebar.hidden = views.hidden = projects.length === 0;
  restore();
})();
