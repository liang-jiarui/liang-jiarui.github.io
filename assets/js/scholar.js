(function () {
  var CACHE_KEY = "gs_stats";
  var HALF_DAY = 12 * 60 * 60 * 1000;
  var REPO = "liang-jiarui/liang-jiarui.github.io";
  var SCHOLAR_ID = "AJl9nB4AAAAJ";

  function citationNodes() {
    return qsa("[data-scholar-citations]");
  }

  function hindexNodes() {
    return qsa("[data-scholar-hindex]");
  }

  function paperNodes() {
    return qsa("[data-scholar-paper]");
  }

  function qsa(selector) {
    return Array.prototype.slice.call(document.querySelectorAll(selector));
  }

  function hasTargets() {
    return citationNodes().length + hindexNodes().length + paperNodes().length > 0;
  }

  function formatCount(count) {
    var value = Number(count);
    if (!isFinite(value) || value < 0) return null;
    return value.toLocaleString("en-US");
  }

  function normalizeTitle(title) {
    return String(title || "")
      .replace(/&amp;/g, "&")
      .replace(/<[^>]+>/g, " ")
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function matchPaper(title, papers) {
    var target = normalizeTitle(title);
    if (!target || !papers || !papers.length) return null;

    var exact = papers.find(function (paper) {
      return normalizeTitle(paper.title) === target;
    });
    if (exact) return exact;

    return papers.find(function (paper) {
      var candidate = normalizeTitle(paper.title);
      return candidate.indexOf(target) !== -1 || target.indexOf(candidate) !== -1;
    }) || null;
  }

  function reveal(el) {
    var wrap = el.closest("[hidden], .scholar-cite, .pub-item__cites");
    if (wrap) wrap.removeAttribute("hidden");
  }

  function apply(data) {
    if (!data) return;

    var cited = formatCount(data.citedby);
    if (cited) {
      citationNodes().forEach(function (el) {
        el.textContent = cited;
        reveal(el);
      });
    }

    var hindex = formatCount(data.hindex);
    if (hindex) {
      hindexNodes().forEach(function (el) {
        el.textContent = hindex;
        reveal(el);
      });
    }

    var papers = data.papers || [];
    paperNodes().forEach(function (el) {
      var paper = matchPaper(el.getAttribute("data-scholar-paper"), papers);
      if (!paper) return;
      var count = formatCount(paper.citedby);
      if (count == null) return;
      var target = el.querySelector("[data-scholar-paper-count]") || el;
      target.textContent = count;
      reveal(el);
    });

    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        citedby: data.citedby,
        hindex: data.hindex,
        papers: papers,
        at: Date.now()
      }));
    } catch (err) {}
  }

  function fromCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      if (!data || Date.now() - Number(data.at || 0) >= HALF_DAY) return false;
      apply(data);
      return true;
    } catch (err) {}
    return false;
  }

  function parseScholarHtml(html) {
    var cells = [];
    var cellRe = /class="gsc_rsb_std">(\d+)/g;
    var match;
    while ((match = cellRe.exec(html))) cells.push(Number(match[1]));

    var papers = [];
    var rowRe = /<tr class="gsc_a_tr">([\s\S]*?)<\/tr>/g;
    while ((match = rowRe.exec(html))) {
      var row = match[1];
      var titleMatch = row.match(/class="gsc_a_at"[^>]*>([\s\S]*?)<\/a>/);
      if (!titleMatch) continue;
      var citeMatch = row.match(/class="gsc_a_ac[^"]*"[^>]*>([\s\S]*?)<\/a>/);
      var citeDigits = citeMatch && citeMatch[1].match(/(\d+)/);
      papers.push({
        title: titleMatch[1].replace(/<[^>]+>/g, "").trim(),
        citedby: citeDigits ? Number(citeDigits[1]) : 0
      });
    }

    var citedby = cells.length ? cells[0] : null;
    if (citedby == null) {
      var meta = html.match(/Cited by\s+(\d+)/i);
      if (meta) citedby = Number(meta[1]);
    }

    return {
      citedby: citedby,
      hindex: cells.length >= 3 ? cells[2] : null,
      papers: papers
    };
  }

  function fromStatsBranch() {
    var url =
      "https://cdn.jsdelivr.net/gh/" +
      REPO +
      "@google-scholar-stats/gs_data.json?t=" +
      Date.now();
    return fetch(url, { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("stats missing");
      return res.json();
    }).then(function (data) {
      if (!data || (data.citedby == null && !(data.papers && data.papers.length))) {
        throw new Error("no scholar stats");
      }
      apply(data);
    });
  }

  function fromScholarPage() {
    var scholar =
      "https://scholar.google.com/citations?user=" +
      SCHOLAR_ID +
      "&hl=en&cstart=0&pagesize=80";
    var proxy = "https://api.allorigins.win/raw?url=" + encodeURIComponent(scholar);
    return fetch(proxy).then(function (res) {
      if (!res.ok) throw new Error("proxy failed");
      return res.text();
    }).then(function (html) {
      var data = parseScholarHtml(html);
      if (data.citedby == null && !data.papers.length) throw new Error("parse failed");
      apply(data);
    });
  }

  if (!hasTargets()) return;
  fromCache();
  fromStatsBranch().catch(fromScholarPage).catch(function () {});
})();
