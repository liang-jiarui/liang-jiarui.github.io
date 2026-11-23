"use strict";

const byId = (id) => document.getElementById(id);
const results = byId("results");
const queryInput = byId("query");
const dialog = byId("detail");
const detailContent = byId("detail-content");
const navLinks = [...document.querySelectorAll("[data-view]")];
const roleLabels = {
  label: "Label", feature: "Feature", feature_and_label: "Feature & label", derived: "Derived",
};

function element(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  node.append(...children);
  return node;
}

function start(catalog) {
  const tasks = new Map(catalog.tasks.map((row) => [row.id, row]));
  const datasets = new Map(catalog.datasets.map((row) => [row.id, row]));
  const hubTitles = new Map(catalog.hubs.map((hub) => [hub.id, hub.short_name ?? hub.title]));
  const views = {
    gallery: {
      title: "ML Gallery", unit: "figure", rows: catalog.gallery,
      description: "Explore inference data diagnostics, research figures and the experiments behind them.",
      placeholder: "Search figures", groupLabel: "By result type",
      groupAll: "All result types", filterLabel: "By task", facetAll: "All tasks",
      facet: (row) => row.task_id, facetTitle: (id) => tasks.get(id)?.title ?? id,
      relatedText: (row) => tasks.get(row.task_id)?.title,
    },
    data: {
      title: "ML datasets", unit: "dataset", rows: catalog.datasets,
      description: "Explore input datasets, their coverage and the variables used in ML experiments.",
      placeholder: "Search datasets", filterLabel: "By role", facetAll: "All roles",
      facet: (row) => row.role, facetTitle: (id) => roleLabels[id] ?? id,
      columns: [
        ["title", "Dataset"], ["role", "Role"], ["temporal", "Frequency"],
        ["spatial", "Resolution"], ["coverage", "Coverage"],
      ],
    },
    tasks: {
      title: "ML tasks", unit: "task", rows: catalog.tasks,
      description: "Find experiment configurations, input datasets and commands to validate each workflow.",
      placeholder: "Search tasks", filterLabel: "By status", facetAll: "All statuses",
      facet: (row) => row.status, facetTitle: (id) => id,
      relatedText: (row) => row.dataset_ids.map((id) => datasets.get(id)?.title),
      columns: [
        ["title", "Task"], ["category", "Topic"], ["target", "Target"],
        ["status", "Status"], ["experiments", "Experiments"],
      ],
    },
  };

  const state = { view: "gallery", topic: "", facet: "", query: "", item: "", sort: "", descending: false };
  const filterToggle = byId("filter-toggle");
  const reset = byId("reset");
  let opener;

  function hrefFor(view, item = "") {
    const url = new URL(location.href);
    url.hash = "";
    url.search = "";
    if (view !== "gallery") url.searchParams.set("view", view);
    if (item) url.searchParams.set("item", item);
    return url;
  }

  function syncUrl(push = false) {
    const url = hrefFor(state.view, state.item);
    for (const [key, value] of [["topic", state.topic], ["filter", state.facet], ["q", state.query]]) {
      if (value) url.searchParams.set(key, value);
    }
    history[push ? "pushState" : "replaceState"](null, "", url);
  }

  function readUrl() {
    const params = new URLSearchParams(location.search);
    const directTask = params.get("task");
    const directDataset = params.get("dataset");
    const requested = params.get("view") ?? (directTask ? "tasks" : directDataset ? "data" : "gallery");
    const view = Object.hasOwn(views, requested) ? requested : "gallery";
    const rows = views[view].rows;
    const topic = params.get("topic") ?? "";
    const facet = params.get("filter") ?? "";
    const item = params.get("item") ?? (view === "tasks" ? directTask : view === "data" ? directDataset : "");
    Object.assign(state, {
      view,
      topic: rows.some((row) => row.category === topic) ? topic : "",
      facet: (view === "gallery" ? tasks.has(facet) : rows.some((row) => views[view].facet(row) === facet)) ? facet : "",
      query: params.get("q") ?? "",
      item: rows.some((row) => row.id === item) ? item : "",
      sort: "", descending: false,
    });
  }

  function navigate(view, item = "") {
    Object.assign(state, { view, item, topic: "", facet: "", query: "", sort: "", descending: false });
    syncUrl(true);
    drawView();
    drawDetail();
  }

  function counts(rows, getKey) {
    const totals = new Map();
    for (const row of rows) {
      const key = getKey(row);
      if (key) totals.set(key, (totals.get(key) ?? 0) + 1);
    }
    return totals;
  }

  function drawTree(container, rows, getKey, label, key, allLabel, include = []) {
    const groupCounts = counts(rows, getKey);
    for (const value of include) {
      if (!groupCounts.has(value)) groupCounts.set(value, 0);
    }
    const sorted = [...groupCounts].sort(([a, aCount], [b, bCount]) =>
      Number(bCount > 0) - Number(aCount > 0) || label(a).localeCompare(label(b)));
    const options = [["", rows.length], ...sorted];
    container.replaceChildren(...options.map(([value, count]) => {
      const button = element("button", { type: "button", "aria-pressed": String(state[key] === value) },
        element("span", {}, value ? label(value) : allLabel), element("span", { class: "n" }, String(count)));
      button.addEventListener("click", () => {
        state[key] = value;
        for (const child of container.children) child.setAttribute("aria-pressed", String(child === button));
        syncUrl();
        drawResults(true);
      });
      return button;
    }));
  }

  function drawView() {
    const view = views[state.view];
    for (const link of navLinks) {
      link.toggleAttribute("aria-current", link.dataset.view === state.view);
      if (link.hasAttribute("aria-current")) link.setAttribute("aria-current", "page");
    }
    byId("view-title").textContent = view.title;
    byId("view-description").textContent = view.description;
    document.title = `${view.title} · ${catalog.hub.title}`;
    byId("group-label").textContent = view.groupLabel ?? "By topic";
    byId("filter-label").textContent = view.filterLabel;
    queryInput.placeholder = view.placeholder;
    queryInput.value = state.query;
    drawTree(byId("groups"), view.rows, (row) => row.category, (name) => name, "topic", view.groupAll ?? "All topics");
    const tasksWithoutFigures = state.view === "gallery" ? tasks.keys() : [];
    drawTree(byId("filters"), view.rows, view.facet, view.facetTitle, "facet", view.facetAll, tasksWithoutFigures);
    drawResults(true);
  }

  function openDetail(id, trigger) {
    opener = trigger;
    state.item = id;
    syncUrl();
    drawDetail();
  }

  function card(row) {
    const image = element("img", { src: row.image, alt: "", loading: "lazy", decoding: "async" });
    const taskTitle = tasks.get(row.task_id)?.title ?? row.task_id;
    const button = element("button", { type: "button", class: "card" },
      element("span", { class: "card-media" }, image),
      element("span", { class: "card-copy" },
        element("span", { class: "card-labels" },
          element("span", { class: "card-kicker" }, row.category),
          ...(row.badge ? [element("span", { class: "card-badge" }, row.badge)] : [])),
        element("strong", { class: "card-title" }, row.title),
        ...(taskTitle && taskTitle !== row.title ? [element("span", { class: "card-task" }, taskTitle)] : [])));
    button.addEventListener("click", () => openDetail(row.id, button));
    return button;
  }

  function pill(value) {
    const tone = value.toLowerCase().replace(/\s+/g, "-");
    return element("span", { class: "pill", "data-tone": tone }, roleLabels[value] ?? value);
  }

  function cell(row, key) {
    if (key === "title") {
      const button = element("button", { type: "button", class: "table-title" }, row.title);
      button.addEventListener("click", () => openDetail(row.id, button));
      return element("th", { scope: "row" }, button, element("span", { class: "table-id mono" }, row.task_path ?? row.id));
    }
    if (key === "status" || key === "role") return element("td", {}, pill(row[key]));
    const value = Array.isArray(row[key]) ? row[key].length : row[key];
    return element("td", {}, String(value ?? "—"));
  }

  function table(rows, view) {
    const headers = view.columns.map(([key, title]) => {
      const th = element("th", { scope: "col" });
      if (state.sort === key) th.setAttribute("aria-sort", state.descending ? "descending" : "ascending");
      const indicator = state.sort === key ? (state.descending ? "↓" : "↑") : "";
      const button = element("button", { type: "button", class: "sort", "data-sort": key },
        title, element("span", { "aria-hidden": "true" }, indicator));
      button.addEventListener("click", () => {
        state.descending = state.sort === key && !state.descending;
        state.sort = key;
        drawResults();
        results.querySelector(`[data-sort="${key}"]`).focus();
      });
      th.append(button);
      return th;
    });
    return element("table", {},
      element("caption", { class: "sr" }, view.title),
      element("thead", {}, element("tr", {}, ...headers)),
      element("tbody", {}, ...rows.map((row) => element("tr", {}, ...view.columns.map(([key]) => cell(row, key))))));
  }

  function searchableText(row, view) {
    return [
      row.id, row.title, row.category, row.description, row.target, row.status, row.coverage, row.run_id, row.scenario, row.badge,
      row.variable, row.period, row.findings, row.data?.map((asset) => asset.label),
      row.spatial, row.temporal, roleLabels[row.role], row.role, row.dataset_ids, row.variables, row.task_path,
      row.experiments?.map((entry) => [entry.id, entry.title, entry.description]), view.relatedText?.(row),
      row.related_resources?.map((resource) => [resource.id, resource.title, hubTitles.get(resource.hub_id)]),
    ].flat(Infinity).filter(Boolean).join(" ").toLowerCase();
  }

  function emptyResults(view, tokens) {
    const selectedTask = state.view === "gallery" && tasks.get(state.facet);
    if (selectedTask && !view.rows.some((row) => row.task_id === selectedTask.id)) {
      return element("div", { class: "empty" }, element("p", {}, "This task has no registered figures yet."),
        detailLink("View task and configurations", "tasks", selectedTask.id));
    }
    if (state.view === "gallery" && !state.topic && !state.facet && tokens.length) {
      const matches = catalog.tasks.filter((task) => {
        const text = searchableText(task, views.tasks);
        return tokens.every((token) => text.includes(token));
      });
      if (matches.length) {
        return element("div", { class: "empty task-matches" }, element("p", {}, "No figures match. Matching ML tasks:"),
          list(matches.map((task) => detailLink(task.title, "tasks", task.id))));
      }
    }
    return element("p", { class: "empty" }, "No results match these filters.");
  }

  function drawActiveFilters(view) {
    const selected = [["topic", state.topic], ["facet", state.facet && view.facetTitle(state.facet)]];
    const chips = selected.filter(([, label]) => label).map(([key, label]) => {
      const button = element("button", { type: "button", class: "chip", "aria-label": `Remove filter: ${label}` },
        label, element("span", { "aria-hidden": "true" }, "×"));
      button.addEventListener("click", () => {
        state[key] = "";
        syncUrl();
        drawView();
        queryInput.focus();
      });
      return button;
    });
    const count = byId("filter-count");
    count.hidden = !chips.length;
    count.textContent = String(chips.length);
    byId("active-filters").replaceChildren(...chips);
    reset.disabled = !chips.length && !state.query && !state.sort;
  }

  function drawResults(resetScroll = false) {
    const view = views[state.view];
    const tokens = state.query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const rows = view.rows.filter((row) => {
      if (state.topic && row.category !== state.topic) return false;
      if (state.facet && view.facet(row) !== state.facet) return false;
      const text = searchableText(row, view);
      return tokens.every((token) => text.includes(token));
    });
    if (state.sort) {
      const value = (row) => Array.isArray(row[state.sort]) ? row[state.sort].length : row[state.sort] ?? "";
      rows.sort((a, b) => String(value(a)).localeCompare(String(value(b)), undefined, { numeric: true }) * (state.descending ? -1 : 1));
    }
    byId("resultcount").textContent = `${rows.length} of ${view.rows.length} ${view.unit}${view.rows.length === 1 ? "" : "s"}`;
    drawActiveFilters(view);
    const content = !rows.length
      ? emptyResults(view, tokens)
      : state.view === "gallery"
        ? element("div", { class: "cards" }, ...rows.map(card))
        : table(rows, view);
    results.replaceChildren(content);
    if (resetScroll) results.scrollTop = 0;
  }

  function section(title, content) {
    detailContent.append(element("section", { class: "detail-section" }, element("h3", {}, title), content));
  }

  function metadata(pairs) {
    const entries = pairs.filter(([, value]) => value != null && value !== "" && value !== "—");
    detailContent.append(element("dl", { class: "meta" }, ...entries.flatMap(([key, value]) => [
      element("dt", {}, key), element("dd", {}, value),
    ])));
  }

  function detailLink(title, view, item) {
    const link = element("a", { href: hrefFor(view, item) }, title);
    link.addEventListener("click", (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigate(view, item);
      byId("detail-title").focus();
    });
    return link;
  }

  function list(items, className = "link-list") {
    const entries = items.map((item) => element("li", {}, ...(Array.isArray(item) ? item : [item])));
    return element("ul", { class: className }, ...entries);
  }

  async function copyText(text, button) {
    let success = false;
    try {
      await navigator.clipboard.writeText(text);
      success = true;
    } catch {
      const field = element("textarea", { class: "visually-copied", "aria-label": "Text to copy", readonly: "" });
      field.value = text;
      dialog.append(field);
      field.select();
      try { success = document.execCommand("copy"); } catch {}
      field.remove();
      button.focus();
    }
    button.textContent = success ? "Copied" : "Copy failed";
    setTimeout(() => { button.textContent = button.dataset.label; }, 1800);
  }

  function copyButton(label, text) {
    const button = element("button", { type: "button", class: "mini", "data-label": label, "aria-live": "polite" }, label);
    button.addEventListener("click", () => copyText(text, button));
    return button;
  }

  function commandRow(command) {
    return element("div", { class: "command" }, element("pre", {}, command), copyButton("Copy command", command));
  }

  function showFigure(row) {
    metadata([["Experiment", row.run_id], ["Variable", row.variable], ["Scenario", row.scenario], ["Period", row.period]]);
    if (row.note) detailContent.append(element("p", { class: "figure-note" }, row.note));
    detailContent.append(element("figure", { class: "full-figure" },
      element("img", { src: row.image, alt: row.alt ?? row.title })));
    if (row.findings?.length) section("Findings", list(row.findings));
    const task = tasks.get(row.task_id);
    const links = [element("a", { href: row.image }, "Open image at full size")];
    if (task) links.unshift(detailLink(task.title, "tasks", task.id));
    section("Figure resources", list(links));
    if (row.data?.length) {
      section("Download figure data", list(row.data.map(({ label, path }) => {
        const href = path.split("/").map(encodeURIComponent).join("/");
        return element("a", { href, download: "" }, label);
      })));
    }
  }

  function showDataset(row) {
    metadata([
      ["Dataset ID", element("span", { class: "mono" }, row.id)], ["Role", pill(row.role)],
      ["Frequency", row.temporal], ["Resolution", row.spatial], ["Coverage", row.coverage],
    ]);
    if (row.variables.length) {
      section("Variables", list(row.variables.map((name) => element("code", {}, name)), "variables"));
    }
    const relatedTasks = catalog.tasks.filter((item) => item.dataset_ids.includes(row.id));
    if (relatedTasks.length) section("ML tasks", list(relatedTasks.map((item) => detailLink(item.title, "tasks", item.id))));
  }

  function showTask(row) {
    metadata([
      ["Task ID", element("span", { class: "mono" }, row.id)], ["Task folder", row.task_path],
      ["Status", pill(row.status)], ["Target", row.target],
    ]);
    if (row.dataset_ids.length) {
      section("ML data", list(row.dataset_ids.map((id) => detailLink(datasets.get(id)?.title ?? id, "data", id))));
    }
    if (row.experiments.length) {
      const items = row.experiments.map((entry) => [
        element("a", { href: entry.url }, entry.title ?? entry.id),
        element("span", { class: "mono" }, entry.config),
        ...(entry.description && entry.description !== row.description
          ? [element("p", { class: "muted" }, entry.description)] : []),
        ...(entry.command ? [commandRow(entry.command)] : []),
      ]);
      section("Experiment configurations", list(items, "experiment-list"));
    }
    if (row.commands?.length) {
      section("Commands", element("div", {}, ...row.commands.flatMap(({ label, command }) => [
        element("p", { class: "muted" }, label), commandRow(command),
      ])));
    }
    const figures = catalog.gallery.filter((item) => item.task_id === row.id);
    if (figures.length) section("Gallery figures", list(figures.map((item) => detailLink(item.title, "gallery", item.id))));
  }

  function drawDetail() {
    const row = views[state.view].rows.find((entry) => entry.id === state.item);
    if (!row) {
      if (dialog.open) dialog.close();
      return;
    }
    detailContent.replaceChildren(
      element("span", { class: "kicker" }, [row.category, row.badge].filter(Boolean).join(" · ")),
      element("h2", { id: "detail-title", tabindex: "-1" }, row.title),
      element("p", { class: "description" }, row.description),
    );
    if (state.view === "gallery") showFigure(row);
    if (state.view === "data") showDataset(row);
    if (state.view === "tasks") showTask(row);
    if (row.links?.length) {
      section("Sources and documentation", list(row.links.map(({ label, url }) => element("a", { href: url }, label))));
    }
    if (row.related_resources?.length) {
      section("Related hub resources", list(row.related_resources.map((resource) => [
        element("span", { class: "muted" }, `${hubTitles.get(resource.hub_id)} · `),
        element("a", { href: resource.url }, resource.title ?? resource.id),
        ...(resource.relationship ? [element("span", { class: "muted" }, ` · ${resource.relationship}`)] : []),
      ])));
    }
    detailContent.append(element("div", { class: "detail-actions" },
      copyButton("Copy link", hrefFor(state.view, row.id).href)));
    dialog.scrollTop = 0;
    if (!dialog.open) dialog.showModal();
  }

  const activeHub = catalog.hub;
  const hubNavigation = byId("hubs");
  hubNavigation.replaceChildren(...catalog.hubs.map((hub) => {
    const label = hub.short_name ?? hub.label ?? hub.title;
    const name = hub.name ?? hub.title;
    const attrs = { title: hub.description ?? name, "data-hub": hub.id };
    const current = hub.id === activeHub.id;
    const href = current ? "index.html" : hub.url;
    if (!href) return element("span", attrs, label);
    if (label !== name) attrs["aria-label"] = `${label} · ${name}`;
    if (current) attrs["aria-current"] = "page";
    return element("a", { ...attrs, href }, label);
  }));
  if (catalog.portal) {
    hubNavigation.prepend(element("a", { href: catalog.portal.url, "data-hub": "researchstarter" }, catalog.portal.title));
  }
  if (activeHub.repository) byId("repository").href = activeHub.repository;
  if (catalog.guide && location.protocol !== "file:") byId("guide").href = catalog.guide;

  for (const link of navLinks) {
    const view = link.dataset.view;
    link.querySelector("span").textContent = String(views[view].rows.length);
    link.addEventListener("click", (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigate(view);
    });
  }

  queryInput.addEventListener("input", () => {
    state.query = queryInput.value;
    syncUrl();
    drawResults(true);
  });
  filterToggle.addEventListener("click", () => {
    filterToggle.setAttribute("aria-expanded", String(filterToggle.getAttribute("aria-expanded") === "false"));
  });
  reset.addEventListener("click", () => {
    Object.assign(state, { query: "", topic: "", facet: "", sort: "", descending: false });
    syncUrl();
    drawView();
    queryInput.focus();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && !dialog.open && !event.target.closest("input, textarea, [contenteditable]")) {
      event.preventDefault();
      queryInput.focus();
    }
  });
  dialog.addEventListener("close", () => {
    if (dialog.open) return;
    if (state.item) {
      state.item = "";
      syncUrl();
    }
    if (opener?.isConnected) opener.focus();
    else document.querySelector(".tabs [aria-current]")?.focus();
    opener = undefined;
  });
  window.addEventListener("popstate", () => {
    readUrl();
    drawView();
    drawDetail();
  });

  readUrl();
  drawView();
  drawDetail();
}

try {
  start(JSON.parse(byId("mlhub-catalog").textContent));
} catch (error) {
  console.error(error);
  results.replaceChildren(element("p", { class: "empty", role: "alert" },
    "The catalog could not be loaded. ", element("a", { href: "catalog.json" }, "Open the JSON export.")));
}
