# Evaluation rubric — AEO Mode

Reference summary of every signal's pass/partial/fail tier definitions, grouped by criterion. The full evaluation rules (the why, the code snippets, the edge cases) live next to each signal definition in Phases 1, 2, or 3 of `SKILL.md`. This file is a quick-lookup index — read it at the end of Phase 4 to verify every signal has been evaluated before generating the report.

**49 signals across 8 criteria. Every signal evaluates to `pass`, `partial`, `fail`, or `na`.** There are no point values, no criterion subtotals, and no threshold labels — see `SKILL.md` Section 4 for the evaluation philosophy.

The `na` status is allowed only where the signal's section in SKILL.md explicitly defines an N/A exemption (typically: `faqSchema` and `faqSchemaApplied` on sites with no FAQ content; `relevantSchemasApplied` when `inScopeCount` is 0 — no content pattern matches any schema-eligible type beyond the excluded Organization/FAQPage/Review; `certificationBadges` when no third-party credential applies to the org/field; `specificOutcomes` when no quantifiable outcomes apply; `namedTeamMembers` (and dependent `authorCredentials`) on deliberately-anonymous sites; `authorBylines` and `contentUpdateRecency` on sites with no editorial content; `recentFeaturedWork` and `currentDomainReferences` on bare single-page sites). When you use `na`, record the rationale in the signal's `notes` field.

**Severity note:** the content-quality criteria — E-E-A-T Signals, Content Freshness, Entity Clarity, Content Specificity, and the content-side AEO Readiness signals (`directAnswers`, `whoWhatWho`, `featuredSnippetStructure`, `answerCapsules`) — cap at `low` severity in the report (TAM judgment). Technical Health, Structured Data, and llms.txt keep normal critical/high/medium severity. `questionFramedHeadings` and `faqSectionPresent` also cap at `low` as optional/stylistic. See `SKILL.md` Section 5 "Issue severity guide."

## Technical Health (6 signals)

| Signal | pass | partial | fail |
| --- | --- | --- | --- |
| robotsAndCrawlerAccess | All live-retrieval bots allowed (training scrapers may be blocked — that is neutral). | One live-retrieval bot blocked, rest fine. | Multiple live-retrieval bots blocked, blanket Disallow, severely misconfigured, or absent. |
| noNoindex | No noindex on the homepage (on prod). On dev/staging, noindex is correct and counts as `pass`. | — | Noindex present on a production homepage. |
| httpsNoMixedContent | HTTPS active, no mixed content. | HTTPS active but mixed content present (HTTP-served images, scripts, or stylesheets). | HTTP only. |
| sitemapLastmod | Sitemap present with at least one lastmod within 90 days. | Present with lastmod but all dates over 90 days. | Absent, or present but malformed / unreachable / all dates over 1 year. |
| nojsAccessible | H1 and 500+ chars of body copy visible without JavaScript. | Some content visible but significantly degraded without JS. | Page is blank or nearly empty without JS. |
| canonicalUrls | Homepage has `<link rel="canonical">` AND at least 2 inner pages have self-referential canonical tags. | Homepage canonical present but inner pages missing canonical, OR canonical present everywhere but pointing to the wrong URL on some pages. | No canonical tag on the homepage. |

## Structured Data (7 signals)

| Signal | pass | partial | fail |
| --- | --- | --- | --- |
| organizationSchema | JSON-LD Organization present with name, url, logo, and at least one sameAs. | JSON-LD Organization present but sparse, OR microdata/RDFa-only with key fields populated. | Absent. |
| primaryEntitySchema | JSON-LD primary entity schema present (type matches Section 0.4 relevance scan expected primary) AND required fields populated. | Schema of correct type present but sparse (key required fields missing), OR microdata/RDFa-only with required fields. | No schema matches the expected primary type for this site's content. |
| relevantSchemasApplied | Coverage ≥ 90% — every high/medium-relevance schema is backed by matching markup. (`Organization`, `FAQPage`, and `Review` are excluded from this coverage ratio — each has its own standalone signal above.) | Coverage 30–89% — significant gaps, may include one or more gaps on `high`-relevance schemas. | `inScopeCount` > 0 AND (coverage < 30%, OR no schemas of any kind present). (`inScopeCount` is 0 → `na`, never `fail` — see the na-allowlist note above.) |
| faqSchema | Visible FAQ content AND JSON-LD FAQPage with 2+ valid Q&A pairs. Both relevance and schema presence are cross-page — check whichever page (homepage or a dedicated FAQ page) actually carries them. | Visible FAQ content but malformed JSON-LD, OR microdata/RDFa-only FAQ markup, OR `faqRelevance` is `medium` (3+ answered question-framed headings, no FAQ container/heading/accordion) and no schema present. | Visible FAQ content but no FAQ schema. (`na` when the site has no FAQ content — never `fail` merely for lacking an FAQ.) |
| jsonLdFormat | JSON-LD present (any blocks). Microdata and/or RDFa may also be present. | No JSON-LD, but microdata OR RDFa present. Record the format breakdown in `notes`. | None of JSON-LD, microdata, or RDFa present. |
| openGraphTags | og:title, og:description, AND og:image all present. | At least one of og:title / og:description / og:image present, but not all three. | None present. |
| reviewSchema | Review or AggregateRating schema present in any format. | — | Absent. |

## AEO Readiness (8 signals)

| Signal | pass | partial | fail |
| --- | --- | --- | --- |
| directAnswers | ≥ 70% of H2s/H3s are followed by a direct first-sentence answer. | 10–69% of headings answered directly. | < 10%, OR content not structured in heading/answer format. |
| whoWhatWho | All three identity elements (publisher / focus / audience) answerable from the homepage within first scroll. | Two of three answerable. | One or fewer answerable. |
| featuredSnippetStructure | 5+ extractable sentences across the homepage. | 2–4 extractable sentences. | 0–1 extractable sentences. |
| answerCapsules | 3+ answer capsules (40–60 word self-contained answers directly under H2/H3) across analyzed pages. | 1–2 answer capsules. | No qualifying capsules. |
| faqSectionPresent | FAQ section found (homepage or dedicated FAQ page) with 2+ Q&A pairs. | Partial — accordion present but only 1 item, OR `faqSectionFound` is false but `answeredQuestionHeadingCount` ≥ 3 (a de facto FAQ: 3+ question-framed headings each followed by answer text, no FAQ container/heading/accordion). | Absent. **Optional — cap any issue at `low`; suggest, don't flag as critical.** |
| faqSchemaApplied | Visible FAQ content AND FAQ JSON-LD schema both present, on whichever page carries each (cross-page, not homepage-only). | FAQ schema present but no visible FAQ content (or vice versa), OR `faqRelevance` is `medium` and no schema present. | FAQ warranted but neither in place. (`na` when the site has no FAQ content.) |
| questionFramedHeadings | 2+ H2/H3 phrased as questions. | One question-framed heading. | None. **Stylistic — cap any issue at `low`; word as a consideration, not a defect.** |
| titleAndMetaQuestionMatch | ≥ 50% of question-targeting pages have a `<title>` or `<meta name="description">` that describes the page (≥ 50% H1 token overlap; question phrasing optional, never required). | 20–50% of question-targeting pages clear the overlap bar, OR homepage fine but inner pages not. | Title and meta are present-but-generic on every sampled page with no topical alignment to the page anywhere. |

## E-E-A-T Signals (8 signals)

| Signal | pass | partial | fail |
| --- | --- | --- | --- |
| namedTeamMembers | Named individuals with type-appropriate roles visible (homepage or About/Team/Authors page). | Site references team through anonymous language only ("our team", "our editors") — no names. | No team / author / staff signals at all. (`na` when the site is deliberately anonymous.) |
| authorCredentials | Specific, verifiable credentials (named past employers/clients, recognized certifications, degrees). | Generic "years of experience" / "industry leader" without specifics. | No credentials mentioned. (`na` when `namedTeamMembers` is `na`.) |
| authorBylines | Visible byline AND author name linked to an author page AND article schema (any format) has populated `author`. | Visible byline AND linked author page, but no `author` on schema, OR `author` present in microdata/RDFa only. | No byline, or byline with no link, or no Article schema in any format. (`na` allowed for sites with no editorial content — record rationale.) |
| demonstratedExpertise | 3+ specifics (named methodologies, sources, technologies, outcomes with numbers, primary citations). | 1–2 specifics with the rest of the copy claiming expertise without evidence. | 0 specifics — only generic claims ("award-winning", "leading"). |
| externalCitations | Named external validation present (named publications, podcasts, awards with named bodies). | Vague "featured in" / "as seen on" without named outlets. | Absent. |
| certificationBadges | Credentialing badges present AND visually confirmed as legible/recognizable, matched to the site type. | DOM indicators found but visual confirmation unclear, or only weak credentials (e.g. SSL-vendor badges). | Absent. (`na` when no third-party credential applies to the org/field.) |
| namedExternalRelationships | At least one named external relationship in copy (clients, partners, sources, funders) — not just a logo. | — | All relationships anonymous, generic ("our clients"), or logo-only. |
| tenureIndicators | Any tenure indicator found (founded YYYY, since YYYY, N years experience, publishing since YYYY, etc.). | — | Absent. |

## Content Freshness (7 signals)

| Signal | pass | partial | fail |
| --- | --- | --- | --- |
| copyrightYearCurrent | Copyright year matches current year. | One year behind. | Two or more years stale, or absent. |
| blogNewsRecent | Blog/news/featured content section present with content dated within last 6 months. | Section present but content older than 6 months. | No blog/news/featured content section found. |
| dateStampsOnContent | Date stamps visible on posts or featured items. | — | Absent. |
| contentUpdateRecency | Visible "Last updated" stamp within the last 12 months on at least one sampled inner page (or `dateModified` in article schema within 12 months). | — | No visible update stamps anywhere, OR stamps present but all >12 months old. (`na` allowed for sites with no editorial content.) |
| sitemapLastmodRecent | Sitemap has lastmod dates within 90 days. | — | Absent or all stale. |
| recentFeaturedWork | Recent featured work (last 12 months) visible (varies by site type — see SKILL.md table). | — | Work appears dated, references deprecated tools/platforms, or no featured work exists. (`na` allowed for bare single-page sites.) |
| currentDomainReferences | Domain references (technology, research, methods, standards) appear current. | — | Deprecated/retired/superseded references cited as current. (`na` allowed for bare single-page sites.) |

## Entity Clarity (5 signals)

| Signal | pass | partial | fail |
| --- | --- | --- | --- |
| entityIdentifiable | A single clear identifying sentence (entity + type + specialty) constructable from the homepage text. | Partially identifiable (2 of 3 elements clear). | One element clearly stated, or cannot identify the entity at all. |
| primaryFocusSpecificity | Primary focus described highly specifically (e.g. "WordPress agency for DTC ecommerce brands on Shopify"). | Moderately specific OR generic. | No clear focus described. |
| socialProfileLinks | LinkedIn AND at least one other professional/social profile linked from the footer. | Only one social link present. | None. |
| geographicMarketClarity | Location, timezone, or market focus stated on the homepage. | — | No location or market reference. |
| consistentIdentity | Consistent identity across hero, about section, and footer. | — | Contradictory or inconsistent positioning across zones. |

## Content Specificity (5 signals)

| Signal | pass | partial | fail |
| --- | --- | --- | --- |
| primaryOfferingDetail | What/who/outcome answered for most primary offerings. | Partially answered for most offerings. | Offerings listed by category label only with no detail. |
| namedSpecificEntities | 2+ named specific entities relevant to the domain (platforms, brands, publishers, frameworks). | 1 named specific entity. | None — generic abstractions only. |
| namedSubjectAreas | Specific subject areas named (industries, topic verticals, product categories, program areas). | — | Generic ("businesses", "people", "everyone"). |
| specificOutcomes | Specific quantified outcomes or named achievements present. | — | Vague claims only ("we get results", "great quality"). (`na` when no quantifiable outcomes apply to the site.) |
| passageExtractionQuality | Most sections yield clean extractable summaries. | — | Sections require surrounding context to make sense. |

## llms.txt (3 signals)

| Signal | pass | partial | fail | na |
| --- | --- | --- | --- | --- |
| llmsTxtPresent | llms.txt present and non-empty. | — | Absent. | — |
| llmsFullTxtPresent | llms-full.txt present. | — | Absent. | — |
| llmsTxtContent | llms.txt content specific and accurate (matches site name, type, and specialty). | — | Vague boilerplate. | Allowed when llmsTxtPresent itself is `fail` — record `na` with note "N/A — llms.txt not present." |
