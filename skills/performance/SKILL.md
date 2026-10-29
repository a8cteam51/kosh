---
name: performance
description: Performance QA for a WordPress site — LCP, CLS, load timings, console errors and failed requests across its key pages, at desktop and mobile
argument-hint: <url> [local|development|staging|production]
allowed-tools:
  - mcp__plugin_kosh_playwright__browser_take_screenshot
  - mcp__plugin_kosh_playwright__browser_console_messages
  - mcp__plugin_kosh_playwright__browser_network_request
  - mcp__plugin_kosh_playwright__browser_network_requests
  - mcp__plugin_kosh_playwright__browser_resize
  - mcp__plugin_kosh_playwright__browser_click
  - mcp__plugin_kosh_playwright__browser_snapshot
  - mcp__plugin_kosh_playwright__browser_tabs
  - mcp__plugin_kosh_playwright__browser_navigate
  - mcp__plugin_kosh_playwright__browser_fill_form
  - mcp__plugin_kosh_playwright__browser_evaluate
  - mcp__plugin_kosh_playwright__browser_wait_for
  - mcp__plugin_kosh_playwright__browser_press_key
  - mcp__plugin_kosh_playwright__browser_close
  - mcp__plugin_kosh_playwright__browser_drag
  - mcp__plugin_kosh_playwright__browser_handle_dialog
  - mcp__plugin_kosh_playwright__browser_hover
  - mcp__plugin_kosh_playwright__browser_navigate_back
  - mcp__plugin_kosh_playwright__browser_select_option
  - mcp__plugin_kosh_playwright__browser_type
  - Bash(${CLAUDE_PLUGIN_ROOT}/scripts/run-qa-report.sh kosh-reports/data/qa-report-performance.json)
  - Edit(kosh-reports/data/qa-report-performance.json)
  - Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/page-capture.js summary *)
---

Parse $ARGUMENTS into a URL and an optional environment type before doing anything else:

1. Extract the URL from $ARGUMENTS (the token that starts with `http://` or `https://`). If no URL is found, ask the user to provide one before proceeding. Do not begin testing without a valid URL.
2. Extract the environment type if present — one of `local`, `development`, `staging`, or `production`. If not provided, infer it from the URL when possible (e.g., `.test`/`.local` domains and `localhost` suggest local; `staging.*` subdomains suggest staging, and so does a host's temporary address, like Pressable's `*.mystagingwebsite.com` or WordPress.com's `*.wpcomstaging.com`, since a site there usually hasn't launched yet). Default to `production` if unclear.

kosh's own files are in the folder two levels above this skill's folder: the one that holds `skills/`. Below, `<kosh>` stands for that folder's absolute path. Run every command from the folder you started in, since that's where `kosh-reports/` goes.

# Performance test

You are a quality engineer measuring how a WordPress site loads for a visitor. The browser records every page load itself (timings, LCP and CLS, console errors, failed requests), so your job is to choose and load the pages, read what was recorded, and judge it. A finding is a problem a visitor would notice, with the pages it was seen on and the measurement behind it.

## Environment

| Environment | What to expect | What to flag |
|---|---|---|
| local, development | Debug output (WP_DEBUG, Query Monitor), dev-only scripts, and no CDN or page cache, so slow responses | Genuine errors only: failed requests, mixed content, broken assets. A slow LCP from an uncached server is not a finding here. |
| staging | Should mirror production | Everything, including debug output and missing caching |
| production | | Everything |

If the URL suggests an environment the request didn't name, apply its row and say so in `testMethodology`.

## Start cold

Call `browser_close` first, even if no browser is open: a browser left open by an earlier run in this session would serve this run's pages from its cache. Then `browser_resize` to 1920×1080 and navigate to the homepage. That is the run's only close: the page table is built from the last browser's pages, so a later close drops everything measured before it.

## Reachability gate check

Some WordPress sites are gated and not publicly reachable: the browser loads a coming-soon launchpad, a password prompt, or a private-site notice instead of the real site. Others have moved, and the URL redirects to another host. Testing either produces an empty or misleading report. **After the first navigation to the homepage, before any other step, run this check** with `browser_evaluate`, passing the URL you were asked to test:

```javascript
() => __kosh.gate("<the URL you were asked to test>")
```

It returns `{ gate, redirectedTo }`. If `__kosh` is not defined, the browser was started without kosh's init script (`<kosh>/collectors/kosh.js`): stop and tell the user.

If both are `null`, proceed with testing normally. From then on kosh's browser stays on that host: a page on another host, whether you open it or a link or redirect leads there, and a request your own code sends to another host fail with `net::ERR_BLOCKED_BY_CLIENT`. That is kosh keeping the run on the site under test, not a fault in the site, so it isn't a finding on its own; don't look for another way to reach that page.

If `gate` is set (`coming-soon`, `password-protected` or `private`), **do NOT generate a report.** Stop and tell the user which gate was detected, then offer the bypass:

- **Interactive (default):** Fire a `PushNotification` so the user is alerted even if they've stepped away (e.g. `kosh: site is gated (private) — log in in the open browser, then say continue`). Tell the user the site is gated and that the browser is left open. Ask them to authenticate in that window — log in to WordPress.com (coming-soon / private) or enter the site password (password-protected) — then reply to continue. When they continue, re-run the check above and only proceed once both fields are `null`. If `gate` is still set, report that authentication didn't clear the gate and stop.
- **Unattended (e.g. automation):** If the user supplied a share/preview URL that carries access, navigate to that URL instead. Otherwise stop with a clear message — kosh cannot audit a gated site without access.

Private sites require access, not just a login: if the WordPress.com account hasn't been granted access to that specific site, the gate persists after login. That's a site-permission issue, not a kosh issue.

If `redirectedTo` is set, **do NOT generate a report** either: the site now lives on another host, and a report would measure a site other than the one requested. Stop and tell the user the URL redirects to `redirectedTo`, so they can re-run the test against it. If `redirectedTo` is a login or access page rather than a site (single sign-on, an access wall), treat it as a gate instead: offer the bypass above, and proceed once the check returns both fields `null`.

## Pages

Load these at desktop, chosen from the site's own menus and links:

1. the homepage;
2. the primary navigation page (About, Services or Products, whichever the main menu leads with);
3. one deep page: a single post, product or service;
4. one index or archive page: the blog, a category or a listing;
5. the contact page, if there is one, since it often loads third-party form scripts.

A site with fewer than four distinct pages has fewer; say in `testMethodology` how you know (the menu, a sitemap). Then `browser_resize` to 375×812 and load the homepage and at least one of the same pages again.

Navigate to each page once per viewport, then give it five seconds (`browser_wait_for` with `time: 5`) so late layout shifts are counted. A page's first load is its measurement. A reload comes from a warm cache and doesn't replace it, so don't reload to re-measure. Every page you load on the site is measured and shows in the report's page table, whatever you loaded it for.

## Reading the measurements

Run this after the last page, or any time you want to see what has been recorded so far:

```bash
node <kosh>/scripts/page-capture.js summary <homepage URL> <every page URL you loaded>
```

It prints one row per page and viewport, the same rows the report's page table will show, and names any page you passed that has no recorded load. Load that page before writing the report: the report is refused while `visitedPages` lists a page the browser never loaded. Base every number and finding on these rows. `browser_console_messages` and `browser_network_requests` are for investigating a row, not a second source of numbers.

Each row has `lcp`, `loadTime`, `domContentLoaded` and `ttfb` in milliseconds, `cls`, transfer sizes in bytes, `console` (errors, warnings and uncaught exceptions) and `network` (failed requests: status 400 and up, or no response). `vitalsSettled: false` means the page was still changing when you left it. `visits` above 1 means the page was loaded again and only the first load counts. A `resourceTransferSize` near 0 means a warm cache, which flatters the numbers.

## What counts

LCP and CLS are judged by the Core Web Vitals bands. They come from one lab load in a browser with no network or CPU throttling, not from field data, so say what was measured; never write that a page passes or fails Core Web Vitals.

| Metric | Good | Needs improvement (medium) | Poor (high) |
|---|---|---|---|
| LCP | up to 2.5 s | up to 4 s | over 4 s |
| CLS | up to 0.1 | up to 0.25 | over 0.25 |

`loadTime` is context, not a finding: it runs to the load event, which a visitor doesn't wait for. A slow `ttfb` is the cause to name when it drives a slow LCP.

Console messages and failed requests, by what they break. A failed request is a `network` row with a 4xx or 5xx `status` or a `failure`, except `net::ERR_ABORTED`: that's the browser cancelling a request because the page moved on, which is not a finding. The "Failed to load resource" console error a failed request logs is part of that request's finding, not a second one. Where a failed request fits a more specific row than its type's, that row wins:

- a stylesheet from a font service (`fonts.googleapis.com`, `use.typekit.net`, `fonts.bunny.net`) only loads fonts, so it's a font;
- a request blocked as mixed content goes by the mixed-content rows;
- a request a third-party script makes, such as an analytics beacon or an ad call, goes in the third-party row, but a failed request for a script the page loads, such as a form embed, is a failed script;
- a 4xx other than 404 from the site's own API has its own row.

| Seen | Severity | Because |
|---|---|---|
| a failed stylesheet, script or API call | critical | breaks the layout or a feature |
| 5xx on a page itself | critical | the page doesn't load |
| uncaught exception or console error from the site's own code | high, critical if the page renders blank | features stop working without a visible error |
| a failed image | high | visible broken content |
| a failed font | high | text falls back to another typeface, and icon-font icons go missing |
| mixed content: an `http:` script, stylesheet, font or API call on an `https:` page | high | the browser blocks it, and it's a security risk |
| mixed content: an `http:` image | medium | a security warning; the image still shows |
| a 4xx other than 404 from the site's own API, such as a 400 from `admin-ajax.php` | medium | usually the endpoint refusing a logged-out visitor: the site's code makes a call that can't work, but the visitor rarely sees it |
| console warning from the site's own code | medium | usually a deprecation that becomes an error later |
| error, warning or failed request from a third-party script (analytics, ads, chat) | low | the site owner can't fix it directly |

A message seen on every page is one site-wide finding listing all its pages, not one finding per page.

- A third-party analytics error is a low finding on production and not a finding on local.
- A warm reload at 300 ms beside the first load at 2600 ms is not a finding; the 2600 ms is the measurement.
- An eager-loaded image or a heavy font file you noticed is outside this test's checks: it goes in `explorationPass`, not `issues`.

## Report

Write `kosh-reports/data/qa-report-performance.json`. Leave `timestamp` as the example has it: `run-qa-report.sh` sets it to when the run's browser first loaded a page. Its contract is `<kosh>/schemas/qa-report-performance-schema.json`, and a report that doesn't match is refused with the fields to fix.

- The measurements aren't yours to write: `run-qa-report.sh` builds `pages[]` from the browser's record. `issues` holds findings with a cause, each naming its pages and the measurement in `metric`.
- `visitedPages` lists every page the test covered, at either viewport.
- `testMethodology` says in a few sentences how the run went: the pages and why, the viewports, and anything that changes how the numbers compare, such as an inferred environment or a page that had to be loaded again.
- Anything you looked into beyond these checks goes in `explorationPass`, with its outcome.
- Set `provenance.model` to the exact model ID you are running as, copied from your system prompt. If your system prompt does not state one, write `"unknown"` — never guess. Add no other `provenance` fields: `<kosh>/scripts/run-qa-report.sh` adds the plugin version and skill hash.
- Save each screenshot with `browser_take_screenshot`, passing the full path as `filename`: `kosh-reports/screenshots/<name>.png`. A bare filename saves to the project root, and moving the file afterwards is a step that gets skipped. A finding's `screenshots` lists paths relative to `kosh-reports/`: `screenshots/<name>.png` for the file at `kosh-reports/screenshots/<name>.png`.

An illustrative report, not one to copy:

```json
{
  "url": "https://example.com/",
  "websiteName": "Example",
  "timestamp": "YYYY-MM-DDTHH:MM:SSZ",
  "provenance": { "model": "<model id>" },
  "environment": "production",
  "testMethodology": "Five pages at 1920x1080 from the main menu, then the homepage and the blog at 375x812, each loaded once from a cold browser.",
  "visitedPages": ["https://example.com/", "https://example.com/about/", "https://example.com/blog/hello-world/", "https://example.com/blog/", "https://example.com/contact/"],
  "issues": {
    "critical": [],
    "high": [
      {
        "category": "Performance",
        "issue": "The hero image on the homepage paints late: LCP is in the poor band, behind a 1.9 s server response.",
        "impact": "Visitors look at a blank hero for over four seconds.",
        "device": "both",
        "pages": ["https://example.com/"],
        "metric": "LCP 4.6 s desktop, 4.9 s mobile (poor over 4 s); TTFB 1.9 s"
      }
    ],
    "medium": [],
    "low": []
  },
  "explorationPass": [
    { "check": "Whether the theme loads font weights the pages don't use.", "outcome": "inconclusive", "detail": "Six weights of the body font load on every page; telling which are used needs a CSS coverage run.", "area": "Fonts" }
  ]
}
```

Then render it:

```bash
<kosh>/scripts/run-qa-report.sh kosh-reports/data/qa-report-performance.json
```

If it says a page has no record of loading, load that page in the browser and run the command again.
