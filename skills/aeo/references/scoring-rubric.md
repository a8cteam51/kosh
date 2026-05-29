# Scoring rubric — AEO Mode

Reference summary of every signal's max points, grouped by criterion. The full scoring rules (tier definitions for each signal) live next to each signal definition in Phases 1, 2, or 3 of `SKILL.md`. This file is a quick-lookup index — read it at the end of Phase 4 to verify every signal has been scored before generating the report.

**49 signals across 8 criteria, 100 points total.**

## Technical Health — 20 pts
| Signal | Max |
|---|---|
| robots.txt and AI crawler access (training-vs-retrieval split aware) | 6 |
| No noindex on homepage | 4 |
| HTTPS, no mixed content | 4 |
| Sitemap with valid lastmod dates | 3 |
| Core content accessible without JavaScript | 2 |
| Canonical URLs on homepage and inner pages | 1 |
| **Subtotal** | **20** |

## Structured Data — 18 pts
| Signal | Max |
|---|---|
| Organization schema | 5 |
| Primary entity schema (the dominant schema type for this site's content — determined by Phase 0.3 relevance scan, not fixed siteType lookup) | 3 |
| Relevant schemas applied (coverage ratio: of every schema type whose content appears on the site, how many are backed by matching markup) | 3 |
| FAQ schema | 3 |
| JSON-LD format used (JSON-LD / microdata / RDFa) | 2 |
| Open Graph tags complete | 1 |
| Review or AggregateRating schema | 1 |
| **Subtotal** | **18** |

## AEO Readiness — 16 pts
| Signal | Max |
|---|---|
| Direct answers after headings | 3 |
| FAQ section present | 3 |
| Answer capsules (40–60 word self-contained answers under H2/H3) | 2 |
| Featured snippet structure (extractable sentences across the page) | 2 |
| Who / what / who content (publisher / focus / audience) | 2 |
| Question-framed headings | 2 |
| Title and meta description question-match | 1 |
| FAQ schema applied | 1 |
| **Subtotal** | **16** |

## E-E-A-T Signals — 14 pts
| Signal | Max |
|---|---|
| Named individuals with roles (team / authors / founders / contributors) | 3 |
| Author credentials or bios | 2 |
| Demonstrated expertise (specifics, sources, methodology) | 2 |
| External citations or press | 2 |
| Credentialing badges (certifications, journalism awards, trust marks) | 2 |
| Author bylines linked to author pages with Person schema | 1 |
| Named external relationships (clients, partners, sponsors, sources) | 1 |
| Tenure indicators (founded in, publishing since, active since) | 1 |
| **Subtotal** | **14** |

## Content Freshness — 12 pts
| Signal | Max |
|---|---|
| Copyright year current | 3 |
| Blog / news / featured content section (last 6 months) | 3 |
| Date stamps on posts or featured items | 2 |
| Sitemap lastmod dates recent | 1 |
| Per-page "Last updated" stamps within last 12 months | 1 |
| Recent featured work (portfolio, posts, products, releases) | 1 |
| Current domain references (current tech, research, methods, standards) | 1 |
| **Subtotal** | **12** |

## Entity Clarity — 10 pts
| Signal | Max |
|---|---|
| Named entity identifiable in one sentence | 3 |
| Primary focus specificity (services / products / topics / programs) | 3 |
| Social profile links in footer | 2 |
| Geographic or market clarity | 1 |
| Consistent identity signals | 1 |
| **Subtotal** | **10** |

## Content Specificity — 7 pts
| Signal | Max |
|---|---|
| Primary offering detail (what, who, outcome) | 2 |
| Named specific entities (platforms, brands, publishers, frameworks) | 2 |
| Named subject areas (industries, topic verticals, program areas) | 1 |
| Specific outcomes or quantified results | 1 |
| Passage extraction quality | 1 |
| **Subtotal** | **7** |

## llms.txt — 3 pts
| Signal | Max |
|---|---|
| llms.txt present | 2 |
| llms-full.txt present | 0.5 |
| llms.txt content accurate and specific | 0.5 |
| **Subtotal** | **3** |

## Grand total

20 + 18 + 16 + 14 + 12 + 10 + 7 + 3 = **100**

## Score thresholds

| Score | Status |
|---|---|
| 80 – 100 | Strong |
| 50 – 79 | Needs work |
| 0 – 49 | At risk |
