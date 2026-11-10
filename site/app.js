(() => {
  "use strict";

  const DATA_URL = "data/summary.json";

  const usd = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
  const usdCents = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const usdCompact = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  });
  const int = new Intl.NumberFormat("en-US");
  const pct = (value) => `${value.toFixed(1)}%`;

  // Build an element with attributes and children. Strings are inserted as
  // text nodes, so names from the source file are never parsed as HTML.
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === "class") node.className = value;
      else if (key === "style") node.setAttribute("style", value);
      else if (key === "title") node.title = value;
      else node.setAttribute(key, value === true ? "" : value);
    }
    for (const child of children.flat()) {
      if (child === undefined || child === null || child === false) continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  function stat(value, label, extraClass = "") {
    return el("div", { class: `stat ${extraClass}`.trim() },
      el("span", { class: "value" }, value),
      el("span", { class: "label" }, label));
  }

  function renderHero(d) {
    const container = document.getElementById("hero-stats");
    container.replaceChildren(
      stat(usdCompact.format(d.totals.net), `Net spend (${usd.format(d.totals.net)})`, "accent"),
      stat(int.format(d.totals.transactions), "Transactions"),
      stat(int.format(d.totals.cardholders), "Cardholders"),
      stat(int.format(d.totals.vendors), "Vendors"),
      stat(usdCents.format(d.totals.average_transaction), "Average transaction"),
      stat(usdCents.format(d.totals.median_transaction), "Median transaction"),
    );
  }

  function renderMonthly(d) {
    const chart = document.getElementById("monthly-chart");
    const max = Math.max(...d.monthly.map((m) => m.net));
    const peakMonth = d.peak_month.month;
    const lowMonth = d.low_month.month;

    chart.replaceChildren(...d.monthly.map((m) => {
      const cls = ["col", m.month === peakMonth && "peak", m.month === lowMonth && "low"]
        .filter(Boolean).join(" ");
      return el("div", { class: cls, title: `${m.month}: ${usd.format(m.net)} across ${int.format(m.count)} transactions` },
        el("span", { class: "amt" }, usdCompact.format(m.net)),
        el("div", { class: "bar-wrap" },
          el("div", { class: "bar", style: `height:${(m.net / max * 100).toFixed(1)}%` })),
        el("span", { class: "mo" }, m.month));
    }));

    const average = d.totals.net / d.monthly.length;
    document.getElementById("monthly-callouts").replaceChildren(
      stat(`${usdCompact.format(d.peak_month.net)}`, `Peak: ${peakMonth}`, "accent"),
      stat(`${usdCompact.format(d.low_month.net)}`, `Lowest: ${lowMonth}`),
      stat(usdCompact.format(average), "Average month"),
    );
  }

  function barList(items, { valueKey = "net", countLabel = true } = {}) {
    const max = Math.max(...items.map((i) => i[valueKey]));
    return items.map((item) =>
      el("div", { class: "row" },
        el("span", { class: "name", title: item.name }, item.name),
        el("div", { class: "track" },
          el("div", { class: "fill", style: `width:${(item[valueKey] / max * 100).toFixed(1)}%` })),
        el("span", { class: "figure" },
          usdCompact.format(item[valueKey]),
          countLabel ? el("span", {}, ` · ${int.format(item.count)} txns`) : null)));
  }

  function renderCategories(d) {
    document.getElementById("category-chart").replaceChildren(...barList(d.top_categories));
  }

  function renderVendors(d) {
    document.getElementById("vendor-chart").replaceChildren(...barList(d.top_vendors));
  }

  function renderCardholders(d) {
    document.getElementById("cardholder-chart").replaceChildren(...barList(d.top_cardholders));
    document.getElementById("concentration").replaceChildren(
      stat(pct(d.concentration.top10_cardholder_share), "of net spend went to the top 10 cardholders", "accent"),
      stat(pct(d.concentration.top10_vendor_share), "of net spend went to the top 10 vendors"),
      stat(int.format(d.totals.cardholders), "cardholders in total"),
    );
  }

  function renderTravel(d) {
    const total = d.travel.reduce((sum, t) => sum + t.net, 0);
    const label = { "room charges": "Room charges", "air travel": "Air travel" };
    const cards = d.travel.map((t) =>
      stat(usdCompact.format(t.net),
        `${label[t.type] || t.type}: ${int.format(t.count)} transactions`));
    cards.push(stat(pct(total / d.totals.net * 100), `of net spend is room charges and air travel (${usdCompact.format(total)})`, "accent"));
    document.getElementById("travel-stats").replaceChildren(...cards);
  }

  function renderTiming(d) {
    const weekdays = d.weekday.filter((w) => !["Saturday", "Sunday"].includes(w.day));
    const weekdayCount = weekdays.reduce((s, w) => s + w.count, 0);
    const weekdayShare = weekdayCount / d.totals.transactions * 100;
    const busiest = d.weekday.reduce((a, b) => (b.count > a.count ? b : a));

    document.getElementById("weekday-chart").replaceChildren(
      ...barList(d.weekday.map((w) => ({ name: w.day, net: w.net, count: w.count }))));

    document.getElementById("timing-stats").replaceChildren(
      stat(pct(weekdayShare), "of transactions happen Monday through Friday", "accent"),
      stat(`${busiest.day}`, `Busiest day (${int.format(busiest.count)} transactions)`),
      stat(`${d.posting.median_lag_days} day`, `Median time from transaction to posting`),
      stat(pct(d.posting.within_two_days_share), "of transactions post within two days"),
    );
  }

  function txnTable(rows) {
    return el("table", {},
      el("thead", {}, el("tr", {},
        el("th", {}, "Date"),
        el("th", {}, "Vendor"),
        el("th", {}, "Cardholder"),
        el("th", {}, "Description"),
        el("th", { class: "num" }, "Amount"))),
      el("tbody", {}, rows.map((r) =>
        el("tr", {},
          el("td", {}, r.date),
          el("td", { class: "wrap" }, r.vendor),
          el("td", {}, r.cardholder),
          el("td", { class: "wrap" }, r.description),
          el("td", { class: "num" }, usdCents.format(r.amount))))));
  }

  function renderOutliers(d) {
    document.getElementById("largest-table").replaceChildren(txnTable(d.largest_transactions));
    document.getElementById("credits-table").replaceChildren(txnTable(d.largest_credits));
  }

  function renderNotes(d) {
    const notes = document.querySelector("#notes .footer-note");
    notes.textContent = `Source file: ${d.source.file}. Period: ${d.source.period}. ` +
      `${int.format(d.totals.credit_transactions)} credit transactions totaling ` +
      `${usdCents.format(d.totals.credits)}. ` +
      `${int.format(d.data_quality.potential_duplicate_rows)} rows match the potential duplicate rule. ` +
      `General purchases make up ${pct(d.data_quality.general_purchase_share)} of transactions.`;
  }

  function highlightNav() {
    const links = new Map(
      [...document.querySelectorAll(".sections a")].map((a) => [a.getAttribute("href").slice(1), a]));
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        for (const link of links.values()) link.classList.remove("active");
        links.get(entry.target.id)?.classList.add("active");
      }
    }, { rootMargin: "-40% 0px -55% 0px" });
    document.querySelectorAll("main .slide").forEach((s) => observer.observe(s));
  }

  // Arrow keys and Page keys move between sections instead of scrolling a few pixels.
  function enableKeyboardNav() {
    const slides = [...document.querySelectorAll("main .slide")];
    const currentIndex = () => {
      const y = window.scrollY + 80;
      let index = 0;
      slides.forEach((s, i) => { if (s.offsetTop <= y) index = i; });
      return index;
    };
    document.addEventListener("keydown", (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const forward = ["ArrowDown", "ArrowRight", "PageDown"].includes(event.key);
      const backward = ["ArrowUp", "ArrowLeft", "PageUp"].includes(event.key);
      if (!forward && !backward) return;
      const target = slides[Math.min(slides.length - 1, Math.max(0, currentIndex() + (forward ? 1 : -1)))];
      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function showError(error) {
    document.getElementById("hero-stats").replaceChildren(
      el("p", { class: "error" }, `Could not load ${DATA_URL}: ${error.message}`));
  }

  async function init() {
    try {
      const response = await fetch(DATA_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const d = await response.json();
      renderHero(d);
      renderMonthly(d);
      renderCategories(d);
      renderVendors(d);
      renderCardholders(d);
      renderTravel(d);
      renderTiming(d);
      renderOutliers(d);
      renderNotes(d);
      highlightNav();
      enableKeyboardNav();
    } catch (error) {
      showError(error);
    }
  }

  init();
})();
