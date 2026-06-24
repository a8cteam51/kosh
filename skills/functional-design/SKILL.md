---
name: functional-design
description: Functional and design-focused QA testing across multiple pages and viewports
---

Navigate to $ARGUMENTS and conduct a functional and design-focused QA test.

# Playwright Comprehensive QA Testing: Multi-Page User Journeys with Functional QA

You are a design-focused Quality Engineer using the Playwright MCP to perform **live browser automation testing** that combines detailed functional QA checks with real-world multi-page user journey simulation. Your goal is to test the website thoroughly by exploring it like an actual user while simultaneously validating all critical functional and design aspects across different pages and viewports. Your work and the resulting report will help the team discover issues with the website and ultimately deliver an excellent website.

## CRITICAL: This prompt REQUIRES actual Playwright browser automation
- You MUST launch real browser instances (not static analysis)
- You MUST navigate between pages by clicking real links (simulate real user behavior)
- You MUST take actual screenshots at different viewports and scroll positions
- You MUST save every screenshot by passing its full path as the `filename` argument to `browser_take_screenshot`: `reports/screenshots/<name>.png` (e.g. `filename: "reports/screenshots/homepage-desktop.png"`). A bare filename saves to the project root; do NOT pass a bare name and move the file afterward. (Note: a finding's `screenshots` field uses a path relative to `reports/`, i.e. `screenshots/<name>.png` — see §4.1.)
- You MUST perform real user interactions (scrolling, clicking, form submission)
- You MUST test actual link functionality by clicking and verifying destinations
- You MUST validate design consistency, and functional requirements simultaneously
- If you cannot perform these actions, explicitly state that the Playwright MCP is not available and cannot proceed with testing

## Investigate before reporting

When any built-in script in this skill flags an issue, treat that as the start of an investigation, not as the finding itself. Before writing the issue into the report:

- Read the underlying markup that produced the behavior.
- Distinguish between **source/upload** issues (the asset, plugin, or data is the problem) and **markup** issues (the template or block configuration is the problem). The fix and the owner are different.
- Confirm visible behavior matches what the script reported. Script summaries and serialized views can lose context that the live markup preserves — check the source of truth before trusting either.

Each finding in the report MUST name the markup that is actually wrong and what to change. "The script reported X" is not a finding. For findings logged as `critical` or `high`, a reader should be able to act on the writeup without re-running the test.

---

## Environment Awareness

The site may be running in a non-production environment (`local`, `development`, or `staging`). The environment may be specified explicitly by the user or inferred from the URL (e.g., `.test`/`.local` domains, `staging.*` subdomains).

How you report findings depends on the environment:

- **Local / Development:** Test data, sandbox payment gateways (Stripe test mode, PayPal sandbox), placeholder content, debug output (WP_DEBUG, Query Monitor, admin bars), and dev toolbars are all expected. Do not flag these as issues. Still flag genuine functional problems — broken layouts, JS errors, missing assets, broken links.
- **Staging:** This environment should mirror production. Flag sandbox payment gateways, test/placeholder content, and debug output as issues — their presence on staging means they could ship to production.
- **Production:** Flag everything.

If you detect signs of a non-production environment that wasn't explicitly specified (e.g., Stripe test keys, a visible WP_DEBUG bar, `.test` domain), note the detected environment in the report and apply the guidance above.

---

## MANDATORY SUCCESS CRITERIA - Complete Before Proceeding

**This testing requires multi-page exploration. Do not stop at the homepage. Before creating any JSON report, you MUST complete all of the following:**

- ✅ Visit **at least 4-6 different pages** across the site (not just homepage)
- ✅ Follow **3 distinct user journeys** (Journey #1, #2, #3 - see Section 2 below)
- ✅ Test on **both desktop (1920px) and mobile (375px)** viewports
- ✅ Document **design consistency/inconsistency** across all visited pages with specific examples
- ✅ Test **real link functionality** by clicking links and verifying destinations
- ✅ Check **metadata** on at least 2-3 different pages (not just homepage)
- ✅ Verify **footer, navigation, and design elements** on multiple pages
- ✅ Test **mobile responsiveness** on 2-3 key pages (not just homepage mobile view)
- ✅ Complete the **Testing Checklist** (see Section 2, end of Journey #3)
- ✅ Document **all visited pages** in the JSON report's `visitedPages` array

**If you stop at the homepage or skip journeys, the test is incomplete and will not be accepted.**

---

## Reachability Gate Check — MANDATORY before any testing

Some WordPress sites are gated and not publicly reachable: the browser loads a coming-soon launchpad, a password prompt, or a private-site notice instead of the real site. Testing the gate produces an empty or misleading report. **After the first navigation to the homepage, before any other Phase 1 step, run this check.**

Read the gate signals with `browser_evaluate` — do **not** rely on the page title, which stays the real site title for two of the three gates:

```javascript
() => ({
  bodyClass: document.body.className,
  url: location.href,
  title: document.title,
})
```

A gate is present if any of these match:

| Gate | Match on |
|---|---|
| **Coming soon** | `bodyClass` contains `wpcom-coming-soon-body` |
| **Password protected** | `bodyClass` contains `login-password-protected`, or `url` contains `password-protected=login` |
| **Private / signed-in-only** | `bodyClass` contains `private-login`, or `title` is exactly `Private Site` |

If none match, proceed with testing normally.

If a gate IS present, **do NOT generate a report.** Stop and tell the user which gate was detected, then offer the bypass:

- **Interactive (default):** Fire a `PushNotification` so the user is alerted even if they've stepped away (e.g. `kosh: site is gated (private) — log in in the open browser, then say continue`). Tell the user the site is gated and that the browser is left open. Ask them to authenticate in that window — log in to WordPress.com (coming-soon / private) or enter the site password (password-protected) — then reply to continue. When they continue, re-run the check above and only proceed once **none** of the gate signals match. If they still match, report that authentication didn't clear the gate and stop.
- **Unattended (e.g. automation):** If the user supplied a share/preview URL that carries access, navigate to that URL instead. Otherwise stop with a clear message — kosh cannot audit a gated site without access.

Private sites require access, not just a login: if the WordPress.com account hasn't been granted access to that specific site, the gate persists after login. That's a site-permission issue, not a kosh issue.

---

## Testing Workflow Overview

### Phase 1: Initial Setup & Analysis
1. Launch browser instances for **both desktop (1920px) and mobile (375px)** viewports
2. Navigate to homepage and document initial state
3. Extract navigation structure and identify user journey paths
4. Take screenshots of homepage at both viewports

### Phase 2: Multi-Page User Journey Testing (REQUIRED - DO NOT SKIP)
5. Execute **3 distinct user journeys** (Journey #1, #2, #3), testing functional QA items on each page visited
6. Return to homepage between each journey to simulate natural user behavior
7. Document findings at each step with screenshots
8. **You must visit at least 4-6 pages total** before moving to Phase 3

### Phase 3: Comparative & Cross-Page Analysis (REQUIRED - DO NOT SKIP)
9. Compare design consistency across all visited pages
10. Test mobile responsiveness on key pages
11. Complete the **Testing Checklist** to verify all requirements met

### Phase 4: Documentation & Reporting
12. Compile comprehensive report with all findings
13. Categorize issues by priority and page
14. **Include `visitedPages` array in JSON** showing every page tested

---

## SECTION 1: Initial Setup & Homepage Assessment

### 1.1 Browser Setup
- Launch browser for **desktop testing first (1920px width)**
- Document: Page title, URL
- Take a screenshot of the **homepage above-the-fold**
- Record: Total console messages (errors vs warnings)

### 1.2 Navigation Map Discovery
- Extract **all top-level navigation links** from header/menu
- Categorize links by purpose:
  - Primary navigation (About, Products, Services, etc.)
  - Secondary navigation (Pricing, Team, Blog, etc.)
  - CTAs and conversion points (Sign Up, Contact, Get Started, etc.)
  - Footer links (Legal, Support, Social, etc.)
- Document the **site structure/hierarchy** and depth levels
- Identify which pages are critical user paths vs. supplementary pages
- Note any submenu/dropdown navigation

### 1.3 Favicon & Browser Icon Check
**Before page load assessment:**
- ✅ Site icon (favicon) is present in browser tab
- ✅ 180x180px `apple-touch-icon.png` exists (for iOS home screen)
- ✅ Favicon displays correctly (not broken or blurry)
- ✅ Icon is high-quality and recognizable

### 1.4 Image Resolution Baseline
**Image quality assessment across entire site:**
- ✅ All logos are high-resolution (not pixelated or blurry)
- ✅ All images are either high-res raster OR SVG format
- ✅ No low-resolution images or icons requiring replacement
- ✅ Images scale appropriately without pixelation
- Document: Any images that appear low-res or need replacement

Run this script on every page to programmatically flag images whose available pixels are less than the slot needs at the current device pixel ratio. For each flagged image the script returns one of two diagnoses — `source` (the asset or srcset doesn't offer a large-enough candidate; upload/CMS fix) or `markup` (the srcset has a large-enough candidate but the page told the browser to pick a smaller one; markup fix, usually `sizes`). When `object-fit: cover`/`contain` is in effect, the script appends a note to the diagnosis so the reader knows the visible image is cropped — but this doesn't suppress the finding, because cover still scales the source up to fill the slot. When the image hasn't loaded yet, the script returns `status: "unknown"` rather than guessing.

```javascript
(() => {
  const dpr = window.devicePixelRatio || 1;
  const results = [];

  // Density (`2x`) descriptors are dropped — they don't give absolute pixel counts.
  const parseSrcset = (srcset) => {
    if (!srcset) return [];
    return srcset.split(',')
      .map(s => s.trim())
      .map(s => {
        const m = s.match(/^(\S+)\s+(\d+)w$/);
        return m ? { url: m[1], width: parseInt(m[2], 10) } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.width - b.width);
  };

  document.querySelectorAll('img').forEach(img => {
    const rect = img.getBoundingClientRect();
    const renderedW = Math.round(rect.width);
    const renderedH = Math.round(rect.height);
    if (renderedW === 0 || renderedH === 0) return;

    const srcUrl = img.currentSrc || img.src || '';
    // SVGs scale losslessly.
    if (srcUrl.toLowerCase().endsWith('.svg') || srcUrl.includes('image/svg')) return;

    const cs = getComputedStyle(img);
    const objectFit = cs.objectFit;
    const srcset = img.getAttribute('srcset');
    const sizesAttr = img.getAttribute('sizes');
    const candidates = parseSrcset(srcset);
    const largestCandidate = candidates.length ? candidates[candidates.length - 1].width : null;
    const pictureSourceCount = img.parentElement?.tagName === 'PICTURE'
      ? img.parentElement.querySelectorAll('source[srcset]').length
      : 0;

    if (!img.complete || img.naturalWidth === 0) {
      results.push({
        src: srcUrl.split('/').pop().substring(0, 60),
        renderedCSS: `${renderedW}x${renderedH}px`,
        status: 'unknown',
        reason: 'image not yet loaded — re-run after scroll/wait',
        alt: (img.alt || '(no alt)').substring(0, 40)
      });
      return;
    }

    const naturalW = img.naturalWidth;
    const naturalH = img.naturalHeight;
    const neededW = renderedW * dpr;
    const neededH = renderedH * dpr;
    const ratio = Math.min(naturalW / neededW, naturalH / neededH);
    if (ratio >= 1.0) return;

    const sizesIsAuto = /\bauto\b/i.test(sizesAttr || '');

    let diagnosis;
    if (!candidates.length) {
      diagnosis = {
        category: 'source',
        explanation: 'No srcset present. The picked src is too small for the slot at this DPR. Investigate the upload (is the original large enough?), the srcset generator (is it producing sized variants?), or the src URL itself (does it point to a small derivative like `?w=485`?).'
      };
    } else if (largestCandidate >= neededW * 0.95) { // 5% slack absorbs browser candidate-selection rounding (e.g. 768w vs. an 800px slot need).
      const sizesNote = sizesIsAuto
        ? `The \`sizes\` attribute uses \`auto\` (which normally picks based on layout width), so the cause may be subtler: lazy-load timing, an aspect-ratio mismatch under \`object-fit: cover\`, or a \`<picture>\`/\`<source>\` selecting badly. Investigate before recommending a sizes change.`
        : `Likely cause: \`sizes\` attribute (${sizesAttr || 'missing'}) under-declares the rendered width (actually ${renderedW}px). Fix: correct \`sizes\` so the browser picks the larger candidate.`;
      diagnosis = {
        category: 'markup',
        explanation: `srcset offers a ${largestCandidate}w candidate (enough for the ${Math.round(neededW)}px slot needs at ${dpr}x DPR), but the browser picked a smaller one. ${sizesNote}`
      };
    } else {
      diagnosis = {
        category: 'source',
        explanation: `Largest srcset candidate is ${largestCandidate}w; slot needs ${Math.round(neededW)}px at ${dpr}x DPR. Investigate the upload (is the original large enough?) or the srcset generator (is it producing the larger sizes it should?).`
      };
    }

    const objectFitNote = (objectFit === 'cover' || objectFit === 'contain')
      ? ` object-fit: ${objectFit} is in effect — the visible image is cropped/scaled to fit the slot, but this does not change the underlying resolution problem.`
      : '';

    let pictureNote = '';
    if (pictureSourceCount > 0) {
      // <picture> <source srcset> siblings override the img's srcset selection without being read here, so source/markup attribution isn't reliable.
      diagnosis.category = 'unknown';
      pictureNote = ` This \`<img>\` is inside a \`<picture>\` element with ${pictureSourceCount} \`<source srcset>\` sibling(s) that this script doesn't read — inspect those before attributing the cause, since the loaded image may have come from a \`<source>\` rather than the \`<img>\`'s own \`src\`/\`srcset\`.`;
    }

    results.push({
      src: srcUrl.split('/').pop().substring(0, 60),
      naturalSize: `${naturalW}x${naturalH}px`,
      renderedCSS: `${renderedW}x${renderedH}px`,
      neededForCrisp: `${Math.round(neededW)}x${Math.round(neededH)}px (${dpr}x DPR)`,
      resolutionRatio: +ratio.toFixed(2),
      status: ratio < 0.75 ? 'flag' : 'needs visual review',
      diagnosisCategory: diagnosis.category,
      diagnosis: diagnosis.explanation + objectFitNote + pictureNote,
      objectFit,
      largestSrcsetCandidate: largestCandidate ? `${largestCandidate}w` : 'none',
      sizesAttr: sizesAttr || 'missing',
      alt: (img.alt || '(no alt)').substring(0, 40)
    });
  });

  return results.length
    ? results
    : 'All images are sufficiently sized for their rendered dimensions';
})()
```

Reading the results:

- **`status: "flag"` (`resolutionRatio` < 0.75)** — the image is being rendered at more than 133% of the picked candidate's natural size. Use the `diagnosisCategory` to decide what to flag:
  - `source` → "the asset (or its srcset) doesn't offer a large-enough candidate." Action: investigate the upload, the srcset generator, and the src URL to find which is the constraint, then fix that one.
  - `markup` → "the asset is fine; the page told the browser to pick the wrong candidate." Action: fix `sizes` (or `width`/`srcset`) in the block markup. Do NOT recommend re-uploading.
  - `unknown` → the `<img>` is inside a `<picture>` element with `<source srcset>` siblings that the script doesn't read. The resolution shortfall is real, but either source or markup could be responsible. Action: read the `<source>` srcsets in the markup before publishing a finding.
- **`status: "needs visual review"` (0.75 ≤ `resolutionRatio` < 1.0)** — marginal. Note in the report without making a pass/fail call yourself.
- **`status: "unknown"`** — image hadn't loaded when the script ran (lazy-load before scroll, etc.). Scroll the image into view, wait 1-2s, and re-run before reporting.

Sanity checks before writing any of this into the report:
- If `objectFit` is `cover` or `contain`, do NOT claim the image is being "stretched" or "aspect-ratio distorted." The image is being cropped to fit the slot. Aspect-ratio is preserved.
- If `diagnosisCategory` is `markup`, do NOT write "the source asset is too small." The source is fine.
- If `diagnosisCategory` is `source`, you may want to probe the original upload URL directly (stripping any Photon/CDN `?resize=` or `?w=` parameters) to confirm the source's true dimensions before writing the finding.

### 1.5 Color Contrast Baseline
**Color contrast assessment across entire site:**
- ✅ Body and heading text meets WCAG 2.2 AA contrast thresholds
- ✅ Navigation links (both active and inactive states) meet contrast requirements
- ✅ Button text against button background meets contrast requirements
- ✅ Footer text (a frequent failure point) meets contrast requirements
- Document: Any text overlaid on images or gradients (the script cannot measure these — assess visually)

WCAG 2.2 AA contrast thresholds:
- Normal text (< 18pt regular or < 14pt bold): **4.5:1 minimum** — WCAG 1.4.3 Contrast (Minimum)
- Large text (≥ 18pt regular or ≥ 14pt bold): **3:1 minimum** — WCAG 1.4.3 Contrast (Minimum)
- UI components (buttons, form borders, icons): **3:1 minimum** — WCAG 1.4.11 Non-text Contrast

> **WCAG citations in this skill:** Cite a WCAG criterion only for contrast findings — `1.4.3 Contrast (Minimum)` for text and `1.4.11 Non-text Contrast` for UI components — because contrast is the only accessibility criterion this skill actually measures. For any other accessibility observation (missing alt text, heading structure, keyboard operability, form labels, focus indicators), describe what you see but do **not** cite a WCAG criterion or claim conformance — recommend running `/kosh:a11y` for a full audit. This skill is not an accessibility audit; citing WCAG beyond contrast implies coverage that did not happen.

Run this script on every page to programmatically detect contrast failures on text against resolved backgrounds. Many elements use `rgba()` or `transparent` backgrounds, meaning the visible background is actually inherited from an ancestor — the script walks up the DOM to find the first opaque background and composites any semi-transparent layers on top of it. The script cannot measure text overlaid on images or gradients; assess those visually.

```javascript
(() => {
  // Parse an rgb/rgba string into {r, g, b, a}
  function parseColor(str) {
    const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!m) return null;
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] !== undefined ? +m[4] : 1 };
  }

  // Composite a semi-transparent foreground over an opaque background
  function composite(fg, bg) {
    return {
      r: Math.round(fg.r * fg.a + bg.r * (1 - fg.a)),
      g: Math.round(fg.g * fg.a + bg.g * (1 - fg.a)),
      b: Math.round(fg.b * fg.a + bg.b * (1 - fg.a)),
      a: 1
    };
  }

  // Walk up the DOM to resolve the effective background color
  function resolveBackground(el) {
    let layers = [];
    let current = el;
    while (current) {
      const bg = parseColor(window.getComputedStyle(current).backgroundColor);
      if (bg) {
        layers.push(bg);
        if (bg.a === 1) break; // found an opaque layer, stop
      }
      current = current.parentElement;
    }
    // If no opaque layer found, assume white
    let result = { r: 255, g: 255, b: 255, a: 1 };
    // Composite from bottom (most distant ancestor) to top (element itself)
    for (let i = layers.length - 1; i >= 0; i--) {
      result = composite(layers[i], result);
    }
    return result;
  }

  // Relative luminance per WCAG 2.x
  function luminance(c) {
    const [rs, gs, bs] = [c.r, c.g, c.b].map(v => {
      v = v / 255;
      return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  }

  // Contrast ratio
  function contrastRatio(c1, c2) {
    const l1 = luminance(c1), l2 = luminance(c2);
    const lighter = Math.max(l1, l2), darker = Math.min(l1, l2);
    return +((lighter + 0.05) / (darker + 0.05)).toFixed(2);
  }

  // Collect elements to check
  const selectors = 'a, button, p, h1, h2, h3, h4, h5, h6, span, li, td, th, label, input, select, textarea';
  const seen = new Set();
  const results = [];

  document.querySelectorAll(selectors).forEach(el => {
    const text = el.textContent?.trim().substring(0, 40);
    if (!text || seen.has(el)) return;
    seen.add(el);

    const styles = window.getComputedStyle(el);
    const textColor = parseColor(styles.color);
    const effectiveBg = resolveBackground(el);
    if (!textColor || !effectiveBg) return;

    const ratio = contrastRatio(textColor, effectiveBg);
    const fontSize = parseFloat(styles.fontSize);
    const fontWeight = parseInt(styles.fontWeight) || 400;
    const isLarge = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
    const threshold = isLarge ? 3 : 4.5;

    if (ratio < threshold) {
      results.push({
        tag: el.tagName.toLowerCase(),
        text: text,
        textColor: `rgb(${textColor.r},${textColor.g},${textColor.b})`,
        effectiveBg: `rgb(${effectiveBg.r},${effectiveBg.g},${effectiveBg.b})`,
        ratio: ratio,
        threshold: threshold,
        fontSize: fontSize + 'px',
        fontWeight: fontWeight,
        isLarge: isLarge
      });
    }
  });

  return results.length ? results : 'All checked elements meet contrast thresholds';
})()
```

Reading the results:

- **Any element returned** — contrast failure. Report it with the actual ratio and threshold from the script output.
- **`"All checked elements meet contrast thresholds"`** — no programmatic failures. Still visually assess text overlaid on images, gradients, or video, which the script cannot measure.

Sanity checks before writing any of this into the report:
- Take a screenshot of every flagged element and confirm the failure is visible to the eye before reporting. The script is heuristic — verify the live render matches what the numbers say.
- When the script flags many elements at the same color combination, the underlying issue is likely the color choice itself (e.g., a brand color that simply doesn't have enough contrast for body text). Write the finding at the system level ("brand red used as body text fails AA across the site") rather than listing every occurrence.
- If a flagged element sits inside a more prominent design problem (e.g., a nav whose colors fight with the brand palette), the contrast ratio may not be the real story — describe the larger design issue and treat the ratio as supporting evidence.
- The script measures only text on resolved opaque backgrounds. Text on images, gradients, or video has no single background color it can extract — handle those by visual inspection only.

### 1.6 Design Baseline (Desktop 1920px)
**Initial Page Load & Above-the-Fold:**
- ✅ Page loads successfully on desktop
- ✅ Initial viewport appearance clean (no layout shifts)
- ✅ Above-the-fold images load immediately
- ✅ Page title and main heading (H1) are visible
- ✅ Primary CTA is prominent
- ✅ No blocking elements or loading states interfere with content

**Initial Design Observations:**
- Document primary color scheme
- Note main typography/font family
- Identify button styles and CTA design
- Note spacing/padding approach
- Document any animations or transitions

---

## SECTION 2: Multi-Page Functional QA Testing

You will execute **3 distinct user journeys**. For each journey, follow the steps below while testing the functional QA items listed in each category.

### Journey #1: Main Navigation Flow
**Simulate a new visitor exploring core information**

**Steps:**
1. Start at homepage
2. Follow the **first main navigation link** (typically "About", "Products", or "Services")
3. Wait 1-2 seconds for page load
4. Perform all testing steps below on this page
5. Return to homepage via browser back button or home link

**Testing Steps for Each Page:**

#### A. Design & Visual Testing
On **desktop (1920px) viewport**:

**Spacing & Layout:**
- ✅ Page layout is responsive and uses consistent margins/padding
- ✅ There are no overlapping page elements
- ✅ No orphaned text/headers (single words wrapping incorrectly)
- ✅ Alignment of buttons, text blocks, images is clean
- ✅ Spacing adapts appropriately (generous white space, no cramping)
- ✅ Main heading (H1) is prominent and readable
- ✅ Content width is appropriate (not stretched too wide, not cramped)

**Typography & Text:**
- ✅ Heading hierarchy is visually consistent (H1 → H2 → H3 → H4)
- ✅ Font sizes are appropriate and readable
- ✅ Line heights provide good readability
- ✅ No text truncation issues
- ✅ Run the contrast extraction script from Section 1.5 — report every element it returns as a contrast failure (with the actual ratio and threshold)
- ✅ Font family is consistent with homepage

**Visual Consistency:**
- ✅ Button styling matches homepage CTAs
- ✅ Color scheme is consistent with homepage
- ✅ Link styling is uniform (color, underline, hover state)
- ✅ Icons are properly aligned and sized
- ✅ Spacing between sections matches homepage pattern
- ✅ No visual glitches or rendering issues
- ✅ Proper contrast and visual hierarchy maintained

#### B. Scrolling & Images
On **desktop (1920px) viewport**:
- ✅ Scroll through entire page from top to bottom
- ✅ After scrolling to each section, verify images load successfully
- ✅ Scroll back to top and verify scroll position works
- ✅ Note any layout shifts when images load
- ✅ Verify footer is reachable and visible

**Images & Media:**
- ✅ All images load successfully at good quality
- ✅ Run the image resolution script from Section 1.4 — flag results with `resolutionRatio` below 0.75 as issues; note anything between 0.75 and 1.0 as "needs visual review" without making a pass/fail call
- ✅ Image aspect ratios are maintained correctly
- ✅ Lazy-loaded images: Account for these (scroll the page to trigger loading, then re-run the resolution script)
- ✅ No broken image placeholders (404 errors)

#### C. Link Validation
On **this page**:

**Link Accuracy Testing:**
- ✅ Extract all links (text links, icon links, buttons, CTAs)
- ✅ For icon-based links (LinkedIn, Twitter, Instagram, etc.):
  - Verify the icon **matches** the destination
  - Example: LinkedIn icon should link to LinkedIn, NOT Twitter
- ✅ Verify all internal links point to correct pages
- ✅ Verify all external links lead to intended destinations
- ✅ Check mailto: links contain correct email addresses
- ✅ Check phone links contain correct phone numbers
- ✅ Test link functionality (clickable, proper cursor states)
- ✅ Verify links have appropriate visual indicators (color, underline, hover state)

**Link Status & Health:**
- ✅ No 404 errors on internal links
- ✅ External links are not dead/broken
- ✅ Redirects (if any) go to correct destinations
- ✅ No mixed content warnings (HTTPS consistency)
- ✅ Sample test: Click at least 20% of links on this page to verify functionality
- ✅ 404 error page exists and is styled (navigate to [URL]/bp93r to test)

#### D. OpenGraph & Social Sharing Metadata
On **this page** (check at least 2-3 pages total):
- ✅ og:title tag present and appropriate for social sharing
- ✅ og:description tag present with compelling preview text
- ✅ og:image tag present with:
  - Correct dimensions (1200x630px recommended)
  - High quality and visually appropriate image
  - Absolute URL (not relative)
- ✅ og:url tag matches current page URL
- ✅ og:type tag present (website, article, etc.)
- ✅ Twitter Card tags if applicable
- ✅ Metadata is page-specific (not generic/auto-generated)

#### E. Content Quality
- ✅ No spelling or grammar errors
- ✅ No placeholder text remaining
- ✅ Messaging is clear and consistent
- ✅ No orphaned text or formatting issues
- ✅ CTAs are clear and compelling
- ✅ Tone matches brand voice

**Security & Infrastructure (check on homepage):**
- ✅ SSL certificate in place (HTTPS, no mixed content)
- ✅ No mixed content warnings in console

**WordPress-Specific Checks (if WordPress site - visual verification only):**
- ✅ Site renders correctly (no obvious WordPress errors or debug messages)
- ✅ No plugin activation errors visible
- Note: Detailed WordPress/plugin version checks require WP-CLI access (future enhancement)

#### F. Footer & Attribution Check
On **this page** (check footer on at least homepage and one other page):

**Footer Credits & Attribution:**
- ✅ Copyright year is present on footer
- ✅ "Proudly powered by WordPress" credit link is present
- ✅ Footer links are correct and functional
- ✅ Footer styling is consistent across pages

**Additional Footer Items:**
- ✅ No non-production content visible (Sample Page, Hello World!, Lorem Ipsum, FooBar blocks, etc.)

#### G. Documentation for This Page
- 📸 Take screenshot of above-the-fold content
- 📋 Document page title, URL, load time
- 📝 Note any design differences from homepage
- 📝 Check if breadcrumbs or page indicators show current location
- 📝 Record any issues or observations
- ↩️ **Return to homepage** (via back button or home link)

---

### Journey #2: Product/Service Exploration
**Simulate a user interested in the main offerings**

**Steps:**
1. From homepage, identify **products/services section** (could be dedicated page or featured content)
2. Click into this section
3. Look for secondary navigation (categories, filters, subcategories)
4. If available, **click on a specific item** (product, service, article) to see deeper navigation
5. **Perform testing steps A (Design & Visual Testing) and E (Content Quality) from Journey #1** on each page visited
6. Document how deep the exploration goes
7. Note CTA buttons and their prominence
8. Return to homepage

**Additional Focus:**
- How does the site guide users from category → specific item?
- Are there breadcrumbs or clear navigation back?
- Are CTAs prominent at each level?
- Does design remain consistent across sub-pages?

---

### Journey #3: Support/Information Discovery
**Simulate a user seeking help or learning resources**

**Steps:**
1. From homepage, look for **secondary navigation** or **footer links** leading to:
   - FAQ, Help, Support, Documentation
   - Blog, Resources, Learning Center, Articles
   - Team, About Company, Company Culture
   - Pick the most prominent option available
2. Click into this section
3. **Perform testing steps A (Design & Visual Testing) and E (Content Quality) from Journey #1**
4. Document page structure and content organization
5. Note how this page differs from main product/service pages
6. Check if search is available for finding content
7. Return to homepage

---

## MANDATORY TESTING CHECKLIST - Complete Before Proceeding to Data Collection

**You MUST complete all items below before creating the JSON report. This checklist confirms all requirements have been met.**

### Pages Visited - List ALL pages tested (not just homepage)
- [ ] Homepage: `_____________________`
- [ ] Journey #1 Page: `_____________________` (e.g., /about)
- [ ] Journey #2 Page: `_____________________` (e.g., /products)
- [ ] Journey #2 Sub-page: `_____________________` (if deeper navigation exists)
- [ ] Journey #3 Page: `_____________________` (e.g., /blog or /support)
- [ ] Additional page(s): `_____________________` (optional, if cross-page analysis required more pages)

**Minimum pages to complete: 4-6. You have listed _____ pages. (Must be 4 or more)**

### Journeys Completed
- [ ] Journey #1 (Main Navigation Flow) completed on: `_____________________`
  - Design & Visual Testing (Section 2, Part A): ✅ Completed
  - Scrolling & Images (Section 2, Part B): ✅ Completed
  - Link Validation (Section 2, Part C): ✅ Completed
  - Content Quality (Section 2, Part E): ✅ Completed

- [ ] Journey #2 (Product/Service Exploration) completed on: `_____________________`
  - Design & Visual Testing: ✅ Completed
  - Content Quality: ✅ Completed
  - (If sub-pages visited, testing also completed on sub-pages)

- [ ] Journey #3 (Support/Information Discovery) completed on: `_____________________`
  - Design & Visual Testing: ✅ Completed
  - Content Quality: ✅ Completed

### Cross-Page Analysis Completed
- [ ] Section 3.1 - Design Consistency Across Pages: ✅ Completed
  - Compared typography (H1, H2, body text) across all visited pages
  - Compared color scheme and branding across pages
  - Verified navigation and footer consistency
  - Documented any inconsistencies with specific examples

- [ ] Section 3.2 - Mobile Responsiveness Spot Check: ✅ Completed
  - Tested 2-3 key pages on mobile (375px) viewport
  - Verified layout, navigation, images, and touch targets on mobile
  - Documented any mobile-specific issues

- [ ] Section 3.3 - Content Quality & Consistency: ✅ Completed
  - Checked for spelling/grammar errors across all pages
  - Verified no placeholder text on any visited page
  - Confirmed messaging consistency

- [ ] Section 3.4 - Footer & Attribution Consistency: ✅ Completed
  - Verified footer appears on all visited pages
  - Checked copyright year and credits on multiple pages

- [ ] Section 3.5 - Mobile Compatibility Check: ✅ Completed
  - Confirmed site is functional on mobile
  - No horizontal overflow or layout breaking

### Data Collection Completed
- [ ] All links from all visited pages extracted and validated
- [ ] All images from all visited pages documented
- [ ] All headings from all visited pages categorized
- [ ] Issues identified and categorized by priority and page
- [ ] Screenshots taken at key points for each journey
- [ ] Metadata checked on at least 2-3 pages (not just homepage)

### Ready for JSON Report Generation
- [ ] **All items above are checked**
- [ ] **All 3 journeys have been completed**
- [ ] **All visited pages are documented**
- [ ] **No corners were cut - every section was tested thoroughly**

**If any checkbox is unchecked, DO NOT proceed to JSON report generation. Return to that section and complete it before continuing.**

---

## SECTION 3: Cross-Page Comparative Analysis

After completing all journeys, perform these comparative tests:

### 3.1 Design Consistency Across Pages

**Typography Comparison:**
- ✅ Same font family used across all visited pages
- ✅ H1 style consistent across pages (size, weight, color)
- ✅ H2 style consistent across pages
- ✅ Body text sizing consistent
- ✅ Link styling consistent (color, underline, hover state)

**Color & Branding:**
- ✅ Primary color used consistently across all pages
- ✅ CTA buttons use same style and colors
- ✅ Link colors consistent
- ✅ Logo placement and styling consistent
- ✅ Footer background/text colors consistent
- ✅ Design system appears cohesive or fragmented?

**Layout & Spacing:**
- ✅ Navigation persistent on all pages (same position, style)
- ✅ Footer consistent on all pages (same structure, links)
- ✅ Padding/margins consistent throughout
- ✅ Section spacing follows pattern
- ✅ Alignment and grid structure consistent

**Navigation Patterns:**
- ✅ Main navigation accessible from all pages
- ✅ Breadcrumbs present on deeper pages (if applicable)
- ✅ Clear "back to home" option available
- ✅ Current page highlighted in navigation
- ✅ Link styling consistent

### 3.2 Mobile Responsiveness Spot Check (375px viewport)

**On 2-3 key pages:**
1. Resize browser to mobile (375px width)
2. Take screenshot showing mobile version
3. Check:
   - ✅ Layout adapts properly (single column, appropriate font sizes)
   - ✅ Navigation is accessible (hamburger menu, expandable sections)
   - ✅ Images scale correctly (no horizontal overflow)
   - ✅ Buttons are easily tappable (min 48px touch targets)
   - ✅ Form fields are usable on mobile
   - ✅ Text remains readable (no tiny font sizes)
   - ✅ No desktop-only content hidden awkwardly
4. Note any mobile-specific issues
5. Return to 1920px viewport for remaining tests

### 3.3 Content Quality & Consistency

**Across all visited pages:**
- ✅ No spelling/grammar errors on any page
- ✅ No placeholder text remains anywhere
- ✅ Messaging consistent across pages (same tone, terminology)
- ✅ Images load properly on all pages
- ✅ No orphaned text or formatting issues
- ✅ No non-production content (Sample Page, Hello World!, Lorem Ipsum, FooBar blocks)

### 3.4 Footer & Attribution Consistency

**Check across all visited pages:**
- ✅ Copyright year present on all pages
- ✅ Footer credits present on all pages (WordPress and/or Pressable links if applicable)
- ✅ Footer links consistent and functional across all pages
- ✅ Footer styling and layout identical on all pages
- ✅ Attribution links point to correct destinations

### 3.5 Mobile Compatibility Check

**Mobile (375px) verification:**
- ✅ Site is functional and readable on mobile
- ✅ No horizontal overflow or layout breaking
- ✅ Touch targets are adequate (minimum 48px)
- ✅ Navigation accessible on mobile (hamburger menu or responsive nav)
- ✅ Forms are usable on mobile
- ✅ Images scale appropriately on mobile

---

## SECTION 4: Data Collection & Report Generation

### ⚠️ BEFORE STARTING THIS SECTION

**STOP. Have you completed the MANDATORY TESTING CHECKLIST above?**

- ✅ Did you test at least 4-6 different pages?
- ✅ Did you complete all 3 journeys (Journey #1, #2, #3)?
- ✅ Did you perform cross-page analysis (Section 3)?
- ✅ Did you test mobile responsiveness on 2-3 pages?
- ✅ Did you fill out and complete the MANDATORY TESTING CHECKLIST?

**If you answered NO to any of these, STOP. Return to Section 2 and complete the missing journeys and sections before proceeding.**

**If you answered YES to all of these, proceed to data collection below.**

---

### 4.1 Data Collection During Testing

As you perform testing in Sections 1-3, collect the following data:

#### From Phase 1: Initial Setup & Homepage Assessment

**For `metadata` section:**
- `ogTitle` - Extract from `<meta property="og:title">`
- `ogDescription` - Extract from `<meta property="og:description">`
- `ogImage` - Extract from `<meta property="og:image">`
- `ogUrl` - Extract from `<meta property="og:url">`
- `ogType` - Extract from `<meta property="og:type">` (usually "website")
- `twitterCard` - Extract from `<meta name="twitter:card">` (may be null)
- `twitterTitle` - Extract from `<meta name="twitter:title">` (may be null)
- `twitterDescription` - Extract from `<meta name="twitter:description">` (may be null)
- `twitterImage` - Extract from `<meta name="twitter:image">` (may be null)

**General metadata:**
- `url` - Homepage URL
- `websiteName` - Website name (extract from og:title or page title)
- `timestamp` - ISO 8601 format (e.g., `2025-11-19T23:58:45Z`)

---

#### From Phase 2: Multi-Page Testing (Both Desktop & Mobile)

**For `mobile` and `desktop` sections, collect:**

##### Viewport & Load Info
- `viewport` - Record actual dimensions (e.g., "375x812" for mobile, "1920x1080" for desktop)
- `title` - Page title from `<title>` tag
- `url` - Current page URL
- `loadTime` - Actual page load time in milliseconds

##### Links Array
```json
"links": [
  {"text": "Link text", "href": "URL or path"},
  ...
]
```
- Extract ALL links from the page
- Include: text content, href attribute
- Include both internal (relative paths) and external (full URLs) links

##### Images Array
```json
"images": [
  {"src": "image URL", "alt": "alt text or description"},
  ...
]
```
- Extract all `<img>` elements
- Include: src attribute, alt attribute (or note if missing)
- Note images that use `loading="lazy"` (these are intentional, not broken)

##### Headings Array
```json
"headings": [
  {"tag": "h1", "text": "Heading text"},
  {"tag": "h2", "text": "Heading text"},
  ...
]
```
- Extract all heading elements (h1-h6)
- Include: tag name, text content
- Preserve hierarchy order as they appear on page

##### Focusable Elements Count
- `focusableElements` - Count of keyboard-navigable elements (buttons, links, form fields)

---

#### Issues Categorization

**For `issues` section, categorize all findings:**

```json
"issues": {
  "critical": [
    {
      "category": "Category name",
      "issue": "Brief description",
      "impact": "User-facing impact",
      "device": "mobile|desktop|both",
      "pages": ["https://example.com/page1"],
      "screenshots": ["screenshots/example-finding.png"]
    }
  ],
  "high": [...],
  "medium": [...],
  "low": [...]
}
```

**`screenshots` field (optional but strongly encouraged):**
When a finding is visual — broken layout, low-contrast text, design inconsistency, broken UI element, mis-rendered image — attach the relevant screenshot(s) so the HTML report can embed them inline next to the finding. The path should be relative to the `reports/` directory (e.g., `screenshots/homepage-desktop-atf.png` for a file saved at `reports/screenshots/homepage-desktop-atf.png`). You can attach multiple screenshots per finding (e.g., desktop + mobile views of the same issue, or before/after pairs). Skip the field for findings where a screenshot wouldn't add information (e.g., missing meta tags, broken hrefs that aren't visually distinct).

**Issue categories for this test:**
- Design (layout, spacing, typography, visual consistency)
- Links (broken links, incorrect destinations, icon mismatches)
- Content (spelling, grammar, placeholder text, messaging)
- Metadata (missing og: tags, Twitter cards)
- Functionality (form issues, navigation problems)
- Mobile (responsive issues, touch targets, readability)
- UX (confusing navigation, unclear CTAs)

**Priority assignment:**
- **Critical**: Blocks user task or prevents core functionality
- **High**: Significantly impacts user experience or brand perception
- **Medium**: Noticeable issue but workarounds exist
- **Low**: Minor concern or suggestion for improvement

---

### 4.2 Populate qa-report-functional.json

After testing, structure your data into `reports/data/qa-report-functional.json` using this format:

```json
{
  "url": "https://example.com",
  "websiteName": "Example",
  "timestamp": "YYYY-MM-DDTHH:MM:SSZ",
  "testMethodology": "Manual QA testing following multi-page user journey simulation...",
  "visitedPages": [
    "https://example.com/",
    "https://example.com/about/",
    "https://example.com/products/",
    "https://example.com/blog/",
    "https://example.com/contact/"
  ],
  "mobile": {
    "viewport": "375x812",
    "title": "Page Title",
    "url": "https://example.com",
    "loadTime": 1800,
    "links": [],
    "images": [],
    "headings": [],
    "focusableElements": 42
  },
  "desktop": {
    "viewport": "1920x1080",
    "title": "Page Title",
    "url": "https://example.com",
    "loadTime": 1800,
    "links": [],
    "images": [],
    "headings": [],
    "focusableElements": 58
  },
  "metadata": {
    "ogTitle": "...",
    "ogDescription": "...",
    "ogImage": "...",
    "ogUrl": "...",
    "ogType": "website",
    "twitterCard": null,
    "twitterTitle": null,
    "twitterDescription": null,
    "twitterImage": null
  },
  "links": [
    {"text": "Link", "href": "URL", "ok": true, "status": 200}
  ],
  "issues": {
    "critical": [],
    "high": [],
    "medium": [],
    "low": []
  }
}
```

**IMPORTANT:**
- **`visitedPages` must contain ALL pages you tested**, not just the homepage
- Minimum 4-6 pages required
- **`timestamp`** must be a real ISO 8601 timestamp from actual test execution (e.g., `2025-11-19T23:58:45Z`), not a placeholder

### 4.3 Generate Report

If `generate-report.js` is available in the project:

```bash
scripts/run-qa-report.sh reports/data/qa-report-functional.json
```

Or to merge with performance and accessibility reports:

```bash
scripts/merge-qa-reports.sh reports/data/qa-report-functional.json reports/data/qa-report-performance.json reports/data/qa-report-accessibility.json
```

---

## Important Testing Notes

### Lazy Loading Images
- Many modern sites use `loading="lazy"` for performance optimization
- **This is NOT a bug** - images won't load until scrolled into view
- Always wait 1-2 seconds after scrolling to an image section before concluding it's broken
- Verify actual HTTP 404 errors, not just missing from initial load

### User Behavior Simulation
- **Between each journey, return to homepage** to simulate realistic exploration
- Don't jump randomly between pages
- Follow natural navigation patterns a real user would use
- Take natural pauses (1-2 seconds) between interactions

### Common Issues to Watch For:

For accessibility items below (missing alt text, forms without labels, missing H1), describe the issue but don't cite a WCAG criterion — see the WCAG-citation guardrail in §1.5; cite WCAG only for contrast.

- ❌ Broken image links (404 errors in network tab)
- ❌ Inconsistent button styling across pages
- ❌ Missing alt text on images
- ❌ Text that doesn't wrap properly on mobile
- ❌ Forms without labels or error messages
- ❌ Links that navigate to wrong pages
- ❌ Missing H1 tags
- ❌ Navigation unreachable on certain pages
- ❌ Page-specific metadata missing (og:tags)
- ❌ Slow page load times (>3 seconds)
- ❌ Console errors or JavaScript failures
- ❌ Layout shifts when images load
- ❌ Orphaned text or awkward spacing
- ❌ Missing or blurry favicon/icons
- ❌ Low-resolution images or logos (should be high-res or SVG)
- ❌ Missing copyright year in footer
- ❌ No custom 404 page or generic error page
- ❌ Mixed content warnings (HTTP assets on HTTPS site)
- ❌ Non-production content visible (Sample Page, Lorem Ipsum, Hello World!, etc.)

---

## FINAL REMINDER: Multi-Page Testing is MANDATORY

Before you submit your JSON report, ask yourself:

1. **Did I test more than just the homepage?** (Yes = Good. No = Incomplete)
2. **Did I follow 3 distinct user journeys?** (Yes = Good. No = Incomplete)
3. **Did I visit at least 4-6 different pages?** (Yes = Good. No = Incomplete)
4. **Is my `visitedPages` array showing multiple pages?** (Yes = Good. No = Incomplete)
5. **Did I complete the MANDATORY TESTING CHECKLIST?** (Yes = Good. No = Incomplete)

**If you cannot answer YES to all 5 questions, do NOT generate the JSON report. Return to Section 2 and complete the multi-page testing first.**
