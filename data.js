// Illustrative sample data for the PriceIntel AI mockup.
// Products, costs, and competitor observations are invented for demonstration only
// and are not verified market observations.

const MARKETPLACES = {
  amazon: { name: "Amazon", search: "https://www.amazon.com/s?k=" },
  walmart: { name: "Walmart", search: "https://www.walmart.com/search?q=" },
  target: { name: "Target", search: "https://www.target.com/s?searchTerm=" }
};

const CATEGORIES = ["Clothing", "Bags", "Home and kitchen", "Drinkware", "Accessories"];

// [sku, name, category, total variable cost (USD), current store price, typical market price, flag]
// flag: "variant" adds a near-miss listing that needs review, "sparse" means only uncertain
// matches, "stale" makes observations older than the freshness threshold.
const PRODUCT_ROWS = [
  ["HNS-HD-001", "Cotton hoodie, unisex, black", "Clothing", 19.50, 27.85, 26.99, "variant"],
  ["HNS-HD-002", "Fleece zip hoodie, navy", "Clothing", 23.00, 34.99, 30.99, ""],
  ["HNS-HD-003", "Oversized graphic hoodie", "Clothing", 16.25, 21.99, 23.99, ""],
  ["HNS-TS-004", "Printed T-shirt, crew neck", "Clothing", 10.50, 16.99, 15.99, ""],
  ["HNS-TS-005", "Polo shirt, pique cotton", "Clothing", 9.50, 13.99, 14.99, "stale"],
  ["HNS-JK-006", "Lightweight windbreaker jacket", "Clothing", 27.50, 44.99, 41.99, ""],
  ["HNS-BG-007", "Travel backpack 35 L", "Bags", 22.50, 36.99, 29.99, "variant"],
  ["HNS-BG-008", "Laptop backpack 15.6 inch", "Bags", 27.00, 34.99, 30.99, ""],
  ["HNS-BG-009", "Canvas tote bag", "Bags", 5.25, 9.99, 8.99, ""],
  ["HNS-BG-010", "Duffel gym bag 40 L", "Bags", 16.00, 24.99, 25.99, ""],
  ["HNS-BG-011", "Sling crossbody bag", "Bags", 8.25, 14.99, 13.99, ""],
  ["HNS-BG-012", "Carry-on spinner luggage 20 inch", "Bags", 52.50, 81.99, 86.99, ""],
  ["HNS-HK-013", "Nonstick frying pan 9.5 inch", "Home and kitchen", 13.00, 20.99, 19.99, ""],
  ["HNS-HK-014", "Stainless steel knife set, 3 pieces", "Home and kitchen", 8.50, 14.99, 15.99, ""],
  ["HNS-HK-015", "Cotton queen sheet set with 2 pillowcases", "Home and kitchen", 15.25, 24.99, 21.99, ""],
  ["HNS-HK-016", "Bamboo cutting board", "Home and kitchen", 4.50, 8.99, 7.49, ""],
  ["HNS-HK-017", "Glass food storage containers, set of 4", "Home and kitchen", 11.25, 18.99, 19.99, "variant"],
  ["HNS-HK-018", "Embroidered throw pillow covers, set of 2", "Home and kitchen", 6.50, 11.99, 10.99, "sparse"],
  ["HNS-DW-019", "Stainless steel tumbler 20 oz", "Drinkware", 14.00, 18.30, 21.99, "variant"],
  ["HNS-DW-020", "Insulated water bottle 32 oz", "Drinkware", 12.00, 19.99, 18.99, "variant"],
  ["HNS-DW-021", "Ceramic coffee mug 12 oz", "Drinkware", 3.50, 6.99, 6.49, ""],
  ["HNS-DW-022", "Glass water bottle 25 oz", "Drinkware", 5.25, 9.99, 10.99, ""],
  ["HNS-DW-023", "Kids straw water bottle 14 oz", "Drinkware", 4.75, 8.99, 7.99, "stale"],
  ["HNS-DW-024", "Travel coffee mug 16 oz", "Drinkware", 8.25, 14.99, 13.99, ""],
  ["HNS-AC-025", "Running shoes", "Accessories", 22.50, 31.99, 34.99, "sparse"],
  ["HNS-AC-026", "Men's leather wallet", "Accessories", 7.50, 14.99, 11.99, ""],
  ["HNS-AC-027", "Analog wristwatch", "Accessories", 17.50, 29.99, 31.99, ""],
  ["HNS-AC-028", "Polarized sunglasses", "Accessories", 6.50, 11.99, 13.99, ""],
  ["HNS-AC-029", "Cotton baseball cap", "Accessories", 3.75, 6.99, 6.49, ""],
  ["HNS-AC-030", "Aluminum phone stand", "Accessories", 4.25, 8.99, 5.99, ""]
];

const VARIANT_NOTES = {
  "HNS-HD-001": "Pack of 2 listing",
  "HNS-BG-007": "45 L capacity, not 35 L",
  "HNS-HK-017": "Set of 3, not set of 4",
  "HNS-DW-019": "30 oz size, not 20 oz",
  "HNS-DW-020": "24 oz size, not 32 oz"
};

const TITLE_SUFFIXES = ["", " | Premium quality", " - Regular fit", " (Value pack)", " | Best seller", " - New arrival"];
const SNAPSHOT_TIME = Date.parse("2026-11-05T18:00:00-05:00");

function seededRandom(seedText) {
  let h = 2166136261;
  for (const ch of seedText) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Free shipping at $35 or more (a common US threshold); cheaper items are often free or carry a small fee.
const shipping = (price, r1, r2) => (price >= 35 || r1 < 0.6 ? 0 : [1.99, 2.99, 3.99][Math.floor(r2 * 3)]);

// Round to the nearest price ending in .99, as US retail prices usually do.
const roundTo99 = (p) => Math.max(0.99, Math.round(p + 0.01) - 0.01);

function makeOffer(sku, mp, index, o, rnd) {
  const jitter = () => Math.round(Math.min(0.99, Math.max(0.3, o.conf + (rnd() - 0.5) * 0.16)) * 100) / 100;
  return {
    id: `${sku}-${mp}-${index}`,
    marketplace: mp,
    title: o.title,
    price: o.price,
    listPrice: o.listPrice,
    delivery: o.delivery,
    inStock: o.inStock,
    confidence: Math.round(o.conf * 100) / 100,
    type: o.type,
    note: o.note,
    signals: {
      text: jitter(),
      image: jitter(),
      attributes: o.note ? Math.round((0.4 + rnd() * 0.2) * 100) / 100 : jitter()
    },
    observedAt: new Date(SNAPSHOT_TIME - o.hoursAgo * 3600 * 1000).toISOString()
  };
}

function buildOffers([sku, name, category, , , market, flag]) {
  const rnd = seededRandom(sku);
  const offers = [];
  const sparse = flag === "sparse";
  for (const mp of Object.keys(MARKETPLACES)) {
    const count = 1 + Math.floor(rnd() * 2);
    for (let i = 0; i < count; i++) {
      const discount = mp === "walmart" ? 0.95 : 1;
      const price = roundTo99(market * discount * (0.93 + rnd() * 0.14));
      const conf = sparse ? 0.48 + rnd() * 0.24 : 0.82 + rnd() * 0.16;
      offers.push(makeOffer(sku, mp, offers.length, {
        title: name + TITLE_SUFFIXES[Math.floor(rnd() * TITLE_SUFFIXES.length)],
        price,
        listPrice: roundTo99(price * (1.3 + rnd() * 0.5)),
        delivery: shipping(price, rnd(), rnd()),
        inStock: rnd() > 0.08,
        conf,
        type: sparse ? "uncertain" : conf > 0.9 ? "exact" : "comparable",
        note: sparse ? "Unbranded listing; design and material could not be confirmed" : "",
        hoursAgo: flag === "stale" ? 50 + Math.floor(rnd() * 30) : 1 + Math.floor(rnd() * 20)
      }, rnd));
    }
  }
  if (flag === "variant") {
    const price = roundTo99(market * (sku === "HNS-HD-001" ? 1.8 : 1.25));
    const mp = Object.keys(MARKETPLACES)[Math.floor(rnd() * 3)];
    offers.push(makeOffer(sku, mp, offers.length, {
      title: `${name} - ${VARIANT_NOTES[sku]}`,
      price,
      listPrice: roundTo99(price * 1.5),
      delivery: 0,
      inStock: true,
      conf: 0.58 + rnd() * 0.14,
      type: "uncertain",
      note: VARIANT_NOTES[sku],
      hoursAgo: 2 + Math.floor(rnd() * 10)
    }, rnd));
  }
  return offers;
}

const PRODUCTS = PRODUCT_ROWS.map((row) => ({
  sku: row[0],
  name: row[1],
  category: row[2],
  cost: row[3],
  price: row[4],
  offers: buildOffers(row)
}));
