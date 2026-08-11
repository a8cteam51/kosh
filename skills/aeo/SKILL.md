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
- ✅ You MUST visit **at least 4–6 pages**: the homepage is the primary evaluation target; inner pages provide evidence for E-E-A-T, freshness, and AEO readiness checks
- ✅ You MUST take a desktop screenshot (1920×1080) of the homepage for visual E-E-A-T confirmation
- ✅ You MUST complete all five phases before generating the JSON report
- ✅ You MUST evaluate every signal to one of `pass` / `partial` / `fail` / `na`. Do not skip signals or leave status blank
- ✅ You MUST include an actionable Claude prompt for every signal at status `fail` or `partial`
- ✅ You MUST include an `effort` field on every issue object. Valid values: `low`, `medium`, `high`, `unknown`. Do not omit it
- ✅ You MUST save the final report to `reports/data/qa-report-aeo.json`
- ✅ You MUST only refer to the site being analyzed by the name found on the site at the provided URL. Never use names from prior analyses in this session. If unsure of the site name, derive it from the homepage `<title>`, `og:site_name`, or the WordPress site title in the header

If you cannot perform these actions, explicitly state that the Playwright MCP is not available and cannot proceed.

---

## Standards Reference

**The rubric in this skill is the standard.** Eight criteria, 49 signals, each evaluated to one of `pass` / `partial` / `fail` / `na`. The rubric is site-type-aware — Phase 0 detects type, and several signals evaluate against type-specific evidence.

## How signals are evaluated

Every signal in this skill is assigned one of four status values. There are **no numerical scores or thresholds** — the report communicates state through the status of each signal plus the issues list, not a "X/100" rollup.

| Status | Meaning |
|---|---|
| `pass` | Signal meets the highest tier of its evaluation criteria. The thing the rubric is checking for is present and well-formed. |
| `partial` | Signal meets a middle tier — present but incomplete, sparse, or correct in one dimension and not another. |
| `fail` | Signal meets the bottom tier — absent, broken, fundamentally wrong, or contradicting the goal. |
| `na` | Signal does not apply to this site. Used sparingly — see per-signal N/A guidance. Record rationale in `notes`. |

Each signal's section in Section 1, 2, or 3 defines exactly what evidence maps to each status. The `references/evaluation-rubric.md` reference file is the quick-lookup index.

After Phase 4 evaluation, every signal at status `fail` or `partial` produces:
- An entry in the appropriate severity bucket of `issues` (see "Issue severity guide" in Phase 5)
- An entry in `actionablePrompts` with a paste-ready Claude prompt

The top-level `summary` block carries the counts: `{ totalSignals: 49, pass, partial, fail, na }`. The full rubric and signal definitions live in:

- `skills/aeo/references/evaluation-rubric.md` — per-criterion signal list with pass/partial/fail tier definitions
- `skills/aeo/references/signal-keys.md` — canonical signal keys for the JSON report
- `skills/aeo/references/wp-seo-capabilities.md` — what WordPress core and Jetpack emit natively per signal; drives native-first fix recommendations and carries the `lastVerified` date for the staleness check

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
- ✅ Evaluate every signal in Phase 4 (49 signals across 8 criteria) to pass / partial / fail / na
- ✅ Write an actionable Claude prompt for every below-max signal

**If you skip any of these steps, the test is incomplete and will not be accepted.**

---

## Reachability Gate Check — MANDATORY before any testing

Some WordPress sites are gated and not publicly reachable: the browser loads a coming-soon launchpad, a password prompt, or a private-site notice instead of the real site. Testing the gate produces an empty or misleading report. **After the first navigation to the homepage, before any other Phase 0 or Phase 1 step, run this check.**

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

### Phase 0: Site Type Detection + Schema Relevance Scan
1. Launch browser at desktop (1920×1080), navigate to homepage
2. Detect the site type (agency / ecommerce / mediaBlog / saas / education / localBusiness / nonprofit / community / other) — drives content-quality signals
3. Run the schema relevance scan (Section 0.4) — drives schema evaluation independently of siteType
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

### Phase 4: Evaluation
14. Map every finding to the rubric; assign each signal a status (pass / partial / fail / na); count totals into the summary block

### Phase 5: Reporting
15. Generate `reports/data/qa-report-aeo.json` matching `schemas/qa-report-aeo-schema.json`
16. Run the report generation script

---

## SECTION 0: Site Type Detection

The rubric evaluates 49 signals that apply to any website, but several signals — `whoWhatWho`, `primaryFocusSpecificity`, `primaryOfferingDetail`, `namedSpecificEntities`, `namedSubjectAreas`, `recentFeaturedWork` — are assessed against type-specific evidence, and schema signals (`primaryEntitySchema`, `relevantSchemasApplied`) are assessed against content relevance detected in Section 0.4 rather than the siteType label. Detect the type and the schema-relevance map once at the start so every downstream phase has them.

### 0.1 Quick detection signals

`browser_navigate` to the homepage, then `browser_evaluate`:

```javascript
// JSON-LD types
const jsonLd = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
  .map(s => { try { return JSON.parse(s.innerText); } catch(e) { return null; }})
  .filter(Boolean)
  .flatMap(s => Array.isArray(s) ? s : (s['@graph'] || [s]));
// Flatten array `@type` values (e.g. Yoast's `@type: ['Person','Organization']`)
// so the resulting Set contains strings, not nested arrays — matches Phase 0.4.
const jsonLdTypes = new Set(jsonLd.map(s => s['@type']).filter(Boolean).flat());

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

The decision tree below treats `schemaTypes` as a format-agnostic union — sites using microdata or RDFa are detected the same as JSON-LD sites for typing purposes. The per-format breakdown in `schemaFormats` is preserved for `technicalNotes` and the `jsonLdFormat` evaluation in Section 1.3.

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

The site type changes what evidence counts for these **content-quality** signals — the evaluation criteria and the underlying question stay constant. Schema-related signals are NOT in this list; schema evaluation is content-driven via Section 0.4, not siteType-driven.

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

Schema evaluation is content-driven, not siteType-driven. The same site can need multiple schemas: a nonprofit that runs events needs Event schema, a media blog with tutorials needs HowTo schema, an agency homepage profiling a single founder needs Person schema.

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

// FAQ — real FAQ structures, plus a weaker "de facto FAQ" signal (also fed by
// existing faqSectionPresent in 1.4).
// NOTE: a single question-style heading does NOT establish FAQ relevance. A CTA like
// "Questions?" or "Ready to get involved?" ends in "?" but is not an FAQ. Requiring a
// genuine FAQ marker prevents manufacturing a phantom FAQ requirement on sites that
// have no FAQ. Genuine markers: an FAQ container, an explicit "frequently asked /
// common questions" heading, or an accordion (2+ <details>).
const hasFaqContainer = !!document.querySelector('[class*="faq"], [id*="faq"]');
const hasFaqHeading = Array.from(document.querySelectorAll('h2, h3'))
  .some(h => /frequently asked|common questions|\bfaqs?\b/i.test(h.innerText.trim()));
const hasFaqAccordion = document.querySelectorAll('details').length >= 2;
const hasFaqMarkers = hasFaqContainer || hasFaqHeading || hasFaqAccordion;
// Weaker signal: a cluster of 3+ question-framed H2/H3 headings, each immediately
// followed by answer-like body text, looks like a genuine FAQ built without any of the
// markers above (no faq class/id, no "FAQ" heading, fewer than 2 <details>). Requiring
// answer text after the heading is what separates a real Q&A pattern from scattered
// CTA headings ("Ready to get started?", "Questions?") that just end in "?" with no
// answer underneath — a single one of those is still just a CTA, not an FAQ signal.
const answeredQuestionHeadings = Array.from(document.querySelectorAll('h2, h3'))
  .filter(h => h.innerText.trim().endsWith('?'))
  .filter(h => {
    const next = h.nextElementSibling;
    return !!next && /^(P|DIV|UL|OL)$/.test(next.tagName) && next.innerText.trim().length > 20;
  });
const hasQuestionHeadingCluster = answeredQuestionHeadings.length >= 3;
const faqRelevance = hasFaqMarkers ? 'high' : hasQuestionHeadingCluster ? 'medium' : 'absent';

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

- **`primaryEntitySchema`** (Section 1.3) — the dominant schema type for this site is the one with the most prominent relevance signal. Evaluate against its presence and completeness.
- **`relevantSchemasApplied`** (Section 1.3) — coverage ratio across every schema with relevance `high` or `medium`.

> Note: `Organization` is always `high`, but it's evaluated under its own standalone signal (`organizationSchema`) — not double-counted in `primaryEntitySchema` or `relevantSchemasApplied`. Similarly, `FAQPage` and `Review` have their own standalone signals and aren't double-counted.

> **`faqRelevance` is cross-page, not homepage-only — and schema presence must travel with it.** This snippet runs on the homepage first, but Section 1.4 explicitly re-runs the equivalent FAQ check on `/faq` / `/faqs` inner pages when the homepage has no FAQ. If that inner-page check finds a real FAQ (`faqSectionFound: true`) or a de facto one (`answeredQuestionHeadingCount ≥ 3`), update `faqRelevance` to the strongest value observed across all pages checked (`high` > `medium` > `absent`) before it feeds `applicableSchemas.FAQPage`, `faqSchema`, and `faqSchemaApplied`. (Not `relevantSchemasApplied` — `FAQPage` is deliberately excluded from that coverage ratio via `STANDALONE_SIGNALS`, so it isn't a consumer here.) Without this, a dedicated FAQ page that never got marked up would score `faqSectionPresent: partial` (correctly flagging the gap) while `faqSchema`/`faqSchemaApplied` simultaneously report `na` ("no FAQ content on the site") for the same site — the two disagreeing about whether the site has an FAQ at all.
>
> Relevance moving cross-page is only half the fix: also re-run FAQ-schema detection on whichever page raised `faqRelevance`. The homepage-only `microdataFaq` snippet above only checks microdata — it never parses `<script type="application/ld+json">`, so it isn't a complete, portable per-page check on its own. Use the same self-contained pattern as the Section 2.1 functional-page check instead (parse `script[type="application/ld+json"]` for `@type: "FAQPage"`, OR the microdata selector), and carry forward the strongest observation across all pages checked: valid JSON-LD FAQPage with 2+ Q&A pairs > microdata-only or malformed JSON-LD > no schema at all. Otherwise a site with a correctly schema-marked-up `/faq` page reads `faqRelevance: 'high'` from that page while the schema lookup — left homepage-only, and JSON-LD-blind even there — sees nothing, producing a false `fail` (`critical`, per the Structured Data severity rule) against a site that did the work correctly.

---

## SECTION 1: Initial Setup & Homepage Programmatic Analysis

### 1.1 Browser Setup

- The browser is already at the homepage from Phase 0
- Confirm desktop viewport (1920×1080) via `browser_resize` if needed
- `browser_take_screenshot` with `filename: "reports/screenshots/homepage-aeo-desktop.png"` (full page). Pass the full `reports/screenshots/...` path as `filename`; a bare filename saves to the project root, so do NOT pass a bare name and move the file afterward.

### 1.2 Technical Health

#### robots.txt and AI crawler access — training-vs-retrieval aware

`browser_navigate` to `[baseURL]/robots.txt`. Capture the body text. Then `browser_navigate` back to the homepage.

The 2026 consensus posture is **block training scrapers, allow live-retrieval bots**. Evaluate against the live-retrieval allowlist; treat training blocks as neutral (intentional, not a failure).

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

**Evaluation:**

- `pass` — All live-retrieval bots above are allowed (or no explicit `Disallow` blocks them under `User-agent: *` or named user-agents). Training scrapers may be allowed or blocked — no penalty either way.
- `partial` — One live-retrieval bot is blocked (e.g. a stale rule blocks `PerplexityBot`) but the rest are fine.
- `fail` — Multiple live-retrieval bots blocked, OR a blanket `Disallow: /` under `User-agent: *` blocks everything, OR robots.txt is absent, OR present but severely misconfigured (broken syntax, redirects).

> **Do NOT penalize** blocking `GPTBot`, `ClaudeBot`, `Google-Extended`, `CCBot`. These are training scrapers, not retrieval bots, and blocking them does not affect citation visibility. If the site blocks training but allows retrieval, record this in `notes` as `"Training scrapers blocked, retrieval bots allowed — modern 2026 posture."`
>
> Environment note: on `local` / `development`, treat any robots.txt config as neutral — record `pass` with a note about the environment. On `staging`, a blanket Disallow is expected and not a finding — record `pass`.

#### No noindex on homepage

```javascript
const robotsMeta = document.querySelector('meta[name="robots"]');
const content = robotsMeta ? robotsMeta.getAttribute('content').toLowerCase() : '';
return {
  metaRobots: content || null,
  hasNoindex: content.includes('noindex'),
  hasNofollow: content.includes('nofollow')
};
```

**Evaluation:**
- `pass` — No noindex on the homepage.
- `fail` — A noindex meta tag is present on the homepage.

> Environment note: on `local` or `development`, noindex is correct and not a finding. Record status as `pass` with a note about the environment in `technicalNotes`. On `staging`, noindex is expected — record `pass` but flag as a reminder if the staging URL was provided for AEO review.

#### HTTPS and mixed content

```javascript
const isHTTPS = window.location.protocol === 'https:';
const mixedContent = Array.from(document.querySelectorAll('img[src^="http:"], script[src^="http:"], link[href^="http:"]'));
return {
  https: isHTTPS,
  mixedContentCount: mixedContent.length,
  examples: mixedContent.slice(0,3).map(el => el.src || el.href)
};
```

**Evaluation:**
- `pass` — HTTPS active and no mixed content.
- `partial` — HTTPS but mixed content (HTTP-served images, scripts, or stylesheets) present.
- `fail` — HTTP only.

#### Sitemap with valid lastmod dates

`browser_navigate` to `[baseURL]/sitemap.xml`. If 404, check robots.txt for a `Sitemap:` directive and navigate there. (Yoast and RankMath typically emit `/sitemap_index.xml`; follow the first child sitemap.) Capture the first ~3000 characters.

Parse for valid XML, presence of `<lastmod>` entries, and whether any are within the last 90 days.

**Evaluation:**
- `pass` — Sitemap present with recent lastmod entries (within 90 days).
- `partial` — Sitemap present but without `<lastmod>` entries, OR all dates stale (over 1 year old).
- `fail` — Sitemap absent.

#### Core content accessible without JavaScript

Open a new browser context with JavaScript disabled, navigate to the homepage, and check whether the H1 and substantial body copy are visible in the static HTML.

```javascript
const h1 = document.querySelector('h1');
return {
  h1Present: !!h1,
  h1Text: h1 ? h1.innerText.trim() : null,
  bodyTextLength: document.body.innerText.trim().length
};
```

Save a screenshot by passing `filename: "reports/screenshots/homepage-no-js.png"` to `browser_take_screenshot` (a bare filename saves to the project root — pass the full path, don't move the file afterward). Close the no-JS context and resume the normal session.

**Evaluation:**
- `pass` — H1 and 500+ chars of body copy visible without JS.
- `partial` — Some content visible but significantly degraded.
- `fail` — Page is blank or nearly empty without JS.

> WordPress note: standard themes render server-side and pass this check easily. Headless WordPress with a Next.js frontend may fail; record the framework in `technicalNotes.cmsDetected`.

#### Canonical URLs

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

**Evaluation:**

- `pass` — Homepage has `<link rel="canonical">` AND at least 2 inner pages have self-referential canonical tags (the canonical points to the page itself, not somewhere else).
- `partial` — Homepage canonical present but inner pages missing canonical, OR canonical present everywhere but points to the wrong URL on some pages (common Yoast/RankMath misconfiguration).
- `fail` — No canonical tag on the homepage.

> WordPress note: Yoast and RankMath emit self-referential canonicals automatically — most WordPress sites pass this signal. SPAs and headless implementations frequently miss it; flag in `effortRationale`.

### 1.3 Structured Data

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

#### Organization schema

Check JSON-LD for `@type: "Organization"` or `@type: "LocalBusiness"`. If present, verify: `name`, `url`, `logo`, `description`, `sameAs`. Also check microdata:

```javascript
const microdataOrg = document.querySelector('[itemscope][itemtype*="schema.org/Organization"], [itemscope][itemtype*="schema.org/LocalBusiness"]');
return { microdataOrg: !!microdataOrg };
```

**Evaluation:**
- `pass` — JSON-LD Organization present with name, url, logo, and at least one sameAs.
- `partial` — JSON-LD present but sparse (key fields missing), OR microdata-only (no JSON-LD).
- `fail` — Absent.

#### Primary entity schema — content-driven

The "primary entity" for a site is the **dominant content type** identified in Section 0.4's relevance scan — not a lookup by siteType. A site's primary entity is whichever schema has the strongest relevance signal among the type-defining schemas (Person, Article, Product, Event, HowTo, LocalBusiness, Course, Recipe, SoftwareApplication). Organization, FAQPage, and Review are evaluated separately and don't compete for the "primary" slot.

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

**Evaluation:**

- `pass` — JSON-LD primary entity schema present, type matches `expectedPrimary` from the relevance scan, AND the required fields for that type are populated.
- `partial` — JSON-LD present with the correct type but sparse (key required fields missing), OR microdata / RDFa-only (with or without all required fields).
- `fail` — No schema matches the expected primary type for this site's content.

> Edge case — no high-relevance primary candidate detected: if Section 0.4 finds no primary schema with `high` relevance (e.g. a pure portfolio site with no Articles, Events, Products, or HowTos), Organization schema becomes the de facto primary entity for evaluation purposes. Record `pass` if Organization is well-formed; otherwise evaluate against the highest-relevance candidate even if it's `medium`. Record the determination in `notes`.
>
> Edge case — ecommerce: Product schema typically lives on PDPs, not the homepage. If `Product` is the expected primary type, sample at least one product page during Phase 2 and evaluate the combined evidence — homepage `Store` / `OfferCatalog` plus PDP Product schema together can satisfy `pass`.

#### Relevant schemas applied — `relevantSchemasApplied`

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

// Compare against the relevance map from 0.4. Organization, FAQPage, and Review each
// have their own standalone signal (organizationSchema, faqSchema, reviewSchema) and are
// excluded here so they aren't double-counted in this coverage ratio too (see the note
// at the end of Section 0.4).
const relevance = /* applicableSchemas from 0.4 */;
const STANDALONE_SIGNALS = ['Organization', 'FAQPage', 'Review'];
const inScope = Object.entries(relevance).filter(([k, v]) => (v === 'high' || v === 'medium') && !STANDALONE_SIGNALS.includes(k));
const matched = inScope.filter(([k, v]) => allPresentTypes.has(k) ||
  // BlogPosting and NewsArticle satisfy Article relevance; Article satisfies BlogPosting relevance
  (k === 'Article' && (allPresentTypes.has('BlogPosting') || allPresentTypes.has('NewsArticle'))) ||
  // Specific LocalBusiness subtypes satisfy LocalBusiness relevance
  (k === 'LocalBusiness' && [...allPresentTypes].some(t => /Restaurant|Dentist|Plumber|MedicalBusiness|Store|HomeAndConstructionBusiness/.test(t)))
);

const coverage = inScope.length === 0 ? null : matched.length / inScope.length;
return { inScopeCount: inScope.length, matchedCount: matched.length, coveragePercent: coverage === null ? null : Math.round(coverage * 100), gaps: inScope.filter(x => !matched.includes(x)).map(([k]) => k) };
```

**Evaluation:**

- `pass` — Coverage ≥ 90% (every high/medium-relevance schema is backed by matching markup; or only one minor gap on a `medium`-relevance schema).
- `partial` — Coverage 30–89% (some relevant schemas present but significant gaps remain; the dominant primary schema may be present but secondary schemas are missing).
- `fail` — `inScopeCount` > 0 AND (coverage < 30%, OR no schemas of any kind present).

> `inScopeCount: 0` (`coveragePercent: null`) — record `na`, with `notes` as `"N/A — no content patterns matched any schema-eligible type beyond Organization/FAQPage/Review, which are excluded from this ratio (they have their own standalone signals)."` This is now an expected outcome, not a rare edge case — Organization no longer keeps `inScope` non-empty by default, so any site whose only high/medium-relevance types are Organization, FAQPage, and/or Review (no blog listing, address+hours, shop, ordered steps, etc.) lands here. Never score this state as `pass` or `fail`; requiring `inScopeCount` > 0 in the `fail` bullet above makes `na` the only reachable status when `coveragePercent` is `null`, even if the site also has zero structured data of any kind.
>
> Record the specific gap list in `notes` — e.g. `"Coverage 60% — gaps: Event (annual conference visible on homepage), HowTo (3 tutorial pages observed)."` Each gap also produces an entry in `actionablePrompts` with a paste-ready Claude prompt to generate the missing schema.

#### FAQ schema

JSON-LD `@type: "FAQPage"` with `mainEntity` containing Q&A pairs. Microdata check:

```javascript
const microdataFaq = document.querySelector('[itemscope][itemtype*="schema.org/FAQPage"], [itemscope][itemtype*="schema.org/Question"]');
return { microdataFaq: !!microdataFaq };
```

**Evaluation:**

FAQ schema only applies when the site actually has FAQ content. Gate on FAQ relevance (Section 0.4 `faqRelevance`) and the visible FAQ check (`faqSectionPresent`, Section 1.4). **Never fail a site merely for lacking an FAQ** — the many sites that legitimately have no FAQ get `na`, not `fail`.

- `na` — No visible FAQ content and `faqRelevance` is `absent`. The site has no FAQ, so FAQ schema is not applicable. Record in `notes` as `"N/A — no FAQ content on the site; FAQ schema not applicable."` Do **not** generate an issue. This is the default for sites without an FAQ.
- `pass` — Visible FAQ content present (a container/heading/accordion, OR — when `faqRelevance` is `medium` — the answered-question-heading cluster) AND JSON-LD FAQPage with 2+ valid Q&A pairs.
- `partial` — Visible FAQ content present but schema is malformed JSON-LD, OR microdata-only FAQ markup, OR `faqRelevance` is `medium` (a cluster of 3+ answered question-framed headings looks like a de facto FAQ, but it carries no FAQ container, heading, or accordion) and no schema of any kind is present. Record in `notes` as `"Partial — question-style headings suggest an unmarked FAQ; no formal FAQ markup or schema found."` and recommend adding explicit FAQ markup (container/heading/accordion) plus FAQPage schema.
- `fail` — Visible FAQ content present but no FAQ schema of any kind. (Only reachable when FAQ content actually exists, i.e. `faqRelevance` is `high`.)

#### JSON-LD format used — `jsonLdFormat`

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

**Evaluation:**

- `pass` — JSON-LD present (any blocks). Microdata and/or RDFa may also be present — no penalty for mixed formats.
- `partial` — No JSON-LD, but microdata OR RDFa present. The finding text must say so explicitly:
  - Microdata-only: `"Zero JSON-LD blocks; [N] microdata itemscope elements present — JSON-LD is preferred for reliable AI parsing."`
  - RDFa-only: `"Zero JSON-LD blocks; [N] RDFa typed elements present — JSON-LD is preferred for reliable AI parsing; RDFa adoption is low and AI parsing support is uneven."`
  - Both microdata and RDFa but no JSON-LD: list both counts and call out JSON-LD as the recommendation.
- `fail` — None of JSON-LD, microdata, or RDFa present.

Always record all three counts in `notes` and in `technicalNotes.schemaFormats` ({ jsonLd, microdata, rdfa }) so downstream consumers can see what was found.

#### Open Graph tags complete — `openGraphTags`

```javascript
const ogTags = ['og:title', 'og:description', 'og:image', 'og:url', 'og:type'];
const result = {};
ogTags.forEach(tag => {
  const el = document.querySelector('meta[property="' + tag + '"]');
  result[tag] = el ? el.getAttribute('content') : null;
});
return result;
```

**Evaluation:**
- `pass` — og:title, og:description, and og:image all present.
- `partial` — Some OG tags present but not the full og:title + og:description + og:image trio.
- `fail` — No Open Graph tags present.

#### Review or AggregateRating schema

JSON-LD `@type: "Review"` or `@type: "AggregateRating"`. Microdata check:

```javascript
const microdataReview = document.querySelector('[itemscope][itemtype*="schema.org/Review"], [itemscope][itemtype*="schema.org/AggregateRating"]');
return { microdataReview: !!microdataReview };
```

**Evaluation:**
- `pass` — Review or AggregateRating schema present in either JSON-LD or microdata.
- `fail` — Absent.

### 1.4 AEO Readiness — Programmatic checks (4 of 8 signals here)

`faqSectionPresent`, `faqSchemaApplied`, `questionFramedHeadings`, and `titleAndMetaQuestionMatch` are programmatic and evaluated below. `directAnswers`, `whoWhatWho`, `featuredSnippetStructure`, and `answerCapsules` are content checks evaluated in Phase 3.

#### FAQ section present

```javascript
// Marker set matches Section 0.4's hasFaqMarkers exactly (container class/id, a bare
// "FAQ"/"FAQs" heading in addition to "frequently asked"/"common questions", and a 2+
// <details> accordion) so faqSectionFound means the same thing here as faqRelevance:
// 'high' does in 0.4 — whichever page this runs against.
const faqIndicators = [
  ...document.querySelectorAll('[class*="faq"], [id*="faq"], [class*="FAQ"], [id*="FAQ"]'),
  ...Array.from(document.querySelectorAll('h2, h3')).filter(h => {
    const t = h.innerText.toLowerCase();
    return /frequently asked|common questions|\bfaqs?\b/.test(t);
  })
];
const dlPairs = document.querySelectorAll('dl');
const detailsElements = document.querySelectorAll('details');
const hasFaqAccordion = detailsElements.length >= 2;
// De facto FAQ: 3+ question-framed H2/H3s, each followed by answer-like body text, on
// THIS page (homepage or the /faq inner page this snippet is run against) — same
// "answered question heading" test as Section 0.4's faqRelevance check.
const answeredQuestionHeadingCount = Array.from(document.querySelectorAll('h2, h3'))
  .filter(h => h.innerText.trim().endsWith('?'))
  .filter(h => {
    const next = h.nextElementSibling;
    return !!next && /^(P|DIV|UL|OL)$/.test(next.tagName) && next.innerText.trim().length > 20;
  }).length;
return {
  faqSectionFound: faqIndicators.length > 0 || hasFaqAccordion,
  dlPairs: dlPairs.length,
  detailsElements: detailsElements.length,
  answeredQuestionHeadingCount
};
```

If no FAQ on the homepage, check `/faq` and `/faqs` as inner pages (also visit during Phase 2) — re-run this snippet on whichever page you land on, so a dedicated FAQ page gets the same de-facto-FAQ check as the homepage.

**Evaluation:**
- `pass` — FAQ section found (homepage or dedicated FAQ page) with 2+ Q&A pairs.
- `partial` — Accordion or FAQ pattern present but only 1 item, or very thin, OR `faqSectionFound` is false but `answeredQuestionHeadingCount` ≥ 3 (a de facto FAQ built from question-style headings each followed by answer text, with no faq class/id, no "FAQ" heading, and fewer than 2 `<details>` — all now covered by `faqSectionFound` above, so this branch can't fire on a page that already has real FAQ markup). Word the finding as a suggestion to add explicit FAQ markup, not as a defect — this stays capped at `low` per the optional/stylistic carve-out below.
- `fail` — Absent.

#### FAQ schema applied to visible FAQ content — `faqSchemaApplied`

Cross-reference: if a FAQ section was found AND FAQ JSON-LD schema was found in 1.3 — on whichever page carries each, per the cross-page rule at the end of Section 0.4.

**Evaluation:**
- `na` — Neither visible FAQ content nor FAQ schema present AND `faqRelevance` is `absent`. The site has no FAQ, so there is nothing to align. Record in `notes` as `"N/A — no FAQ content on the site."` Do **not** generate an issue.
- `pass` — Both visible FAQ content (a container/heading/accordion, OR — when `faqRelevance` is `medium` — the answered-question-heading cluster) and FAQ schema present.
- `partial` — FAQ schema present but no visible FAQ content, OR visible FAQ content present but no FAQ schema, OR `faqRelevance` is `medium` (answered-question-heading cluster present, no formal FAQ markup) and no schema is present. A genuine FAQ built from question-style headings alone — no `faq` class, no "frequently asked" heading, fewer than 2 `<details>` — lands here rather than `na`, so the missing markup still surfaces as a finding.
- `fail` — FAQ content is warranted (`faqRelevance` is `high` — e.g. a dedicated FAQ page or accordion exists) but neither the visible FAQ nor the schema is properly in place.

This signal exists alongside `faqSchema` and `faqSectionPresent` to verify that the schema and the visible content are applied together — the alignment, not the presence of either alone.

#### Question-framed headings

```javascript
const headings = Array.from(document.querySelectorAll('h2, h3'));
const questionHeadings = headings.filter(h => h.innerText.trim().endsWith('?'));
return {
  total: headings.length,
  questionFramed: questionHeadings.length,
  examples: questionHeadings.slice(0,3).map(h => h.innerText.trim())
};
```

**Evaluation:**
- `pass` — 2+ H2/H3 phrased as questions.
- `partial` — Exactly one H2/H3 phrased as a question.
- `fail` — No question-framed H2/H3 headings.

> **Stylistic signal — low importance.** Question-framed headings are one valid way to structure content for AEO, not a requirement. Phrasing headings as statements is a legitimate style choice. When this signal is `fail` or `partial`, treat it as an optional *consideration*, not a defect: cap the issue at **`low`** severity (see the "Optional / stylistic signals" carve-out in the Issue severity guide) and word the finding as a suggestion (e.g. "Consider phrasing a few headings as questions…"), never as a directive. Never describe a site as deficient for using statement-style headings.

#### Title and meta description question-match — `titleAndMetaQuestionMatch`

AI engines weight the page's `<title>` and `<meta name="description">` as signals about what the page is about. The substantive thing this signal checks is whether the title and meta **actually describe the page's topic** — a `<title>` that's just the site name, or a theme-default boilerplate meta description, tells AI nothing about what the page answers. Question phrasing is *one optional way* to achieve that alignment (the post notes it "helps to include the question or a close variant in the title tag or meta description"), but it is **not required** — a clear descriptive title that matches the page's topic passes just as well. Do not treat statement-style (non-question) titles as a miss.

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

// Informational only — question phrasing is optional and never required to pass.
// The pass/partial decision is driven by topical overlap (titleOverlap / metaOverlap) below.
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

**Evaluation:**

This signal centers on **topical alignment**: does the title/meta describe the page? Question phrasing optionally counts toward that alignment but is never required, and its absence is never a miss on its own.

- `pass` — Across the homepage plus inner pages visited, at least 50% of question-targeting pages have a `<title>` OR `<meta name="description">` that describes the page — reaching ≥50% token overlap with the page's H1. (Question phrasing may count toward the overlap but is optional.)
- `partial` — Titles/metas exist but weakly describe their pages (20–50% of question-targeting pages clear the overlap bar), OR the homepage is fine but inner pages are generic.
- `fail` — Title and meta are present-but-generic on every sampled page (e.g. `<title>` is the site name only; meta description is theme-default boilerplate), with no topical alignment to the page anywhere.

> N/A exemption: if zero pages visited are question-targeting (a pure-portfolio site with one-word page titles like "Work", "Studio", "Contact"), record `na` and note in `notes` as `"N/A — no question-targeting pages observed."`
>
> Record the per-page results in `notes` so the report can show which pages passed and which failed. The fix is a content edit (one-field change in Yoast/RankMath for most WordPress sites) — `effort` is almost always `low`.

`directAnswers`, `whoWhatWho`, `featuredSnippetStructure`, and `answerCapsules` are evaluated in Phase 3 (content).

### 1.5 E-E-A-T Signals — Programmatic checks (3 of 8 signals here)

The remaining 5 are evaluated in Phase 3 (content). `aboutTeamPageLinked` as a standalone signal was retired — the "is there an About/Team/Authors page" check is now embedded in `namedTeamMembers` (you must visit it to verify named individuals).

#### Named individuals with roles — `namedTeamMembers`

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

**Evaluation:**

- `na` — The site runs on a deliberately anonymous model where named individuals would not be expected (e.g. a privacy- or safety-conscious org, or a collective/brand that intentionally doesn't front individuals). Record the rationale in `notes` (e.g. `"N/A — deliberately anonymous model; no named individuals expected."`). Use this only when the anonymity is clearly a choice, not a mere omission — when in doubt use `partial`. Many legitimate sites have no named team; do not treat that as a defect.
- `pass` — Named individuals with type-appropriate roles visible (homepage or About/Team/Authors page).
- `partial` — Site is referenced through anonymous language only ("our team", "our editors", "the staff") — no names anywhere accessible from the homepage.
- `fail` — No team / author / staff signals at all.

#### Credentialing badges — `certificationBadges`

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

**Evaluation:**

- `na` — No third-party credential is applicable to this organization or field. Many legitimate organizations — nonprofits included — hold no relevant certification, accreditation, or trust-mark, and shouldn't be flagged for lacking one they may not qualify for or need. Record `"N/A — no applicable third-party credential for this org/field."`
- `pass` — Credentialing badges present AND visually confirmed as legible/recognizable, matched to the site type.
- `partial` — DOM indicators found but visual confirmation unclear, or only weak credentials (e.g. SSL-vendor badges).
- `fail` — Absent.

#### Tenure indicators — `tenureIndicators`

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

**Evaluation:**
- `pass` — Any tenure indicator is found.
- `fail` — Absent.

#### Author bylines linked to Person schema — `authorBylines`

**This signal applies primarily to `mediaBlog`, `education`, `nonprofit`, and any other site that publishes articles or posts.** For sites with no editorial content (e.g. pure ecommerce, single-page SaaS), record `na` by default and note in `notes` as `"N/A — site has no editorial articles to byline."`

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

**Evaluation:**

- `pass` — Visible byline AND author name linked to an author page AND article schema (any format) has a populated `author` property.
- `partial` — Visible byline AND linked author page, but no `author` on any schema format, OR `author` present in microdata/RDFa only (JSON-LD preferred for AI parsing).
- `fail` — Anonymous publication: no byline, or byline with no link, or no Article/BlogPosting schema in any format.

### 1.6 Content Freshness — Programmatic checks (5 of 7 signals here)

#### Copyright year

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

**Evaluation:**
- `pass` — Copyright year matches current year.
- `partial` — Copyright year is one year behind.
- `fail` — Two or more years stale, or absent entirely.

#### Blog or news section detection — visit blog page in Phase 2

```javascript
const blogIndicators = Array.from(document.querySelectorAll('[class*="blog"], [class*="news"], [class*="post"], [class*="article"], [id*="blog"], [id*="news"]'));
const datePattern = /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2},?\s+20\d{2}|\b20\d{2}[-\/](0[1-9]|1[0-2])[-\/](0[1-9]|[12]\d|3[01])\b/gi;
const dates = (document.body.innerText.match(datePattern) || []);
return { blogSectionFound: blogIndicators.length > 0, datesFound: dates.slice(0,5) };
```

Confirm in Phase 2 by visiting the blog/news listing page. Most-recent post date determines freshness.

**Evaluation:**
- `pass` — Blog/news section present with content dated within last 6 months.
- `partial` — Section present but content older than 6 months.
- `fail` — No blog/news section found.

#### Date stamps on posts or case studies

```javascript
const dateTags = Array.from(document.querySelectorAll('time[datetime], [class*="date"], [class*="published"]'));
return { count: dateTags.length, examples: dateTags.slice(0,3).map(el => el.innerText.trim() || el.getAttribute('datetime')) };
```

Confirm by visiting at least one blog post in Phase 2 — the post page should display a published date.

**Evaluation:**
- `pass` — Date stamps visible on posts or case studies.
- `fail` — Absent.

#### Sitemap lastmod dates recent — `sitemapLastmodRecent`

Cross-reference 1.2 sitemap analysis. Were lastmod dates present and within 90 days?

**Evaluation:**
- `pass` — Sitemap has lastmod dates within 90 days.
- `fail` — Absent or all stale.

#### Per-page "Last updated" stamps — `contentUpdateRecency`

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

**Evaluation:**

- `pass` — Visible "Last updated" stamp within the last 12 months on at least one sampled inner page. Article schema `dateModified` alone also counts if it is within the last 12 months and the page is editorial.
- `fail` — No visible update stamps anywhere, OR stamps present but all >12 months old.

> Pure-ecommerce / single-page SaaS exemption: if there is no editorial content to bear "last updated" stamps, record `na` and note in `notes` as `"N/A — site has no editorial content requiring update stamps."`

`recentFeaturedWork` and `currentDomainReferences` are evaluated in Phase 3.

### 1.7 Entity Clarity — Programmatic check (1 of 5 signals here)

#### Social profile links in footer

```javascript
const socialDomains = ['linkedin.com', 'twitter.com', 'x.com', 'facebook.com', 'instagram.com', 'youtube.com'];
const links = Array.from(document.querySelectorAll('footer a[href], [class*="social"] a[href]'));
const socialLinks = links.filter(a => socialDomains.some(d => a.href.includes(d)));
return { count: socialLinks.length, platforms: [...new Set(socialLinks.map(a => a.href.split('/')[2]))] };
```

**Evaluation:**
- `pass` — LinkedIn and at least one other professional profile linked from footer.
- `partial` — Only one social profile linked.
- `fail` — No social profile links in footer.

`entityIdentifiable`, `primaryFocusSpecificity`, `geographicMarketClarity`, and `consistentIdentity` are all evaluated in Phase 3.

### 1.8 llms.txt

`browser_navigate` to `[baseURL]/llms.txt`. Record whether it loads (status 200 vs 404) and capture body text. Then `browser_navigate` to `[baseURL]/llms-full.txt` and record presence. Return to homepage.

```javascript
return { found: document.body.innerText.trim().length > 10, content: document.body.innerText.substring(0, 1000) };
```

**Evaluation:**
- `llmsTxtPresent` — `pass` if present and non-empty. `fail` if absent.
- `llmsFullTxtPresent` — `pass` if present. `fail` if absent.
- `llmsTxtContent` — evaluated in Phase 3 based on accuracy and specificity.

---

## SECTION 2: Multi-Page Evidence Collection

The homepage is the primary evaluation target, but several signals require inner-page confirmation. Visit **at least 3 additional pages** beyond the homepage. Record every URL visited in `visitedPages`.

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

**Optional 4th visit:** if a dedicated FAQ page exists at `/faq`, `/faqs`, `/help`, or `/support`, visit it and re-run both the Section 1.4 FAQ check and the Section 1.3 FAQ-schema check on that page — this is what feeds `faqSectionPresent`, `faqSchema`, and `faqSchemaApplied`, and can raise `faqRelevance` per the cross-page rule at the end of Section 0.4.

**Mediablog-specific 5th visit — archive page quality check.** For mediaBlog sites, visit at least one category or tag archive page (`/category/<slug>/`, `/tag/<slug>/`, `/topics/<slug>/`, or whatever the routing convention is). Run the `archivePageQuality` check from Section 2.1.

If a page type doesn't exist (e.g. ecommerce site with no editorial content), record the absence — it may change the status of the related signal, or trigger the type-specific exemption rule.

### 2.1 Type-specific functional page checks

These checks feed into existing evaluated signals rather than introducing new ones — they sharpen the evidence Phase 1 collected by checking the pages where the post's recommendations land most concretely.

#### FAQ schema on functional pages — `nonprofit`, `mediaBlog`, `community`

Visit the type-specific functional page and re-run the FAQ check:

```javascript
const jsonLd = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
  .map(s => { try { return JSON.parse(s.innerText); } catch(e) { return null; }})
  .filter(Boolean)
  .flatMap(s => Array.isArray(s) ? s : (s['@graph'] || [s]));
const hasFaqSchema = jsonLd.some(s => s['@type'] === 'FAQPage') ||
  !!document.querySelector('[itemscope][itemtype*="schema.org/FAQPage"]');
// Same two-tier definition as Section 0.4's hasFaqMarkers / hasQuestionHeadingCluster —
// a real FAQ marker (container, a "frequently asked"/"common questions"/bare "FAQ"
// heading, or a 2+ <details> accordion) counts as visibleFaq outright. Absent that, only
// a cluster of 3+ question-framed headings EACH followed by answer-like body text counts
// — two bare "?"-ending headings with no answer underneath is a CTA pattern, not an FAQ,
// and must not flag this page as having one.
const hasFaqMarkers = !!document.querySelector('[class*="faq"], [id*="faq"]') ||
  Array.from(document.querySelectorAll('h2, h3')).some(h => /frequently asked|common questions|\bfaqs?\b/i.test(h.innerText.trim())) ||
  document.querySelectorAll('details').length >= 2;
const answeredQuestionHeadingCount = Array.from(document.querySelectorAll('h2, h3'))
  .filter(h => h.innerText.trim().endsWith('?'))
  .filter(h => {
    const next = h.nextElementSibling;
    return !!next && /^(P|DIV|UL|OL)$/.test(next.tagName) && next.innerText.trim().length > 20;
  }).length;
const visibleFaq = hasFaqMarkers || answeredQuestionHeadingCount >= 3;
return { hasFaqSchema, visibleFaq, hasFaqMarkers, answeredQuestionHeadingCount, url: window.location.href };
```

The post's argument: donation, subscribe, and join/membership pages are exactly the pages where AI tools land users with concrete intent-bearing queries ("how do I donate to X?", "how do I subscribe to Y?", "what does a Z membership include?"). FAQ schema on these specific pages is high-leverage.

How the result feeds into evaluation — treat this page as another page checked under the Section 0.4 cross-page rule, updating `faqRelevance`, `faqSchema`, and `faqSchemaApplied` together rather than `faqSchemaApplied` alone (leaving only `faqSchemaApplied` in sync here would reproduce, for this page, the same presence-vs-alignment split just fixed for the generic `/faq` case):

- **`hasFaqMarkers` true but no FAQ schema found on this page** → `faqRelevance` rises to `high` (or stays `high`) from this evidence. This page's schema evidence feeds the same cross-page aggregation as Section 0.4: if no page checked anywhere in the run (homepage, `/faq`, and this functional page) has valid schema, `faqSchema` resolves to `fail` and `faqSchemaApplied` to `partial`, creating a `medium`-severity issue with effort `low` and a paste-ready Claude prompt for the FAQ schema. If schema was already found elsewhere, that stronger observation wins instead — don't let this page's absence override it.
- **`hasFaqMarkers` false but `answeredQuestionHeadingCount` ≥ 3 (a de facto FAQ) and no schema found on this page** → `faqRelevance` rises to at least `medium`; `faqSchema`/`faqSchemaApplied` land at `partial` per their own tiers, unless a stronger schema observation from another page checked already supersedes it.
- **Both `visibleFaq` and FAQ schema present** → `faqRelevance` is `high` if `hasFaqMarkers` drove `visibleFaq`, or at least `medium` if only the de facto cluster did; either way this confirms `faqSchema` and `faqSchemaApplied` at full credit per their `pass` tiers.
- **`visibleFaq` false** on the functional page → not penalized (the page may genuinely not need FAQ format) and doesn't affect `faqRelevance`, but record in `notes` as a missed AEO opportunity since these pages are high-intent.

#### `archivePageQuality` check — `mediaBlog` only

Per the post: *"Category and tag pages need descriptive text — a list of posts alone gives AI nothing to work with."* WordPress archive pages typically emit an empty `<meta name="description">` and zero copy beyond the post list.

This check **does not introduce a new evaluated signal**. It feeds findings into two existing signals:

1. `passageExtractionQuality` (Content Specificity) — an archive page with no descriptive text fails the "could a clean 1–2 sentence summary be pulled from each major section" test, since the archive page IS a major section and yields nothing extractable.
2. `primaryFocusSpecificity` (Entity Clarity) — an archive page with no topic-area description weakens the site's overall focus signal for the dominant vertical.

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
// Jetpack: detect by its actual plugin asset paths and enqueued script/style handles,
// not by incidental "jetpack" strings in visible text (which false-positive on footer
// credits, comments, or links to jetpack.com).
const jetpack = !!document.querySelector(
  'link[href*="/plugins/jetpack/" i], script[src*="/plugins/jetpack/" i], ' +
  'link[href*="/jetpack_vendor/" i], script[src*="/jetpack_vendor/" i], ' +
  'link[id^="jetpack" i], script[id^="jetpack" i], style[id^="jetpack" i], ' +
  '[class*="jp-carousel" i], [class*="sharedaddy" i], [id*="jp-post-flair" i]'
);
const wpContent = !!document.querySelector('link[href*="/wp-content/"]') || !!document.querySelector('script[src*="/wp-content/"]');
const wpJsonApi = document.body.outerHTML.includes('/wp-json/');
return {
  generator: generator ? generator.getAttribute('content') : null,
  yoast: yoastBlock || yoastClass,
  rankMath,
  seopress,
  jetpack,
  isWordPress: wpContent || wpJsonApi || (generator && /WordPress/i.test(generator.getAttribute('content') || ''))
};
```

Record the result in `technicalNotes.cmsDetected` (e.g. `"WordPress + Yoast"`, `"WordPress + RankMath"`, `"WordPress + Jetpack"`, `"WordPress + Jetpack (no dedicated SEO plugin)"`, `"WordPress (no SEO plugin)"`, `"Headless / unknown"`). This drives the `effort` ratings in Phase 5. **Jetpack detection matters for native-first recommendations** — see the capability check below.

### Native-first capability check + matrix staleness (run once, after CMS detection)

Read `skills/aeo/references/wp-seo-capabilities.md`. It maps each plugin-dependent AEO signal to what WordPress core and Jetpack can emit natively, versus the schema signals that genuinely need a third-party plugin or custom JSON-LD.

Use it two ways:

1. **Native-first recommendations.** When you write actionable prompts and effort rationales in Phase 5, prefer the core / Jetpack path for any signal the matrix marks as natively covered (Open Graph, sitemap lastmod, canonical, robots/noindex, editable title + meta description). Only recommend a third-party SEO plugin (Yoast / RankMath / AIOSEO) or custom JSON-LD as the *primary* fix for the schema signals the matrix lists under "genuine gap" (`organizationSchema`, `primaryEntitySchema`, `faqSchema`, `reviewSchema`, `relevantSchemasApplied`, Article-schema `author`, breadcrumbs). Name the free vs. paid Jetpack tier when the native fix relies on one.

2. **Staleness check.** Parse the `lastVerified:` date from that file and compare it to the current date. If the gap exceeds `stalenessThresholdDays` (90), print a one-line operator notice — `kosh: WP SEO capability matrix last verified YYYY-MM-DD (N days ago) — re-verify against the source docs in wp-seo-capabilities.md` — and record `capabilityMatrixStale: true` in `technicalNotes`. Under the threshold, stay silent. Either way, record `capabilityMatrixLastVerified: "YYYY-MM-DD"` in `technicalNotes`.

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

Use this content to evaluate the remaining signals.

### 3.1 AEO Readiness — Content (4 signals)

#### Direct answers after headings — `directAnswers`

For each H2/H3, read the paragraph immediately following it. Count what fraction of those headings are followed by a direct first-sentence answer (not a preamble or build-up).

**Evaluation:**
- `pass` — 70%+ of headings answered directly.
- `partial` — 10–69% of headings answered directly.
- `fail` — Less than 10%, OR content not structured in heading/answer format (no H2s/H3s).

#### Who / what / who content — `whoWhatWho`

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

**Evaluation:**
- `pass` — All three elements answerable from the homepage text alone within the first scroll.
- `partial` — Two of three answerable.
- `fail` — One or zero answerable.

#### Featured snippet structure — `featuredSnippetStructure`

Count "extractable" sentences across the homepage: a sentence that defines a term, states a number with context, gives a step, or answers a question — and stands alone without surrounding context. Definition lists, numbered steps, and FAQ answers each count as one.

**Evaluation:**
- `pass` — 5+ extractable sentences.
- `partial` — 2–4 extractable sentences.
- `fail` — 0–1 extractable sentences.

#### Answer capsules — `answerCapsules`

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

**Evaluation:**

- `pass` — 3 or more answer capsules across the analyzed pages.
- `partial` — 1–2 answer capsules.
- `fail` — No qualifying capsules: every H2/H3 either has no text directly under it, has a preamble before the answer, or has text outside the 40–60 word band.

### 3.2 E-E-A-T Signals — Content (4 signals)

#### Author / staff credentials — `authorCredentials`

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

**Evaluation:**
- `na` — No named individuals whose credentials could apply (i.e. `namedTeamMembers` is `na`, or the site legitimately has no named people). Record `"N/A — no named individuals whose credentials could apply."`
- `pass` — Specific, third-party-verifiable credentials present.
- `partial` — Generic credentials only ("years of experience", "industry leader") without specifics.
- `fail` — No credentials at all.

#### Demonstrated expertise — `demonstratedExpertise`

Count "specifics" across the homepage and visited pages. A specific is concrete, third-party-verifiable evidence — one of:

- A named methodology, technique, framework, or standard used or cited
- A named past client, partner, or institutional reference
- A specific outcome with a number (% growth, $ raised, N users, response times)
- A named technology, platform, or tool relevant to the site type
- A named primary source for a claim (study, paper, dataset, report)
- A subject-area technical term used correctly in context

**Evaluation:**
- `pass` — 3 or more specifics observed across homepage and visited pages.
- `partial` — 1–2 specifics with the rest of the copy claiming expertise without evidence.
- `fail` — Zero specifics (only generic claims like "award-winning", "expert", "leading").

#### External citations or press — `externalCitations`

Third-party validation: publications that have cited or covered the site, podcasts the site has appeared on, industry awards with named bodies, conference talks, press mentions, peer recognition.

**Evaluation:**
- `pass` — Named external validation present (named publications, podcasts, awards bodies, etc.).
- `partial` — Vague "featured in" / "as seen on" without named outlets.
- `fail` — Absent.

#### Named external relationships — `namedExternalRelationships`

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

**Evaluation:**
- `pass` — At least one named external relationship appears in copy (not just a logo).
- `fail` — All relationships are anonymous, generic ("our clients", "our sources"), or logo-only.

### 3.3 Content Freshness — Content (2 signals)

#### Recent featured work — `recentFeaturedWork`

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

**Evaluation:**
- `pass` — Recent featured work (last 12 months) is visible.
- `fail` — Work appears dated, references deprecated tools/platforms, or no featured work exists.

#### Current domain references — `currentDomainReferences`

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

**Evaluation:**
- `pass` — Domain references appear current.
- `fail` — Deprecated/retired/superseded references are cited as current.

### 3.4 Entity Clarity — Content (4 signals)

#### Named entity identifiable in one sentence — `entityIdentifiable`

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

**Evaluation:**
- `pass` — A single clear identifying sentence containing all three required elements is constructable from the homepage.
- `partial` — Partially identifiable (1 or 2 of 3 elements clear).
- `fail` — Cannot identify the site from the homepage text.

#### Primary focus specificity — `primaryFocusSpecificity`

Generalized from "service specificity." How specific is the site's primary focus, as stated in the homepage copy?

| Site type | Specificity examples (high / medium / low) |
|---|---|
| `agency` | "WordPress agency for DTC ecommerce brands on Shopify" / "web design and development for small businesses" / "full-service digital agency" |
| `mediaBlog` | "Climate change reporting for policymakers" / "general business news" / "lifestyle blog" |
| `ecommerce` | "Hand-thrown ceramic dinnerware for hospitality buyers" / "kitchen accessories" / "general home goods" |
| `saas` | "Customer feedback dashboards for B2B SaaS product managers" / "feedback management" / "productivity software" |
| `education` | "Online tax-law CLE courses for practicing attorneys" / "professional development courses" / "online learning" |
| `nonprofit` | "Free legal aid for tenants facing eviction in NYC" / "housing rights advocacy" / "social justice" |

**Evaluation:**
- `pass` — Highly specific primary focus stated.
- `partial` — Moderately specific or generic focus.
- `fail` — No clear focus described.

#### Geographic or market clarity

Is a location, timezone, or market focus stated anywhere on the homepage?

**Evaluation:**
- `pass` — Location, timezone, or market focus is stated.
- `fail` — Absent.

#### Consistent identity signals

Does the site describe itself consistently across the hero, about section, and footer? Or does the specialty/positioning shift between zones?

**Evaluation:**
- `pass` — Consistent identity across all zones.
- `fail` — Contradictory identity signals between zones.

### 3.5 Content Specificity — Content (5 signals)

#### Primary offering detail — what, who, outcome — `primaryOfferingDetail`

For each primary offering described, can you answer: what is it, who is it for, what outcome does it deliver? The "offering" varies by site type:

| Site type | What counts as a primary offering |
|---|---|
| `agency`, `saas`, `localBusiness` | Each service or product line |
| `ecommerce` | Each product category or collection |
| `mediaBlog` | Each content vertical or beat |
| `education` | Each course, program, or degree track |
| `nonprofit` | Each program, cause area, or initiative |
| `community` | Each major activity or sub-community |

**Evaluation:**
- `pass` — All three (what / who / outcome) answered for most offerings.
- `partial` — Partially answered (some offerings have detail, others don't, or 1–2 of the three elements addressed).
- `fail` — Offerings listed by category label only with no detail.

#### Named specific entities — `namedSpecificEntities`

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

**Evaluation:**
- `pass` — 2 or more named specific entities relevant to the domain.
- `partial` — Exactly one named specific entity.
- `fail` — None (generic abstractions only).

#### Named subject areas — `namedSubjectAreas`

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

**Evaluation:**
- `pass` — Specific subject areas named.
- `fail` — Generic only ("businesses", "people", "everyone").

#### Specific outcomes — `specificOutcomes`

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

**Evaluation:**
- `na` — The site legitimately has no quantifiable outcomes to report (e.g. an early-stage program, a service type where metrics aren't standard, or a privacy-constrained context). Record `"N/A — no quantifiable outcomes applicable to this site."` Use sparingly — prefer `fail` (which caps at `low`) when outcomes plausibly exist but simply aren't stated.
- `pass` — Specific quantified outcomes or named achievements present.
- `fail` — Vague claims only ("we get results", "great quality", "trusted").

#### Passage extraction quality — `passageExtractionQuality`

Could a clean, accurate 1–2 sentence summary be pulled from each major section without needing surrounding context?

**Evaluation:**
- `pass` — Most sections yield clean extractable summaries.
- `fail` — Sections require surrounding context to make sense.

### 3.6 llms.txt content quality

If llms.txt was found in 1.8, evaluate the recorded content:

- Does it accurately describe the site name, type, and specialty?
- Does it mention specific services, target audiences, or platforms?
- Is it specific or generic boilerplate?

**Evaluation:**
- `pass` — Specific and accurate; describes site name, type, specialty, and mentions specific services / audiences / platforms.
- `fail` — Vague boilerplate.
- `na` — llms.txt is absent (covered by the `llmsTxtPresent` signal; record `na` here with note `"N/A — llms.txt not present."`).

---

## SECTION 4: Evaluation & Verification

1. Map all findings from Sections 1–3 to the rubric in `references/evaluation-rubric.md`.
2. Assign each signal a status (`pass` / `partial` / `fail` / `na`).
3. Verify each criterion's `signals` block contains every signal from the canonical signal-keys list. No signal may be omitted; use `na` with rationale when the signal genuinely does not apply.
4. Count totals into the `summary` block: `{ totalSignals: 49, pass, partial, fail, na }`. Confirm `pass + partial + fail + na === 49`.
5. There is **no top-level score and no threshold label** — the summary counts plus the issues list communicate state.

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
- [ ] CMS detection completed and recorded in `technicalNotes.cmsDetected` (including Jetpack presence)
- [ ] Native-first capability check run against `references/wp-seo-capabilities.md`; `capabilityMatrixLastVerified` recorded in `technicalNotes` and the staleness notice surfaced if over threshold
- [ ] All Section 1 programmatic checks completed
- [ ] All Section 2 inner-page checks completed
- [ ] All Section 3 content checks completed
- [ ] All 49 signals evaluated across 8 criteria — every signal has a `status` of `pass`, `partial`, `fail`, or `na`
- [ ] `summary` block populated with `totalSignals`, `pass`, `partial`, `fail`, `na` counts; the four buckets sum to `totalSignals`
- [ ] **Every signal at status `fail` or `partial` has a corresponding entry in `issues.critical|high|medium|low[]`**
- [ ] Actionable Claude prompt written for every signal at status `fail` or `partial`
- [ ] Every issue object includes an `effort` field (`low` / `medium` / `high` / `unknown`)

**If any item above is unchecked, do NOT generate the report. Return to the relevant section and complete it.**

---

## SECTION 5: Report Generation

### File location

Save the report to `reports/data/qa-report-aeo.json`. This is the fixed filename the kosh report generator and merge script expect.

### Top-level structure

The full structure is defined in `schemas/qa-report-aeo-schema.json`. Use canonical signal keys from `references/signal-keys.md` — do not invent variants (`robotsAndCrawlerAccess`, not `robotsTxt`; `noNoindex`, not `noindex`).

Each criterion follows `{signals: {key: {status, notes}, ...}}` where `status` is one of `pass` / `partial` / `fail` / `na`.

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
  "environment": "production",
  "visitedPages": [
    "https://example.com/",
    "https://example.com/about/",
    "https://example.com/category/climate/",
    "https://example.com/articles/recent-piece/"
  ],
  "summary": {
    "totalSignals": 49,
    "pass": 38,
    "partial": 6,
    "fail": 4,
    "na": 1
  },
  "criteria": {
    "technicalHealth": {
      "signals": {
        "robotsAndCrawlerAccess": { "status": "pass", "notes": "All live-retrieval bots allowed." },
        "noNoindex": { "status": "pass", "notes": "No noindex." }
        /* ...remaining technicalHealth signals per schema... */
      }
    }
    /* ...7 more criterion blocks, 49 signals total per references/signal-keys.md... */
  },
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
  "actionablePrompts": [ /* one entry per signal at status fail or partial */ ],
  "technicalNotes": {
    "robotsTxt": "Allowed: OAI-SearchBot, ChatGPT-User, Claude-User, PerplexityBot. Blocked: GPTBot, ClaudeBot, Google-Extended, CCBot — modern training/retrieval split.",
    "sitemapUrl": "https://example.com/sitemap_index.xml",
    "llmsTxtFound": false,
    "llmsFullTxtFound": false,
    "javascriptRequired": false,
    "httpsActive": true,
    "mixedContentCount": 0,
    "cmsDetected": "WordPress + Yoast",
    "capabilityMatrixLastVerified": "2026-07-15",
    "capabilityMatrixStale": false,
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
    }
  }
}
```

### Issue severity guide

- **critical** — Signal at `fail` for a high-impact **technical** rubric area (Technical Health or Structured Data). Blocking AI discoverability or citation. (Note: AEO Readiness is **not** blanket-critical — most of its signals are content or stylistic and capped at `low` below; only `titleAndMetaQuestionMatch` and, when FAQ content is warranted, `faqSchemaApplied` stay elevated.)
- **high** — Signal at `fail` for a non-content criterion that isn't capped below — for example `llmsTxt`, `titleAndMetaQuestionMatch`, or `faqSchemaApplied` (when warranted) — or a substantial `partial` on those; also the severity for secondary Structured Data signals downgraded from `critical` under the "Consolidate shared-root schema findings" rule below (e.g. `faqSchema` or `reviewSchema` failing alongside whichever single signal — `organizationSchema` or `primaryEntitySchema` — was recorded as the `critical` anchor for that same no-schema-emitter root cause). Significantly weakens AI understanding or trust signals.
- **medium** — `partial` where the gap is moderate on a non-content, non-capped signal.
- **low** — Minor gap, OR any content-quality / optional / stylistic signal per the caps below. Most AEO Readiness signals land here.

**Optional / stylistic signals — always cap at `low`.** A few signals describe optional AEO enhancements or stylistic choices, not requirements. Regardless of the criterion they live under, when these are `fail` or `partial` the issue is capped at **`low`** severity and worded as a consideration, not a directive:

- `questionFramedHeadings` — phrasing headings as questions is one valid style, not a requirement.
- `faqSectionPresent` — an FAQ is a useful AEO opportunity, but many sites legitimately don't need one. Suggest it; never flag its absence as critical.

The FAQ story spans three signals with deliberately different treatment: `faqSectionPresent` (is there a visible FAQ?) caps at `low` as an optional suggestion; `faqSchema` and `faqSchemaApplied` (is the FAQ marked up?) go `na` when there's no FAQ content, so they never generate an issue on a site that simply has no FAQ. Only when FAQ content actually exists do the schema signals flag a missing-markup gap.

**Consolidate shared-root schema findings.** When several Structured Data signals fail for the *same* root cause — the site emits no JSON-LD because it has no schema emitter (WordPress + Jetpack/core with no Yoast / RankMath / AIOSEO or custom schema) — do **not** emit a separate `critical` issue for every schema type; that floods the critical bucket with near-duplicates (the volume problem from the source feedback). Instead: record ONE representative `critical` issue on `organizationSchema` (or `primaryEntitySchema` if Organization is already present) describing the shared root and remedy, keep the other schema signals at their `fail` status, and record their issues at `high` with an `issue`/`impact` line that cross-references the primary (e.g. "part of the site-wide no-schema gap — see organizationSchema"). The finding stays complete; the critical bucket stays readable.

**Content signals — cap at `low` (TAM judgment).** Content-quality findings are recommendations, not defects. They depend on editorial priorities, partner staffing, and whether the rubric's baseline even fits the site — so they are surfaced at **`low`** severity for the TAM to weigh, never at critical/high. Word them as considerations ("Consider adding…"), not directives. This applies to every signal in these criteria:

- **E-E-A-T Signals** (`eeatSignals`)
- **Content Freshness** (`contentFreshness`)
- **Entity Clarity** (`entityClarity`)
- **Content Specificity** (`contentSpecificity`)
- The content-side **AEO Readiness** signals: `directAnswers`, `whoWhatWho`, `featuredSnippetStructure`, `answerCapsules`

The objective, machine-level criteria — **Technical Health**, **Structured Data**, and **llms.txt** — keep their normal critical / high / medium severity. They are cheap, unambiguous, and not subject to editorial judgment, so they are not capped.

> Impact and priority are different axes. A content signal can be high-*impact* for AEO — `answerCapsules`, for instance, is cited as a strong 2026 citation signal in `references/signal-keys.md` — yet still `low`-*priority* for a given partner because acting on it is discretionary editorial work. The cap reflects TAM priority, not a claim that the signal doesn't matter for AEO.

### Issue effort guide

Every issue must include an `effort` field. Use this two-step process:

**Step 1 — assign the signal-type baseline:**

| Effort | Meaning | Typical AEO examples |
|---|---|---|
| `low` | Content edit or simple config. No developer required. Under 1 hour. | Create llms.txt, update copyright year, add social profile links, add geographic location to copy |
| `medium` | Requires a developer, plugin, or significant content creation. Hours to a day. | Add Organization or Service JSON-LD schema, add FAQ schema to existing FAQ, write question-framed headings, add date stamps |
| `high` | Requires design or development work, refactoring, or substantial new content. Days or more. | Fix JS-only rendering, build a blog or news section from scratch, create case studies with named outcomes |
| `unknown` | Stack context insufficient to assess. Use sparingly. | |

**Step 2 — adjust based on observed CMS context (native-first — consult `references/wp-seo-capabilities.md`):**

Recommend the **core / Jetpack** path before any third-party plugin. The capability matrix determines which fixes are native and which genuinely need a plugin:

- **Natively-covered signals** (Open Graph, sitemap lastmod, canonical, robots/noindex, editable title + meta description): the fix is enabling or configuring a core setting or a Jetpack module — effort `low`. Examples: `openGraphTags` → "Enable Jetpack Social/Sharing (free) — OG tags emit automatically"; `sitemapLastmodRecent` → "Enable Jetpack Sitemaps (free) for lastmod support"; `titleAndMetaQuestionMatch` → "Set SEO title/meta in Jetpack SEO Tools". Name the free vs. paid Jetpack tier per the matrix so the estimate is honest.
- **Schema-gap signals** (`organizationSchema`, `primaryEntitySchema`, `faqSchema`, `reviewSchema`, `relevantSchemasApplied`, Article-schema `author`, breadcrumbs): neither core nor Jetpack emits JSON-LD, so a third-party plugin or custom JSON-LD is warranted here.
  - WordPress + Yoast / RankMath / AIOSEO already installed: schema additions are one-field / block edits in the SEO plugin panel — drop to `low`. Record `effortRationale: "WordPress + RankMath detected — schema is a one-field edit in the plugin panel."`
  - WordPress + Jetpack but no dedicated SEO plugin: schema stays `medium` — Jetpack cannot emit it, so this needs a schema plugin (Yoast/RankMath/AIOSEO) or custom JSON-LD. Record that in `effortRationale`, and note it is a candidate to flag to the Jetpack team as a native-SEO gap.
  - WordPress core only (no SEO plugin): schema stays `medium` (plugin install or theme code edit).
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

Every signal at status `fail` or `partial` must have an entry in `actionablePrompts`. Each prompt must:

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
- **Native-first.** For signals the capability matrix (`references/wp-seo-capabilities.md`) marks as natively covered — Open Graph, sitemap lastmod, canonical, robots/noindex, editable title + meta description — the prompt's recommended fix is the core / Jetpack path (naming the free vs. paid Jetpack tier), not a third-party plugin. Recommend Yoast / RankMath / AIOSEO or custom JSON-LD as the primary fix only for the schema signals the matrix lists as a genuine gap.

Example — ❌ "I'm Maple Creative, a Toronto branding agency. My homepage has no Organization schema. Write me one."

Example — ✅ "Write a complete JSON-LD Organization schema block for a Toronto branding agency homepage `<head>`. Include name, url, logo, description, and sameAs links for LinkedIn and Twitter. Output a single `<script type=\"application/ld+json\">` block."

### Generate the HTML report

Once `reports/data/qa-report-aeo.json` is saved, run:

```bash
node scripts/generate-report.js reports/data/qa-report-aeo.json
```

The AEO branch is auto-detected from `report.mode === "aeo"`. The script writes a self-contained HTML report to `reports/` (color-coded status pills, per-criterion signal tables, schema-relevance section, collapsible severity blocks, paste-ready Claude prompts) and prints the output path. `--aeo` can be passed explicitly to force the AEO branch.

### Terminal summary

After saving the JSON and running the report script, print a brief summary:

```
Kosh AEO Analysis — [Website Name]
URL: [URL]
Site type: [siteType] ([confidence])
Environment: [environment]
Signals: [pass] pass · [partial] partial · [fail] fail · [na] N/A (of [totalSignals])

Top issues:
- [Top 3 critical/high issues by severity and CMS-adjusted effort]

Full report saved to:
  JSON: reports/data/qa-report-aeo.json
  HTML: reports/[SITENAME]_AEO_QA_REPORT_[YYYY-MM-DD].html
```

---

## WordPress-Specific Patterns

When you detect WordPress (look for `/wp-content/`, `/wp-json/`, `meta[name="generator"]` with WordPress, or admin bar markup), these patterns are common:

- **Jetpack** — an Automattic-native option. Jetpack emits **Open Graph tags** (free, Social/Sharing) and **XML sitemaps with lastmod** (free), and its **SEO Tools** (paid tier) provide editable SEO titles, meta descriptions, and archive canonicals. **Jetpack emits no schema.org JSON-LD** — Organization, Article, FAQ, Product, Event, Review, and breadcrumb schema all require a dedicated SEO plugin or custom code even with Jetpack active. Prefer the native Jetpack/core path for OG, sitemap, canonical, robots, and title/meta fixes (see `references/wp-seo-capabilities.md`); treat schema as the genuine gap. When Jetpack is present but there's no schema plugin, flag missing schema as a candidate to raise with the Jetpack team rather than blanket-recommending a third-party plugin.
- **Yoast SEO** — emits `@graph`-wrapped JSON-LD with Organization, WebSite, WebPage, and BreadcrumbList by default. Check whether Organization fields (logo, sameAs) are populated in the Yoast settings — empty fields are a common failure mode.
- **RankMath** — similar coverage to Yoast, with FAQ block schema available in the editor. Check whether FAQ blocks were used on FAQ pages.
- **SEOPress** — narrower default schema coverage; Organization usually present, FAQ usually not.
- **All in One SEO** — Organization + WebPage; check explicitly because some sites disable schema output.
- **Site Kit / Google plugins** — do not emit schema, but may emit additional meta. Don't mistake meta tags for schema markup.
- **Yoast and RankMath both emit `/sitemap_index.xml`** rather than a flat `/sitemap.xml`. If `/sitemap.xml` 404s, follow the `Sitemap:` line in robots.txt.
- **WooCommerce sites** typically have Product schema on product pages but not on the homepage. AEO evaluation is anchored on the homepage — a WooCommerce site with no Store, OfferCatalog, or Organization schema on the homepage still fails its `primaryEntitySchema` signal even if Product schema is plentiful on PDPs (those are confirmed during the Phase 2 sample).
- **The WordPress comments JSON-LD block** (`@type: "Comment"`) does not count toward Service / Organization / FAQ tallies.
- **REST API exposure (`/wp-json/`)** is a separate signal not in the rubric, but record its presence in `technicalNotes.cmsDetected` — it affects effort estimates for some fixes.
- **llms.txt** — there is no widely adopted WordPress plugin for llms.txt as of this rubric version. Effort to create it is always `low` (paste a text file into the WordPress root via SFTP or use a "raw file" plugin), but it does require server access.

---

## AEO Testing Notes

### Why homepage-anchored, multi-page evaluation?

The rubric is anchored to the homepage as the primary evaluation target, with Phase 2 inner-page checks providing **confirmation and evidence-gathering** for signals that don't always show fully on the homepage. The homepage anchor matters because AI tools tend to treat the homepage as the canonical entity-defining page when synthesizing a one-paragraph answer about a site.

Several signals (canonical URLs, contentUpdateRecency, authorBylines) genuinely require multi-page evidence and are evaluated against the inner-page findings. The site-type detection from Phase 0 determines which inner pages are most useful to visit.

### What passes vs. fails AEO testing

**Passes:** Schema present and complete on the homepage, robots.txt allows AI crawlers, sitemap is fresh, content can be parsed by AI without JS, headings answer questions directly, entities (business name, service, audience) are unambiguous in the first scroll.

**Fails:** Missing or malformed schema, robots.txt blocking AI crawlers, no sitemap, content requires JS to render, dense paragraph copy with no extractable sentences, no named team or external validation, generic positioning ("full-service digital agency"), no llms.txt.

### Edge cases

- **Single-page sites** — evaluate Phase 2 inner-page signals based on the same homepage, noting in `notes` that no separate inner pages exist. Cap `visitedPages` at the homepage URL only and record the constraint in `technicalNotes`.
- **Sites behind a paywall or login** — evaluate what's accessible. Note in `technicalNotes` that crawler-accessible content is limited.
- **Sites with locale routing** — evaluate the locale you landed on. If a `hreflang` is present and the English version is reachable, prefer it.
- **Sites with cookie/consent walls that block content** — evaluate the post-consent state. Accept consent in the browser session before evaluating.
