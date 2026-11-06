# PriceIntel AI

PriceIntel AI is a clickable mockup of a competitor price intelligence dashboard for a small US online retailer that competes with listings on Amazon, Walmart, and Target. It shows how matched competitor prices, margin rules, and human approval can combine into safe price recommendations.

**Live demo:** <https://mudassar-data-ai.github.io/hop-n-shop/>

> [!NOTE]
> This is a design mockup. All 30 products, costs, and competitor listings are invented sample data, not real marketplace observations. Nothing is scraped or fetched.

## Features

* **Recommendations:** each product is marked overpriced, competitive, underpriced, or insufficient data, with its lowest Amazon, Walmart, and Target price side by side (cheapest highlighted, excluded listings greyed out), competitor benchmark, margin floor, and recommended price. You can filter, search, approve or reject a recommendation, or bulk-approve several.
* **Product detail:** every competitor listing with its match confidence, text, image, and attribute signals, freshness, and whether it counted toward the benchmark, plus a plain-English rationale.
* **Match review:** low-confidence listings, such as a pack of 2 or a different size, wait for a reviewer to accept or reject them. Accepting one recalculates the benchmark.
* **Pricing rules:** minimum and target margin, benchmark policy (median, lowest, or confidence-weighted), confidence threshold, freshness, tolerance, maximum change per update, and rounding.
* **Audit log and CSV export** of approved prices.

Decisions are saved in browser `localStorage`. Use **Reset demo data** on the Audit log tab to clear them.

## How the pricing works

1. Listings count toward the benchmark when they are in stock, fresh, and either above the confidence threshold or accepted by a reviewer.
2. The benchmark is the median, lowest, or confidence-weighted price of those listings, optionally including shipping.
3. The status compares the store price with the benchmark, within a tolerance.
4. The recommendation follows the benchmark, limited by the maximum change per update and never below the margin floor: `cost / (1 - minimum margin)`.
5. The price is rounded, for example to end in .99, without dropping below the floor.

Prices are in US dollars and exclude sales tax, which marketplaces add at checkout. Confirm your sales tax obligations with a tax advisor.

## Run locally

Requires [Node.js](https://nodejs.org/) 18 or later. There are no dependencies to install.

```bash
node server.js
```

Open <http://localhost:8080>. The local server binds to `127.0.0.1`, serves only web file types, blocks dotfiles, and sends security headers.

## Architecture options

[docs/architecture/ARCHITECTURE-OPTIONS.md](docs/architecture/ARCHITECTURE-OPTIONS.md) compares three ways to deliver this in production: buy a SaaS tool, combine licensed data with your own pricing rules on Azure, or build a custom platform on Azure. Each option has an editable draw.io diagram, an SVG, and a PNG.

## Project structure

| Path | Purpose |
|---|---|
| `index.html`, `styles.css`, `app.js` | Dashboard UI and pricing logic |
| `data.js` | Sample products and competitor listings |
| `server.js` | Optional local static server |
| `docs/architecture/` | Architecture options and diagrams |

## Contributing

Issues and pull requests are welcome. Keep the app dependency-free, keep all data illustrative, and don't add code that scrapes marketplaces in breach of their terms.

## License

The code and documentation are licensed under the [MIT License](LICENSE).

The architecture diagrams embed Microsoft Azure and Microsoft Entra icons. These icons are owned by Microsoft, are not covered by the MIT License, and are used under Microsoft's [icon terms](https://learn.microsoft.com/azure/architecture/icons/) for architecture diagrams. Amazon, Walmart, Target, and Shopify are trademarks of their respective owners. This project is not affiliated with or endorsed by any of them.
