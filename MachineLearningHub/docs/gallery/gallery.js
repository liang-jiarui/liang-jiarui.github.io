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
const inferenceStatus = {
  profiled: "Profiled", partial: "Partially profiled", inspected: "Coverage available",
  registered: "Registry only", derived: "Derived",
};
const gridNumber = new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 });
const fraction = new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 });
const statisticNumber = new Intl.NumberFormat(undefined, { maximumSignificantDigits: 5 });

function element(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  node.append(...children);
  return node;
}

function dateLabel(value) {
  const text = String(value ?? "");
  const compact = /^(\d{4})(\d{2})(\d{2})?$/.exec(text);
  if (compact) return compact.slice(1).filter(Boolean).join("-");
  return text.replace(/[T ]00:00:00(?:\.0+)?Z?$/, "");
}

function dateRange(start, end) {
  const first = dateLabel(start);
  const last = dateLabel(end);
  return first && last && first !== last ? `${first} – ${last}` : first || last;
}

function coverageBounds(variable, prefix = "") {
  const bounds = ["lat_min", "lat_max", "lon_min", "lon_max"].map(key => variable[prefix + key]);
  if (!bounds.every(Number.isFinite)) return "";
  const [latMin, latMax, lonMin, lonMax] = bounds;
  const degrees = value => `${gridNumber.format(value)}°`;
  return `${degrees(latMin)} to ${degrees(latMax)} lat · ${degrees(lonMin)} to ${degrees(lonMax)} lon`;
}

function productName(product) {
  const label = product.label ?? product.title ?? product.id;
  return [label, product.scenario, product.model].filter((value, index, values) => value && values.indexOf(value) === index).join(" · ");
}

function featureStatus(feature) {
  if (feature.profiles) return feature.profiles < feature.variants.length ? "partial" : "profiled";
  return feature.variants.length ? "inspected" : "registered";
}

function gridShape(variable) {
  if (!variable.dimensions?.length || !variable.shape?.length) return "";
  return variable.dimensions.map((name, index) => `${name} ${gridNumber.format(variable.shape[index])}`).join(" × ");
}

function inferenceSources(datasets, inventory) {
  const sources = new Map((inventory?.datasets ?? []).map(row => [row.id, row]));
  return datasets.map(dataset => {
    const source = sources.get(dataset.id);
    const products = source?.products ?? [];
    const names = new Set(dataset.variables);
    const index = new Map();
    for (const product of products) {
      for (const variable of product.variables ?? []) {
        names.add(variable.name);
        if (!index.has(variable.name)) index.set(variable.name, []);
        index.get(variable.name).push({ product, variable });
      }
    }
    const features = [...names].map(name => {
      const variants = index.get(name) ?? [];
      const profiles = variants.filter(({ variable }) => variable.figures?.length).length;
      return { name, native: dataset.variable_metadata?.[name] ?? {}, variants, profiles };
    });
    const profiled = features.filter(feature => feature.profiles).length;
    const status = profiled ? (features.every(feature => featureStatus(feature) === "profiled") ? "profiled" : "partial")
      : products.length ? "inspected" : dataset.role === "derived" ? "derived" : "registered";
    return { ...dataset, status, variables: [...names], products, features, profiled, inventoryNote: source?.note };
  });
}

function start(catalog) {
  const tasks = new Map(catalog.tasks.map((row) => [row.id, row]));
  const datasets = new Map(catalog.datasets.map((row) => [row.id, row]));
  const inference = inferenceSources(catalog.datasets, catalog.inference_data);
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
    inference: {
      title: "Inference Data", unit: "dataset", rows: inference,
      description: "Browse every registered source and inspect variable-level time coverage, maps and value distributions.",
      placeholder: "Search by source, variable or scenario", filterLabel: "By availability", facetAll: "All availability",
      facet: row => row.status, facetTitle: id => inferenceStatus[id],
      relatedText: row => [
        row.features.map(({ native }) => [native.description, native.units]), inferenceStatus[row.status],
        row.products.map(product => [productName(product), product.kind,
          product.variables?.map(field => [field.label, field.description, field.units, dateLabel(field.time_start), dateLabel(field.time_end)])]),
      ],
      columns: [
        ["title", "Dataset"], ["status", "Availability"], ["variables", "Variables"], ["profiled", "Variables profiled"],
        ["coverage", "Native time range"], ["spatial", "Native resolution"],
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

  const state = { view: "gallery", topic: "", facet: "", query: "", item: "", variable: "", product: "", sort: "", descending: false };
  const filterToggle = byId("filter-toggle");
  const reset = byId("reset");
  let opener;

  function hrefFor(view, item = "", variable = "", product = "") {
    const url = new URL(location.href);
    url.hash = "";
    url.search = "";
    if (view !== "gallery") url.searchParams.set("view", view);
    if (item) url.searchParams.set("item", item);
    if (view === "inference" && item && variable) {
      url.searchParams.set("variable", variable);
      if (product) url.searchParams.set("product", product);
    }
    return url;
  }

  function syncUrl(push = false) {
    const url = hrefFor(state.view, state.item, state.variable, state.product);
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
    const item = params.get("item") ?? (view === "tasks" ? directTask : ["data", "inference"].includes(view) ? directDataset : "");
    const row = rows.find((entry) => entry.id === item);
    const variable = view === "inference" ? row?.features.find(feature => feature.name === params.get("variable")) : undefined;
    const variant = variable?.variants.find(({ product }) => product.id === params.get("product"));
    Object.assign(state, {
      view,
      topic: rows.some((row) => row.category === topic) ? topic : "",
      facet: (view === "gallery" ? tasks.has(facet) : rows.some((row) => views[view].facet(row) === facet)) ? facet : "",
      query: params.get("q") ?? "",
      item: row?.id ?? "",
      variable: variable?.name ?? "",
      product: variant?.product.id ?? "",
      sort: "", descending: false,
    });
  }

  function navigate(view, item = "") {
    Object.assign(state, { view, item, variable: "", product: "", topic: "", facet: "", query: "", sort: "", descending: false });
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
    Object.assign(state, { item: id, variable: "", product: "" });
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
    if (key === "status" || key === "role") {
      const label = key === "status" && state.view === "inference" ? inferenceStatus[row.status] : row[key];
      return element("td", {}, pill(label));
    }
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

  function definitionList(pairs) {
    const entries = pairs.filter(([, value]) => value != null && value !== "" && value !== "—");
    return element("dl", { class: "meta" }, ...entries.flatMap(([key, value]) => [
      element("dt", {}, key), element("dd", {}, value),
    ]));
  }

  function metadata(pairs) {
    detailContent.append(definitionList(pairs));
  }

  function detailTable(columns, rows, label) {
    const table = element("table", { class: "inference-detail-table" },
      element("caption", { class: "sr" }, label),
      element("thead", {}, element("tr", {}, ...columns.map(name => element("th", { scope: "col" }, name)))),
      element("tbody", {}, ...rows.map(([first, ...cells]) => element("tr", {},
        element("th", { scope: "row" }, first), ...cells.map(value => element("td", {}, value))))));
    return element("div", { class: "inference-table-wrap", tabindex: "0", role: "region", "aria-label": label }, table);
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
    showDownloads(row.data ?? [], "Download figure data");
  }

  function publishedAsset(path) {
    return path.split("/").map(encodeURIComponent).join("/");
  }

  function showDownloads(files, title) {
    const byPath = new Map(files.map(file => [file.path, file]));
    if (byPath.size) section(title, list([...byPath.values()].map(({ label, path }) =>
      element("a", { href: publishedAsset(path), download: "" }, label))));
  }

  function showDataset(row) {
    metadata([
      ["Dataset ID", element("span", { class: "mono" }, row.id)], ["Role", pill(row.role)],
      ["Frequency", row.temporal], ["Resolution", row.spatial], ["Coverage", row.coverage],
    ]);
    if (row.variables.length) {
      section("Variables", list(row.variables.map((name) => element("code", {}, name)), "variables"));
    }
    section("Inference data", detailLink("Browse variable coverage and profiles", "inference", row.id));
    const relatedTasks = catalog.tasks.filter((item) => item.dataset_ids.includes(row.id));
    if (relatedTasks.length) section("ML tasks", list(relatedTasks.map((item) => detailLink(item.title, "tasks", item.id))));
  }

  function changeInferenceSelection(variable, product = "", focus = "detail-title") {
    Object.assign(state, { variable, product });
    syncUrl(true);
    drawDetail();
    byId(focus).focus();
  }

  function inferenceSelectionLink(title, row, variable = "") {
    const link = element("a", { href: hrefFor("inference", row.id, variable) }, title);
    link.addEventListener("click", event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      changeInferenceSelection(variable);
    });
    return link;
  }

  function inferenceSelector(id, label, choices, selected, select) {
    const input = element("select", { id }, ...choices.map(([value, title]) => element("option", { value }, title)));
    input.value = selected;
    input.addEventListener("change", () => select(input.value));
    return element("label", { class: "inference-select", for: id }, element("span", {}, label), input);
  }

  function showInferenceOverview(row) {
    metadata([
      ["Dataset ID", element("code", {}, row.id)], ["Role", pill(row.role)],
      ["Availability", pill(inferenceStatus[row.status])], ["Native frequency", row.temporal],
      ["Native resolution", row.spatial], ["Native time range", row.coverage],
    ]);
    if (typeof row.inventoryNote === "string" && row.inventoryNote) {
      detailContent.append(element("p", { class: "muted" }, row.inventoryNote));
    }
    if (row.coverage_periods?.length) {
      const periods = row.coverage_periods.map(period => [period.id, dateRange(period.start, period.end), period.scenarios?.join(", ") ?? "—"]);
      section("Registered time windows", detailTable(["Period", "Dates", "Scenarios"], periods, "Registered time windows"));
    }
    if (row.products.length) {
      const summarize = (variables, format) => {
        const values = [...new Set(variables.map(format).filter(Boolean))];
        return values.length < 3 ? values.join(" · ") || "—" : `${values.length} variable-specific ranges`;
      };
      const products = row.products.map(product => {
        const variables = product.variables ?? [];
        return [productName(product), summarize(variables, variable => dateRange(variable.time_start, variable.time_end)),
          summarize(variables, coverageBounds), String(variables.length)];
      });
      section("Available products", detailTable(["Product", "Stored time range", "Grid bounds", "Variables"], products, "Available products"));
    } else {
      const message = row.role === "derived" ? "Computed during feature preparation."
        : "Archive coverage will appear when a processed product is indexed.";
      section("Available products", element("p", { class: "muted" }, message));
    }
    const items = row.features.map(feature => {
      const { name, native, variants } = feature;
      const status = featureStatus(feature);
      const published = variants.find(({ variable }) => variable.units)?.variable.units;
      const field = element("div", {}, inferenceSelectionLink(element("code", {}, name), row, name),
        ...(native.description ? [element("p", { class: "muted" }, native.description)] : []));
      return [field, native.units || published || "—",
        pill(inferenceStatus[status === "registered" && row.role === "derived" ? "derived" : status]),
        String(variants.length)];
    });
    if (items.length) {
      section(`Variables (${items.length})`, detailTable(["Variable", "Units", "Availability", "Products"], items, "Variables"));
    }
  }

  function showInferenceVariable(row, feature) {
    const bar = element("div", { class: "inference-controls" },
      inferenceSelector("inference-variable", "Variable", row.features.map(field => [field.name, field.name]), feature.name,
        name => changeInferenceSelection(name, "", "inference-variable")));
    detailContent.append(element("p", { class: "inference-back" }, inferenceSelectionLink("All variables in this dataset", row)), bar);
    const { native, variants } = feature;
    const description = native.description ?? variants.find(({ variable }) => variable.description)?.variable.description;
    if (description) detailContent.append(element("p", { class: "description" }, description));
    metadata([["Registered units", native.units], ["Registered dimensions", native.dims], ["ML scope", native.ml_scope]]);
    if (!variants.length) {
      section("Coverage and profiles", element("p", { class: "muted" }, row.role === "derived"
        ? "Computed from the model grid and calendar during feature preparation."
        : "This variable is listed in the registry. Its archive coverage and profiles await a processed product."));
      return;
    }
    const selected = variants.find(({ product }) => product.id === state.product)
      ?? variants.find(({ variable }) => variable.figures?.length) ?? variants[0];
    const { product, variable } = selected;
    const choices = variants.map(({ product, variable }) => [product.id,
      [productName(product), dateRange(variable.time_start, variable.time_end)].filter(Boolean).join(" · ")]);
    bar.append(inferenceSelector("inference-product", "Product and time range", choices, product.id,
      id => changeInferenceSelection(feature.name, id, "inference-product")));
    const summary = variable.summary ?? {};
    const finiteFraction = Number.isFinite(summary.mean_finite_fraction) ? fraction.format(summary.mean_finite_fraction) : "";
    const analysed = summary.analysed_cells ?? summary.grid_cells;
    const sampled = Number.isFinite(analysed) && Number.isFinite(summary.grid_cells) && analysed < summary.grid_cells;
    metadata([
      ["Archive units", variable.units], ["Stored time range", dateRange(variable.time_start, variable.time_end)],
      ["Time range with data", dateRange(variable.valid_time_start, variable.valid_time_end)],
      ["Frequency", variable.frequency ?? product.frequency], ["Resolution", variable.resolution ?? product.resolution],
      ["Grid bounds", coverageBounds(variable)], ["Bounds with data", coverageBounds(variable, "valid_")],
      ["Array shape", gridShape(variable)],
      ["Time steps with data", Number.isFinite(summary.steps_with_data) && Number.isFinite(summary.time_steps)
        ? `${gridNumber.format(summary.steps_with_data)} of ${gridNumber.format(summary.time_steps)}` : ""],
      ["Spatial sample", sampled ? `${gridNumber.format(analysed)} of ${gridNumber.format(summary.grid_cells)} grid cells` : ""],
      [sampled ? "Sampled cells with data" : "Grid cells with data", Number.isFinite(summary.cells_ever_finite) && Number.isFinite(analysed)
        ? `${gridNumber.format(summary.cells_ever_finite)} of ${gridNumber.format(analysed)}` : ""],
      ["Mean finite coverage", finiteFraction],
    ]);
    const notes = [...new Set([product.note, variable.note].filter(note => typeof note === "string" && note))];
    if (notes.length) section("About this product", list(notes));
    const figures = variable.figures ?? [];
    if (figures.length) {
      const images = figures.map(figure => {
        const href = publishedAsset(figure.image);
        return element("figure", { class: "inference-figure" },
          element("img", { src: href, alt: figure.alt ?? figure.title, loading: "lazy", decoding: "async" }),
          element("figcaption", {}, element("span", {}, figure.title), element("a", { href }, "Open full size")));
      });
      section("Visual profiles", element("div", { class: "inference-figures" }, ...images));
    } else {
      section("Visual profiles", element("p", { class: "muted" }, "Coverage metadata is available for this product."));
    }
    const distribution = summary.distribution ?? {};
    const quantiles = [["Minimum", "min"], ["25th percentile", "p25"], ["Median", "p50"], ["75th percentile", "p75"], ["Maximum", "max"]]
      .filter(([, key]) => Number.isFinite(distribution[key]))
      .map(([name, key]) => [name, [statisticNumber.format(distribution[key]), variable.units].filter(Boolean).join(" ")]);
    if (quantiles.length) {
      section(dateRange(variable.time_start, variable.time_end) ? "Distribution of grid-cell time means" : "Grid-cell value distribution",
        definitionList(quantiles));
    }
    showDownloads([...(product.data ?? []), ...(variable.data ?? []), ...figures.flatMap(figure => figure.data ?? [])], "Download profile data");
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
    const feature = state.view === "inference" ? row.features.find(item => item.name === state.variable) : undefined;
    dialog.classList.toggle("inference-dialog", state.view === "inference");
    detailContent.replaceChildren(
      element("span", { class: "kicker" }, [row.category, row.badge].filter(Boolean).join(" · ")),
      element("h2", { id: "detail-title", tabindex: "-1" }, feature ? `${row.title} · ${feature.name}` : row.title),
    );
    if (!feature) detailContent.append(element("p", { class: "description" }, row.description));
    if (state.view === "gallery") showFigure(row);
    if (state.view === "data") showDataset(row);
    if (state.view === "tasks") showTask(row);
    if (state.view === "inference") {
      if (feature) showInferenceVariable(row, feature);
      else showInferenceOverview(row);
    }
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
      copyButton("Copy link", hrefFor(state.view, row.id, state.variable, state.product).href)));
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
      Object.assign(state, { item: "", variable: "", product: "" });
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
