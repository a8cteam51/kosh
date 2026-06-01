# Canonical signal keys — AEO Mode

Use these exact keys when populating `criteria.{criterion}.signals.{key}` and `issues.*[].signal` in the JSON report. Do not invent variants. Consistency across runs depends on this list being authoritative. If a signal name is missing or unclear, surface it to the maintainer rather than inventing a new key.

```text
technicalHealth:     robotsAndCrawlerAccess, noNoindex, httpsNoMixedContent,
                     sitemapLastmod, nojsAccessible, canonicalUrls

structuredData:      organizationSchema, primaryEntitySchema, faqSchema,
                     relevantSchemasApplied, jsonLdFormat, openGraphTags,
                     reviewSchema

aeoReadiness:        directAnswers, whoWhatWho, featuredSnippetStructure,
                     answerCapsules, faqSectionPresent, faqSchemaApplied,
                     questionFramedHeadings, titleAndMetaQuestionMatch

eeatSignals:         namedTeamMembers, authorCredentials, authorBylines,
                     demonstratedExpertise, externalCitations, certificationBadges,
                     namedExternalRelationships, tenureIndicators

contentFreshness:    copyrightYearCurrent, blogNewsRecent, dateStampsOnContent,
                     contentUpdateRecency, sitemapLastmodRecent,
                     recentFeaturedWork, currentDomainReferences

entityClarity:       entityIdentifiable, primaryFocusSpecificity,
                     socialProfileLinks, geographicMarketClarity,
                     consistentIdentity

contentSpecificity:  primaryOfferingDetail, namedSpecificEntities,
                     namedSubjectAreas, specificOutcomes, passageExtractionQuality

llmsTxt:             llmsTxtPresent, llmsFullTxtPresent, llmsTxtContent
```

**49 signals across 8 criteria. Each signal is evaluated to `pass` / `partial` / `fail` / `na` — see `evaluation-rubric.md` for tier definitions.**

## Site type field

The top-level `siteType` field on every report uses one of these values:

```text
agency, ecommerce, mediaBlog, saas, education,
localBusiness, nonprofit, community, other
```

The site type is detected in Phase 0 and propagated into how generalized signals are evaluated. The default is `other` when detection is ambiguous.

## Notes on intentional collisions

- `sitemapLastmod` (under `technicalHealth`) and `sitemapLastmodRecent` (under `contentFreshness`) are deliberately distinct keys. The first asks whether lastmod is present and well-formed; the second asks whether dates are recent enough to signal freshness.
- `featuredSnippetStructure` and `answerCapsules` overlap conceptually but are evaluated separately. `featuredSnippetStructure` counts extractable sentences across the whole page (definitions, numbered steps, FAQ answers). `answerCapsules` is stricter: 40–60 word self-contained answers placed **directly** under an H2/H3 — the specific structural pattern AI engines extract verbatim.
- `primaryEntitySchema` and `relevantSchemasApplied` work together but ask different questions. `primaryEntitySchema` asks "is the dominant schema type for this site's homepage present and well-formed?" — content-driven, not siteType-driven. `relevantSchemasApplied` asks "of every schema type whose content actually appears on this site, what percent are backed by matching schema markup?" — captures the nonprofit-with-events-but-no-Event-schema pattern. A site can pass one and fail the other.
- `dateStampsOnContent` (per-post visible dates) and `contentUpdateRecency` (per-page "Last updated" stamps within the last 12 months) are distinct. A site can show post dates but never update them — `dateStampsOnContent` would pass, `contentUpdateRecency` would fail.
- `authorCredentials` (named expertise on the byline area or bio) and `authorBylines` (visible byline on articles, linked to an author page with Person schema) are distinct. A site can have an authors page with credentials but no bylines on articles, which is a real failure mode.

## Aliases (historical)

These keys were used in earlier drafts and should never appear in new reports. The Aliases column is included only so analyses of pre-refactor reports can be normalized to the canonical names.

| Canonical key | Historical alias | Notes |
|---|---|---|
| `primaryEntitySchema` | `serviceSchema` | Broadened to evaluate whichever primary schema type matches the detected site type's content (Service, Product, Article, Recipe, HowTo, Event, Course, LocalBusiness). |
| `namedExternalRelationships` | `namedClientPartnerships` | Broadened from "named clients" to "named external relationships" (clients, partners, distributors, sponsors, contributors, sources). |
| `tenureIndicators` | `yearsInBusiness` | Broadened from "years in business" to any tenure marker (founded in, publishing since, active since, established). |
| `recentFeaturedWork` | `recentPortfolio` | Broadened from "portfolio or case study work" to any recent featured content (portfolio, posts, products, releases, episodes, exhibits). |
| `currentDomainReferences` | `currentTechReferences` | Broadened from "agency tech stack" to any current references in the site's domain (technology, research, methods, standards, regulations). |
| `primaryFocusSpecificity` | `serviceSpecificity` | Broadened from "service offering specificity" to "primary focus specificity" (services, products, topic verticals, program areas). |
| `primaryOfferingDetail` | `serviceDetail` | Broadened from "service detail" to "primary offering detail" — the what/who/outcome pattern applied to whatever the site primarily offers. |
| `namedSpecificEntities` | `namedPlatformsTech` | Broadened from "platforms and technologies" to any named specific entities relevant to the site's domain (platforms, brands, publishers, accreditations, frameworks). |
| `namedSubjectAreas` | `namedIndustries` | Broadened from "industries served" to "subject areas" (industries, topic verticals, product categories, program areas). |

Signals removed:

| Removed key | Where it went |
|---|---|
| `aboutTeamPageLinked` | The "linked About/Team page" check is now embedded inside `namedTeamMembers`: visiting the About/Team page is how you verify named individuals exist. |
| `twitterCardMeta` | Retired during the content-driven schema refactor. Twitter Card meta has minimal independent AI-citation impact in 2026 — Open Graph tags already cover the AI-relevant social metadata layer, and X.com's citation weight has dropped sharply. |

Signals added:

| New key | Criterion | Why added |
|---|---|---|
| `canonicalUrls` | technicalHealth | AI engines explicitly use `<link rel="canonical">` to dedupe pages and pick the source-of-truth URL. |
| `answerCapsules` | aeoReadiness | 72.4% of ChatGPT-cited pages have 40–60 word self-contained answer capsules under H2/H3. Strongest 2026 AEO signal. |
| `authorBylines` | eeatSignals | Articles with visible bylines linked to author pages with Person schema are Google AI Mode's primary author-entity verification path. |
| `contentUpdateRecency` | contentFreshness | Perplexity cites content from the last 30 days at 82% and gives 3.2× more weight to pages updated in the last 12 months. Per-page "Last updated" stamps matter independently from sitemap lastmod. |
| `relevantSchemasApplied` | structuredData | A site's content can map to multiple schema types — a nonprofit that runs annual events needs both NGO and Event; a media blog with tutorials needs both Article and HowTo. This signal evaluates the coverage ratio: of every schema type whose content actually appears on the site (detected in Phase 0.4), how many are backed by matching JSON-LD / microdata / RDFa? Content-driven, not siteType-driven. |
| `titleAndMetaQuestionMatch` | aeoReadiness | For pages targeting a specific question, the `<title>` and `<meta name="description">` should include the question or a close variant. Signals to AI systems what the page is answering. The Team 51 AEO 101 post explicitly calls this out as Foundation 3 of new-build AEO. |
