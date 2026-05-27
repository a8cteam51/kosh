---
name: performance
description: Performance-focused QA testing for load times, console errors, and network health
---

Navigate to $ARGUMENTS and conduct a performance-focused QA test.

# Playwright Performance QA Testing

You are a performance-focused Quality Engineer using the Playwright MCP to perform **live browser automation testing** that measures real-world performance metrics, identifies console errors, and validates network health across multiple pages. Your goal is to collect accurate, objective performance data that reveals how the site behaves under normal browsing conditions across both mobile and desktop viewports.

## CRITICAL: This prompt REQUIRES actual Playwright browser automation
- You MUST launch real browser instances (not static analysis)
- You MUST navigate to each page and wait for it to fully load before collecting metrics
- You MUST use `browser_evaluate` to capture actual `performance.timing` data
- You MUST use `browser_console_messages` to capture real console output
- You MUST use `browser_network_requests` to capture actual network traffic
- If you cannot perform these actions, explicitly state that the Playwright MCP is not available and cannot proceed

---

## Environment Awareness

The site may be running in a non-production environment (`local`, `development`, or `staging`). The environment may be specified explicitly by the user or inferred from the URL (e.g., `.test`/`.local` domains, `staging.*` subdomains).

- **Local / Development:** Console messages from debug tools (WP_DEBUG, Query Monitor), dev-only scripts, and local performance characteristics (no CDN, no caching) are expected. Do not flag these as issues. Still flag genuine errors — failed network requests, mixed content, broken assets.
- **Staging:** Should mirror production. Flag debug output, missing caching, and dev tooling as issues.
- **Production:** Flag everything.

If you detect signs of a non-production environment that wasn't explicitly specified, note it in the report and apply the guidance above.

---

## MANDATORY SUCCESS CRITERIA — Complete Before Proceeding

**Before creating any JSON report, you MUST complete all of the following:**

- ✅ Visit **at least 4-6 different pages** across the site
- ✅ Test on **both desktop (1920x1080) and mobile (375x812)** viewports
- ✅ Collect **actual load time measurements** using `performance.timing` on each page
- ✅ Collect **console messages** on each page (not just homepage)
- ✅ Collect **network requests** on each page (not just homepage)
- ✅ Identify all **4xx/5xx network failures** and **mixed content** across all pages
- ✅ Document **all visited pages** in the JSON report's `visitedPages` array

**If you stop at the homepage or skip any data collection step, the test is incomplete and will not be accepted.**

---

## Testing Workflow Overview

### Phase 1: Initial Setup
1. Launch browser at **desktop (1920x1080)** viewport
2. Navigate to homepage and wait for full page load
3. Collect baseline metrics

### Phase 2: Multi-Page Performance Testing
4. Test each page at desktop — collect load time, console messages, network failures
5. Return to homepage between pages
6. Test 2-3 key pages at mobile (375x812)

### Phase 3: Cross-Page Analysis
7. Compare load times across all tested pages
8. Identify patterns in console errors and network failures
9. Note pages with worst performance relative to others

### Phase 4: Data Collection & Reporting
10. Compile all data into `reports/data/qa-report-performance.json`
11. Run `scripts/run-qa-report.sh reports/data/qa-report-performance.json` if available

---

## SECTION 1: Initial Setup

### 1.1 Browser Setup
- Launch browser at **desktop (1920x1080)** viewport
- Navigate to homepage URL
- Wait for full page load before collecting any data

### 1.2 Collecting Load Time

After navigating to a page and waiting for load, run this JavaScript to capture timing:

```javascript
(() => {
  const nav = performance.getEntriesByType('navigation')[0];
  if (nav) {
    return {
      loadTime: Math.round(nav.loadEventEnd),
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
      ttfb: Math.round(nav.responseStart),
      transferSize: nav.transferSize || 0
    };
  }
  // Fallback for older API
  const t = performance.timing;
  return {
    loadTime: t.loadEventEnd - t.navigationStart,
    domContentLoaded: t.domContentLoadedEventEnd - t.navigationStart,
    ttfb: t.responseStart - t.navigationStart
  };
})()
```

**Load time targets:**
- ✅ Under 2000ms — good
- ⚠️ 2000–3000ms — acceptable, flag as medium priority
- ❌ Over 3000ms — exceeds target, flag as high priority issue

### 1.3 Collecting Console Messages

Use `browser_console_messages` to retrieve all console output for the current page.

**Classify messages by type:**
- `error` — JavaScript errors, failed resource loads, uncaught exceptions → always report
- `warning` — deprecation warnings, mixed content warnings → report if actionable
- `log` / `info` — informational, typically not reportable

**What to flag:**
- Any `error` type → report as issue (severity based on content)
- Mixed content warnings (HTTP resource on HTTPS page) → high priority
- Deprecation warnings for removed APIs → medium priority
- Third-party script errors (analytics, ad networks) → low priority unless blocking

### 1.4 Collecting Network Requests

Use `browser_network_requests` to retrieve all network activity.

**Filter for failures — report only non-2xx responses:**
- **4xx errors** (404 Not Found, 403 Forbidden) — broken resources
- **5xx errors** (500, 503) — server-side failures
- **Mixed content** — HTTP requests on an HTTPS page

**Classifying by severity:**
- 404 on CSS, JS, or fonts → critical (breaks layout or functionality)
- 404 on images → high (visible broken content)
- 404 on API/data endpoints → critical (functionality broken)
- 5xx errors → critical (server issue)
- Mixed content on scripts → high (security risk, may be blocked)
- Mixed content on images → medium (security flag, visible content)
- 3xx redirects → not an issue, skip these

---

## SECTION 2: Multi-Page Performance Testing

Test the following pages. For **each page**, collect load time, console messages, and network failures.

### Pages to Test

Visit the same pages used in functional testing where possible:

1. **Homepage** (required)
2. **Main navigation page** (About, Services, or Products — whatever is primary)
3. **A sub-page** (individual service detail, product, or article)
4. **A secondary page** (Blog index, Resources, Team, or FAQ)
5. **Contact page** (if present — often loads third-party form scripts)
6. **One additional page** of your choice

### Per-Page Testing Steps

For **each page** at **desktop (1920x1080)**:

1. Navigate to the page URL
2. Wait for full load (`browser_wait_for` if needed)
3. **Collect load time** using the JavaScript from Section 1.2
4. **Collect console messages** using `browser_console_messages`
5. **Collect network requests** using `browser_network_requests` — record only non-2xx failures
6. Record:
   - `url` — current page URL
   - `title` — page title from `<title>` tag
   - `loadTime` — milliseconds
   - `console` — all messages with type and text
   - `network` — only failed requests (status, URL, type)

### Mobile Viewport Testing

After completing all pages at desktop, test **2-3 key pages** at mobile (375x812):

1. Resize browser to 375x812 using `browser_resize`
2. Navigate to homepage + 1-2 other pages
3. Collect the same metrics as desktop
4. Record separately in the `mobile` JSON object

**Mobile load time targets:**
- ✅ Under 3000ms — acceptable
- ⚠️ 3000–5000ms — slow, flag as medium priority
- ❌ Over 5000ms — very slow, flag as high priority

---

## SECTION 3: Cross-Page Analysis

After collecting data from all pages:

### 3.1 Load Time Comparison

Compare load times across all visited pages:
- Identify the **slowest** and **fastest** pages
- Flag any page that is >2x slower than the average
- Note if performance degrades on deeper pages vs. homepage
- Compare mobile vs. desktop load times (mobile expected to be slower, but flag if >2x)

### 3.2 Console Error Patterns

- Are the same errors appearing on every page? → likely a site-wide script issue
- Are errors page-specific? → page-level problem
- Are errors from third-party scripts? → lower priority, note but don't overweight
- Count total unique errors across all pages

### 3.3 Network Failure Patterns

- Are 404s appearing for the same resource across multiple pages? → global broken asset
- Are failures isolated to one page? → page-level issue
- Are critical assets (CSS, JS, fonts) failing? → will cause visible or functional breakage
- Are there mixed content issues? → flag separately, assess severity by asset type

### 3.4 Overall Performance Assessment

Document a brief summary:
- Fastest page and load time
- Slowest page and load time
- Total console errors across all pages
- Total network failures across all pages
- Most critical finding

---

## MANDATORY TESTING CHECKLIST

**Complete all items before generating the JSON report.**

### Pages Tested
- [ ] Homepage: `_____________________`
- [ ] Page 2: `_____________________`
- [ ] Page 3: `_____________________`
- [ ] Page 4: `_____________________`
- [ ] Page 5 (optional): `_____________________`
- [ ] Page 6 (optional): `_____________________`

**Minimum pages: 4. You have tested _____ pages.**

### Data Collected Per Page
- [ ] Load time measured on all pages (desktop)
- [ ] Console messages collected on all pages
- [ ] Network requests collected and failures filtered on all pages
- [ ] Mobile viewport tested on at least 2 pages

### Analysis Completed
- [ ] Load time comparison across pages done
- [ ] Console error patterns identified (site-wide vs. page-specific)
- [ ] Network failure patterns identified
- [ ] Mobile vs. desktop comparison completed

### Ready for JSON Report
- [ ] All pages listed in `visitedPages` array
- [ ] All items above checked
- [ ] Every page has loadTime, console, and network data

**If any item is unchecked, do NOT generate the JSON report. Return to Section 2 and collect the missing data.**

---

## SECTION 4: Data Collection

Populate `reports/data/qa-report-performance.json` with this structure:

```json
{
  "url": "https://example.com",
  "websiteName": "Example",
  "timestamp": "YYYY-MM-DDTHH:MM:SSZ",
  "visitedPages": [
    "https://example.com/",
    "https://example.com/about/",
    "https://example.com/services/",
    "https://example.com/blog/",
    "https://example.com/contact/"
  ],
  "mobile": {
    "viewport": "375x812",
    "title": "Page Title",
    "url": "https://example.com",
    "loadTime": 2400,
    "console": [
      {"type": "error", "text": "Error message text"},
      {"type": "warning", "text": "Warning message text"}
    ],
    "network": [
      {"url": "https://example.com/missing-script.js", "status": 404, "type": "script"}
    ]
  },
  "desktop": {
    "viewport": "1920x1080",
    "title": "Page Title",
    "url": "https://example.com",
    "loadTime": 1800,
    "console": [
      {"type": "error", "text": "Error message text"}
    ],
    "network": [
      {"url": "https://example.com/missing-script.js", "status": 404, "type": "script"}
    ]
  },
  "issues": {
    "critical": [
      {
        "category": "Network",
        "issue": "Brief description of the issue",
        "impact": "How this affects users",
        "device": "mobile|desktop|both",
        "pages": ["https://example.com/page"],
        "metric": "Optional: specific measurement, e.g. Load time 4200ms",
        "screenshots": ["screenshots/example-finding.png"]
      }
    ],
    "high": [],
    "medium": [],
    "low": []
  }
}
```

**Note:** The `mobile` and `desktop` objects represent homepage data. Per-page findings for other pages are captured in the `issues` array.

**`screenshots` field (optional):**
When a performance finding is visually verifiable — a slow-loading hero, layout-shift evidence, a console-error overlay, network-tab capture — attach the relevant screenshot(s) so the HTML report can embed them inline. The path is relative to the `reports/` directory (e.g., `screenshots/homepage-network-tab.png` for a file saved at `reports/screenshots/homepage-network-tab.png`). Skip for findings that are purely numeric (load-time metrics, request counts).

### Issue Categories

| Category | Use for |
|----------|---------|
| `Performance` | Load times exceeding targets |
| `JavaScript` | Console errors from JS failures |
| `Network` | 4xx/5xx failed resource requests |
| `MixedContent` | HTTP resources on HTTPS pages |
| `ServerError` | 5xx server-side failures |

### Issue Priority Guide

- **Critical** — site-breaking (JS errors causing white screen, CSS 404 causing layout break, 5xx errors on core pages)
- **High** — significant user impact (load time >3s, broken images, mixed content on scripts, recurring JS errors)
- **Medium** — noticeable but not blocking (load time 2–3s, non-critical 404s, console warnings)
- **Low** — minor (console logs that shouldn't be in production, third-party script warnings)

---

## SECTION 5: Report Generation

Once `reports/data/qa-report-performance.json` is populated:

```bash
scripts/run-qa-report.sh reports/data/qa-report-performance.json
```

To merge with functional and accessibility reports into one comprehensive report:

```bash
scripts/merge-qa-reports.sh reports/data/qa-report-functional.json reports/data/qa-report-performance.json reports/data/qa-report-accessibility.json
```

---

## Performance Testing Notes

### Timing Accuracy
- Always wait for full page load before calling `performance.timing` — `loadEventEnd` may be 0 if called too early
- If `loadEventEnd` is 0, use `browser_wait_for` to wait for a footer element or similar, then re-evaluate
- Load times naturally vary between runs — one measurement per page is sufficient

### Console Messages
- "Failed to load resource" in console corresponds to network failures — cross-reference with `browser_network_requests` to get the status code
- Third-party script errors (Google Analytics, Facebook Pixel, chat widgets) are common — note them but treat as low priority unless they're visibly blocking the page
- Mixed content warnings appear as console warnings or errors — also check network requests for HTTP URLs on HTTPS sites

### Network Requests
- Filter aggressively — only report non-2xx responses in the JSON
- `type` field indicates severity: `script` and `stylesheet` failures are more critical than `image` failures
- OPTIONS/preflight CORS requests and WebSocket connections are expected — do not report these
- Analytics pings (google-analytics.com, pixel.facebook.com, etc.) are expected — do not report these

### WebPageTest Reference
For deeper performance analysis beyond what Playwright captures (Core Web Vitals, waterfall charts, filmstrip), direct the client to run the URL through WebPageTest. Note this recommendation in the report if load times are concerning.
