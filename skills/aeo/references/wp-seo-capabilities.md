# WordPress core + Jetpack SEO capability matrix

What WordPress **core** and **Jetpack** can emit natively for each plugin-dependent AEO signal, and where a third-party SEO plugin (Yoast / RankMath / AIOSEO) or custom code is genuinely required.

The AEO skill reads this file to make its fix recommendations **native-first**: recommend the core / Jetpack path when one exists, and only fall back to a third-party plugin for capabilities neither core nor Jetpack provides. It also reads `lastVerified` below to decide whether to surface a re-verification notice (see "Staleness check").

**lastVerified:** 2026-07-15
**stalenessThresholdDays:** 90

---

## The split in one sentence

Core + Jetpack cover **meta descriptions, Open Graph, XML sitemaps (with lastmod), canonical URLs, and robots/noindex**. **Every JSON-LD schema type is a gap in both** — that is the only place a third-party plugin (or custom code) is actually warranted, and the set worth flagging to the Jetpack team as an enhancement opportunity.

---

## Native-first — covered by core and/or Jetpack (no third-party plugin needed)

| AEO signal | WordPress core | Jetpack | Native fix to recommend |
|---|---|---|---|
| `openGraphTags` | ❌ none | ✅ Automatic OG tags — **free** (Social / Sharing module) | Enable Jetpack Social/Sharing; OG tags emit automatically. |
| `sitemapLastmod`, `sitemapLastmodRecent` | ⚠️ Sitemap present (`wp-sitemap.xml`) but **no `<lastmod>`** by default (deliberate — Trac #52099) | ✅ XML Sitemaps emit per-URL `<lastmod>` — **free** (Jetpack → SEO → Sitemaps), refreshed ~12h. Confirmed in Jetpack's `sitemap-builder.php` (`jp_sitemap_datetime()`). | Enable Jetpack Sitemaps for lastmod support (core sitemap alone will score `partial` — no lastmod). |
| `canonicalUrls` | ⚠️ Self-referential canonical on **singular** views (posts/pages) only; **not** on a blog-posts-index front page (`is_home`) or on archives | ✅ Adds canonical to **archive** pages too (SEO Tools) | Core covers singular pages; if the front page is the posts index, or for archives, enable Jetpack canonical-for-archives (or a SEO plugin). |
| `noNoindex` / robots meta | ✅ `wp_robots()` + Settings → Reading indexing control | (respects core) | Core-only; toggle Settings → Reading "Discourage search engines" appropriately. |
| `titleAndMetaQuestionMatch` (editable title + meta description) | ⚠️ Title tag via `title-tag` support; **no meta description**, no per-page SEO title | ✅ Custom SEO titles + front-page/per-post meta descriptions (Jetpack **SEO Tools**) | Use Jetpack SEO Tools to set SEO title / meta description. |

**Jetpack tiers (verify on re-check):**

- **Free:** Open Graph tags (Social/Sharing), XML Sitemaps (with lastmod).
- **Paid (SEO Tools — Professional / Complete or the Security/Complete bundles):** custom SEO titles, per-post & front-page meta descriptions, archive canonical URLs.
- **Complete only:** AI auto-generation of SEO titles / descriptions / image alt text.

> When a native fix relies on a **paid** Jetpack tier, say so in the recommendation and note the free fallback (core, or a free third-party plugin) so the effort/cost is honest.

---

## Genuine gap — neither core nor Jetpack emits these (third-party plugin or custom code)

Jetpack emits **no schema.org JSON-LD at all**, and core emits none by default. All of the following require Yoast, RankMath, AIOSEO, a dedicated schema plugin, or hand-rolled JSON-LD:

| AEO signal | Who can provide it |
|---|---|
| `organizationSchema` | Yoast / RankMath / AIOSEO (Organization), or custom JSON-LD |
| `primaryEntitySchema` (Article / Service / Product / Event / HowTo / Course / etc.) | RankMath (broadest type coverage), Yoast (Article + limited), schema plugins, or custom |
| `faqSchema` | RankMath FAQ block, Yoast FAQ block, dedicated FAQ-schema plugins, or custom |
| `reviewSchema` (Review / AggregateRating) | RankMath, schema plugins, or custom |
| `relevantSchemasApplied` (Event, HowTo, Product, Recipe, …) | RankMath / schema plugins / custom, per type |
| Article schema + populated `author` (feeds `authorBylines`) | Yoast / RankMath, or custom |
| Breadcrumb schema | Yoast / RankMath |

> This is the set to flag to the Jetpack team as a native-SEO enhancement opportunity, and the only set where the AEO skill should recommend a third-party plugin as the primary fix.

---

## How the skill uses this file

1. **Native-first recommendations.** For any signal in the "native-first" table above, the actionable prompt and effort rationale recommend the core / Jetpack path first (naming the free vs. paid tier). Only for the "genuine gap" signals does the skill recommend a third-party plugin or custom JSON-LD as the primary fix.
2. **Effort adjustment.** Native fixes that are toggles (enable Jetpack Sitemaps, enable Social) are `low`. Schema-gap fixes stay `medium` (plugin install/config) or rise per stack, per the Issue effort guide.
3. **Staleness check.** At CMS-detection time the skill compares `lastVerified` to the current date. If the gap exceeds `stalenessThresholdDays`, it prints a one-line notice to the operator and records `capabilityMatrixStale: true` plus `capabilityMatrixLastVerified` in `technicalNotes`. Under the threshold it stays silent but still records the date.

---

## How to re-verify (bump `lastVerified` after)

Re-check these public docs and update the rows + the `lastVerified` date above:

- Jetpack SEO Tools — <https://jetpack.com/support/seo-tools/> (titles, meta descriptions, archive canonicals, tiering)
- Jetpack Sitemaps — <https://jetpack.com/support/sitemaps/> (update frequency) and the sitemap builder source (`modules/sitemaps/sitemap-builder.php` in <https://github.com/Automattic/jetpack>) which confirms per-URL `<lastmod>` output via `jp_sitemap_datetime()`
- Jetpack Open Graph — <https://developer.jetpack.com/hooks/jetpack_open_graph_tags/> (OG output, module)
- WordPress core XML sitemaps — <https://make.wordpress.org/core/2020/07/22/new-xml-sitemaps-functionality-in-wordpress-5-5/> and lastmod ticket <https://core.trac.wordpress.org/ticket/52099>
- WordPress core structured data — confirm core still emits no JSON-LD by default (test a default-theme install, or the WP plugin directory `json-ld` tag)

Also confirm whether Jetpack has **added any schema.org JSON-LD output** since the last check — if so, move the affected rows out of the "genuine gap" table.

**Sources of record (last verified 2026-07-15):** Jetpack SEO Tools, Jetpack Sitemaps support doc + `sitemap-builder.php` source (per-URL lastmod), Jetpack Open Graph developer hook, WordPress 5.5 core sitemaps announcement + Trac #52099 (core omits lastmod), WordPress core JSON-LD-by-default (none).
