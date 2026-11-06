// Illustrative sample data for the PriceIntel AI mockup.
// Products, costs, and competitor observations are invented for demonstration only
// and are not verified market observations.

const MARKETPLACES = {
  amazon: { name: "Amazon India", search: "https://www.amazon.in/s?k=" },
  flipkart: { name: "Flipkart", search: "https://www.flipkart.com/search?q=" },
  meesho: { name: "Meesho", search: "https://www.meesho.com/search?q=" }
};

const CATEGORIES = ["Clothing", "Bags", "Home and kitchen", "Drinkware", "Accessories"];

// [sku, name, category, total variable cost, current store price, typical market price, flag]
// flag: "variant" adds a near-miss listing that needs review, "sparse" means only uncertain
// matches, "stale" makes observations older than the freshness threshold.
const PRODUCT_ROWS = [
  ["HNS-HD-001", "Cotton hoodie, unisex, black", "Clothing", 780, 1114, 1099, "variant"],
  ["HNS-HD-002", "Fleece zip hoodie, navy", "Clothing", 920, 1399, 1249, ""],
  ["HNS-HD-003", "Oversized graphic hoodie", "Clothing", 650, 899, 949, ""],
  ["HNS-TS-004", "Printed T-shirt, crew neck", "Clothing", 420, 699, 649, ""],
  ["HNS-TS-005", "Polo T-shirt, pique cotton", "Clothing", 380, 549, 599, "stale"],
  ["HNS-JK-006", "Lightweight windcheater jacket", "Clothing", 1100, 1799, 1699, ""],
  ["HNS-BG-007", "Travel backpack 35 L", "Bags", 900, 1499, 1199, "variant"],
  ["HNS-BG-008", "Laptop backpack 15.6 inch", "Bags", 1080, 1399, 1249, ""],
  ["HNS-BG-009", "Canvas tote bag", "Bags", 210, 399, 349, ""],
  ["HNS-BG-010", "Duffel gym bag 40 L", "Bags", 640, 999, 1049, ""],
  ["HNS-BG-011", "Sling crossbody bag", "Bags", 330, 599, 549, ""],
  ["HNS-BG-012", "Trolley cabin luggage 20 inch", "Bags", 2100, 3299, 3499, ""],
  ["HNS-HK-013", "Non-stick frying pan 24 cm", "Home and kitchen", 520, 849, 799, ""],
  ["HNS-HK-014", "Stainless steel knife set, 3 pieces", "Home and kitchen", 340, 599, 649, ""],
  ["HNS-HK-015", "Cotton double bedsheet with 2 pillow covers", "Home and kitchen", 610, 999, 899, ""],
  ["HNS-HK-016", "Bamboo chopping board", "Home and kitchen", 180, 349, 299, ""],
  ["HNS-HK-017", "Glass storage containers, set of 4", "Home and kitchen", 450, 749, 799, "variant"],
  ["HNS-HK-018", "Embroidered cushion covers, set of 5", "Home and kitchen", 260, 499, 449, "sparse"],
  ["HNS-DW-019", "Steel tumbler 500 ml", "Drinkware", 560, 732, 899, "variant"],
  ["HNS-DW-020", "Insulated water bottle 1 L", "Drinkware", 480, 799, 749, "variant"],
  ["HNS-DW-021", "Ceramic coffee mug 350 ml", "Drinkware", 140, 299, 279, ""],
  ["HNS-DW-022", "Glass water bottle 750 ml", "Drinkware", 210, 399, 429, ""],
  ["HNS-DW-023", "Kids sipper bottle 400 ml", "Drinkware", 190, 349, 329, "stale"],
  ["HNS-DW-024", "Travel coffee mug 450 ml", "Drinkware", 330, 599, 549, ""],
  ["HNS-AC-025", "Running sports shoes", "Accessories", 900, 1299, 1399, "sparse"],
  ["HNS-AC-026", "Leather wallet for men", "Accessories", 300, 599, 499, ""],
  ["HNS-AC-027", "Analog wrist watch", "Accessories", 700, 1199, 1299, ""],
  ["HNS-AC-028", "Polarised sunglasses", "Accessories", 260, 499, 549, ""],
  ["HNS-AC-029", "Cotton baseball cap", "Accessories", 150, 299, 279, ""],
  ["HNS-AC-030", "Aluminium phone stand", "Accessories", 170, 349, 249, ""]
];

const VARIANT_NOTES = {
  "HNS-HD-001": "Pack of 2 listing",
  "HNS-BG-007": "45 L capacity, not 35 L",
  "HNS-HK-017": "Set of 3, not set of 4",
  "HNS-DW-019": "750 ml size, not 500 ml",
  "HNS-DW-020": "750 ml size, not 1 L"
};

const TITLE_SUFFIXES = ["", " | Premium quality", " - Regular fit", " (Combo offer)", " | Bestseller", " - New arrival"];
const SNAPSHOT_TIME = Date.parse("2026-11-05T18:00:00+05:30");

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

const roundTo9 = (p) => Math.max(9, Math.round((p + 1) / 10) * 10 - 1);

function makeOffer(sku, mp, index, o, rnd) {
  const jitter = () => Math.round(Math.min(0.99, Math.max(0.3, o.conf + (rnd() - 0.5) * 0.16)) * 100) / 100;
  return {
    id: `${sku}-${mp}-${index}`,
    marketplace: mp,
    title: o.title,
    price: o.price,
    mrp: o.mrp,
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
      const discount = mp === "meesho" ? 0.9 : 1;
      const price = roundTo9(market * discount * (0.93 + rnd() * 0.14));
      const conf = sparse ? 0.48 + rnd() * 0.24 : 0.82 + rnd() * 0.16;
      offers.push(makeOffer(sku, mp, offers.length, {
        title: name + TITLE_SUFFIXES[Math.floor(rnd() * TITLE_SUFFIXES.length)],
        price,
        mrp: roundTo9(price * (1.3 + rnd() * 0.5)),
        delivery: rnd() < 0.6 ? 0 : [40, 49, 69][Math.floor(rnd() * 3)],
        inStock: rnd() > 0.08,
        conf,
        type: sparse ? "uncertain" : conf > 0.9 ? "exact" : "comparable",
        note: sparse ? "Unbranded listing; design and material could not be confirmed" : "",
        hoursAgo: flag === "stale" ? 50 + Math.floor(rnd() * 30) : 1 + Math.floor(rnd() * 20)
      }, rnd));
    }
  }
  if (flag === "variant") {
    const price = roundTo9(market * (sku === "HNS-HD-001" ? 1.8 : 1.25));
    const mp = Object.keys(MARKETPLACES)[Math.floor(rnd() * 3)];
    offers.push(makeOffer(sku, mp, offers.length, {
      title: `${name} - ${VARIANT_NOTES[sku]}`,
      price,
      mrp: roundTo9(price * 1.5),
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
