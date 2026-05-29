# <img width="30" alt="kosh" src="https://github.com/user-attachments/assets/04072d21-359e-4b50-ad08-fe4056e1a077" /> kosh 

<img alt="kosh; text reads one moment of perfect beauty" width="300" src="https://github.com/user-attachments/assets/db9737bb-7ea8-4dbf-b539-e503c29bb9a5">

A Claude Code plugin for testing WordPress sites. Run automated functional, performance, accessibility, and AEO audits against any live URL using real browser automation via Playwright MCP.

## What it does

Kosh tests a site across four dimensions:

- **Functional & design:** User journeys, layout consistency, link validation, OpenGraph metadata, content quality
- **Performance:** Load times, console errors, network failures, mixed content
- **Accessibility:** WCAG 2.2 Level AA compliance: heading hierarchy, alt text, color contrast, keyboard navigation, form labels, ARIA
- **AEO (Answer Engine Optimization):** How AI tools like ChatGPT, Perplexity, Claude, and Google AI Overviews discover, parse, understand, and cite the site. 49 signals across 8 criteria, site-type-aware and content-driven (100 pts)

Each test visits 4–6+ pages, simulates real user behavior, and outputs a structured JSON report. An optional script converts any report to a formatted Markdown document, and a merge script combines all three into one comprehensive report.

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

```
commands/        Slash commands (/kosh:a11y, /kosh:aeo, /kosh:functional-design, /kosh:performance)
skills/          Full testing procedures for each command
schemas/         JSON schemas for report validation
scripts/         Report generation and merge scripts
hooks/           Session hook that creates reports/data/ on startup
.mcp.json        Playwright MCP server configuration
.claude/         Project settings and Playwright tool permissions
```

## Report structure

All reports follow the same shape:

```json
{
  "url": "https://example.com",
  "websiteName": "Example",
  "timestamp": "2026-03-20T10:00:00.000Z",
  "visitedPages": ["https://example.com", "..."],
  "mobile": { ... },
  "desktop": { ... },
  "issues": {
    "critical": [],
    "high": [],
    "medium": [],
    "low": []
  }
}
```

Schema definitions are in `schemas/`.
