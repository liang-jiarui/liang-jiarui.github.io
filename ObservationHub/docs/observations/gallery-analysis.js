(() => {
  "use strict";

  const ink = "#385149";
  const accent = "#0f6b54";
  const line = "#d5e0d6";
  const band = "#0f6b5427";
  const palette = [[228, 208, 143], [82, 157, 128], [14, 84, 76]];
  const number = new Intl.NumberFormat("en", {maximumSignificantDigits: 5});
  const tickNumber = new Intl.NumberFormat("en", {maximumSignificantDigits: 4});
  const monthName = new Intl.DateTimeFormat("en", {month: "short", timeZone: "UTC"});
  const dayName = new Intl.DateTimeFormat("en", {month: "short", day: "numeric", timeZone: "UTC"});
  const active = new WeakMap();

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function format(value, unit = "") {
    return Number.isFinite(value) ? number.format(value) + (unit ? " " + unit : "") : "—";
  }

  function countLabel(variable) {
    return variable.observation_label ? `${variable.observation_label} count` : "Observation count";
  }

  function extent(values, minimumSpread = 1) {
    let low = Infinity;
    let high = -Infinity;
    for (const value of values) {
      if (!Number.isFinite(value)) continue;
      low = Math.min(low, value);
      high = Math.max(high, value);
    }
    if (low === high) return [low - minimumSpread / 2, high + minimumSpread / 2];
    return [low, high];
  }

  function ticks([min, max], count, {extend = false, minimumStep = 0} = {}) {
    const approximate = Math.max(minimumStep, (max - min) / count);
    const magnitude = 10 ** Math.floor(Math.log10(approximate));
    const factor = [1, 2, 2.5, 5, 10].find(value => value * magnitude >= approximate);
    const step = factor * magnitude;
    const first = (extend ? Math.floor : Math.ceil)(min / step);
    const last = (extend ? Math.ceil : Math.floor)(max / step);
    return Array.from({length: last - first + 1}, (_, index) => (first + index) * step);
  }

  function scale([a, b], [start, end]) {
    return value => start + ((value - a) / (b - a)) * (end - start);
  }

  function drawAxes(ctx, width, height, {xValues, yValues, xDomain, yDomain, xLabel, yLabel,
    xText = value => tickNumber.format(value), yText = value => tickNumber.format(value)}) {
    ctx.font = "12px system-ui, sans-serif";
    const left = Math.max(37, ...yValues.map(value => ctx.measureText(yText(value)).width + 12));
    const right = width - 15;
    const top = yLabel ? 27 : 13;
    const bottom = height - (xLabel ? 45 : 28);
    const x = scale(xDomain, [left, right]);
    const y = scale(yDomain, [bottom, top]);

    ctx.strokeStyle = line;
    ctx.fillStyle = ink;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (const value of yValues) {
      const at = y(value);
      ctx.beginPath();
      ctx.moveTo(left, at);
      ctx.lineTo(right, at);
      ctx.stroke();
      ctx.fillText(yText(value), left - 7, at);
    }
    ctx.textBaseline = "top";
    for (const value of xValues) {
      const at = x(value);
      const label = xText(value);
      const halfLabel = ctx.measureText(label).width / 2;
      ctx.beginPath();
      ctx.moveTo(at, top);
      ctx.lineTo(at, bottom + 4);
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.fillText(label, Math.max(halfLabel + 1, Math.min(width - halfLabel - 1, at)), bottom + 8);
    }
    if (xLabel) ctx.fillText(xLabel, width / 2, bottom + 28);
    if (yLabel) {
      ctx.textAlign = "left";
      ctx.fillText(yLabel, left, 3);
    }
    return {x, y, left, right, top, bottom};
  }

  function dataTable(headers, rows) {
    const table = element("table");
    const head = element("thead");
    const headings = element("tr");
    for (const label of headers) {
      const cell = element("th", label);
      cell.scope = "col";
      headings.append(cell);
    }
    head.append(headings);
    const body = element("tbody");
    for (const row of rows) {
      const tr = element("tr");
      for (const value of row) tr.append(element("td", value));
      body.append(tr);
    }
    table.append(head, body);
    return table;
  }

  function chart(config) {
    const figure = element("figure", null, "analysis-chart" + (config.wide ? " chart-wide" : ""));
    const stage = element("div", null, "chart-stage");
    const canvas = element("canvas", null, "chart-canvas");
    const tooltip = element("div", null, "chart-tooltip");
    stage.style.position = "relative";
    canvas.style.cssText = "display:block;width:100%;height:var(--chart-height, 16rem)";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", `${config.title}. Numerical values follow in the data table.`);
    tooltip.style.cssText = "position:absolute;pointer-events:none;z-index:1";
    tooltip.setAttribute("aria-hidden", "true");
    tooltip.hidden = true;
    stage.append(canvas, tooltip);
    figure.append(element("h4", config.title), stage);
    if (config.legend) figure.append(config.legend);
    if (config.note) figure.append(element("p", config.note, "chart-note"));
    const details = element("details", null, "chart-data");
    const summary = element("summary", "View chart data");
    summary.setAttribute("aria-label", `View chart data for ${config.title}`);
    details.append(summary);
    details.addEventListener("toggle", () => {
      if (!details.open || details.children.length > 1) return;
      const wrap = element("div", null, "chart-tablewrap");
      wrap.style.overflow = "auto";
      wrap.append(dataTable(config.headers, config.rows));
      details.append(wrap);
    });
    figure.append(details);

    let drawing;
    function paint() {
      const {width, height} = canvas.getBoundingClientRect();
      if (width < 100 || height < 100) return;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(ratio, ratio);
      drawing = config.draw(ctx, width, height);
      tooltip.hidden = true;
    }

    function showTooltip(event) {
      if (!drawing) return;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const {frame, marks} = drawing;
      let closest;
      let distance = Infinity;
      if (x >= frame.left && x <= frame.right && y >= frame.top && y <= frame.bottom) {
        for (const mark of marks) {
          const gap = mark.span != null
            ? Math.abs(mark.x - x)
            : Math.hypot(mark.x - x, mark.y - y);
          if (gap <= (mark.span ?? 12) && gap < distance) {
            closest = mark;
            distance = gap;
          }
        }
      }
      tooltip.hidden = !closest;
      if (!closest) return;
      tooltip.replaceChildren(...closest.text.map((text, index) => element(index ? "div" : "strong", text)));
      const left = Math.max(0, Math.min(rect.width - tooltip.offsetWidth, x + 12));
      const top = y > tooltip.offsetHeight + 8 ? y - tooltip.offsetHeight - 8 : y + 12;
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    }

    canvas.addEventListener("pointermove", showTooltip);
    canvas.addEventListener("pointerdown", showTooltip);
    canvas.addEventListener("pointerleave", () => { tooltip.hidden = true; });
    return {figure, mount() {
      paint();
      if (typeof ResizeObserver === "function") {
        const observer = new ResizeObserver(paint);
        observer.observe(stage);
        return () => observer.disconnect();
      }
      window.addEventListener("resize", paint);
      return () => window.removeEventListener("resize", paint);
    }};
  }

  function seriesData(values) {
    return (values || [])
      .map(row => {
        const utc = /^\d{4}-\d\d-\d\d[T ]\d\d:\d\d(:\d\d(\.\d+)?)?$/.test(row.date) ? row.date + "Z" : row.date;
        return {...row, time: Date.parse(utc)};
      })
      .filter(row => Number.isFinite(row.time))
      .sort((a, b) => a.time - b.time);
  }

  function timeAxis(series, label, width) {
    const days = 86400000;
    const annual = /year|annual/i.test(label);
    const monthly = /month/i.test(label);
    const hourly = series.some(row => /[T ]\d{2}:/.test(row.date)) &&
      series[series.length - 1].time - series[0].time <= 2 * days;
    const step = hourly ? days / 24 : days * (annual ? 366 : monthly ? 31 : 1);
    const years = new Set(series.map(row => new Date(row.time).getUTCFullYear()));
    const spacing = hourly || years.size > 1 ? 86 : 54;
    const count = Math.min(series.length, Math.max(2, Math.floor((width - 50) / spacing)));
    const domain = extent(series.map(row => row.time), step);
    const selected = [];
    for (const row of series) {
      if (!selected.length || row.time - selected[selected.length - 1] >= (domain[1] - domain[0]) / Math.max(count - 1, 1)) selected.push(row.time);
    }
    return {
      extent: domain,
      ticks: [...new Set(selected)],
      maxGap: step * (annual || monthly ? 1.5 : 2),
      text(value) {
        const year = new Date(value).getUTCFullYear();
        if (annual) return String(year);
        if (hourly) return dayName.format(value) + " " + new Date(value).toISOString().slice(11, 16);
        const month = monthly ? monthName.format(value) : dayName.format(value);
        return years.size > 1 ? month + " ’" + String(year).slice(-2) : month;
      },
    };
  }

  function segments(rows, valid, maxGap) {
    const groups = [];
    let previous;
    for (const row of rows) {
      if (!valid(row)) {
        previous = null;
        continue;
      }
      if (!previous || row.time - previous.time > maxGap) groups.push([]);
      groups[groups.length - 1].push(row);
      previous = row;
    }
    return groups;
  }

  function timeSeries(variable, rows, raw = false) {
    const unit = variable.unit;
    const period = variable.period_label || "Period";
    const hasRange = row => Number.isFinite(row.value) && Number.isFinite(row.low) && Number.isFinite(row.high);
    const showRange = rows.some(hasRange);
    const bandLabel = variable.band_label || "Reported range";
    const legend = showRange ? element("div", null, "chart-legend") : null;
    if (legend) {
      const swatch = element("span", null, "chart-swatch");
      swatch.style.cssText = `display:inline-block;width:1rem;height:.65rem;margin-right:.4rem;background:${band};border:1px solid ${accent}`;
      legend.append(swatch, document.createTextNode(bandLabel));
    }
    return chart({title: raw ? "Individual values over time" : (variable.series_title || "Time series"), wide: true, legend,
      note: raw ? variable.raw_note || (rows.length + " source records shown. Repeated values can overlap.") : variable.series_note,
      headers: [period, `Value (${unit})`, ...(showRange ? [`${bandLabel} lower`, `${bandLabel} upper`] : []), raw ? "Source label" : countLabel(variable)],
      rows: rows.map(row => [row.date, format(row.value), ...(showRange ? [format(row.low), format(row.high)] : []), raw ? row.label || "—" : format(row.count)]),
      draw(ctx, width, height) {
        const axis = timeAxis(rows, period, width);
        const observed = rows.flatMap(row => hasRange(row) ? [row.value, row.low, row.high] : [row.value]);
        const yt = ticks(extent(observed), 5, {extend: true});
        const frame = drawAxes(ctx, width, height, {
          xValues: axis.ticks, yValues: yt, xDomain: axis.extent,
          yDomain: [yt[0], yt[yt.length - 1]], xText: axis.text, yLabel: unit,
        });
        const {x, y} = frame;
        ctx.fillStyle = band;
        for (const group of segments(rows, hasRange, axis.maxGap)) {
          if (group.length === 1) {
            const row = group[0];
            ctx.fillRect(x(row.time) - 2, y(row.high), 4, y(row.low) - y(row.high));
            continue;
          }
          ctx.beginPath();
          ctx.moveTo(x(group[0].time), y(group[0].high));
          for (const row of group.slice(1)) ctx.lineTo(x(row.time), y(row.high));
          for (let i = group.length - 1; i >= 0; i--) ctx.lineTo(x(group[i].time), y(group[i].low));
          ctx.closePath();
          ctx.fill();
        }
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2;
        for (const group of (raw ? [] : segments(rows, row => Number.isFinite(row.value), axis.maxGap))) {
          ctx.beginPath();
          ctx.moveTo(x(group[0].time), y(group[0].value));
          for (const row of group.slice(1)) ctx.lineTo(x(row.time), y(row.value));
          ctx.stroke();
        }
        ctx.fillStyle = accent;
        const marks = rows.filter(row => Number.isFinite(row.value)).map(row => {
          const px = x(row.time);
          const py = y(row.value);
          ctx.beginPath();
          ctx.arc(px, py, 2.75, 0, Math.PI * 2);
          ctx.fill();
          return {x: px, y: py, text: [row.date, format(row.value, unit), ...(row.label ? [row.label] : []),
            ...(hasRange(row) ? [`${bandLabel} ${format(row.low)}–${format(row.high, unit)}`] : []),
            ...(Number.isFinite(row.count) ? [`${countLabel(variable)} ${format(row.count)}`] : [])]};
        });
        return {frame, marks};
      },
    });
  }

  function barChart({title, headers, rows, ranges, xAxis, xLabel, yLabel, text, note, integer = true}) {
    return chart({title, headers, rows, note,
      draw(ctx, width, height) {
        const axis = xAxis(width);
        const yt = ticks(extent([0, ...ranges.map(row => row.amount)]), 5,
          {extend: true, minimumStep: integer ? 1 : 0});
        const frame = drawAxes(ctx, width, height, {xValues: axis.ticks, yValues: yt,
          xDomain: axis.extent, yDomain: [yt[0], yt[yt.length - 1]], xText: axis.text, xLabel, yLabel});
        const marks = [];
        const baseline = frame.y(0);
        for (const row of ranges) {
          const left = frame.x(row.start);
          const right = frame.x(row.end);
          const px = (left + right) / 2;
          const py = frame.y(row.amount);
          ctx.fillStyle = row.amount < 0 ? "#a36b33" : "#438875";
          ctx.fillRect(left + 1, Math.min(py, baseline), Math.max(1, right - left - 2), Math.abs(baseline - py));
          marks.push({x: px, y: py, span: Math.max(3, (right - left) / 2), text: text(row)});
        }
        return {frame, marks};
      },
    });
  }

  function distribution(variable, bins) {
    const unit = variable.unit;
    const ranges = bins.map(row => ({...row, start: row.min, end: row.max, amount: row.count}));
    return barChart({title: "Distribution", headers: [`Lower edge (${unit})`, `Upper edge (${unit})`, "Count"],
      rows: bins.map(row => [format(row.min), format(row.max), format(row.count)]), ranges,
      xAxis(width) {
        const domain = extent(bins.flatMap(row => [row.min, row.max]));
        return {extent: domain, ticks: ticks(domain, Math.max(3, Math.floor(width / 75)))};
      },
      xLabel: unit, yLabel: "Count",
      note: [variable.distribution.label, variable.distribution.notes].filter(Boolean).join(". "),
      text: row => [`${format(row.min)}–${format(row.max, unit)}`, `Count ${format(row.count)}`],
    });
  }

  function periodBars(variable, series) {
    const period = variable.period_label || "Period";
    const annual = /annual|year/i.test(period);
    const label = annual ? `Change (${variable.unit})` : countLabel(variable);
    const title = annual ? "Year-over-year change" : "Coverage over time";
    const elapsed = series.slice(1).map((row, index) => row.time - series[index].time).filter(value => value > 0);
    const halfWidth = elapsed.length ? Math.min(...elapsed) * .36 : 86400000 * 4;
    const entries = series.map((row, index) => {
      const prev = series[index - 1];
      const adjacent = prev && row.time - prev.time >= 365 * 86400000 && row.time - prev.time <= 366 * 86400000;
      const change = adjacent && Number.isFinite(row.value) && Number.isFinite(prev.value) ? row.value - prev.value : null;
      return {...row, amount: annual ? change : row.count};
    });
    const ranges = entries.filter(row => Number.isFinite(row.amount)).map(row => ({...row,
      start: row.time - halfWidth, end: row.time + halfWidth}));
    if (!ranges.length) return null;
    return barChart({title, headers: [period, label],
      rows: entries.map(row => [row.date, format(row.amount)]), ranges,
      xAxis(width) {
        const axis = timeAxis(series, period, width);
        axis.extent = [series[0].time - halfWidth, series[series.length - 1].time + halfWidth];
        return axis;
      },
      yLabel: annual ? variable.unit : "Count", integer: !annual,
      text: row => [row.date, `${annual ? "Change" : label} ${format(row.amount, annual ? variable.unit : "")}`],
    });
  }

  function mapColor(fraction) {
    const step = Math.min(1, Math.floor(fraction * 2));
    const mix = fraction * 2 - step;
    return `rgb(${palette[step].map((value, index) => Math.round(value + (palette[step + 1][index] - value) * mix)).join(",")})`;
  }

  function spatial(variable, points, coastline) {
    const unit = variable.unit;
    const min = Math.min(...points.map(point => point.value));
    const max = Math.max(...points.map(point => point.value));
    const legend = element("div", null, "chart-legend chart-color-legend");
    if (min === max) legend.textContent = format(min, unit);
    else {
      const ramp = element("span", null, "chart-ramp");
      ramp.style.cssText = `display:inline-block;width:5rem;height:.65rem;background:linear-gradient(90deg,${mapColor(0)},${mapColor(.5)},${mapColor(1)})`;
      legend.append(element("span", format(min, unit)), ramp, element("span", format(max, unit)));
    }
    const title = variable.spatial.title || "Spatial distribution";
    const longitude = value => value === 0 ? "0°" : `${tickNumber.format(Math.abs(value))}°${value < 0 ? "W" : "E"}`;
    const latitude = value => value === 0 ? "0°" : `${tickNumber.format(Math.abs(value))}°${value < 0 ? "S" : "N"}`;
    const note = [variable.spatial.notes, coastline.length ? "Coastline from Natural Earth." : ""].filter(Boolean).join(" ");
    return chart({title, legend, note,
      headers: ["Location", "Longitude", "Latitude", `Value (${unit})`, "Count"],
      rows: points.map(point => [point.label || "—", longitude(point.lon), latitude(point.lat), format(point.value), format(point.count)]),
      draw(ctx, width, height) {
        const xt = ticks(extent(points.map(point => point.lon), 4), Math.max(3, Math.floor(width / 63)), {extend: true});
        const yt = ticks(extent(points.map(point => point.lat), 4), 5, {extend: true});
        const frame = drawAxes(ctx, width, height, {xValues: xt, yValues: yt,
          xDomain: [xt[0] - .25, xt[xt.length - 1] + .25], yDomain: [yt[0] - .25, yt[yt.length - 1] + .25],
          xLabel: "Longitude", yLabel: "Latitude", xText: longitude, yText: latitude});
        if (coastline.length) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(frame.left, frame.top, frame.right - frame.left, frame.bottom - frame.top);
          ctx.clip();
          ctx.strokeStyle = "#a7b9b0";
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (const path of coastline) {
            if (!path.length) continue;
            const [[lon, lat], ...rest] = path;
            ctx.moveTo(frame.x(lon), frame.y(lat));
            for (const [nextLon, nextLat] of rest) ctx.lineTo(frame.x(nextLon), frame.y(nextLat));
          }
          ctx.stroke();
          ctx.restore();
        }
        const marks = [];
        const radius = Math.max(2, Math.min(4, Math.abs(frame.x(1) - frame.x(0)) * .85,
          Math.abs(frame.y(1) - frame.y(0)) * .85));
        for (const point of points) {
          const px = frame.x(point.lon);
          const py = frame.y(point.lat);
          ctx.fillStyle = mapColor(min === max ? .5 : (point.value - min) / (max - min));
          ctx.strokeStyle = "#294c43";
          ctx.lineWidth = .55;
          ctx.beginPath();
          ctx.arc(px, py, radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          const coords = `${latitude(point.lat)}, ${longitude(point.lon)}`;
          marks.push({x: px, y: py, text: [point.label || coords, ...(point.label ? [coords] : []), format(point.value, unit),
            ...(Number.isFinite(point.count) ? [`Count ${format(point.count)}`] : [])]});
        }
        return {frame, marks};
      },
    });
  }

  window.renderObservationCharts = (container, variable, coastline = []) => {
    for (const cleanup of active.get(container) || []) cleanup();
    const charts = [];
    if (variable) {
      const series = seriesData(variable.series);
      const raw = seriesData(variable.raw_series);
      const spatialPoints = (variable.spatial?.points || []).filter(point => Number.isFinite(point.value) &&
        Number.isFinite(point.lon) && Number.isFinite(point.lat));
      const bins = (variable.distribution?.bins || []).filter(row => Number.isFinite(row.count) &&
        Number.isFinite(row.min) && Number.isFinite(row.max) && row.max > row.min);
      if (raw.length && raw[0].time !== raw[raw.length - 1].time) charts.push(timeSeries(variable, raw, true));
      const hasTrend = series.length > 1 && series.some(row => Number.isFinite(row.value)) &&
        (!raw.length || series.some(row => row.count > 1));
      if (hasTrend) charts.push(timeSeries(variable, series));
      if (spatialPoints.length) charts.push(spatial(variable, spatialPoints, coastline));
      if (bins.length) charts.push(distribution(variable, bins));
      const changes = series.length > 1 && !raw.length ? periodBars(variable, series) : null;
      if (changes) charts.push(changes);
    }
    container.replaceChildren(...charts.map(item => item.figure));
    active.set(container, charts.map(item => item.mount()));
  };
})();
