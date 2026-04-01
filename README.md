# <img width="30" alt="kosh" src="https://github.com/user-attachments/assets/04072d21-359e-4b50-ad08-fe4056e1a077" /> kosh 

<img alt="kosh; text reads one moment of perfect beauty" width="300" src="https://github.com/user-attachments/assets/db9737bb-7ea8-4dbf-b539-e503c29bb9a5">

A Claude Code plugin for testing WordPress sites. Run automated functional, performance, and accessibility audits against any live URL using real browser automation via Playwright MCP.

## What it does

Kosh tests a site across three dimensions:

- **Functional & design:** User journeys, layout consistency, link validation, OpenGraph metadata, content quality
- **Performance:** Load times, console errors, network failures, mixed content
- **Accessibility:** WCAG 2.2 Level AA compliance: heading hierarchy, alt text, color contrast, keyboard navigation, form labels, ARIA

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
```

For detailed setup instructions (including troubleshooting), see the [Getting Started guide](docs/getting-started.md).

## Project structure

```
commands/        Slash commands (/kosh:a11y, /kosh:functional-design, /kosh:performance)
skills/          Full testing procedures for each command
schemas/         JSON schemas for report validation
scripts/         Report generation and merge scripts
hooks/           Session hooks and permission notification sound
.mcp.json        Playwright MCP server configuration
.claude/         Project settings and Playwright tool permissions
```

## Notification sound

Kosh plays a notification sound when Claude Code needs permission approval and your terminal isn't focused — so you don't come back to find it's been waiting for you.

To mute the sound, create an empty file called `mute` inside the `assets/` folder:

```bash
touch assets/mute
```

To re-enable it, delete that file:

```bash
rm assets/mute
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
