# <img width="30" alt="kosh" src="https://github.com/user-attachments/assets/04072d21-359e-4b50-ad08-fe4056e1a077" /> kosh 

<img alt="kosh; text reads one moment of perfect beauty" width="300" src="https://github.com/user-attachments/assets/db9737bb-7ea8-4dbf-b539-e503c29bb9a5">

A Claude Code plugin for testing WordPress sites. Run automated functional, performance, accessibility, and AEO audits against any live URL using real browser automation via Playwright MCP.

## What it does

Kosh tests a site across four dimensions:

- **Functional & design:** User journeys, layout consistency, link validation, OpenGraph metadata, content quality
- **Performance:** Load times, console errors, network failures, mixed content
- **Accessibility:** WCAG 2.2 Level AA compliance: heading hierarchy, alt text, color contrast, keyboard navigation, form labels, ARIA
- **AEO (Answer Engine Optimization):** How AI tools like ChatGPT, Perplexity, Claude, and Google AI Overviews discover, parse, understand, and cite the site. 49 signals across 8 criteria, status-based evaluation (pass / partial / fail / N/A), site-type-aware and content-driven.

Each test visits 4–6+ pages, simulates real user behavior, and outputs a structured JSON report. A render script converts the JSON into a self-contained HTML report with color-coded severity, collapsible sections, and inline screenshots. The functional, performance, and accessibility test types can also be merged into one comprehensive report.

## Quick start

```bash
git clone https://github.com/a8cteam51/kosh.git
cd kosh
claude --plugin-dir .
```

On first run, Claude Code will ask you to trust this project's settings — **accept the prompt**. This pre-approves the Playwright browser tools so you don't get prompted for each one during a test.

Then run a test:

```
/kosh:functional-design https://example.com
/kosh:performance https://example.com
/kosh:a11y https://example.com
/kosh:aeo https://example.com
```

For detailed setup instructions (including troubleshooting), see the [Getting Started guide](docs/getting-started.md).

## Project structure

```text
commands/        Slash commands (/kosh:a11y, /kosh:aeo, /kosh:functional-design, /kosh:performance)
skills/          Full testing procedures for each command
schemas/         JSON schemas for report validation
scripts/         Report generation and merge scripts
hooks/           Session hook that creates reports/data/ on startup
.mcp.json        Playwright MCP server configuration
.claude/         Project settings and Playwright tool permissions
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

- **Functional & design / Performance / Accessibility** (`qa-report-functional-schema.json`, `qa-report-performance-schema.json`, `qa-report-accessibility-schema.json`) — `mobile` and `desktop` blocks carry the viewport-specific findings (page metadata, network errors, contrast failures, etc.).
- **AEO** (`qa-report-aeo-schema.json`) — `criteria` block with eight criterion sub-blocks (each containing pass / partial / fail / N/A signal evaluations), a top-level `summary` with signal counts, plus `siteType`, `siteTypeConfidence`, and a `technicalNotes.applicableSchemas` relevance map.
