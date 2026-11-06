// PriceIntel AI mockup: deterministic pricing over illustrative sample data.
(() => {
  const STORAGE_KEY = "pi-state";
  const DEFAULT_SETTINGS = {
    minMargin: 15,
    targetMargin: 20,
    policy: "median",
    threshold: 0.8,
    landed: true,
    freshHours: 48,
    tolerance: 3,
    maxChange: 20,
    rounding: "99"
  };
  const STATUS_LABEL = {
    overpriced: "Overpriced",
    competitive: "Competitive",
    underpriced: "Underpriced",
    insufficient: "Insufficient data"
  };

  const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  const fmt = (n) => (n == null || Number.isNaN(n) ? "-" : usd.format(n));
  const pct = (n, digits = 1) => (n == null ? "-" : `${n > 0 ? "+" : ""}${(n * 100).toFixed(digits)}%`);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (sel) => document.querySelector(sel);

  let state = loadState();
  let selected = new Set();
  let openSku = null;

  function sanitizeSettings(raw) {
    const s = { ...DEFAULT_SETTINGS };
    if (!raw || typeof raw !== "object") return s;
    const num = (k, min, max) => {
      const v = Number(raw[k]);
      if (Number.isFinite(v)) s[k] = Math.min(max, Math.max(min, v));
    };
    num("minMargin", 0, 90); num("targetMargin", 0, 90); num("threshold", 0.5, 0.99);
    num("freshHours", 1, 240); num("tolerance", 0, 20); num("maxChange", 1, 50);
    if (["median", "lowest", "weighted"].includes(raw.policy)) s.policy = raw.policy;
    if (["99", "1", "0.01"].includes(raw.rounding)) s.rounding = raw.rounding;
    if (typeof raw.landed === "boolean") s.landed = raw.landed;
    return s;
  }

  function sanitizeState(saved) {
    const skus = new Set(PRODUCTS.map((p) => p.sku));
    const offerIds = new Set(PRODUCTS.flatMap((p) => p.offers.map((o) => o.id)));
    const offerDecisions = {};
    for (const [id, d] of Object.entries(saved.offerDecisions || {})) {
      if (offerIds.has(id) && (d === "accepted" || d === "rejected")) offerDecisions[id] = d;
    }
    const recDecisions = {};
    for (const [sku, r] of Object.entries(saved.recDecisions || {})) {
      if (skus.has(sku) && r && (r.decision === "approved" || r.decision === "rejected") &&
          Number.isFinite(r.price) && Number.isFinite(r.previous) && !Number.isNaN(Date.parse(r.at))) {
        recDecisions[sku] = { decision: r.decision, price: r.price, previous: r.previous, at: new Date(r.at).toISOString() };
      }
    }
    const audit = (Array.isArray(saved.audit) ? saved.audit : [])
      .filter((a) => a && !Number.isNaN(Date.parse(a.time)))
      .slice(0, 500)
      .map((a) => ({ time: a.time, user: String(a.user), action: String(a.action), details: String(a.details) }));
    return { offerDecisions, recDecisions, settings: sanitizeSettings(saved.settings), audit };
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && typeof saved === "object") return sanitizeState(saved);
    } catch (e) { /* ignore corrupt state */ }
    return { offerDecisions: {}, recDecisions: {}, settings: { ...DEFAULT_SETTINGS }, audit: [] };
  }
  function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  function log(action, details) {
    state.audit.unshift({ time: new Date().toISOString(), user: "Pricing analyst (demo)", action, details });
    save();
  }
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  // ---------- Pricing engine ----------
  function ageHours(offer) { return (SNAPSHOT_TIME - Date.parse(offer.observedAt)) / 3600000; }

  function offerStatus(offer) {
    const s = state.settings;
    const decision = state.offerDecisions[offer.id];
    if (decision === "rejected") return { used: false, reason: "Rejected by reviewer" };
    if (!offer.inStock) return { used: false, reason: "Out of stock" };
    if (ageHours(offer) > s.freshHours) return { used: false, reason: `Stale (${Math.round(ageHours(offer))} h old)` };
    if (decision === "accepted") return { used: true, reason: "Accepted by reviewer" };
    if (offer.confidence < s.threshold) return { used: false, reason: "Below confidence threshold" };
    return { used: true, reason: "Auto-accepted" };
  }

  function effectivePrice(offer) { return offer.price + (state.settings.landed ? offer.delivery : 0); }

  function benchmarkOf(used) {
    const policy = state.settings.policy;
    const prices = used.map(effectivePrice).sort((a, b) => a - b);
    if (policy === "lowest") return prices[0];
    if (policy === "weighted") {
      const w = used.reduce((a, o) => a + o.confidence, 0);
      return used.reduce((a, o) => a + effectivePrice(o) * o.confidence, 0) / w;
    }
    const m = Math.floor(prices.length / 2);
    return prices.length % 2 ? prices[m] : (prices[m - 1] + prices[m]) / 2;
  }

  // Works in whole cents to avoid floating-point drift.
  function roundPrice(p, mode, direction) {
    const cents = Math.round(p * 100 * 1000) / 1000;
    if (mode === "99") {
      const down = Math.floor((cents + 1) / 100) * 100 - 1;
      return (direction === "up" ? (down >= cents ? down : down + 100) : down) / 100;
    }
    const step = mode === "1" ? 100 : 1;
    return (direction === "up" ? Math.ceil(cents / step) * step : Math.round(cents / step) * step) / 100;
  }

  function evaluate(product) {
    const s = state.settings;
    const rows = product.offers.map((o) => ({ offer: o, ...offerStatus(o) }));
    const used = rows.filter((r) => r.used).map((r) => r.offer);
    const floor = product.cost / (1 - s.minMargin / 100);
    const target = product.cost / (1 - s.targetMargin / 100);
    const margin = (product.price - product.cost) / product.price;
    const base = { product, rows, used, floor, target, margin };
    if (used.length === 0) {
      const stale = product.offers.some((o) => ageHours(o) > s.freshHours);
      return { ...base, status: "insufficient", benchmark: null, gap: null, recommended: null, flags: [],
        rationale: stale ? "All observations are older than the freshness threshold. Refresh the competitor data before pricing."
          : "No listing meets the confidence threshold. Review the candidate matches before a benchmark can be set." };
    }
    const benchmark = benchmarkOf(used);
    const gap = (product.price - benchmark) / benchmark;
    const tol = s.tolerance / 100;
    const status = gap > tol ? "overpriced" : gap < -tol ? "underpriced" : "competitive";

    const flags = [];
    let rec = benchmark;
    const lo = product.price * (1 - s.maxChange / 100);
    const hi = product.price * (1 + s.maxChange / 100);
    if (rec < lo) { rec = lo; flags.push("change capped"); }
    if (rec > hi) { rec = hi; flags.push("change capped"); }
    let floorApplied = false;
    if (rec < floor) { rec = floor; floorApplied = true; flags.push("margin floor applied"); }
    let rounded = roundPrice(rec, s.rounding, floorApplied ? "up" : "down");
    if (rounded < floor) rounded = roundPrice(floor, s.rounding, "up");
    const recMargin = (rounded - product.cost) / rounded;

    const policyName = { median: "median", lowest: "lowest valid price", weighted: "confidence-weighted average" }[s.policy];
    let rationale = `Benchmark is the ${policyName} of ${used.length} accepted listing${used.length > 1 ? "s" : ""}${s.landed ? " including shipping" : ""}: ${fmt(benchmark)}. `;
    rationale += `Your price is ${pct(gap)} versus the benchmark, so the product is ${STATUS_LABEL[status].toLowerCase()} (tolerance ±${s.tolerance}%). `;
    if (floorApplied) rationale += `Matching the market would drop margin below the ${s.minMargin}% minimum, so the price is held at the margin floor. `;
    else if (flags.includes("change capped")) rationale += `The move is limited to ${s.maxChange}% per update. `;
    rationale += `Recommended ${fmt(rounded)} gives a ${(recMargin * 100).toFixed(1)}% gross margin.`;
    if (recMargin < s.targetMargin / 100) rationale += ` This is below the ${s.targetMargin}% target margin.`;

    return { ...base, status, benchmark, gap, recommended: rounded, recMargin, flags, rationale };
  }

  const evaluateAll = () => PRODUCTS.map(evaluate);
  const decisionOf = (sku) => state.recDecisions[sku]?.decision || "pending";

  // ---------- Rendering ----------
  function renderKpis(results) {
    const count = (s) => results.filter((r) => r.status === s).length;
    const approved = results.filter((r) => decisionOf(r.product.sku) === "approved").length;
    const review = reviewQueue().length;
    const floorHits = results.filter((r) => r.flags.includes("margin floor applied")).length;
    const cards = [
      { label: "Products tracked", value: results.length, sub: `${PRODUCTS.reduce((a, p) => a + p.offers.length, 0)} competitor listings` },
      { label: "Overpriced", value: count("overpriced"), sub: "above benchmark", status: "overpriced" },
      { label: "Competitive", value: count("competitive"), sub: `within ±${state.settings.tolerance}%`, status: "competitive" },
      { label: "Underpriced", value: count("underpriced"), sub: "below benchmark", status: "underpriced" },
      { label: "Insufficient data", value: count("insufficient"), sub: "needs review or refresh", status: "insufficient" },
      { label: "Margin floor applied", value: floorHits, sub: `min ${state.settings.minMargin}% margin` },
      { label: "Matches to review", value: review, sub: "below confidence threshold" },
      { label: "Approved", value: approved, sub: "ready to export" }
    ];
    $("#kpis").innerHTML = cards.map((c) => `
      <div class="kpi" ${c.status ? `data-status="${c.status}" title="Filter by ${c.label}"` : ""}>
        <div class="label">${c.label}</div><div class="value">${c.value}</div><div class="sub">${c.sub}</div>
      </div>`).join("");
  }

  function filtered(results) {
    const q = $("#search").value.trim().toLowerCase();
    const cat = $("#fCategory").value;
    const st = $("#fStatus").value;
    const dec = $("#fDecision").value;
    return results.filter((r) =>
      (!q || r.product.sku.toLowerCase().includes(q) || r.product.name.toLowerCase().includes(q)) &&
      (!cat || r.product.category === cat) &&
      (!st || r.status === st) &&
      (!dec || decisionOf(r.product.sku) === dec));
  }

  // Lowest price per marketplace. Listings that count toward the benchmark win over ones that don't.
  function competitorPrices(r) {
    const out = {};
    for (const mp of Object.keys(MARKETPLACES)) {
      const rows = r.rows.filter((x) => x.offer.marketplace === mp);
      const pool = rows.filter((x) => x.used).length ? rows.filter((x) => x.used) : rows.filter((x) => x.offer.inStock);
      if (!pool.length) { out[mp] = rows.length ? { none: "Out of stock" } : { none: "Not listed" }; continue; }
      const best = pool.reduce((a, b) => (effectivePrice(b.offer) < effectivePrice(a.offer) ? b : a));
      out[mp] = { offer: best.offer, used: best.used, reason: best.reason };
    }
    const usedPrices = Object.values(out).filter((c) => c.used).map((c) => effectivePrice(c.offer));
    const cheapest = usedPrices.length ? Math.min(...usedPrices) : null;
    return { out, cheapest };
  }

  function competitorCell(c, cheapest) {
    if (c.none) return `<td class="num comp muted">-<div class="meta">${c.none}</div></td>`;
    const o = c.offer;
    const isLow = c.used && effectivePrice(o) === cheapest;
    const ship = o.delivery ? `+ ${fmt(o.delivery)} ship` : "free ship";
    const meta = c.used ? ship : c.reason.toLowerCase();
    return `<td class="num comp${c.used ? "" : " excluded"}${isLow ? " lowest" : ""}" title="${esc(MARKETPLACES[o.marketplace].name)}: ${esc(o.title)}${c.used ? "" : " (not in benchmark: " + esc(c.reason) + ")"}">${fmt(o.price)}<div class="meta">${esc(meta)}</div></td>`;
  }

  function renderTable(results) {
    const rows = filtered(results);
    $("#recTable tbody").innerHTML = rows.length ? rows.map((r) => {
      const p = r.product;
      const d = decisionOf(p.sku);
      const canDecide = r.recommended != null;
      const gapCls = r.gap > 0 ? "gap-pos" : r.gap < 0 ? "gap-neg" : "";
      const comp = competitorPrices(r);
      return `<tr data-sku="${p.sku}">
        <td><input type="checkbox" class="rowSel" data-sku="${p.sku}" ${selected.has(p.sku) ? "checked" : ""} ${canDecide ? "" : "disabled"} aria-label="Select ${esc(p.name)}"></td>
        <td class="prod" data-open="${p.sku}"><div class="name">${esc(p.name)}</div><div class="meta">${p.sku} · ${esc(p.category)} · ${r.used.length}/${p.offers.length} listings used</div></td>
        <td class="num">${fmt(p.price)}<div class="meta muted">cost ${fmt(p.cost)} · ${(r.margin * 100).toFixed(1)}%</div></td>
        ${Object.keys(MARKETPLACES).map((mp) => competitorCell(comp.out[mp], comp.cheapest)).join("")}
        <td class="num">${fmt(r.benchmark)}</td>
        <td class="num ${gapCls}">${pct(r.gap)}</td>
        <td class="num">${fmt(Math.ceil(r.floor * 100) / 100)}</td>
        <td class="num"><strong>${fmt(r.recommended)}</strong>${r.flags.map((f) => `<span class="floor-flag">${f}</span>`).join("")}</td>
        <td><span class="pill ${r.status}">${STATUS_LABEL[r.status]}</span></td>
        <td><div class="decision">${d === "pending"
          ? (canDecide ? `<button class="btn small ok" data-approve="${p.sku}">Approve</button><button class="btn small no" data-reject="${p.sku}">Reject</button>` : `<span class="muted">Review matches</span>`)
          : `<span class="pill ${d}">${d === "approved" ? "Approved" : "Rejected"}</span><button class="btn small" data-undo="${p.sku}" title="Undo">Undo</button>`}</div></td>
      </tr>`;
    }).join("") : `<tr><td colspan="12" class="muted" style="text-align:center;padding:30px">No products match these filters.</td></tr>`;
    updateBulk();
  }

  function reviewQueue() {
    const s = state.settings;
    const queue = [];
    for (const p of PRODUCTS) for (const o of p.offers) {
      if (o.confidence < s.threshold && !state.offerDecisions[o.id] && o.inStock) queue.push({ product: p, offer: o });
    }
    return queue;
  }

  function signalBars(sig) {
    return `<div class="bars">${[["Text", sig.text], ["Image", sig.image], ["Attributes", sig.attributes]].map(([k, v]) => `
      <div class="bar"><span>${k}</span><div class="track"><div class="fill" style="width:${Math.round(v * 100)}%"></div></div><span>${v.toFixed(2)}</span></div>`).join("")}</div>`;
  }

  function renderReview() {
    const queue = reviewQueue();
    const badge = $("#reviewCount");
    badge.textContent = queue.length;
    badge.classList.toggle("zero", queue.length === 0);
    $("#reviewList").innerHTML = queue.length ? queue.map(({ product: p, offer: o }) => `
      <div class="review-card">
        <div>
          <div class="vs">HoppNShop product</div>
          <h3>${esc(p.name)}</h3>
          <div class="muted">${p.sku} · store price ${fmt(p.price)}</div>
        </div>
        <div>
          <div class="vs">${MARKETPLACES[o.marketplace].name} candidate · <span class="pill ${o.type}">${o.type}</span> · confidence ${o.confidence.toFixed(2)}</div>
          <h3>${esc(o.title)}</h3>
          <div class="muted">${fmt(o.price)}${o.delivery ? ` + ${fmt(o.delivery)} shipping` : " · free shipping"}</div>
          ${o.note ? `<div class="note">⚠ ${esc(o.note)}</div>` : ""}
          ${signalBars(o.signals)}
        </div>
        <div class="decision">
          <button class="btn small ok" data-accept-offer="${o.id}">Accept match</button>
          <button class="btn small no" data-reject-offer="${o.id}">Not a match</button>
        </div>
      </div>`).join("") : `<div class="review-empty">All candidate matches have been reviewed.</div>`;
  }

  function renderAudit() {
    $("#auditTable tbody").innerHTML = state.audit.length ? state.audit.map((a) => `
      <tr><td>${new Date(a.time).toLocaleString("en-US")}</td><td>${esc(a.user)}</td><td>${esc(a.action)}</td><td style="white-space:normal">${esc(a.details)}</td></tr>`).join("")
      : `<tr><td colspan="4" class="muted" style="text-align:center;padding:30px">No activity yet.</td></tr>`;
  }

  function renderRules() {
    const f = $("#rulesForm");
    for (const [k, v] of Object.entries(state.settings)) {
      const el = f.elements[k];
      if (!el) continue;
      if (el.type === "checkbox") el.checked = v; else el.value = v;
    }
  }

  function renderDetail() {
    if (!openSku) return;
    const r = evaluate(PRODUCTS.find((p) => p.sku === openSku));
    const p = r.product;
    $("#detailTitle").textContent = p.name;
    $("#detailSub").textContent = `${p.sku} · ${p.category} · cost ${fmt(p.cost)} · store price ${fmt(p.price)}`;
    const d = decisionOf(p.sku);
    $("#detailBody").innerHTML = `
      <div class="calc">
        <div><div class="k">Current margin</div><div class="v">${(r.margin * 100).toFixed(1)}%</div></div>
        <div><div class="k">Benchmark</div><div class="v">${fmt(r.benchmark)}</div></div>
        <div><div class="k">Gap vs benchmark</div><div class="v">${pct(r.gap)}</div></div>
        <div><div class="k">Margin floor (${state.settings.minMargin}%)</div><div class="v">${fmt(Math.ceil(r.floor * 100) / 100)}</div></div>
        <div><div class="k">Target price (${state.settings.targetMargin}%)</div><div class="v">${fmt(Math.ceil(r.target * 100) / 100)}</div></div>
        <div><div class="k">Recommended</div><div class="v">${fmt(r.recommended)}</div></div>
      </div>
      <div class="rationale"><strong><span class="pill ${r.status}">${STATUS_LABEL[r.status]}</span></strong> ${esc(r.rationale)}</div>
      <div class="table-wrap">
        <table class="grid">
          <thead><tr><th>Marketplace</th><th>Listing</th><th class="num">Price</th><th class="num">Shipping</th><th>Match</th><th>Signals</th><th>Observed</th><th>Used?</th><th></th></tr></thead>
          <tbody>${r.rows.map(({ offer: o, used, reason }) => {
            const dec = state.offerDecisions[o.id];
            const age = ageHours(o);
            return `<tr class="${used ? "" : "excluded"}">
              <td>${MARKETPLACES[o.marketplace].name}</td>
              <td style="white-space:normal;min-width:200px;max-width:280px"><a href="${MARKETPLACES[o.marketplace].search}${encodeURIComponent(p.name)}" target="_blank" rel="noopener">${esc(o.title)}</a>${o.note ? `<div class="floor-flag">⚠ ${esc(o.note)}</div>` : ""}${o.inStock ? "" : `<div class="floor-flag">Out of stock</div>`}</td>
              <td class="num">${fmt(o.price)}<div class="meta muted">List ${fmt(o.listPrice)}</div></td>
              <td class="num">${o.delivery ? fmt(o.delivery) : "Free"}</td>
              <td><span class="pill ${o.type}">${o.type}</span><div class="meta muted">${o.confidence.toFixed(2)}</div></td>
              <td style="min-width:210px">${signalBars(o.signals)}</td>
              <td>${Math.round(age)} h ago${age > state.settings.freshHours ? ` <span class="pill stale">stale</span>` : ""}</td>
              <td>${used ? "Yes" : "No"}<div class="meta muted">${reason}</div></td>
              <td><div class="decision">${dec
                ? `<button class="btn small" data-clear-offer="${o.id}">Undo ${dec === "accepted" ? "accept" : "reject"}</button>`
                : `<button class="btn small ok" data-accept-offer="${o.id}" title="Accept match">✓</button><button class="btn small no" data-reject-offer="${o.id}" title="Not a match">✕</button>`}</div></td>
            </tr>`;
          }).join("")}</tbody>
        </table>
      </div>
      <p class="muted" style="margin:0">Links open a marketplace search for this product. Listing titles and prices are illustrative.</p>
      <div class="detail-actions">${r.recommended == null ? `<span class="muted">Accept at least one match to get a recommendation.</span>`
        : d === "pending" ? `<button class="btn no" data-reject="${p.sku}">Reject recommendation</button><button class="btn primary" data-approve="${p.sku}">Approve ${fmt(r.recommended)}</button>`
        : `<span class="pill ${d}">${d === "approved" ? `Approved at ${fmt(state.recDecisions[p.sku].price)}` : "Rejected"}</span><button class="btn" data-undo="${p.sku}">Undo</button>`}</div>`;
  }

  function render() {
    const results = evaluateAll();
    renderKpis(results);
    renderTable(results);
    renderReview();
    renderAudit();
    renderDetail();
  }

  function updateBulk() {
    const visible = [...document.querySelectorAll(".rowSel:not(:disabled)")];
    const all = $("#selectAll");
    all.checked = visible.length > 0 && visible.every((c) => c.checked);
    $("#bulkApprove").disabled = selected.size === 0;
    $("#bulkApprove").textContent = selected.size ? `Approve selected (${selected.size})` : "Approve selected";
  }

  // ---------- Actions ----------
  function setRec(sku, decision) {
    const r = evaluate(PRODUCTS.find((p) => p.sku === sku));
    if (r.recommended == null) return false;
    state.recDecisions[sku] = { decision, price: r.recommended, previous: r.product.price, at: new Date().toISOString() };
    log(decision === "approved" ? "Price approved" : "Recommendation rejected",
      `${sku}: ${fmt(r.product.price)} → ${fmt(r.recommended)} (${STATUS_LABEL[r.status]}${r.flags.length ? ", " + r.flags.join(", ") : ""})`);
    return true;
  }

  function setOffer(id, decision) {
    const product = PRODUCTS.find((p) => p.offers.some((o) => o.id === id));
    const offer = product.offers.find((o) => o.id === id);
    if (decision) state.offerDecisions[id] = decision; else delete state.offerDecisions[id];
    // A changed match can change the benchmark, so any earlier price decision needs a fresh look.
    if (state.recDecisions[product.sku]) delete state.recDecisions[product.sku];
    log(decision === "accepted" ? "Match accepted" : decision === "rejected" ? "Match rejected" : "Match decision cleared",
      `${product.sku} ↔ ${MARKETPLACES[offer.marketplace].name}: "${offer.title}" (${fmt(offer.price)}, confidence ${offer.confidence.toFixed(2)})`);
  }

  function exportCsv() {
    const approved = Object.entries(state.recDecisions).filter(([, v]) => v.decision === "approved");
    if (!approved.length) { toast("No approved prices to export yet."); return; }
    const lines = [["sku", "product", "current_price_usd", "new_price_usd", "approved_at"].join(",")];
    // Quote every cell and neutralize leading formula characters so spreadsheets don't execute them.
    const cell = (v) => {
      let s = String(v);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return `"${s.replace(/"/g, '""')}"`;
    };
    for (const [sku, v] of approved) {
      const p = PRODUCTS.find((x) => x.sku === sku);
      lines.push([sku, p.name, v.previous.toFixed(2), v.price.toFixed(2), v.at].map(cell).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `hoppnshop-price-updates-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    log("Exported price file", `${approved.length} approved price${approved.length > 1 ? "s" : ""} exported to CSV`);
    toast(`Exported ${approved.length} approved price${approved.length > 1 ? "s" : ""}.`);
    render();
  }

  function showTab(name) {
    document.querySelectorAll(".tab").forEach((t) => {
      const on = t.dataset.tab === name;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on);
    });
    document.querySelectorAll(".panel").forEach((p) => { p.hidden = p.id !== `tab-${name}`; });
  }

  // ---------- Events ----------
  document.addEventListener("click", (e) => {
    const t = e.target.closest("button, [data-open], .kpi[data-status]");
    if (!t) return;
    const ds = t.dataset;
    if (ds.tab) return showTab(ds.tab);
    if (ds.open) { openSku = ds.open; renderDetail(); $("#detail").showModal(); return; }
    if (ds.status && t.classList.contains("kpi")) { $("#fStatus").value = $("#fStatus").value === ds.status ? "" : ds.status; render(); return; }
    if (ds.approve) { if (setRec(ds.approve, "approved")) { selected.delete(ds.approve); toast(`Approved ${ds.approve}`); } return render(); }
    if (ds.reject) { setRec(ds.reject, "rejected"); selected.delete(ds.reject); toast(`Rejected ${ds.reject}`); return render(); }
    if (ds.undo) { delete state.recDecisions[ds.undo]; log("Decision undone", ds.undo); return render(); }
    if (ds.acceptOffer) { setOffer(ds.acceptOffer, "accepted"); toast("Match accepted; benchmark recalculated"); return render(); }
    if (ds.rejectOffer) { setOffer(ds.rejectOffer, "rejected"); toast("Match rejected"); return render(); }
    if (ds.clearOffer) { setOffer(ds.clearOffer, null); return render(); }
  });

  $("#recTable").addEventListener("change", (e) => {
    if (e.target.id === "selectAll") {
      document.querySelectorAll(".rowSel:not(:disabled)").forEach((c) => {
        c.checked = e.target.checked;
        if (c.checked) selected.add(c.dataset.sku); else selected.delete(c.dataset.sku);
      });
    } else if (e.target.classList.contains("rowSel")) {
      if (e.target.checked) selected.add(e.target.dataset.sku); else selected.delete(e.target.dataset.sku);
    }
    updateBulk();
  });

  $("#bulkApprove").addEventListener("click", () => {
    let n = 0;
    for (const sku of selected) if (decisionOf(sku) === "pending" && setRec(sku, "approved")) n++;
    selected.clear();
    toast(`Approved ${n} price${n === 1 ? "" : "s"}`);
    render();
  });
  $("#exportCsv").addEventListener("click", exportCsv);
  ["#search", "#fCategory", "#fStatus", "#fDecision"].forEach((s) => $(s).addEventListener("input", render));
  $("#closeDetail").addEventListener("click", () => $("#detail").close());
  $("#detail").addEventListener("close", () => { openSku = null; });
  $("#detail").addEventListener("click", (e) => { if (e.target.id === "detail") $("#detail").close(); });

  $("#rulesForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target.elements;
    const next = {
      minMargin: Number(f.minMargin.value), targetMargin: Number(f.targetMargin.value),
      policy: f.policy.value, threshold: Number(f.threshold.value), landed: f.landed.checked,
      freshHours: Number(f.freshHours.value), tolerance: Number(f.tolerance.value),
      maxChange: Number(f.maxChange.value), rounding: f.rounding.value
    };
    if (next.targetMargin < next.minMargin) { toast("Target margin must be at least the minimum margin."); return; }
    const changes = Object.keys(next).filter((k) => next[k] !== state.settings[k]).map((k) => `${k}: ${state.settings[k]} → ${next[k]}`);
    state.settings = next;
    log("Pricing rules changed", changes.length ? changes.join("; ") : "No changes");
    toast("Rules saved; recommendations recalculated");
    render();
  });
  $("#resetRules").addEventListener("click", () => {
    state.settings = { ...DEFAULT_SETTINGS };
    log("Pricing rules reset", "Restored default rules");
    renderRules();
    render();
    toast("Rules reset to defaults");
  });
  $("#resetDemo").addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    state = loadState();
    selected.clear();
    renderRules();
    render();
    toast("Demo data reset");
  });

  // ---------- Init ----------
  for (const c of CATEGORIES) $("#fCategory").insertAdjacentHTML("beforeend", `<option>${esc(c)}</option>`);
  renderRules();
  render();
})();
