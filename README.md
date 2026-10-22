# <img width="30" alt="kosh" src="https://github.com/user-attachments/assets/04072d21-359e-4b50-ad08-fe4056e1a077" /> kosh 

<img alt="kosh; text reads one moment of perfect beauty" width="300" src="https://github.com/user-attachments/assets/db9737bb-7ea8-4dbf-b539-e503c29bb9a5">

A Claude Code plugin for testing WordPress sites. Run automated functional, performance, accessibility, shop, and AEO audits against any live URL using real browser automation via Playwright MCP.

## What it does

Kosh tests a site across five dimensions:

- **Functional & design:** User journeys, layout consistency, link validation, OpenGraph metadata, content quality
- **Performance:** LCP and CLS, load timings, console errors, failed requests and mixed content across a site's key pages, recorded by the browser rather than reported by the model
- **Accessibility:** WCAG 2.2 Level AA compliance: heading hierarchy, alt text, color contrast, keyboard navigation, form labels, ARIA
- **Shop (WooCommerce):** The guest purchase path — catalog, product pages, add to cart, cart quantity and removal operations, cart math, and the checkout form. Stops at the payment step and never places an order.
- **AEO (Answer Engine Optimization):** How AI tools like ChatGPT, Perplexity, Claude, and Google AI Overviews discover, parse, understand, and cite the site. 49 signals across 8 criteria, status-based evaluation (pass / partial / fail / N/A), site-type-aware and content-driven.

Each test visits 4–6+ pages, simulates real user behavior, and outputs a structured JSON report. A render script converts the JSON into a self-contained HTML report with color-coded severity, collapsible sections, and inline screenshots.

## Quick start

In Claude Code 2.1.275 or later, install kosh once:

```
/plugin install kosh --marketplace a8cteam51/kosh
```

Confirm the marketplace, then choose **Install for you**. Start Claude Code in the folder where you want the reports (they go in its `kosh-reports/`), then run a test:

```
/kosh:functional-design https://example.com
/kosh:performance https://example.com
/kosh:a11y https://example.com
/kosh:shop https://example.com
/kosh:aeo https://example.com
```

Testing a site that's in coming-soon mode, password-protected, or private? kosh detects the gate and pauses so you can log in — see [Testing a site that isn't publicly reachable](docs/getting-started.md#testing-a-site-that-isnt-publicly-reachable).

For detailed setup instructions (including updates and troubleshooting), see the [Getting Started guide](docs/getting-started.md). Working on kosh itself? See [AGENTS.md](AGENTS.md).

## Project structure

```text
skills/          Full testing procedures, invoked as /kosh:a11y, /kosh:aeo, /kosh:functional-design, /kosh:performance, /kosh:shop
schemas/         JSON schemas for report validation
shared/          Canonical blocks each skill carries a verbatim copy of
collectors/      Code Playwright MCP loads: into every page (window.__kosh), and in Node for every tab (the page capture)
scripts/         Report generation, validation, provenance, the page-capture merge and summary, and run comparison
hooks/           Guards that keep page captures read-only and stop browser tools reaching past the page
evals/           Promptfoo regression checks for skill decision rules
tests/           node --test checks for the scripts, the collectors, the capture and its guard, skill snippets, shared-block copies, portability, JSON files, the Playwright MCP flags, allowlist and browser guard, skill ↔ schema drift, report validation and redacted report fixtures — run by .github/workflows/ci.yml on every PR
.claude/         Playwright tool permissions for working in a clone
.claude-plugin/  Plugin manifest, with the Playwright MCP server (pinned, --isolated, --no-webmcp, --init-script, --init-page, --output-dir, --output-max-size), and the marketplace that lists it
.github/         CI workflow — runs tests/ on every PR and push to trunk
```

## Report structure

Every test type emits a JSON report with this common frame:

```json
{
  "url": "https://example.com",
  "websiteName": "Example",
  "timestamp": "2026-03-20T10:00:00.000Z",
  "visitedPages": ["https://example.com", "..."],
  "issues": {
    "critical": [],
    "high": [],
    "medium": [],
    "low": []
  }
}
```

Beyond that frame, each test type has its own shape — see `schemas/` for the authoritative per-type definitions:

- **Functional & design / Accessibility** (`qa-report-functional-schema.json`, `qa-report-accessibility-schema.json`) — `mobile` and `desktop` blocks carry the viewport-specific findings (page metadata, network errors, contrast failures, etc.).
- **Performance** (`qa-report-performance-schema.json`) — a `pages` list with one row per page and viewport (LCP, CLS, load timings, transfer sizes, console errors, failed requests), which `run-qa-report.sh` builds from the browser's page capture; the skill writes the findings. The HTML report shows it as a table with LCP and CLS banded by the Core Web Vitals thresholds.
- **Shop** (`qa-report-shop-schema.json`) — the common frame plus a `shop` block recording what the journey actually exercised: platform, the discovered catalog/cart/checkout URLs, whether the store runs classic or blocks templates, the products tested, which cart operations were verified, and where the run stopped at checkout.
- **AEO** (`qa-report-aeo-schema.json`) — `criteria` block with eight criterion sub-blocks (each containing pass / partial / fail / N/A signal evaluations), a top-level `summary` with signal counts, plus `siteType`, `siteTypeConfidence`, and a `technicalNotes.applicableSchemas` relevance map.
