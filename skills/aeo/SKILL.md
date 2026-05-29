---
name: aeo
description: AEO / AI Mode QA — evaluates how AI tools discover, parse, and cite a website
---

Navigate to $ARGUMENTS and conduct an AEO (Answer Engine Optimization) / AI Mode QA test.

# Playwright AEO QA Testing (AI Mode)

You are an AEO-focused Quality Engineer using the Playwright MCP to perform **live browser inspection** of how a website will be discovered, parsed, understood, and cited by AI tools like ChatGPT, Perplexity, Claude, and Google AI Overviews.

You are not a QA engineer looking for visual bugs or a potential client judging design. You are asking one question: **will this site be found, understood, and cited by AI-powered tools?**

This rubric is site-type-aware. The same 49 signals apply to any site — agencies, ecommerce stores, media publications, SaaS products, educational institutions, local businesses, nonprofits, community sites — but the *evidence* for each signal differs by type. Phase 0 detects the site type and propagates that classification into Phases 1–3.

## Rubric version

**aeoRubricVersion: 1.0**

Include this exact value in the `aeoRubricVersion` field of every report you generate. Do not modify it.

## CRITICAL: This prompt REQUIRES actual Playwright browser automation

- ✅ You MUST use `browser_navigate` and `browser_evaluate` to inspect DOM, schema, and meta tags on each page
- ✅ You MUST use `browser_navigate` to fetch `robots.txt`, `sitemap.xml`, `llms.txt`, and `llms-full.txt` as separate top-level requests
- ✅ You MUST visit **at least 4–6 pages**: the homepage is the primary scoring target; inner pages provide evidence for E-E-A-T, freshness, and AEO readiness checks
- ✅ You MUST take a desktop screenshot (1920×1080) of the homepage for visual E-E-A-T confirmation
- ✅ You MUST complete all five phases before generating the JSON report
- ✅ You MUST score every signal. Do not skip signals or leave scores blank
- ✅ You MUST include an actionable Claude prompt for every signal that scores below maximum
- ✅ You MUST include an `effort` field on every issue object. Valid values: `low`, `medium`, `high`, `unknown`. Do not omit it
- ✅ You MUST save the final report to `reports/data/qa-report-aeo.json`
- ✅ You MUST only refer to the site being analyzed by the name found on the site at the provided URL. Never use names from prior analyses in this session. If unsure of the site name, derive it from the homepage `<title>`, `og:site_name`, or the WordPress site title in the header

If you cannot perform these actions, explicitly state that the Playwright MCP is not available and cannot proceed.

---

## Standards Reference

**The rubric in this skill is the standard.** Eight criteria, 49 signals, 100 points total. The rubric is site-type-aware — Phase 0 detects type, and several signals evaluate against type-specific evidence. The full rubric and signal definitions live in:

- `skills/aeo/references/scoring-rubric.md` — per-criterion signal list with max points
- `skills/aeo/references/signal-keys.md` — canonical signal keys for the JSON report

Underlying frameworks the rubric draws on:

- **Schema.org** — Organization, Service, FAQPage, Person, Review, AggregateRating
- **Open Graph / Twitter Card** — social and AI metadata standards
- **Google E-E-A-T** — Experience, Expertise, Authoritativeness, Trustworthiness
- **AEO best practices** — direct answers after headings, question-framed headings, FAQ schema, extractable passages
- **llms.txt proposal** — the emerging convention for declaring site purpose to LLMs at the domain root

---

## Environment Awareness

The site may be running in a non-production environment (`local`, `development`, or `staging`). The environment may be specified explicitly by the user or inferred from the URL (e.g., `.test`/`.local` domains, `staging.*` subdomains).

- **Local / Development:** AEO content (schema, FAQ structure, blog freshness) is still meaningful in dev — flag it. But noindex on dev environments is **expected and correct**, not an issue. Flag noindex as a finding only on production. Likewise, robots.txt blocking all crawlers on staging is correct, not a failure.
- **Staging:** Should mirror production AEO setup. Flag missing schema, missing llms.txt, and content gaps. But continue to treat noindex / blanket Disallow as expected.
- **Production:** Flag everything per the rubric.

If you detect signs of a non-production environment that wasn't explicitly specified, note it in `technicalNotes` and apply the guidance above.

---

## MANDATORY SUCCESS CRITERIA — Complete Before Proceeding

- ✅ Visit **at least 4–6 pages**, beginning with the homepage
- ✅ Fetch `robots.txt`, `sitemap.xml`, `llms.txt`, and `llms-full.txt` as separate top-level navigations
- ✅ Run `browser_evaluate` for schema / meta / heading inspection on the homepage
- ✅ Take a desktop screenshot of the homepage saved to `reports/screenshots/homepage-aeo-desktop.png`
- ✅ Run a no-JavaScript reachability check on the homepage
- ✅ Confirm E-E-A-T anchors on About / Team pages where present
- ✅ Confirm content freshness on blog / news / case study listing pages
- ✅ Document all visited pages in the `visitedPages` array
- ✅ Score every signal in Phase 4 (49 signals across 8 criteria)
- ✅ Write an actionable Claude prompt for every below-max signal

**If you skip any of these steps, the test is incomplete and will not be accepted.**

---

## Testing Workflow Overview

### Phase 0: Site Type Detection + Schema Relevance Scan
1. Launch browser at desktop (1920×1080), navigate to homepage
2. Detect the site type (agency / ecommerce / mediaBlog / saas / education / localBusiness / nonprofit / community / other) — drives content-quality signals
3. Run the schema relevance scan (Section 0.4) — drives schema scoring independently of siteType
4. Record both: siteType + confidence + rationale, and applicableSchemas relevance map

### Phase 1: Programmatic Analysis (homepage + ancillary files)
5. Take desktop screenshot
6. Fetch robots.txt, sitemap.xml, llms.txt, llms-full.txt
7. Run all programmatic homepage checks (schema, meta, headings, FAQ, freshness, canonical URLs)
8. Run a no-JavaScript reachability check

### Phase 2: Multi-Page Evidence Collection
9. Identify and visit 3–5 inner pages appropriate to the detected site type and applicable schemas
10. Capture supporting evidence for E-E-A-T, freshness, AEO signals, per-page update recency, and per-page schema presence
11. Detect the CMS — used to tune effort estimates in Phase 5

### Phase 3: Content AI Analysis
12. Extract homepage text and evaluate AEO content quality, E-E-A-T language, entity clarity, content specificity, llms.txt quality
13. If Section 0.4 found ambiguous schema relevance, confirm or adjust based on content read

### Phase 4: Scoring
14. Map every finding to the rubric; sum to criterion totals; sum criteria to a final score out of 100

### Phase 5: Reporting
15. Generate `reports/data/qa-report-aeo.json` matching `schemas/qa-report-aeo-schema.json`
16. Run the report generation script

---

## SECTION 0: Site Type Detection

The rubric scores 49 signals that apply to any website, but several signals — `whoWhatWho`, `primaryFocusSpecificity`, `primaryOfferingDetail`, `namedSpecificEntities`, `namedSubjectAreas`, `recentFeaturedWork` — are evaluated against type-specific evidence, and schema signals (`primaryEntitySchema`, `relevantSchemasApplied`) are evaluated against content relevance detected in Section 0.4 rather than the siteType label. Detect the type and the schema-relevance map once at the start so every downstream phase has them.

### 0.1 Quick detection signals

`browser_navigate` to the homepage, then `browser_evaluate`:

```javascript
// JSON-LD types
const jsonLd = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
  .map(s => { try { return JSON.parse(s.innerText); } catch(e) { return null; }})
  .filter(Boolean)
  .flatMap(s => Array.isArray(s) ? s : (s['@graph'] || [s]));
const jsonLdTypes = new Set(jsonLd.map(s => s['@type']).filter(Boolean));

// Microdata types (treat as equivalent format-of-the-same-truth)
const microdataTypes = new Set(
  Array.from(document.querySelectorAll('[itemscope][itemtype]'))
    .map(el => {
      const t = el.getAttribute('itemtype') || '';
      const m = t.match(/schema\.org\/(\w+)/);
      return m ? m[1] : null;
    })
    .filter(Boolean)
);

// RDFa types (rare but real — typeof attribute under vocab="http://schema.org/")
const rdfaTypes = new Set(
  Array.from(document.querySelectorAll('[typeof]'))
    .filter(el => {
      // Only count if a vocab/prefix indicates schema.org
      const vocab = el.closest('[vocab]');
      const prefix = el.closest('[prefix]');
      return (vocab && /schema\.org/.test(vocab.getAttribute('vocab'))) ||
             (prefix && /schema(:|=)\s*http:\/\/schema\.org/.test(prefix.getAttribute('prefix')));
    })
    .flatMap(el => (el.getAttribute('typeof') || '').split(/\s+/))
    .filter(Boolean)
);

// Union of all three formats — the rest of the decision tree should work off this set
const schemaTypes = [...new Set([...jsonLdTypes, ...microdataTypes, ...rdfaTypes])];

// Per-format counts for the technicalNotes payload
const schemaFormats = {
  jsonLd: jsonLdTypes.size,
  microdata: microdataTypes.size,
  rdfa: rdfaTypes.size
};

const hasShopMarkers = !!document.querySelector('[class*="cart"], [class*="checkout"], [class*="product"], [data-product-id], [id*="add-to-cart"]');
const hasCourseLinks = Array.from(document.querySelectorAll('a[href]')).some(a => /\/course|\/curriculum|\/enroll|\/program/.test(a.href));
const hasBlogPattern = !!document.querySelector('article, [class*="post-"], [class*="article"]') && Array.from(document.querySelectorAll('a[href]')).filter(a => /\/(blog|news|articles|posts)\//.test(a.href)).length >= 3;
const hasSaasMarkers = Array.from(document.querySelectorAll('a, button')).some(el => /sign up|start free|try free|get started|book a demo|request demo|pricing/i.test(el.innerText.trim())) && !!document.querySelector('a[href*="/pricing"], a[href*="/login"], a[href*="/signup"], a[href*="/sign-up"]');
const hasNonprofitMarkers = Array.from(document.querySelectorAll('a, button')).some(el => /donate|give now|join us|become a member/i.test(el.innerText.trim()));
const hasLocalBusinessMarkers = !!document.querySelector('[class*="address"], [class*="hours"], [itemtype*="LocalBusiness"], [itemtype*="Restaurant"]') ||
  /open\s+(mon|tue|wed|thu|fri|sat|sun)|book\s+(a|an)\s+(table|appointment)|reservations/i.test(document.body.innerText);

return {
  schemaTypes,        // union across JSON-LD + microdata + RDFa
  schemaFormats,      // per-format counts for technicalNotes
  hasShopMarkers,
  hasCourseLinks,
  hasBlogPattern,
  hasSaasMarkers,
  hasNonprofitMarkers,
  hasLocalBusinessMarkers,
  generator: (document.querySelector('meta[name="generator"]') || {}).getAttribute && document.querySelector('meta[name="generator"]').getAttribute('content')
};
```

The decision tree below treats `schemaTypes` as a format-agnostic union — sites using microdata or RDFa are detected the same as JSON-LD sites for typing purposes. The per-format breakdown in `schemaFormats` is preserved for `technicalNotes` and the `jsonLdFormat` scoring in Section 1.3.

### 0.2 Site type decision tree

Walk this tree top to bottom and stop at the first match. Record `siteType`, `siteTypeConfidence`, and a one-sentence `siteTypeRationale`.

1. **`ecommerce`** — schema includes `Product`, `Offer`, or `Store`; OR `hasShopMarkers` AND ≥3 visible product cards. *high confidence.*
2. **`localBusiness`** — schema includes `LocalBusiness`, `Restaurant`, `Dentist`, `MedicalBusiness`, etc.; OR `hasLocalBusinessMarkers` AND a visible address/phone. *high confidence.*
3. **`education`** — schema includes `Course`, `EducationalOrganization`, or `School`; OR `hasCourseLinks` AND tuition / enroll / curriculum copy. *high confidence.*
4. **`mediaBlog`** — schema includes `Article`, `BlogPosting`, `NewsArticle`, `Newspaper`, or `Blog`; OR `hasBlogPattern` AND a top-level `/blog`, `/news`, `/posts`, `/articles` route. *high confidence when schema present, medium when pattern-only.*
5. **`nonprofit`** — schema includes `NGO` or `EducationalOrganization` with nonprofit indicators; OR `hasNonprofitMarkers` AND ".org" / ".charity" TLD or copy explicitly using "nonprofit", "charity", "501(c)(3)". *high confidence.*
6. **`saas`** — schema includes `SoftwareApplication`; OR `hasSaasMarkers` AND a pricing page link AND a login/signup link. *high confidence when schema present, medium when pattern-only.*
7. **`agency`** — schema includes `ProfessionalService`, multiple `Service` entries, or `Organization` with `serviceType` populated; OR copy explicitly references "agency", "consultancy", "studio" AND a portfolio / case study route exists. *high confidence when schema present, medium when copy-only.*
8. **`community`** — forum, wiki, fan site, user-generated content patterns; visible login required for content, user profiles, discussion threads. *medium confidence at best.*
9. **`other`** — none of the above match cleanly. *low confidence — flag in rationale.*

If two categories tie (e.g. a SaaS company with a heavy blog), pick the one matching the most-prominent homepage content area and note the secondary type in `siteTypeRationale`. Most homepages weight one type primarily.

### 0.3 What the site type controls

The site type changes what evidence counts for these **content-quality** signals — point values and the underlying question stay constant. Schema-related signals are NOT in this list; schema scoring is content-driven via Section 0.4, not siteType-driven.

| Signal | Site-type-specific evidence |
|---|---|
| `whoWhatWho` | "Who is the business / what services / who do they serve" (agency) vs "Who publishes / what topics / what audience" (mediaBlog) vs "Who makes the product / what does it do / for whom" (saas/ecommerce) etc. |
| `primaryFocusSpecificity` | Service offering (agency) / product category (ecommerce) / editorial topic (mediaBlog) / software category (saas) / program area (education/nonprofit) |
| `primaryOfferingDetail` | Service detail (agency) / product detail (ecommerce) / content vertical detail (mediaBlog) / feature/use-case detail (saas) |
| `namedSpecificEntities` | Platforms & tech (agency/saas) / brands (ecommerce) / publishers, sources, cited researchers (mediaBlog) / accreditations, frameworks (education/nonprofit) |
| `namedSubjectAreas` | Industries served (agency) / product categories (ecommerce) / topic verticals (mediaBlog) / fields of study (education) / program areas (nonprofit) |
| `recentFeaturedWork` | Recent portfolio or case studies (agency) / new products or collections (ecommerce) / recent articles (mediaBlog) / changelog/releases (saas) / recent courses/cohorts (education) / recent campaigns/programs (nonprofit) |

All other signals are evaluated the same regardless of site type. Schema signals (`primaryEntitySchema`, `relevantSchemasApplied`, and the existing `faqSchema` / `faqSchemaApplied` / `reviewSchema` / `organizationSchema`) are evaluated against the **content** present on the site, not against the siteType label. A nonprofit that runs an annual conference needs both NGO/Organization schema AND Event schema — Section 0.4 detects both.

### 0.4 Schema Relevance Scan

Schema scoring is content-driven, not siteType-driven. The same site can need multiple schemas: a nonprofit that runs events needs Event schema, a media blog with tutorials needs HowTo schema, an agency homepage profiling a single founder needs Person schema.

For each schema type below, observe whether the site's content actually warrants it, and record a relevance level: `high` (clearly applicable, the content pattern is prominent), `medium` (some applicable content but secondary to the dominant type), `low` (one-off mention or weak pattern), or `absent` (no content the schema would describe).

```javascript
// Run on the homepage. Most relevance scans are pattern-based; ambiguous cases
// (e.g. "is this primarily editorial or primarily conference site") use
// content judgment in Phase 3 — record an initial relevance here and revisit.

const text = document.body.innerText;
const lower = text.toLowerCase();

// Person — bylined posts, named single-person bio, homepage profile pattern
const hasNamedHeroBio = !!document.querySelector('[class*="hero"], [class*="bio"], [class*="about"]') &&
  /\bi'?m\s+[A-Z][a-z]+|\bmy\s+name\s+is\s+[A-Z][a-z]+/.test(text);
const hasBylines = /\bby\s+[A-Z][a-z]+\s+[A-Z][a-z]+/.test(text);
const personRelevance = hasNamedHeroBio ? 'high' : hasBylines ? 'medium' : 'absent';

// Article / BlogPosting — listing of 3+ dated posts, article-like content
const hasBlogListing = Array.from(document.querySelectorAll('a[href]'))
  .filter(a => /\/(blog|news|articles|posts)\//.test(a.href)).length >= 3;
const hasArticleElement = !!document.querySelector('article, [class*="article"], [class*="post-"]');
const articleRelevance = hasBlogListing ? 'high' : hasArticleElement ? 'medium' : 'absent';

// Organization — always relevant; the question is whether it's populated correctly
const organizationRelevance = 'high';

// LocalBusiness — visible address, hours, booking copy
const hasAddress = !!document.querySelector('[class*="address"], address, [itemprop="address"]') ||
  /\b\d{1,5}\s+[A-Z][a-z]+\s+(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr)\b/i.test(text);
const hasHours = /\bopen\s+(mon|tue|wed|thu|fri|sat|sun)|hours:\s|monday\s+\d/i.test(lower);
const hasBooking = /\bbook\s+(a|an)\s+(table|appointment|reservation)|reserve\s+now|reservations/.test(lower);
const localRelevance = (hasAddress && hasHours) ? 'high' : (hasAddress || hasBooking) ? 'medium' : 'absent';

// Event — dated event listings with venue/registration
const hasEventDatePattern = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+20\d{2}\s*(at|·|—|-)\s*\d/i.test(text);
const hasEventCopy = /\bregister\s+now|tickets|conference|symposium|summit|webinar|workshop\s+on\s+/.test(lower);
const hasMultipleEvents = (text.match(/\bregister|tickets|join\s+us\s+on/gi) || []).length >= 2;
const eventRelevance = (hasEventDatePattern && hasMultipleEvents) ? 'high' : hasEventCopy ? 'medium' : 'absent';

// FAQ — Q&A patterns (also fed by existing faqSectionPresent in 1.4)
const hasFaqMarkers = !!document.querySelector('[class*="faq"], [id*="faq"]') ||
  Array.from(document.querySelectorAll('h2, h3')).filter(h => h.innerText.trim().endsWith('?')).length >= 2 ||
  document.querySelectorAll('details').length >= 2;
const faqRelevance = hasFaqMarkers ? 'high' : 'absent';

// HowTo — numbered step sequence with a stated goal
const hasOrderedSteps = !!document.querySelector('ol li + li + li') ||
  /\bstep\s+1\b[\s\S]{0,500}\bstep\s+2\b/i.test(text);
const hasHowToFraming = /\bhow\s+to\s+[a-z]/i.test(text) || /\btutorial|guide:|step-by-step/i.test(lower);
const howToRelevance = (hasOrderedSteps && hasHowToFraming) ? 'high' : hasOrderedSteps ? 'medium' : 'absent';

// Product — cart/checkout markers, product cards
const hasShop = !!document.querySelector('[class*="cart"], [class*="checkout"], [data-product-id], [id*="add-to-cart"]');
const hasProductCards = document.querySelectorAll('[class*="product"]').length >= 3;
const productRelevance = (hasShop && hasProductCards) ? 'high' : hasShop ? 'medium' : 'absent';

// Course — curriculum / syllabus / enrollment
const hasCourseLinks = Array.from(document.querySelectorAll('a[href]'))
  .some(a => /\/course|\/curriculum|\/enroll|\/program|\/syllabus/.test(a.href));
const hasCourseCopy = /\btuition|enroll(ment)?|syllabus|curriculum|prerequisites|cohort/i.test(text);
const courseRelevance = (hasCourseLinks && hasCourseCopy) ? 'high' : hasCourseCopy ? 'medium' : 'absent';

// Recipe — ingredients + instructions pattern
const hasIngredients = /\bingredients[:\s]/i.test(text) && /\b(cup|tablespoon|teaspoon|gram|ounce|oz|tbsp|tsp)s?\b/i.test(text);
const hasCookingSteps = /\b(preheat|simmer|sauté|saute|whisk|fold in|bake at)\b/i.test(text);
const recipeRelevance = (hasIngredients && hasCookingSteps) ? 'high' : hasIngredients ? 'medium' : 'absent';

// Review / AggregateRating — review content visible
const hasReviewCopy = /\b\d+(\.\d+)?\s*(out of|\/)\s*5\b|\bcustomer reviews|\b\d+\s+reviews\b/i.test(text);
const reviewRelevance = hasReviewCopy ? 'high' : 'absent';

return {
  applicableSchemas: {
    Person: personRelevance,
    Article: articleRelevance,
    Organization: organizationRelevance,
    LocalBusiness: localRelevance,
    Event: eventRelevance,
    FAQPage: faqRelevance,
    HowTo: howToRelevance,
    Product: productRelevance,
    Course: courseRelevance,
    Recipe: recipeRelevance,
    Review: reviewRelevance
  }
};
```

For ambiguous sites — for example, an editorial publication that also runs an annual conference where the conference content is prominent on the homepage — use a brief Phase 3 content read to confirm or adjust the relevance level. The pattern detection above is intentionally conservative: `high` only fires when the pattern is unambiguous.

Persist the result as `technicalNotes.applicableSchemas`. It drives two signals downstream:

- **`primaryEntitySchema`** (Section 1.3) — the dominant schema type for this site is the one with the most prominent relevance signal. Score against its presence and completeness.
- **`relevantSchemasApplied`** (Section 1.3) — coverage ratio across every schema with relevance `high` or `medium`.

> Note: `Organization` is always `high`, but it's scored under its own standalone signal (`organizationSchema`, 5pts) — not double-counted in `primaryEntitySchema` or `relevantSchemasApplied`. Similarly, `FAQPage` and `Review` have their own standalone signals and aren't double-counted.

---

## SECTION 1: Initial Setup & Homepage Programmatic Analysis

### 1.1 Browser Setup

- The browser is already at the homepage from Phase 0
- Confirm desktop viewport (1920×1080) via `browser_resize` if needed
- `browser_take_screenshot` saved to `reports/screenshots/homepage-aeo-desktop.png` (full page)

### 1.2 Technical Health — 20 pts

#### robots.txt and AI crawler access (max 6pts) — training-vs-retrieval aware

`browser_navigate` to `[baseURL]/robots.txt`. Capture the body text. Then `browser_navigate` back to the homepage.

The 2026 consensus posture is **block training scrapers, allow live-retrieval bots**. Score against the live-retrieval allowlist; treat training blocks as neutral (intentional, not a failure).

**Live-retrieval bots — should be ALLOWED:**

- `OAI-SearchBot` — OpenAI ChatGPT search retrieval
- `ChatGPT-User` — OpenAI ChatGPT user-initiated browsing
- `Claude-User` — Anthropic Claude user-initiated retrieval
- `Claude-SearchBot` — Anthropic Claude search retrieval
- `PerplexityBot` — Perplexity retrieval and citation
- `YouBot` — You.com retrieval
- `Googlebot` — Google Search and AI Overviews crawler

**Training scrapers — blocking is acceptable (and increasingly common):**

- `GPTBot` — OpenAI training scraper
- `ClaudeBot` — Anthropic training scraper (the current name; `anthropic-ai` and `Claude-Web` are deprecated and should not be checked)
- `Google-Extended` — Google's training opt-out token
- `CCBot` — Common Crawl
- `Meta-ExternalAgent`, `FacebookBot` — Meta training

**Scoring:**

- 6pts — All live-retrieval bots above are allowed (or no explicit `Disallow` blocks them under `User-agent: *` or named user-agents). Training scrapers may be allowed or blocked — no penalty either way.
- 4pts — One live-retrieval bot is blocked (e.g. a stale rule blocks `PerplexityBot`) but the rest are fine.
- 2pts — Multiple live-retrieval bots blocked, OR a blanket `Disallow: /` under `User-agent: *` blocks everything.
- 1pt — Present but severely misconfigured (e.g. broken syntax, redirects).
- 0pts — robots.txt absent.

> **Do NOT penalize** blocking `GPTBot`, `ClaudeBot`, `Google-Extended`, `CCBot`. These are training scrapers, not retrieval bots, and blocking them does not affect citation visibility. If the site blocks training but allows retrieval, record this in `notes` as `"Training scrapers blocked, retrieval bots allowed — modern 2026 posture."`
>
> Environment note: on `local` / `development`, treat any robots.txt config as neutral. On `staging`, a blanket Disallow is expected and not a finding.

#### No noindex on homepage (max 4pts)

```javascript
const robotsMeta = document.querySelector('meta[name="robots"]');
const content = robotsMeta ? robotsMeta.getAttribute('content').toLowerCase() : '';
return {
  metaRobots: content || null,
  hasNoindex: content.includes('noindex'),
  hasNofollow: content.includes('nofollow')
};
```

**Scoring:** 4pts if no noindex. 0pts if noindex is present.

> Environment note: on `local` or `development`, noindex is correct and not a finding. Award full 4pts and record the environment in `technicalNotes`. On `staging`, noindex is expected but flag as a reminder if the staging URL was provided for AEO review.

#### HTTPS and mixed content (max 4pts)

```javascript
const isHTTPS = window.location.protocol === 'https:';
const mixedContent = Array.from(document.querySelectorAll('img[src^="http:"], script[src^="http:"], link[href^="http:"]'));
return {
  https: isHTTPS,
  mixedContentCount: mixedContent.length,
  examples: mixedContent.slice(0,3).map(el => el.src || el.href)
};
```

**Scoring:** 4pts if HTTPS active and no mixed content. 2pts if HTTPS but mixed content present. 0pts if HTTP only.

#### Sitemap with valid lastmod dates (max 3pts)

`browser_navigate` to `[baseURL]/sitemap.xml`. If 404, check robots.txt for a `Sitemap:` directive and navigate there. (Yoast and RankMath typically emit `/sitemap_index.xml`; follow the first child sitemap.) Capture the first ~3000 characters.

Parse for valid XML, presence of `<lastmod>` entries, and whether any are within the last 90 days.

**Scoring:** 3pts if present with recent lastmod (within 90 days). 2pts if present but no lastmod. 1pt if all dates stale (over 1 year). 0pts if absent.

#### Core content accessible without JavaScript (max 2pts)

Open a new browser context with JavaScript disabled, navigate to the homepage, and check whether the H1 and substantial body copy are visible in the static HTML.

```javascript
const h1 = document.querySelector('h1');
return {
  h1Present: !!h1,
  h1Text: h1 ? h1.innerText.trim() : null,
  bodyTextLength: document.body.innerText.trim().length
};
```

Save a screenshot to `reports/screenshots/homepage-no-js.png`. Close the no-JS context and resume the normal session.

**Scoring:** 2pts if H1 and 500+ chars of body copy visible without JS. 1pt if some content visible but significantly degraded. 0pts if page is blank or nearly empty.

> WordPress note: standard themes render server-side and pass this check easily. Headless WordPress with a Next.js frontend may fail; record the framework in `technicalNotes.cmsDetected`.

#### Canonical URLs (max 1pt)

AI engines explicitly use `<link rel="canonical">` to dedupe pages and pick the source-of-truth URL when synthesizing answers. Missing or wrong canonical tags cause the AI to weight signals across duplicate URLs, dropping citation weight on the page you actually want cited.

Check the homepage, then sample at least 2 inner pages from Phase 2:

```javascript
const canonical = document.querySelector('link[rel="canonical"]');
const canonicalHref = canonical ? canonical.getAttribute('href') : null;
return {
  present: !!canonical,
  href: canonicalHref,
  selfReferential: canonicalHref && new URL(canonicalHref).pathname === window.location.pathname
};
```

**Scoring:**

- 1pt — Homepage has `<link rel="canonical">` AND at least 2 inner pages have self-referential canonical tags (the canonical points to the page itself, not somewhere else).
- 0.5pt — Homepage canonical present but inner pages missing canonical, OR canonical present everywhere but points to the wrong URL on some pages (common Yoast/RankMath misconfiguration).
- 0pts — No canonical tag on the homepage.

> WordPress note: Yoast and RankMath emit self-referential canonicals automatically — most WordPress sites pass this signal. SPAs and headless implementations frequently miss it; flag in `effortRationale`.

### 1.3 Structured Data — 18 pts

#### JSON-LD inventory

```javascript
const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
const schemas = scripts.map(s => {
  try {
    const parsed = JSON.parse(s.innerText);
    return { type: parsed['@type'] || (parsed['@graph'] ? '@graph' : 'unknown'), keys: Object.keys(parsed) };
  } catch(e) {
    return { type: 'invalid', error: e.message };
  }
});
return { count: scripts.length, schemas };
```

Record which schema types are present. Invalid (unparseable) JSON-LD counts as absent.

#### Organization schema (max 5pts)

Check JSON-LD for `@type: "Organization"` or `@type: "LocalBusiness"`. If present, verify: `name`, `url`, `logo`, `description`, `sameAs`. Also check microdata:

```javascript
const microdataOrg = document.querySelector('[itemscope][itemtype*="schema.org/Organization"], [itemscope][itemtype*="schema.org/LocalBusiness"]');
return { microdataOrg: !!microdataOrg };
```

**Scoring:** 5pts if JSON-LD Organization present with name, url, logo, and at least one sameAs. 3pts if JSON-LD present but sparse. 2pts if microdata-only (no JSON-LD). 0pts if absent.

#### Primary entity schema (max 3pts) — content-driven

The "primary entity" for a site is the **dominant content type** identified in Section 0.4's relevance scan — not a lookup by siteType. A site's primary entity is whichever schema has the strongest relevance signal among the type-defining schemas (Person, Article, Product, Event, HowTo, LocalBusiness, Course, Recipe, SoftwareApplication). Organization, FAQPage, and Review are scored separately and don't compete for the "primary" slot.

If multiple schemas tie at `high` relevance, prefer the one matching the most-prominent homepage content area. Record the determination in `notes`.

**Per-schema expected field set** (what counts as a "well-formed" primary entity schema):

| Schema | Required-for-full-credit fields |
|---|---|
| `Service` | `name`, `description`, `provider` (linked to Organization) |
| `Product` | `name`, `offers`, `brand` or `manufacturer` |
| `Article` / `BlogPosting` / `NewsArticle` | `headline`, `author`, `datePublished`, `image` |
| `Person` | `name`, `jobTitle` or `description`, `sameAs` (≥1 external profile) |
| `Event` | `name`, `startDate`, `location`, `eventStatus` |
| `HowTo` | `name`, `step` (≥3 HowToStep entries), `totalTime` or `tool`/`supply` |
| `LocalBusiness` (or subtype) | `name`, `address`, `openingHoursSpecification`, `telephone` |
| `Course` | `name`, `description`, `provider`, `hasCourseInstance` or `offers` |
| `Recipe` | `name`, `recipeIngredient`, `recipeInstructions`, `cookTime` or `prepTime` |
| `SoftwareApplication` | `name`, `applicationCategory`, `offers` or `operatingSystem` |

Programmatic check:

```javascript
// Use the relevance map from Section 0.4 to pick the expected primary type.
// PRIMARY_CANDIDATES is the type-defining schema list (excludes Organization/FAQPage/Review).
const PRIMARY_CANDIDATES = ['Person','Article','BlogPosting','NewsArticle','Product','Event','HowTo','LocalBusiness','Course','Recipe','SoftwareApplication'];
const relevance = /* applicableSchemas from 0.4 */;
const primaryCandidates = Object.entries(relevance)
  .filter(([k,v]) => v === 'high' && PRIMARY_CANDIDATES.includes(k))
  .sort();
const expectedPrimary = primaryCandidates[0] ? primaryCandidates[0][0] : null;

const jsonLd = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
  .map(s => { try { return JSON.parse(s.innerText); } catch(e) { return null; }})
  .filter(Boolean)
  .flatMap(s => Array.isArray(s) ? s : (s['@graph'] || [s]));
const jsonLdMatch = expectedPrimary ? jsonLd.find(s => s['@type'] === expectedPrimary || (Array.isArray(s['@type']) && s['@type'].includes(expectedPrimary))) : null;
const microdataMatch = expectedPrimary ? document.querySelector(`[itemscope][itemtype*="schema.org/${expectedPrimary}"]`) : null;
const rdfaMatch = expectedPrimary ? document.querySelector(`[typeof~="${expectedPrimary}"], [typeof~="schema:${expectedPrimary}"]`) : null;
return {
  expectedPrimary,
  jsonLdMatch: jsonLdMatch ? Object.keys(jsonLdMatch) : null,
  hasMicrodata: !!microdataMatch,
  hasRdfa: !!rdfaMatch
};
```

**Scoring:**

- 3pts — JSON-LD primary entity schema present, type matches `expectedPrimary` from the relevance scan, AND the required fields for that type are populated.
- 2pts — JSON-LD present with the correct type but sparse (key required fields missing), OR microdata / RDFa-only with required fields.
- 1pt — A schema of the correct type is present but in microdata/RDFa only and sparse.
- 0pts — No schema matches the expected primary type for this site's content.

> Edge case — no high-relevance primary candidate detected: if Section 0.4 finds no primary schema with `high` relevance (e.g. a pure portfolio site with no Articles, Events, Products, or HowTos), Organization schema becomes the de facto primary entity for scoring purposes. Award 3pts if Organization is well-formed; otherwise score against the highest-relevance candidate even if it's `medium`. Record the determination in `notes`.
>
> Edge case — ecommerce: Product schema typically lives on PDPs, not the homepage. If `Product` is the expected primary type, sample at least one product page during Phase 2 and score the combined evidence — homepage `Store` / `OfferCatalog` plus PDP Product schema both earn credit toward the 3pts.

#### Relevant schemas applied (max 3pts) — `relevantSchemasApplied`

The coverage signal. Of every schema type with relevance `high` or `medium` from Section 0.4, what percent are backed by actual schema markup (in any format — JSON-LD, microdata, or RDFa)?

This is the signal that catches the nonprofit-with-events-but-no-Event-schema pattern, the media-blog-with-tutorials-but-no-HowTo-schema pattern, and the agency-with-client-reviews-but-no-Review-schema pattern.

```javascript
// Build the schema presence map across all three formats
const allLd = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
  .map(s => { try { return JSON.parse(s.innerText); } catch(e) { return null; }})
  .filter(Boolean)
  .flatMap(s => Array.isArray(s) ? s : (s['@graph'] || [s]));
const jsonLdTypes = new Set(allLd.map(s => s['@type']).filter(Boolean).flat());

const microdataTypes = new Set(
  Array.from(document.querySelectorAll('[itemscope][itemtype]'))
    .map(el => (el.getAttribute('itemtype').match(/schema\.org\/(\w+)/) || [])[1])
    .filter(Boolean)
);

const rdfaTypes = new Set(
  Array.from(document.querySelectorAll('[typeof]'))
    .flatMap(el => (el.getAttribute('typeof') || '').split(/\s+/))
    .map(t => t.replace(/^schema:/, ''))
    .filter(Boolean)
);

const allPresentTypes = new Set([...jsonLdTypes, ...microdataTypes, ...rdfaTypes]);

// Compare against the relevance map from 0.4
const relevance = /* applicableSchemas from 0.4 */;
const inScope = Object.entries(relevance).filter(([k, v]) => v === 'high' || v === 'medium');
const matched = inScope.filter(([k, v]) => allPresentTypes.has(k) ||
  // BlogPosting and NewsArticle satisfy Article relevance; Article satisfies BlogPosting relevance
  (k === 'Article' && (allPresentTypes.has('BlogPosting') || allPresentTypes.has('NewsArticle'))) ||
  // Specific LocalBusiness subtypes satisfy LocalBusiness relevance
  (k === 'LocalBusiness' && [...allPresentTypes].some(t => /Restaurant|Dentist|Plumber|MedicalBusiness|Store|HomeAndConstructionBusiness/.test(t)))
);

const coverage = inScope.length === 0 ? 1 : matched.length / inScope.length;
return { inScopeCount: inScope.length, matchedCount: matched.length, coveragePercent: Math.round(coverage * 100), gaps: inScope.filter(x => !matched.includes(x)).map(([k]) => k) };
```

**Scoring:**

- 3pts — Coverage ≥ 90% (every high/medium-relevance schema is backed by matching markup; or only one minor gap on a `medium`-relevance schema).
- 2pts — Coverage 60–89% (most relevant schemas present; one or two gaps including up to one on a `high`-relevance schema).
- 1pt — Coverage 30–59% (significant gaps; the dominant primary schema may be present but several relevant secondary schemas are missing).
- 0pts — Coverage < 30%, OR no schemas of any kind present.

> If `Section 0.4` found no schemas with `high` or `medium` relevance (rare — Organization is always at least `high`, so this should never be empty), award 3pts by default and note in `notes` as `"N/A — no content patterns matched any schema-eligible type beyond Organization."`
>
> Record the specific gap list in `notes` — e.g. `"Coverage 60% — gaps: Event (annual conference visible on homepage), HowTo (3 tutorial pages observed)."` Each gap also produces an entry in `actionablePrompts` with a paste-ready Claude prompt to generate the missing schema.

#### FAQ schema (max 3pts)

JSON-LD `@type: "FAQPage"` with `mainEntity` containing Q&A pairs. Microdata check:

```javascript
const microdataFaq = document.querySelector('[itemscope][itemtype*="schema.org/FAQPage"], [itemscope][itemtype*="schema.org/Question"]');
return { microdataFaq: !!microdataFaq };
```

**Scoring:** 3pts if JSON-LD FAQPage with 2+ valid Q&A pairs. 1pt if malformed JSON-LD or microdata-only. 0pts if absent.

#### JSON-LD format used (max 2pts) — `jsonLdFormat`

The signal name reflects what AI engines prefer, but the check enumerates all three structured-data formats the rubric supports: JSON-LD, microdata, and RDFa.

```javascript
const jsonLd = document.querySelectorAll('script[type="application/ld+json"]').length;
const microdata = document.querySelectorAll('[itemscope][itemtype]').length;

// RDFa: count elements with `typeof` inside a `vocab="http://schema.org/"` or compatible prefix scope
const rdfa = Array.from(document.querySelectorAll('[typeof]')).filter(el => {
  const vocab = el.closest('[vocab]');
  const prefix = el.closest('[prefix]');
  return (vocab && /schema\.org/.test(vocab.getAttribute('vocab'))) ||
         (prefix && /schema(:|=)\s*http:\/\/schema\.org/.test(prefix.getAttribute('prefix')));
}).length;

return { jsonLd, microdata, rdfa };
```

**Scoring:**

- 2pts — JSON-LD present (any blocks). Microdata and/or RDFa may also be present — no penalty for mixed formats.
- 1pt — No JSON-LD, but microdata OR RDFa present. The finding text must say so explicitly:
  - Microdata-only: `"Zero JSON-LD blocks; [N] microdata itemscope elements present — JSON-LD is preferred for reliable AI parsing."`
  - RDFa-only: `"Zero JSON-LD blocks; [N] RDFa typed elements present — JSON-LD is preferred for reliable AI parsing; RDFa adoption is low and AI parsing support is uneven."`
  - Both microdata and RDFa but no JSON-LD: list both counts and call out JSON-LD as the recommendation.
- 0pts — None of JSON-LD, microdata, or RDFa present.

Always record all three counts in `notes` and in `technicalNotes.schemaFormats` ({ jsonLd, microdata, rdfa }) so downstream consumers can see what was found.

#### Open Graph tags complete (max 1pt) — `openGraphTags`

```javascript
const ogTags = ['og:title', 'og:description', 'og:image', 'og:url', 'og:type'];
const result = {};
ogTags.forEach(tag => {
  const el = document.querySelector('meta[property="' + tag + '"]');
  result[tag] = el ? el.getAttribute('content') : null;
});
return result;
```

**Scoring:** 1pt if og:title, og:description, and og:image all present. 0.5pt if partial. 0pts if none. (Reduced from 2pts in the content-driven refactor — OG tags are still the AI-relevant social-metadata layer, but the additional weight was reallocated to `relevantSchemasApplied`.)

#### Review or AggregateRating schema (max 1pt)

JSON-LD `@type: "Review"` or `@type: "AggregateRating"`. Microdata check:

```javascript
const microdataReview = document.querySelector('[itemscope][itemtype*="schema.org/Review"], [itemscope][itemtype*="schema.org/AggregateRating"]');
return { microdataReview: !!microdataReview };
```

**Scoring:** 1pt if present in either format. 0pts if absent.

### 1.4 AEO Readiness — Programmatic checks (4 of 8 signals here)

`faqSectionPresent`, `faqSchemaApplied`, `questionFramedHeadings`, and `titleAndMetaQuestionMatch` are programmatic and scored below. `directAnswers`, `whoWhatWho`, `featuredSnippetStructure`, and `answerCapsules` are content checks scored in Phase 3.

#### FAQ section present (max 3pts)

```javascript
const faqIndicators = [
  ...document.querySelectorAll('[class*="faq"], [id*="faq"], [class*="FAQ"], [id*="FAQ"]'),
  ...Array.from(document.querySelectorAll('h2, h3')).filter(h => {
    const t = h.innerText.toLowerCase();
    return t.includes('frequently asked') || t.includes('common questions');
  })
];
const dlPairs = document.querySelectorAll('dl');
const detailsElements = document.querySelectorAll('details');
return {
  faqSectionFound: faqIndicators.length > 0,
  dlPairs: dlPairs.length,
  detailsElements: detailsElements.length
};
```

If no FAQ on the homepage, check `/faq` and `/faqs` as inner pages (also visit during Phase 2).

**Scoring:** 3pts if a FAQ section is found (homepage or dedicated FAQ page) with 2+ Q&A pairs. 1pt if partial (accordion present but only 1 item). 0pts if absent.

#### FAQ schema applied to visible FAQ content (max 1pt) — `faqSchemaApplied`

Cross-reference: if a FAQ section was found AND FAQ JSON-LD schema was found in 1.3.

**Scoring:** 1pt if both present. 0.5pt if FAQ schema present but no visible FAQ content (or vice versa). 0pts if neither.

(Reduced from 2pts in the title-and-meta refactor — the FAQ alignment is already partially measured by `faqSchema` (3pts) and `faqSectionPresent` (3pts); the additional weight was reallocated to `titleAndMetaQuestionMatch`.)

#### Question-framed headings (max 2pts)

```javascript
const headings = Array.from(document.querySelectorAll('h2, h3'));
const questionHeadings = headings.filter(h => h.innerText.trim().endsWith('?'));
return {
  total: headings.length,
  questionFramed: questionHeadings.length,
  examples: questionHeadings.slice(0,3).map(h => h.innerText.trim())
};
```

**Scoring:** 2pts if 2+ H2/H3 phrased as questions. 1pt if one. 0pts if none.

#### Title and meta description question-match (max 1pt) — `titleAndMetaQuestionMatch`

For pages targeting a specific question, AI engines weight the page's `<title>` and `<meta name="description">` as signals about what question the page is answering. The post explicitly recommends: *"For pages targeting specific questions (e.g., a services page answering 'what does X company do?'), it helps to include the question or a close variant in the title tag or meta description."*

Check the homepage AND every inner page visited in Phase 2.

```javascript
const title = document.querySelector('title') ? document.querySelector('title').innerText.trim() : '';
const metaDescEl = document.querySelector('meta[name="description"]');
const metaDesc = metaDescEl ? metaDescEl.getAttribute('content').trim() : '';
const h1 = document.querySelector('h1') ? document.querySelector('h1').innerText.trim() : '';

// A page is "question-targeting" if its H1 ends with "?", or contains "how", "what",
// "why", "when", "where", "who" as the first word, or matches the dominant
// question pattern in the H2/H3 set
const h1IsQuestion = /\?$/.test(h1) || /^(how|what|why|when|where|who|can|does|is|are|should|do)\s+/i.test(h1);

// Or the page is question-targeting by purpose: services pages, FAQ pages,
// product detail pages, donation pages, etc.
const pathSignalsQuestion = /\/(faq|services?|pricing|how-it-works|about|donate|subscribe|join|tutorials?|guides?)/.test(window.location.pathname);

const isQuestionTargeting = h1IsQuestion || pathSignalsQuestion;

// Signal extraction — does title or meta description contain question phrasing
// or align with the H1's question/topic?
const titleHasQuestion = /\?/.test(title) || /^(how|what|why|when|where|who|can|does|is|are|should|do)\s+/i.test(title);
const metaHasQuestion = /\?/.test(metaDesc) || /^(how|what|why|when|where|who|can|does|is|are|should|do)\s+/i.test(metaDesc);

// Token overlap between title/meta and H1 (a rough proxy for alignment when the
// page isn't framed as a literal question — e.g. a services page titled
// "Web Development Services for B2B SaaS" aligning with H1 "What we build")
function tokens(s) {
  return new Set((s || '').toLowerCase().match(/[a-z][a-z]+/g) || []);
}
const h1Tokens = tokens(h1);
const titleTokens = tokens(title);
const metaTokens = tokens(metaDesc);
const titleOverlap = h1Tokens.size > 0 ? [...h1Tokens].filter(t => titleTokens.has(t)).length / h1Tokens.size : 0;
const metaOverlap = h1Tokens.size > 0 ? [...h1Tokens].filter(t => metaTokens.has(t)).length / h1Tokens.size : 0;

return {
  url: window.location.href,
  h1, title, metaDesc,
  isQuestionTargeting,
  titleHasQuestion, metaHasQuestion,
  titleOverlap: Math.round(titleOverlap * 100) / 100,
  metaOverlap: Math.round(metaOverlap * 100) / 100
};
```

**Scoring:**

- 1pt — Question-targeting pages on this site have a `<title>` OR `<meta name="description">` that either (a) contains question phrasing, or (b) reaches ≥50% token overlap with the page's H1. Score across the homepage plus all inner pages visited; at least 50% of question-targeting pages must clear this bar.
- 0.5pt — Title and meta exist on all sampled pages but show low alignment with H1 / question framing (between 20% and 50% of question-targeting pages clear the bar). OR the homepage is fine but inner pages are not.
- 0pts — Title and meta are present-but-generic on every sampled page (e.g. `<title>` is the site name only; meta description is boilerplate from theme defaults), with no question framing or H1 alignment anywhere.

> N/A exemption: if zero pages visited are question-targeting (a pure-portfolio site with one-word page titles like "Work", "Studio", "Contact"), award 1pt by default and note in `notes` as `"N/A — no question-targeting pages observed."`
>
> Record the per-page results in `notes` so the report can show which pages passed and which failed. The fix is a content edit (one-field change in Yoast/RankMath for most WordPress sites) — `effort` is almost always `low`.

`directAnswers`, `whoWhatWho`, `featuredSnippetStructure`, and `answerCapsules` are scored in Phase 3 (content).

### 1.5 E-E-A-T Signals — Programmatic checks (3 of 8 signals here)

The remaining 5 are scored in Phase 3 (content). `aboutTeamPageLinked` as a standalone signal was retired — the "is there an About/Team/Authors page" check is now embedded in `namedTeamMembers` (you must visit it to verify named individuals).

#### Named individuals with roles (max 3pts) — `namedTeamMembers`

The check is "are there real named human beings with identifiable roles tied to this site?" The evidence varies by site type:

| Site type | What counts as a named individual |
|---|---|
| `agency`, `saas`, `localBusiness`, `nonprofit` | Founders, leadership, employees, key staff with names and titles |
| `mediaBlog` | Bylined authors, editorial leadership (editor-in-chief, contributing editors) |
| `ecommerce` | Founders, designers, makers, key team members — common on brand-led shops, often absent on dropshippers |
| `education` | Faculty, instructors, course leads with credentials |
| `community` | Moderators, leadership, named maintainers |

```javascript
const teamSections = Array.from(document.querySelectorAll('[class*="team"], [id*="team"], [class*="about"], [id*="about"], [class*="author"], [class*="staff"], [class*="faculty"], [class*="contributor"]'));

// Person in JSON-LD
const personJsonLd = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
  .map(s => { try { return JSON.parse(s.innerText); } catch(e) { return null; }})
  .filter(Boolean)
  .flatMap(s => Array.isArray(s) ? s : (s['@graph'] || [s]))
  .filter(s => s['@type'] === 'Person');

// Person in microdata
const personMicrodata = Array.from(document.querySelectorAll('[itemscope][itemtype*="schema.org/Person"]'));

// Person in RDFa
const personRdfa = Array.from(document.querySelectorAll('[typeof~="Person"], [typeof~="schema:Person"]'));

const aboutLink = Array.from(document.querySelectorAll('a[href]')).find(a => {
  const text = a.innerText.toLowerCase();
  const href = a.href.toLowerCase();
  return /\b(about|team|authors|staff|faculty|masthead|people)\b/.test(text) || /\/(about|team|authors|staff|faculty|masthead|people)\//.test(href);
});
return {
  teamSectionCount: teamSections.length,
  personSchemaCount: personJsonLd.length,
  personMicrodataCount: personMicrodata.length,
  personRdfaCount: personRdfa.length,
  aboutLinkHref: aboutLink ? aboutLink.href : null
};
```

Person can appear in JSON-LD, microdata, or RDFa — all three count toward the "named team" signal. JSON-LD is preferred for AI parsing reliability; if Person is microdata-only or RDFa-only, note that in the finding (`"Person markup present in microdata only — JSON-LD is preferred for AI parsing."`).

If an About/Team/Authors page is linked, visit it in Phase 2 to confirm named individuals are present.

**Scoring:**

- 3pts — Named individuals with type-appropriate roles visible (homepage or About/Team/Authors page).
- 1pt — Site is referenced through anonymous language only ("our team", "our editors", "the staff") — no names anywhere accessible from the homepage.
- 0pts — No team / author / staff signals at all.

#### Credentialing badges (max 2pts) — `certificationBadges`

The check is "are there visible third-party credentials backing this site?" The evidence varies by site type:

| Site type | What counts as a credentialing badge |
|---|---|
| `agency`, `saas` | Partner badges (Google Partner, WooCommerce Expert, AWS Partner), certifications, ISO badges |
| `mediaBlog` | Press affiliations, fact-checking certifications (IFCN), journalism awards, professional press credentials |
| `ecommerce`, `localBusiness` | BBB rating, Trustpilot widget, payment-processor trust marks, industry trade group memberships |
| `education` | Accreditation badges (regional accreditor, programmatic accreditation), recognized certifications |
| `nonprofit` | Charity Navigator, GuideStar Seal, BBB Wise Giving, 501(c)(3) verification badges |
| `community` | Verified-organization marks from the platform host, hosting-provider trust marks |

```javascript
const badgeIndicators = Array.from(document.querySelectorAll('[class*="cert"], [class*="badge"], [class*="partner"], [class*="award"], [class*="accredit"], [class*="trust"], [class*="verified"], [class*="rated"], [alt*="award"], [alt*="certified"], [alt*="accredited"], [alt*="rated"]'));
const trustWidgets = !!document.querySelector('iframe[src*="trustpilot"], iframe[src*="bbb.org"], [class*="trustpilot"], [class*="bbb"], [class*="guidestar"], [class*="charitynavigator"]');
return { count: badgeIndicators.length, hasTrustWidget: trustWidgets };
```

DOM presence alone is not sufficient — confirm visually via the homepage screenshot that the badges are legible (the failure mode is small-text or visually-unrecognizable images that match the selectors but aren't real credentials).

**Scoring:**

- 2pts — Credentialing badges present AND visually confirmed as legible/recognizable, matched to the site type.
- 1pt — DOM indicators found but visual confirmation unclear, or only weak credentials (e.g. SSL-vendor badges).
- 0pts — Absent.

#### Tenure indicators (max 1pt) — `tenureIndicators`

The check is "does the site signal how long it has been operating?" — a recognized AI-trust signal across all types. The phrasing varies:

| Site type | Common tenure phrasings |
|---|---|
| `agency`, `saas`, `ecommerce` | "Founded in YYYY", "established YYYY", "since YYYY", "N years in business" |
| `mediaBlog` | "Publishing since YYYY", "covering [topic] since YYYY", "founded YYYY" |
| `education` | "Founded YYYY", "serving students since YYYY" |
| `nonprofit` | "Founded YYYY", "serving the community for N years" |
| `community` | "Active since YYYY", "the longest-running [topic] community" |

```javascript
const bodyText = document.body.innerText;
const yearPatterns = [
  /founded\s+(?:in\s+)?(\d{4})/i,
  /established\s+(?:in\s+)?(\d{4})/i,
  /since\s+(\d{4})/i,
  /(\d+)\s+years?\s+(?:of\s+)?(?:experience|in\s+business|publishing|operation|serving|active)/i,
  /publishing\s+since\s+(\d{4})/i,
  /covering\s+\w+\s+since\s+(\d{4})/i,
  /serving\s+(?:the\s+)?\w+(?:\s+\w+)?\s+since\s+(\d{4})/i
];
const matches = yearPatterns.map(p => bodyText.match(p)).filter(Boolean);
return { found: matches.length > 0, matches: matches.map(m => m[0]).slice(0,2) };
```

**Scoring:** 1pt if any tenure indicator is found. 0pts if absent.

#### Author bylines linked to Person schema (max 1pt) — `authorBylines`

**This signal applies primarily to `mediaBlog`, `education`, `nonprofit`, and any other site that publishes articles or posts.** For sites with no editorial content (e.g. pure ecommerce, single-page SaaS), award the full 1pt by default and record in `notes` as `"N/A — site has no editorial articles to byline."`

Visit at least one editorial / blog / news / post page during Phase 2 and check:

```javascript
const articleSelector = 'article, [class*="article"], [class*="post-"]';
const article = document.querySelector(articleSelector);
const visibleByline = article && article.innerText.match(/\bby\s+([A-Z][a-z]+\s+[A-Z][a-z]+)/);
const authorLink = article && article.querySelector('a[href*="/author/"], a[rel="author"]');

// Article in JSON-LD
const articleJsonLd = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
  .map(s => { try { return JSON.parse(s.innerText); } catch(e) { return null; }})
  .filter(Boolean)
  .flatMap(s => Array.isArray(s) ? s : (s['@graph'] || [s]))
  .filter(s => ['Article','BlogPosting','NewsArticle'].includes(s['@type']));
const authorOnJsonLd = articleJsonLd.some(s => s.author && (typeof s.author === 'object' || Array.isArray(s.author)));

// Article in microdata
const articleMicrodata = Array.from(document.querySelectorAll(
  '[itemscope][itemtype*="schema.org/Article"], [itemscope][itemtype*="schema.org/BlogPosting"], [itemscope][itemtype*="schema.org/NewsArticle"]'
));
const authorOnMicrodata = articleMicrodata.some(el => el.querySelector('[itemprop="author"]'));

// Article in RDFa
const articleRdfa = Array.from(document.querySelectorAll(
  '[typeof~="Article"], [typeof~="BlogPosting"], [typeof~="NewsArticle"], [typeof~="schema:Article"], [typeof~="schema:BlogPosting"], [typeof~="schema:NewsArticle"]'
));
const authorOnRdfa = articleRdfa.some(el => el.querySelector('[property="author"], [property="schema:author"]'));

return {
  hasVisibleByline: !!visibleByline,
  authorName: visibleByline ? visibleByline[1] : null,
  hasAuthorLink: !!authorLink,
  authorLinkHref: authorLink ? authorLink.href : null,
  hasArticleJsonLd: articleJsonLd.length > 0,
  hasArticleMicrodata: articleMicrodata.length > 0,
  hasArticleRdfa: articleRdfa.length > 0,
  hasAuthorOnSchema: authorOnJsonLd || authorOnMicrodata || authorOnRdfa
};
```

**Scoring:**

- 1pt — Visible byline AND author name linked to an author page AND article schema (any format) has a populated `author` property.
- 0.5pt — Visible byline AND linked author page, but no `author` on any schema format, OR `author` present in microdata/RDFa only (JSON-LD preferred for AI parsing).
- 0pts — Anonymous publication: no byline, or byline with no link, or no Article/BlogPosting schema in any format.

### 1.6 Content Freshness — Programmatic checks (5 of 7 signals here)

#### Copyright year (max 3pts)

```javascript
const footerText = document.querySelector('footer') ? document.querySelector('footer').innerText : document.body.innerText;
const yearMatch = footerText.match(/[©℗]\s*(\d{4})/);
const currentYear = new Date().getFullYear();
return {
  found: !!yearMatch,
  year: yearMatch ? parseInt(yearMatch[1]) : null,
  current: yearMatch ? parseInt(yearMatch[1]) === currentYear : false
};
```

**Scoring:** 3pts if copyright year matches current year. 1pt if one year behind. 0pts if two or more years stale, or absent.

#### Blog or news section detection (max 3pts — visit blog page in Phase 2)

```javascript
const blogIndicators = Array.from(document.querySelectorAll('[class*="blog"], [class*="news"], [class*="post"], [class*="article"], [id*="blog"], [id*="news"]'));
const datePattern = /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2},?\s+20\d{2}|\b20\d{2}[-\/](0[1-9]|1[0-2])[-\/](0[1-9]|[12]\d|3[01])\b/gi;
const dates = (document.body.innerText.match(datePattern) || []);
return { blogSectionFound: blogIndicators.length > 0, datesFound: dates.slice(0,5) };
```

Confirm in Phase 2 by visiting the blog/news listing page. Most-recent post date determines freshness.

**Scoring:** 3pts if blog/news section present with content dated within last 6 months. 1pt if section present but content older than 6 months. 0pts if no blog section found.

#### Date stamps on posts or case studies (max 2pts)

```javascript
const dateTags = Array.from(document.querySelectorAll('time[datetime], [class*="date"], [class*="published"]'));
return { count: dateTags.length, examples: dateTags.slice(0,3).map(el => el.innerText.trim() || el.getAttribute('datetime')) };
```

Confirm by visiting at least one blog post in Phase 2 — the post page should display a published date.

**Scoring:** 2pts if date stamps visible on posts or case studies. 0pts if absent.

#### Sitemap lastmod dates recent (max 1pt) — `sitemapLastmodRecent`

Cross-reference 1.2 sitemap analysis. Were lastmod dates present and within 90 days?

**Scoring:** 1pt if sitemap has lastmod dates within 90 days. 0pts if absent or all stale.

#### Per-page "Last updated" stamps (max 1pt) — `contentUpdateRecency`

Distinct from `dateStampsOnContent` (which checks for any visible date on posts). This signal checks whether individual pages — especially evergreen reference pages — carry a visible "Last updated" / "Updated on" / "Revised YYYY" stamp within the last 12 months.

Perplexity cites content updated in the last 30 days at 82%; content updated within the last 12 months earns 3.2× more Perplexity citations. Per-page update stamps signal active maintenance.

Visit one editorial / reference page during Phase 2 and check:

```javascript
const bodyText = document.body.innerText;
const updatedPattern = /(?:last\s+updated|updated\s+on|revised|last\s+revised|reviewed\s+on)[:\s]+([A-Z][a-z]+\s+\d{1,2},?\s+20\d{2}|\d{1,2}\s+[A-Z][a-z]+\s+20\d{2}|20\d{2}-\d{2}-\d{2})/i;
const modifiedMeta = document.querySelector('meta[property="article:modified_time"], meta[name="last-modified"]');

// dateModified in JSON-LD
const jsonLdMod = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
  .map(s => { try { return JSON.parse(s.innerText); } catch(e) { return null; }})
  .filter(Boolean)
  .flatMap(s => Array.isArray(s) ? s : (s['@graph'] || [s]))
  .find(s => s.dateModified);

// dateModified in microdata — <meta itemprop="dateModified" content="..."> or <time itemprop="dateModified" datetime="...">
const microdataModEl = document.querySelector('[itemprop="dateModified"]');
const microdataMod = microdataModEl
  ? (microdataModEl.getAttribute('datetime') || microdataModEl.getAttribute('content') || microdataModEl.innerText.trim())
  : null;

// dateModified in RDFa
const rdfaModEl = document.querySelector('[property="dateModified"], [property="schema:dateModified"]');
const rdfaMod = rdfaModEl
  ? (rdfaModEl.getAttribute('datetime') || rdfaModEl.getAttribute('content') || rdfaModEl.innerText.trim())
  : null;

const match = bodyText.match(updatedPattern);
return {
  visibleUpdatedStamp: match ? match[0] : null,
  modifiedMetaContent: modifiedMeta ? modifiedMeta.getAttribute('content') : null,
  schemaDateModified: (jsonLdMod && jsonLdMod.dateModified) || microdataMod || rdfaMod || null,
  schemaDateModifiedFormat: (jsonLdMod && jsonLdMod.dateModified) ? 'json-ld' : microdataMod ? 'microdata' : rdfaMod ? 'rdfa' : null
};
```

**Scoring:**

- 1pt — Visible "Last updated" stamp within the last 12 months on at least one sampled inner page. Article schema `dateModified` alone also counts if it is within the last 12 months and the page is editorial.
- 0pts — No visible update stamps anywhere, OR stamps present but all >12 months old.

> Pure-ecommerce / single-page SaaS exemption: if there is no editorial content to bear "last updated" stamps, award 1pt by default and note in `notes` as `"N/A — site has no editorial content requiring update stamps."`

`recentFeaturedWork` and `currentDomainReferences` are scored in Phase 3.

### 1.7 Entity Clarity — Programmatic check (1 of 5 signals here)

#### Social profile links in footer (max 2pts)

```javascript
const socialDomains = ['linkedin.com', 'twitter.com', 'x.com', 'facebook.com', 'instagram.com', 'youtube.com'];
const links = Array.from(document.querySelectorAll('footer a[href], [class*="social"] a[href]'));
const socialLinks = links.filter(a => socialDomains.some(d => a.href.includes(d)));
return { count: socialLinks.length, platforms: [...new Set(socialLinks.map(a => a.href.split('/')[2]))] };
```

**Scoring:** 2pts if LinkedIn and at least one other professional profile linked from footer. 1pt if only one social link. 0pts if none.

`entityIdentifiable`, `primaryFocusSpecificity`, `geographicMarketClarity`, and `consistentIdentity` are all scored in Phase 3.

### 1.8 llms.txt — 3 pts

`browser_navigate` to `[baseURL]/llms.txt`. Record whether it loads (status 200 vs 404) and capture body text. Then `browser_navigate` to `[baseURL]/llms-full.txt` and record presence. Return to homepage.

```javascript
return { found: document.body.innerText.trim().length > 10, content: document.body.innerText.substring(0, 1000) };
```

**Scoring:**
- `llmsTxtPresent` (max 2pts) — 2pts if present and non-empty. 0pts if absent.
- `llmsFullTxtPresent` (max 0.5pts) — 0.5pts if present. 0pts if absent.
- `llmsTxtContent` (max 0.5pts) — scored in Phase 3 based on accuracy and specificity.

---

## SECTION 2: Multi-Page Evidence Collection

The homepage is the primary scoring target, but several signals require inner-page confirmation. Visit **at least 3 additional pages** beyond the homepage. Record every URL visited in `visitedPages`.

### Pages to visit (in priority order, by site type)

Always start with the **homepage** (already visited in Phase 0/1). Then pick inner pages based on the detected `siteType`:

**Universal must-visit pages (all site types):**

| # | Page type | Purpose |
|---|---|---|
| 1 | About / Team / Authors / Masthead / People | Confirm `namedTeamMembers`, `authorCredentials`, sample `canonicalUrls` |
| 2 | One primary-offering page (varies by site type, see below) | Confirm `primaryEntitySchema`, `primaryOfferingDetail`, `namedSpecificEntities`, `primaryFocusSpecificity` |
| 3 | A recent editorial or featured-content page (varies by site type, see below) | Confirm `dateStampsOnContent`, `contentUpdateRecency`, `authorBylines`, `blogNewsRecent` |

**Site-type-specific page targets:**

| Site type | Primary-offering page | Featured-content page | Type-specific functional page |
|---|---|---|---|
| `agency` | A service / solution page | A case study or recent blog post | — |
| `ecommerce` | A product detail page (PDP) | The /new or /collections page or a recent product launch | — |
| `mediaBlog` | A category / section index for the dominant vertical | A recent article from the last 30 days | `/subscribe` or `/newsletter` (FAQ schema check) |
| `saas` | A feature or pricing page | A changelog / release notes / recent blog post | — |
| `education` | A course or program page | A recent news / announcements page or instructor page | — |
| `localBusiness` | A services / menu / offerings page | A recent updates / news / events page if present | — |
| `nonprofit` | A program / cause / how-we-help page | A recent campaign / impact-report / news page | `/donate` or `/give` (FAQ schema check) |
| `community` | A "what is this" / rules / wiki page | A recently-active discussion / featured contribution | `/join`, `/membership`, or `/become-a-member` (FAQ schema check) |

**Optional 4th visit:** if a dedicated FAQ page exists at `/faq`, `/faqs`, `/help`, or `/support`, visit it to confirm `faqSectionPresent` and `faqSchemaApplied`.

**Mediablog-specific 5th visit — archive page quality check.** For mediaBlog sites, visit at least one category or tag archive page (`/category/<slug>/`, `/tag/<slug>/`, `/topics/<slug>/`, or whatever the routing convention is). Run the `archivePageQuality` check from Section 2.1.

If a page type doesn't exist (e.g. ecommerce site with no editorial content), record the absence — it may change the score on the related signal, or trigger the type-specific exemption rule.

### 2.1 Type-specific functional page checks

These checks feed into existing scoring signals rather than introducing new ones — they sharpen the evidence Phase 1 collected by checking the pages where the post's recommendations land most concretely.

#### FAQ schema on functional pages — `nonprofit`, `mediaBlog`, `community`

Visit the type-specific functional page and re-run the FAQ check:

```javascript
const jsonLd = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
  .map(s => { try { return JSON.parse(s.innerText); } catch(e) { return null; }})
  .filter(Boolean)
  .flatMap(s => Array.isArray(s) ? s : (s['@graph'] || [s]));
const hasFaqSchema = jsonLd.some(s => s['@type'] === 'FAQPage') ||
  !!document.querySelector('[itemscope][itemtype*="schema.org/FAQPage"]');
const visibleFaq = !!document.querySelector('[class*="faq"], [id*="faq"]') ||
  Array.from(document.querySelectorAll('h2, h3')).filter(h => h.innerText.trim().endsWith('?')).length >= 2 ||
  document.querySelectorAll('details').length >= 2;
return { hasFaqSchema, visibleFaq, url: window.location.href };
```

The post's argument: donation, subscribe, and join/membership pages are exactly the pages where AI tools land users with concrete intent-bearing queries ("how do I donate to X?", "how do I subscribe to Y?", "what does a Z membership include?"). FAQ schema on these specific pages is high-leverage.

How the result feeds into scoring:

- **Visible FAQ content present but no FAQ schema** on the functional page → drops `faqSchemaApplied` toward 0.5pt (was on track for 1pt) and creates a `medium`-severity issue with effort `low` and a paste-ready Claude prompt for the FAQ schema.
- **Both visible FAQ and FAQ schema present** → confirms `faqSchemaApplied` at full credit.
- **No FAQ content visible at all** on the functional page → not penalized (the page may genuinely not need FAQ format), but record in `notes` as a missed AEO opportunity since these pages are high-intent.

#### `archivePageQuality` check — `mediaBlog` only

Per the post: *"Category and tag pages need descriptive text — a list of posts alone gives AI nothing to work with."* WordPress archive pages typically emit an empty `<meta name="description">` and zero copy beyond the post list.

This check **does not introduce a new scored signal**. It feeds findings into two existing signals:

1. `passageExtractionQuality` (Content Specificity, 1pt) — an archive page with no descriptive text fails the "could a clean 1–2 sentence summary be pulled from each major section" test, since the archive page IS a major section and yields nothing extractable.
2. `primaryFocusSpecificity` (Entity Clarity, 3pts) — an archive page with no topic-area description weakens the site's overall focus signal for the dominant vertical.

Programmatic check:

```javascript
const h1 = document.querySelector('h1') ? document.querySelector('h1').innerText.trim() : '';
const metaDesc = document.querySelector('meta[name="description"]') ?
  document.querySelector('meta[name="description"]').getAttribute('content').trim() : '';

// Look for descriptive copy NOT inside the post list — typically in
// <header>, <.archive-description>, <.term-description>, or the first
// .entry-content / .page-content block before the list
const descCandidates = Array.from(document.querySelectorAll(
  'header p, .archive-description, .term-description, .category-description, .tag-description, [class*="archive-intro"], [class*="archive-summary"]'
));
const descText = descCandidates.map(el => el.innerText.trim()).filter(t => t.length > 50).join(' ');

// Post list density check — how much of the page is post cards vs descriptive copy
const postListEls = document.querySelectorAll('article, [class*="post-"], [class*="card"]');
const bodyTextLen = document.body.innerText.length;
const descRatio = bodyTextLen > 0 ? (descText.length / bodyTextLen) : 0;

return {
  h1,
  metaDesc,
  metaDescLength: metaDesc.length,
  descriptiveCopyLength: descText.length,
  descriptiveCopySample: descText.slice(0, 200),
  postListCount: postListEls.length,
  descriptiveRatio: Math.round(descRatio * 100) / 100,
  qualityGrade:
    descText.length >= 200 && metaDesc.length >= 80 ? 'good' :
    descText.length >= 80 || metaDesc.length >= 50 ? 'partial' :
    'empty'
};
```

**Grading:**

- **`good`** — 200+ chars of descriptive copy above the post list AND a meta description of 80+ chars. Counts toward `passageExtractionQuality` passing for this section and `primaryFocusSpecificity` for the dominant vertical.
- **`partial`** — Some descriptive copy OR meta description but not both at full quality. Half credit toward the above; record the gap.
- **`empty`** — No descriptive copy beyond the H1 (often just "Category: Climate") and either no meta description or theme-default boilerplate. Drops `passageExtractionQuality` and weakens `primaryFocusSpecificity`; create a `medium`-severity issue with effort `low` and a Claude prompt to write a 2–3 sentence topic description for the archive.

If the site has no archive pages (single-page sites, ecommerce with no editorial section), skip this check and record `"N/A — site has no archive pages."`

### Per-inner-page checks

For each inner page:

1. `browser_navigate` to the URL
2. `browser_evaluate` to inspect schema and meta tags (a site with a SEO plugin like Yoast / RankMath / SEOPress typically emits schema and meta on every page):

```javascript
const jsonLd = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map(s => {
  try { return JSON.parse(s.innerText); } catch(e) { return null; }
}).filter(Boolean);
const personOnPage = jsonLd.some(s => s['@type'] === 'Person' || (Array.isArray(s['@graph']) && s['@graph'].some(g => g['@type'] === 'Person')));
const articleOnPage = jsonLd.some(s => s['@type'] === 'Article' || s['@type'] === 'BlogPosting');
return { jsonLdCount: jsonLd.length, personOnPage, articleOnPage };
```

3. For About / Team pages, run a quick named-person check:

```javascript
const headings = Array.from(document.querySelectorAll('h2, h3, h4')).map(h => h.innerText.trim());
const possibleNames = headings.filter(t => /^[A-Z][a-z]+\s+[A-Z][a-z]+/.test(t)); // crude "First Last" pattern
return { headingsCount: headings.length, namedPeople: possibleNames.slice(0, 10) };
```

4. For blog / news listings, extract dates from the most recent posts:

```javascript
const timeEls = Array.from(document.querySelectorAll('time[datetime]'));
const datedItems = timeEls.map(t => ({ datetime: t.getAttribute('datetime'), text: t.innerText.trim() })).slice(0, 10);
return { datedItems };
```

5. **Canonical URL check** — every inner page should have `<link rel="canonical">` pointing to itself:

```javascript
const c = document.querySelector('link[rel="canonical"]');
return {
  href: c ? c.getAttribute('href') : null,
  selfReferential: c && new URL(c.getAttribute('href'), location.href).pathname === window.location.pathname
};
```

Record per-page results to feed the `canonicalUrls` Phase 1 signal.

6. **Per-page update recency** — on at least one editorial / reference page, run the `contentUpdateRecency` check from Section 1.6 to capture visible "Last updated" stamps and `article:modified_time` meta.

7. **Author byline check** — on at least one article/post/blog page, run the `authorBylines` check from Section 1.5.

8. Record all findings against the relevant signals.

### CMS detection (run once on the homepage)

```javascript
const generator = document.querySelector('meta[name="generator"]');
const yoastBlock = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).some(s => s.innerText.includes('"yoast"') || s.innerText.includes('Yoast'));
const yoastClass = !!document.querySelector('[class*="yoast"]');
const rankMath = !!document.querySelector('meta[name="generator"][content*="Rank Math"]') || document.body.outerHTML.includes('rankmath');
const seopress = document.body.outerHTML.includes('seopress');
const wpContent = !!document.querySelector('link[href*="/wp-content/"]') || !!document.querySelector('script[src*="/wp-content/"]');
const wpJsonApi = document.body.outerHTML.includes('/wp-json/');
return {
  generator: generator ? generator.getAttribute('content') : null,
  yoast: yoastBlock || yoastClass,
  rankMath,
  seopress,
  isWordPress: wpContent || wpJsonApi || (generator && /WordPress/i.test(generator.getAttribute('content') || ''))
};
```

Record the result in `technicalNotes.cmsDetected` (e.g. `"WordPress + Yoast"`, `"WordPress + RankMath"`, `"WordPress (no SEO plugin)"`, `"Headless / unknown"`). This drives the `effort` ratings in Phase 5.

---

## SECTION 3: Content AI Analysis

Extract homepage visible text:

```javascript
return document.body.innerText;
```

Also extract:
- All heading texts: `Array.from(document.querySelectorAll('h1,h2,h3,h4')).map(h => ({ tag: h.tagName, text: h.innerText.trim() }))`
- First paragraph after each H2 (for direct-answer assessment)
- Footer text

Use this content to score the remaining signals.

### 3.1 AEO Readiness — Content (4 signals)

#### Direct answers after headings (max 3pts) — `directAnswers`

For each H2/H3, read the paragraph immediately following it. Count what fraction of those headings are followed by a direct first-sentence answer (not a preamble or build-up).

**Scoring:**
- 70%+ of headings answered directly: 3pts
- 40–69%: 2pts
- 10–39%: 1pt
- Less than 10%, OR content not structured in heading/answer format (no H2s/H3s): 0pts

#### Who / what / who content (max 2pts) — `whoWhatWho`

The question is site-type-agnostic but the framing differs:

| Site type | Three identifiable elements |
|---|---|
| `agency`, `saas` | Who is the business / what do they make or do / who do they serve |
| `mediaBlog` | Who publishes this / what topics are covered / who is the intended reader |
| `ecommerce` | Who is the brand / what category of products / who buys them |
| `education` | Who is the institution / what is taught / who is the student |
| `localBusiness` | Who is the business / what services / what local market |
| `nonprofit` | Who is the organization / what is the mission / who is served |
| `community` | What is this community / what is the focus / who participates |

Can you clearly answer all three from the homepage text alone, within the first scroll?

**Scoring:** 2pts if all three answerable. 1pt if two of three. 0pts if one or fewer.

#### Featured snippet structure (max 2pts) — `featuredSnippetStructure`

Count "extractable" sentences across the homepage: a sentence that defines a term, states a number with context, gives a step, or answers a question — and stands alone without surrounding context. Definition lists, numbered steps, and FAQ answers each count as one.

**Scoring:** 5+ extractable sentences: 2pts. 2–4: 1pt. 0–1: 0pts.

#### Answer capsules (max 2pts) — `answerCapsules`

Distinct from `featuredSnippetStructure`. An answer capsule is a **40–60 word self-contained answer placed directly under an H2 or H3**. This is the specific structural pattern AI engines extract verbatim — 72.4% of ChatGPT-cited pages have one. The capsule must be:

1. Located in the first paragraph or block under the heading (no preamble or transition sentence above it)
2. Between roughly 40 and 60 words
3. Capable of standing alone as a complete answer to the heading's implicit question

Scan the page (homepage plus any visited content pages) for H2/H3 elements and analyze the immediately-following text:

```javascript
const result = [];
document.querySelectorAll('h2, h3').forEach(h => {
  let next = h.nextElementSibling;
  while (next && (next.tagName === 'BR' || next.innerText.trim() === '')) next = next.nextElementSibling;
  if (!next) return;
  const text = next.innerText.trim();
  const firstBlock = text.split(/\n\n+/)[0];
  const wordCount = firstBlock.split(/\s+/).filter(Boolean).length;
  const sentenceCount = firstBlock.split(/[.!?]+\s/).filter(s => s.trim().length).length;
  if (wordCount >= 35 && wordCount <= 70 && sentenceCount <= 4) {
    result.push({ heading: h.innerText.trim().slice(0,80), wordCount, sentenceCount, capsule: firstBlock.slice(0,300) });
  }
});
return { capsuleCount: result.length, examples: result.slice(0,5) };
```

**Scoring:**

- 2pts — 3 or more answer capsules across the analyzed pages.
- 1pt — 1–2 answer capsules.
- 0pts — No qualifying capsules: every H2/H3 either has no text directly under it, has a preamble before the answer, or has text outside the 40–60 word band.

### 3.2 E-E-A-T Signals — Content (4 signals)

#### Author / staff credentials (max 2pts) — `authorCredentials`

Do the named individuals identified in `namedTeamMembers` carry specific, verifiable credentials? "Verifiable" means a fact a third party could check: published works, named past clients/employers, named degrees or institutions, recognized certifications, prior press appearances.

The evidence varies by site type:

| Site type | What counts as verifiable credentials |
|---|---|
| `agency`, `saas`, `localBusiness` | Named past employers, named past clients, recognized certifications, professional licenses |
| `mediaBlog` | Prior bylines at named publications, recognized journalism awards, subject-matter degrees, books authored |
| `ecommerce` | Founder/designer/maker background relevant to the product category (e.g. "20 years woodworking", "former Patagonia designer") |
| `education` | Degrees, peer-reviewed publications, named institutional affiliations |
| `nonprofit` | Board affiliations, prior nonprofit leadership, named expertise areas |
| `community` | Prior community-building / topic-area credentials |

**Scoring:** 2pts if specific verifiable credentials. 1pt if generic "years of experience" / "industry leader" without specifics. 0pts if no credentials.

#### Demonstrated expertise (max 2pts) — `demonstratedExpertise`

Count "specifics" across the homepage and visited pages. A specific is concrete, third-party-verifiable evidence — one of:

- A named methodology, technique, framework, or standard used or cited
- A named past client, partner, or institutional reference
- A specific outcome with a number (% growth, $ raised, N users, response times)
- A named technology, platform, or tool relevant to the site type
- A named primary source for a claim (study, paper, dataset, report)
- A subject-area technical term used correctly in context

**Scoring:** 3+ specifics: 2pts. 1–2 specifics with the rest of the copy claiming expertise without evidence: 1pt. 0 specifics (only generic claims like "award-winning", "expert", "leading"): 0pts.

#### External citations or press (max 2pts) — `externalCitations`

Third-party validation: publications that have cited or covered the site, podcasts the site has appeared on, industry awards with named bodies, conference talks, press mentions, peer recognition.

**Scoring:** 2pts if named external validation present. 1pt if vague "featured in" / "as seen on" without named outlets. 0pts if absent.

#### Named external relationships (max 1pt) — `namedExternalRelationships`

Generalized from "named clients." The check is "are external entities the site relates to named explicitly, not just shown as anonymous logos?" The relevant relationships vary by site type:

| Site type | Named external relationships |
|---|---|
| `agency`, `saas` | Named clients, named partners, named integration vendors |
| `mediaBlog` | Named sources, named cited researchers, named contributors |
| `ecommerce` | Named brands carried, named manufacturers, named retail partners |
| `education` | Named partner institutions, named accreditors, named research collaborators |
| `nonprofit` | Named funders, named partner organizations, named beneficiary communities |
| `localBusiness` | Named suppliers, named professional affiliations, named recurring partner businesses |
| `community` | Named affiliated organizations, named sponsors, named partner communities |

**Scoring:** 1pt if at least one named external relationship appears in copy (not just a logo). 0pts if all relationships are anonymous, generic ("our clients", "our sources"), or logo-only.

### 3.3 Content Freshness — Content (2 signals)

#### Recent featured work (max 1pt) — `recentFeaturedWork`

Generalized from "recent portfolio." The check varies by site type:

| Site type | What counts as recent featured work |
|---|---|
| `agency` | Recent case studies, portfolio pieces, or named recent projects (last 12 months) |
| `ecommerce` | New product launches, new collections, recent restocks featured prominently |
| `mediaBlog` | Recent articles in the dominant vertical, especially editor-featured pieces |
| `saas` | Recent feature releases, changelog entries, customer-spotlight posts |
| `education` | New courses, recent cohort launches, recent research publications |
| `localBusiness` | Recent events, recent menu/service changes, recent local appearances |
| `nonprofit` | Recent campaigns, recent impact reports, recent program launches |
| `community` | Recent featured discussions, recent contributor spotlights, recent events |

**Scoring:** 1pt if recent featured work (last 12 months) is visible. 0pts if work appears dated, references deprecated tools/platforms, or no featured work exists.

#### Current domain references (max 1pt) — `currentDomainReferences`

Generalized from "current tech references." The check is "do the named entities and references in the content reflect what is current in the site's domain?" — deprecated tools, retired standards, stale research, or outdated regulations signal abandonment.

| Site type | What counts as current domain references |
|---|---|
| `agency`, `saas` | Currently-maintained platforms, frameworks, libraries |
| `mediaBlog` | Citations of current research, current regulations, current industry events |
| `ecommerce` | Current product lines, current trends, current designer/maker references |
| `education` | Current curricula, current pedagogical research, current accreditation standards |
| `localBusiness` | Current local references, current professional standards |
| `nonprofit` | Current programs, current policy references, current statistics |
| `community` | Current platform conventions, current topic-area developments |

**Scoring:** 1pt if domain references appear current. 0pts if deprecated/retired/superseded references are cited as current.

### 3.4 Entity Clarity — Content (4 signals)

#### Named entity identifiable in one sentence (max 3pts) — `entityIdentifiable`

Can you write a single sentence identifying this site from the homepage text alone? It must include three elements appropriate to the site type:

| Site type | Required elements |
|---|---|
| `agency`, `saas`, `localBusiness` | Business name + business type + core specialty |
| `mediaBlog` | Publication name + topic area + editorial stance / audience |
| `ecommerce` | Brand name + product category + target buyer |
| `education` | Institution name + program type + student audience |
| `nonprofit` | Organization name + cause area + beneficiary |
| `community` | Community name + topic area + participant type |

Example one-sentence identifications by type:

- agency: "Bolt Studio is a WordPress development agency specialising in WooCommerce for DTC brands."
- mediaBlog: "Stratechery is a strategy publication covering tech business models for senior tech operators."
- ecommerce: "Outdoor Voices is a women-led athletic apparel brand for everyday recreational athletes."
- saas: "Linear is a project management SaaS built for product-led software teams."
- education: "Lambda School is an online coding bootcamp training career-changers in full-stack web development."

**Scoring:** 3pts if a single clear identifying sentence is constructable. 2pts if partially identifiable (2 of 3 elements). 1pt if only 1 element clear. 0pts if cannot identify.

#### Primary focus specificity (max 3pts) — `primaryFocusSpecificity`

Generalized from "service specificity." How specific is the site's primary focus, as stated in the homepage copy?

| Site type | Specificity examples (high / medium / low) |
|---|---|
| `agency` | "WordPress agency for DTC ecommerce brands on Shopify" / "web design and development for small businesses" / "full-service digital agency" |
| `mediaBlog` | "Climate change reporting for policymakers" / "general business news" / "lifestyle blog" |
| `ecommerce` | "Hand-thrown ceramic dinnerware for hospitality buyers" / "kitchen accessories" / "general home goods" |
| `saas` | "Customer feedback dashboards for B2B SaaS product managers" / "feedback management" / "productivity software" |
| `education` | "Online tax-law CLE courses for practicing attorneys" / "professional development courses" / "online learning" |
| `nonprofit` | "Free legal aid for tenants facing eviction in NYC" / "housing rights advocacy" / "social justice" |

**Scoring:** 3pts if highly specific. 2pts if moderately specific. 1pt if generic. 0pts if no clear focus described.

#### Geographic or market clarity (max 1pt)

Is a location, timezone, or market focus stated anywhere on the homepage?

**Scoring:** 1pt if stated. 0pts if absent.

#### Consistent identity signals (max 1pt)

Does the site describe itself consistently across the hero, about section, and footer? Or does the specialty/positioning shift between zones?

**Scoring:** 1pt if consistent across all zones. 0pts if contradictory.

### 3.5 Content Specificity — Content (5 signals)

#### Primary offering detail — what, who, outcome (max 2pts) — `primaryOfferingDetail`

For each primary offering described, can you answer: what is it, who is it for, what outcome does it deliver? The "offering" varies by site type:

| Site type | What counts as a primary offering |
|---|---|
| `agency`, `saas`, `localBusiness` | Each service or product line |
| `ecommerce` | Each product category or collection |
| `mediaBlog` | Each content vertical or beat |
| `education` | Each course, program, or degree track |
| `nonprofit` | Each program, cause area, or initiative |
| `community` | Each major activity or sub-community |

**Scoring:** 2pts if all three (what / who / outcome) answered for most offerings. 1pt if partially answered. 0pts if offerings listed by category label only with no detail.

#### Named specific entities (max 2pts) — `namedSpecificEntities`

Generalized from "named platforms and technologies." Are specific entities relevant to the site's domain named explicitly rather than referred to abstractly?

| Site type | What counts as named specific entities |
|---|---|
| `agency`, `saas` | Platforms, frameworks, libraries (WordPress, React, Stripe, Shopify, AWS) |
| `mediaBlog` | Named publishers cited, named primary sources, named research datasets, named experts quoted |
| `ecommerce` | Named brands carried, named manufacturers, named raw materials or techniques (single-origin Ethiopian Yirgacheffe; Italian leather) |
| `education` | Named accreditors, named frameworks (Common Core, NGSS), named institutional partnerships |
| `nonprofit` | Named partner organizations, named cited reports, named legislation references |
| `localBusiness` | Named suppliers, named professional certifications, named local landmarks |
| `community` | Named upstream/sibling communities, named featured tools |

**Scoring:** 2pts if 2+ named specific entities relevant to the domain. 1pt if 1. 0pts if none (generic abstractions only).

#### Named subject areas (max 1pt) — `namedSubjectAreas`

Generalized from "named industries." Are the site's subject areas named specifically?

| Site type | What counts as named subject areas |
|---|---|
| `agency` | Industries served (DTC ecommerce, healthcare, fintech, climate tech) |
| `mediaBlog` | Topic verticals or beats (geopolitics, indie publishing, electric vehicles) |
| `ecommerce` | Product categories (women's outerwear, kitchen knives, indoor plants) |
| `saas` | ICP roles or verticals (product managers, restaurant operators, B2B SaaS sales teams) |
| `education` | Fields of study or specializations (data science, environmental policy, early childhood ed) |
| `nonprofit` | Program areas (eviction defense, food security, watershed restoration) |
| `localBusiness` | Service specialties (italian cuisine, sports medicine, residential plumbing) |
| `community` | Topic focus (mechanical keyboards, woodworking, climate policy) |

**Scoring:** 1pt if specific subject areas named. 0pts if generic ("businesses", "people", "everyone").

#### Specific outcomes (max 1pt) — `specificOutcomes`

Generalized from "client wins with numbers." Are quantified results or named achievements present?

| Site type | What counts as specific outcomes |
|---|---|
| `agency`, `saas` | Named client wins with metrics (3× conversion lift, 40% cost reduction, $2M raised) |
| `mediaBlog` | Cited statistics in articles, original research findings with numbers, primary-source quoted figures |
| `ecommerce` | Named reviewed metrics (4.8★ from 12K reviews, 96% recommend), return-rate transparency |
| `education` | Named outcomes (graduate placement rate %, mean salary, named alumni) |
| `nonprofit` | Named impact metrics (N families served, $ delivered, % of donations reaching programs) |
| `localBusiness` | Named tenure metrics (servicing X area since YYYY, named reviewed ratings) |
| `community` | Named member/contributor counts, named published outputs |

**Scoring:** 1pt if specific quantified outcomes or named achievements. 0pts if vague claims only ("we get results", "great quality", "trusted").

#### Passage extraction quality (max 1pt) — `passageExtractionQuality`

Could a clean, accurate 1–2 sentence summary be pulled from each major section without needing surrounding context?

**Scoring:** 1pt if most sections yield clean extractable summaries. 0pts if sections require surrounding context to make sense.

### 3.6 llms.txt content quality (max 0.5pts)

If llms.txt was found in 1.8, evaluate the recorded content:

- Does it accurately describe the site name, type, and specialty?
- Does it mention specific services, target audiences, or platforms?
- Is it specific or generic boilerplate?

**Scoring:** 0.5pts if specific and accurate. 0pts if vague boilerplate.

---

## SECTION 4: Scoring & Verification

1. Map all findings from Sections 1–3 to the rubric in `references/scoring-rubric.md`.
2. Calculate a score for each signal.
3. Sum to criterion totals. Verify each criterion total matches the rubric max (20, 18, 16, 14, 12, 10, 7, 3).
4. Sum criteria to a final AEO score out of 100.
5. Assign threshold label:

| Score | Status |
|---|---|
| 80 – 100 | strong |
| 50 – 79 | needs-work |
| 0 – 49 | at-risk |

---

## MANDATORY PRE-REPORT CHECKLIST

Complete all items before generating the JSON report.

- [ ] Phase 0 site type detection completed, `siteType`, `siteTypeConfidence`, `siteTypeRationale` recorded
- [ ] Phase 0.4 schema relevance scan completed, `applicableSchemas` recorded in `technicalNotes`
- [ ] Playwright launched and homepage loaded at desktop viewport (1920×1080)
- [ ] Desktop screenshot saved to `reports/screenshots/homepage-aeo-desktop.png`
- [ ] robots.txt fetched and analyzed with the training-vs-retrieval split
- [ ] sitemap.xml fetched and analyzed for lastmod dates
- [ ] llms.txt and llms-full.txt fetches attempted and results recorded
- [ ] Canonical URL checked on homepage and at least 2 inner pages
- [ ] No-JS reachability check completed
- [ ] At least 4 pages visited (homepage + 3 type-appropriate inner pages) and recorded in `visitedPages`
- [ ] Per-page `contentUpdateRecency` check run on at least one editorial / reference page (or N/A exemption applied per site type)
- [ ] Per-page `authorBylines` check run on at least one article / post page (or N/A exemption applied per site type)
- [ ] CMS detection completed and recorded in `technicalNotes.cmsDetected`
- [ ] All Section 1 programmatic checks completed
- [ ] All Section 2 inner-page checks completed
- [ ] All Section 3 content checks completed
- [ ] All 49 signals scored across 8 criteria
- [ ] Criterion subtotals verified to match signal sums and rubric maximums
- [ ] Final score calculated (sum of all 8 criterion subtotals, max 100)
- [ ] Threshold label assigned (strong / needs-work / at-risk)
- [ ] **Every below-max signal has a corresponding entry in `issues.critical|high|medium|low[]`**
- [ ] Actionable Claude prompt written for every signal scoring below maximum
- [ ] Every issue object includes an `effort` field (`low` / `medium` / `high` / `unknown`)

**If any item above is unchecked, do NOT generate the report. Return to the relevant section and complete it.**

---

## SECTION 5: Report Generation

### File location

Save the report to `reports/data/qa-report-aeo.json`. This is the fixed filename the kosh report generator and merge script expect.

### Top-level structure

The full structure is defined in `schemas/qa-report-aeo-schema.json`. Use canonical signal keys from `references/signal-keys.md` — do not invent variants (`robotsAndCrawlerAccess`, not `robotsTxt`; `noNoindex`, not `noindex`).

Each criterion follows `{score, maxScore, signals: {key: {score, maxScore, notes}, ...}}`.

Minimal top-level shape:

```json
{
  "url": "https://example.com",
  "websiteName": "Example",
  "timestamp": "ISO-8601",
  "mode": "aeo",
  "aeoRubricVersion": "1.0",
  "siteType": "mediaBlog",
  "siteTypeConfidence": "high",
  "siteTypeRationale": "BlogPosting JSON-LD on 3 of 5 sampled pages; /blog/ route with 40+ dated entries.",
  "applicableSchemas": {
    "Person": "medium",
    "Article": "high",
    "Organization": "high",
    "LocalBusiness": "absent",
    "Event": "high",
    "FAQPage": "high",
    "HowTo": "medium",
    "Product": "absent",
    "Course": "absent",
    "Recipe": "absent",
    "Review": "absent"
  },
  "environment": "production",
  "score": 0,
  "threshold": "strong|needs-work|at-risk",
  "visitedPages": [
    "https://example.com/",
    "https://example.com/about/",
    "https://example.com/category/climate/",
    "https://example.com/articles/recent-piece/"
  ],
  "criteria": { /* 8 criterion blocks per schema, 49 signals total */ },
  "issues": {
    "critical": [
      {
        "criterion": "structuredData",
        "signal": "organizationSchema",
        "issue": "One sentence describing the specific gap found on this site.",
        "impact": "One sentence explaining the consequence for AI discoverability or citation.",
        "effort": "medium"
      }
    ],
    "high": [],
    "medium": [],
    "low": []
  },
  "actionablePrompts": [ /* one entry per below-max signal */ ],
  "technicalNotes": {
    "robotsTxt": "Allowed: OAI-SearchBot, ChatGPT-User, Claude-User, PerplexityBot. Blocked: GPTBot, ClaudeBot, Google-Extended, CCBot — modern training/retrieval split.",
    "sitemapUrl": "https://example.com/sitemap_index.xml",
    "llmsTxtFound": false,
    "llmsFullTxtFound": false,
    "javascriptRequired": false,
    "httpsActive": true,
    "mixedContentCount": 0,
    "cmsDetected": "WordPress + Yoast"
  }
}
```

### Issue severity guide

- **critical** — Signal scores 0 where maximum is 3pts or more. Blocking AI discoverability or citation.
- **high** — Signal scores 0 or 1 where maximum is 2pts. Significantly weakens AI understanding or trust signals.
- **medium** — Signal scores below maximum but not zero. Improvement opportunity.
- **low** — Minor gap. Worth noting but low priority.

### Issue effort guide

Every issue must include an `effort` field. Use this two-step process:

**Step 1 — assign the signal-type baseline:**

| Effort | Meaning | Typical AEO examples |
|---|---|---|
| `low` | Content edit or simple config. No developer required. Under 1 hour. | Create llms.txt, update copyright year, add social profile links, add geographic location to copy |
| `medium` | Requires a developer, plugin, or significant content creation. Hours to a day. | Add Organization or Service JSON-LD schema, add FAQ schema to existing FAQ, write question-framed headings, add date stamps |
| `high` | Requires design or development work, refactoring, or substantial new content. Days or more. | Fix JS-only rendering, build a blog or news section from scratch, create case studies with named outcomes |
| `unknown` | Stack context insufficient to assess. Use sparingly. | |

**Step 2 — adjust based on observed CMS context:**

- WordPress + Yoast / RankMath / SEOPress detected: schema additions and most meta-tag changes drop from `medium` to `low` (one-field edits in the SEO plugin panel). Record `effortRationale: "WordPress + Yoast detected — one-field edit in the SEO panel."`
- WordPress core only (no SEO plugin): schema changes stay `medium` (requires plugin install or theme code edit).
- Headless WordPress / Next.js / custom React: structural changes stay `medium` or rise to `high`. Note in `effortRationale`.
- llms.txt: always `low` regardless of stack — it's a plain text file at the domain root.
- Partial completion (e.g. Organization schema present but missing `sameAs`): effort to complete is lower than building from scratch.

Only write `effortRationale` when site context meaningfully changes the baseline.

**Example issue object:**
```json
{
  "criterion": "structuredData",
  "signal": "organizationSchema",
  "issue": "No Organization schema present.",
  "impact": "AI tools cannot reliably identify the site as a named entity, reducing citation likelihood.",
  "effort": "low",
  "effortRationale": "WordPress + Yoast detected — Organization schema can be configured in the Yoast SEO Settings panel.",
  "pages": ["https://example.com/"]
}
```

### Actionable prompt guide

Every signal scoring below maximum must have an entry in `actionablePrompts`. Each prompt must:

1. Describe the specific issue found on this site (not a generic description)
2. Explain the impact on AI discoverability or citation in one sentence
3. Provide a ready-to-use Claude prompt the site owner can paste directly into Claude

The `prompt` field conventions:

- **Open with the imperative** ("Write…", "Generate…", "Emit…", "Audit…"). No identity preamble.
- **Include only context Claude needs.** Site type, named services or platforms, audience, language, existing `@id` if any.
- **Reference actual content from the site** — service names, FAQ questions, copyright year — so Claude grounds output in real content, not placeholders.
- **Specify output format up front:** JSON-LD schema type, single block vs `@graph`, character limits, code pattern shape.
- **State language only when not English.**
- **No filler.** Skip "Help me", "Can you", "Please".
- **`llms.txt` is always lowercase**, even at sentence start.

Example — ❌ "I'm Maple Creative, a Toronto branding agency. My homepage has no Organization schema. Write me one."

Example — ✅ "Write a complete JSON-LD Organization schema block for a Toronto branding agency homepage `<head>`. Include name, url, logo, description, and sameAs links for LinkedIn and Twitter. Output a single `<script type=\"application/ld+json\">` block."

### Generate the Markdown report

Once `reports/data/qa-report-aeo.json` is saved, run:

```bash
node scripts/generate-aeo-report.js reports/data/qa-report-aeo.json
```

The script writes a Markdown report to `reports/` and prints the output path.

### Terminal summary

After saving the JSON and running the report script, print a brief summary:

```
Kosh AEO Analysis — [Website Name]
URL: [URL]
Environment: [environment]
Score: [X]/100 ([threshold label])

Top issues:
- [Top 3 issues by severity and points impact]

Full report saved to:
  JSON:     reports/data/qa-report-aeo.json
  Markdown: reports/[SITENAME]_AEO_QA_REPORT_[YYYY-MM-DD].md
```

---

## WordPress-Specific Patterns

When you detect WordPress (look for `/wp-content/`, `/wp-json/`, `meta[name="generator"]` with WordPress, or admin bar markup), these patterns are common:

- **Yoast SEO** — emits `@graph`-wrapped JSON-LD with Organization, WebSite, WebPage, and BreadcrumbList by default. Check whether Organization fields (logo, sameAs) are populated in the Yoast settings — empty fields are a common failure mode.
- **RankMath** — similar coverage to Yoast, with FAQ block schema available in the editor. Check whether FAQ blocks were used on FAQ pages.
- **SEOPress** — narrower default schema coverage; Organization usually present, FAQ usually not.
- **All in One SEO** — Organization + WebPage; check explicitly because some sites disable schema output.
- **Site Kit / Google plugins** — do not emit schema, but may emit additional meta. Don't mistake meta tags for schema markup.
- **Yoast and RankMath both emit `/sitemap_index.xml`** rather than a flat `/sitemap.xml`. If `/sitemap.xml` 404s, follow the `Sitemap:` line in robots.txt.
- **WooCommerce sites** typically have Product schema on product pages but not on the homepage. AEO scoring is on the homepage — a WooCommerce site with no Service or Organization schema on the homepage still loses points even if product schema is plentiful elsewhere.
- **The WordPress comments JSON-LD block** (`@type: "Comment"`) does not count toward Service / Organization / FAQ tallies.
- **REST API exposure (`/wp-json/`)** is a separate signal not in the rubric, but record its presence in `technicalNotes.cmsDetected` — it affects effort estimates for some fixes.
- **llms.txt** — there is no widely adopted WordPress plugin for llms.txt as of this rubric version. Effort to create it is always `low` (paste a text file into the WordPress root via SFTP or use a "raw file" plugin), but it does require server access.

---

## AEO Testing Notes

### Why homepage-anchored, multi-page scoring?

The rubric is anchored to the homepage as the primary scoring target, with Phase 2 inner-page checks providing **confirmation and evidence-gathering** for signals that don't always show fully on the homepage. The homepage anchor matters because AI tools tend to treat the homepage as the canonical entity-defining page when synthesizing a one-paragraph answer about a site.

Several signals (canonical URLs, contentUpdateRecency, authorBylines) genuinely require multi-page evidence and are scored against the inner-page findings. The site-type detection from Phase 0 determines which inner pages are most useful to visit.

### What passes vs. fails AEO testing

**Passes:** Schema present and complete on the homepage, robots.txt allows AI crawlers, sitemap is fresh, content can be parsed by AI without JS, headings answer questions directly, entities (business name, service, audience) are unambiguous in the first scroll.

**Fails:** Missing or malformed schema, robots.txt blocking AI crawlers, no sitemap, content requires JS to render, dense paragraph copy with no extractable sentences, no named team or external validation, generic positioning ("full-service digital agency"), no llms.txt.

### Edge cases

- **Single-page sites** — score Phase 2 inner-page signals based on the same homepage, noting in `notes` that no separate inner pages exist. Cap `visitedPages` at the homepage URL only and record the constraint in `technicalNotes`.
- **Sites behind a paywall or login** — score what's accessible. Note in `technicalNotes` that crawler-accessible content is limited.
- **Sites with locale routing** — score the locale you landed on. If a `hreflang` is present and the English version is reachable, prefer it.
- **Sites with cookie/consent walls that block content** — score the post-consent state. Accept consent in the browser session before scoring.
