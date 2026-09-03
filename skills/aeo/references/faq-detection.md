# Canonical FAQ detection — single source of truth

**Version:** 2  ·  **Consumers:** `faqRelevance` (Section 0.4), `faqSchema` (1.3), `faqSectionPresent` + `faqSchemaApplied` (1.4), functional-page FAQ check (2.1)

Every FAQ determination in the AEO skill — is there an FAQ, is it marked up, how well — comes from the one probe defined below. **Do not re-derive, paraphrase, or partially inline any part of it in `SKILL.md`.** Previous revisions of this skill carried three "identical" copies of this logic in Sections 1.3, 1.4, and 2.1; each fix round patched one copy and left the others behind, which is what produced the false `critical` findings this file exists to prevent. Sections reference this probe by name and consume its outputs.

## The probe

Inject and run on **every page** where FAQ evidence is collected: the homepage (Section 1.3), a dedicated `/faq` · `/faqs` · `/help` · `/support` page if one exists (Section 1.4 / Phase 2 optional visit), and the type-specific functional page (Section 2.1). It is one `page.evaluate()` per page and returns every field those sections need, so no section needs a second FAQ probe.

```javascript
function koshFaqProbe() {
  // Self-contained by design: everything this probe needs is defined inside it, so the
  // single instruction "inject koshFaqProbe" can never leave a helper behind. An earlier
  // revision kept isSchemaOrgRdfa in a second fenced block and every injection
  // instruction named only the probe, so the [typeof] scan threw ReferenceError on any
  // page carrying a typeof attribute.

  // Does this element's `typeof` resolve to schema.org? Shared with jsonLdFormat via the
  // schemaOrgRdfaCount return field, so the two signals cannot disagree about RDFa.
  const isSchemaOrgRdfa = el => {
    // RDFa's initial context maps the `schema:` prefix to schema.org, so a
    // `schema:`-prefixed type is unambiguous without an explicit vocab/prefix scope.
    if (/(^|\s)schema:/.test(el.getAttribute('typeof') || '')) return true;
    const vocab = el.closest('[vocab]');
    if (vocab && /schema\.org/.test(vocab.getAttribute('vocab') || '')) return true;
    const prefix = el.closest('[prefix]');
    return !!prefix && /schema\s*[:=]\s*https?:\/\/schema\.org/.test(prefix.getAttribute('prefix') || '');
  };

  // innerText is preferred (it respects visibility); textContent is the fallback for
  // headless/DOM contexts that don't implement innerText.
  const txt = el => ((typeof el.innerText === 'string' ? el.innerText : el.textContent) || '').trim();

  // ---------------------------------------------------------------------------
  // Visible FAQ evidence
  // ---------------------------------------------------------------------------
  // Case-insensitive attribute matching ([... i]) replaces the hand-listed case
  // variants that used to differ between copies of this logic ('faq' in one place,
  // 'faq' + 'FAQ' in another, so the same page scored differently per section).
  const FAQ_CONTAINER_SELECTOR = '[class*="faq" i], [id*="faq" i]';
  const FAQ_HEADING_PATTERN = /frequently asked|common questions|\bfaqs?\b/i;

  const headings = Array.from(document.querySelectorAll('h2, h3'));
  const hasFaqContainer = !!document.querySelector(FAQ_CONTAINER_SELECTOR);
  const hasFaqHeading = headings.some(h => FAQ_HEADING_PATTERN.test(txt(h)));
  const detailsElements = document.querySelectorAll('details').length;
  const hasFaqAccordion = detailsElements >= 2;
  const hasFaqMarkers = hasFaqContainer || hasFaqHeading || hasFaqAccordion;

  // De facto FAQ: a question-framed heading only counts when answer-like body text
  // actually follows it. That test is what separates a real Q&A block from CTA
  // headings ("Questions?", "Ready to get started?") that merely end in "?".
  // Lookahead is deliberately tolerant of theme wrappers: up to two following
  // siblings, stopping at the next heading, then the heading's parent's next sibling
  // for themes that wrap each heading in its own container.
  const ANSWER_TAGS = /^(P|DIV|UL|OL|DL|SECTION|ARTICLE|SPAN)$/;
  // The parent fallback below accepts CONTENT tags only. A SECTION/DIV/ARTICLE sitting
  // after a heading's wrapper is the next layout band, not this heading's answer — that
  // shape is how three CTA headings in separate page-builder bands ("Ready to get
  // started?", "Questions?") once scored as a de facto FAQ.
  const FALLBACK_ANSWER_TAGS = /^(P|UL|OL|DL)$/;
  const MIN_ANSWER_CHARS = 20;
  // A candidate containing a heading is the next question's wrapper, never an answer.
  const noHeading = el => !el.querySelector('h1, h2, h3, h4, h5, h6');
  const isAnswerLike = el =>
    !!el && ANSWER_TAGS.test(el.tagName) && noHeading(el) && txt(el).length > MIN_ANSWER_CHARS;
  const hasAnswerText = h => {
    let el = h.nextElementSibling;
    for (let i = 0; i < 2 && el; i++, el = el.nextElementSibling) {
      if (/^H[1-6]$/.test(el.tagName)) break; // next question — this one went unanswered
      if (isAnswerLike(el)) return true;
    }
    // Fallback for themes that wrap each heading alone: the heading must be its
    // wrapper's only element child, and the following element must be bare content.
    const parent = h.parentElement;
    const candidate = parent && parent.nextElementSibling;
    return !!parent && parent.children.length === 1 && !!candidate &&
      FALLBACK_ANSWER_TAGS.test(candidate.tagName) && noHeading(candidate) &&
      txt(candidate).length > MIN_ANSWER_CHARS;
  };

  const answeredQuestionHeadings = headings.filter(h => txt(h).endsWith('?')).filter(hasAnswerText);
  const answeredQuestionHeadingCount = answeredQuestionHeadings.length;
  // Threshold is 3, not 1: one "?" heading is a CTA, a cluster is an FAQ.
  const MIN_DE_FACTO_QUESTIONS = 3;
  const hasQuestionHeadingCluster = answeredQuestionHeadingCount >= MIN_DE_FACTO_QUESTIONS;

  const faqRelevance = hasFaqMarkers ? 'high' : hasQuestionHeadingCluster ? 'medium' : 'absent';
  const visibleFaq = hasFaqMarkers || hasQuestionHeadingCluster;

  // ---------------------------------------------------------------------------
  // FAQ schema tier — 'valid' | 'weak' | 'none'
  // ---------------------------------------------------------------------------
  // textContent, not innerText: for a non-rendered element the two are equivalent per
  // spec, but textContent states the intent and doesn't depend on that fallback.
  const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
  let hasMalformedFaqAttempt = false;
  const jsonLd = scripts.map(s => {
    try { return JSON.parse(s.textContent); }
    catch (e) { if (/FAQPage/.test(s.textContent)) hasMalformedFaqAttempt = true; return null; }
  }).filter(Boolean).flatMap(s => Array.isArray(s) ? s : (s['@graph'] || [s]));

  const types = node => [].concat((node && node['@type']) || []);
  const faqPageNodes = jsonLd.filter(n => types(n).includes('FAQPage'));
  // A Q&A pair must actually be a Question node with a non-empty acceptedAnswer.
  // Counting bare `mainEntity` array length let two empty objects reach 'valid'.
  const qaPairs = node => [].concat(node.mainEntity || []).filter(q =>
    q && typeof q === 'object' &&
    types(q).includes('Question') &&
    [].concat(q.acceptedAnswer || []).some(a => a && typeof a === 'object' && String(a.text || '').trim().length > 0)
  );
  const MIN_QA_PAIRS = 2;
  const hasValidJsonLdFaq = faqPageNodes.some(n => qaPairs(n).length >= MIN_QA_PAIRS);
  const hasWeakJsonLdFaq = (faqPageNodes.length > 0 && !hasValidJsonLdFaq) || hasMalformedFaqAttempt;

  // Microdata and RDFa are treated symmetrically: both accept FAQPage *and* Question,
  // so the same FAQ scores the same tier whichever syntax expresses it.
  const FAQ_TYPE_TOKENS = ['FAQPage', 'Question'];
  const hasMicrodataFaq = !!document.querySelector(
    '[itemscope][itemtype*="schema.org/FAQPage"], [itemscope][itemtype*="schema.org/Question"]'
  );
  const schemaOrgRdfaElements = Array.from(document.querySelectorAll('[typeof]')).filter(isSchemaOrgRdfa);
  const hasRdfaFaq = schemaOrgRdfaElements.some(el =>
    (el.getAttribute('typeof') || '').split(/\s+/)
      .some(tok => FAQ_TYPE_TOKENS.includes(tok.replace(/^schema:/, '')))
  );
  const hasNonJsonLdFaq = hasMicrodataFaq || hasRdfaFaq;

  const faqSchemaTier = hasValidJsonLdFaq ? 'valid'
    : (hasWeakJsonLdFaq || hasNonJsonLdFaq) ? 'weak'
    : 'none';

  return {
    // visible FAQ evidence
    faqRelevance,
    visibleFaq,
    hasFaqMarkers,
    answeredQuestionHeadingCount,
    faqSectionFound: hasFaqMarkers,
    dlPairs: document.querySelectorAll('dl').length,
    detailsElements,
    // schema evidence
    faqSchemaTier,
    faqSchemaFormats: {
      validJsonLd: hasValidJsonLdFaq,
      weakJsonLd: hasWeakJsonLdFaq,
      malformedJsonLd: hasMalformedFaqAttempt,
      microdata: hasMicrodataFaq,
      rdfa: hasRdfaFaq
    },
    // Consumed by jsonLdFormat (Section 1.3) so that signal's RDFa count and this
    // probe's RDFa test share one definition rather than two parallel injections.
    schemaOrgRdfaCount: schemaOrgRdfaElements.length,
    url: window.location.href
  };
}
```

### RDFa scope, shared with `jsonLdFormat`

`isSchemaOrgRdfa` lives **inside** the probe and its element count is returned as `schemaOrgRdfaCount`. Section 1.3's `jsonLdFormat` reads that field instead of re-implementing the test, so the two signals can never disagree about whether a page contains schema.org RDFa. Previously the FAQ check accepted any bare `schema:` prefix while `jsonLdFormat` required an explicit `vocab`/`prefix` scope, so one report could read "RDFa-only FAQ markup present" next to "no RDFa present" for the same markup.

There is deliberately **one** injectable block in this file. Anything the probe needs is defined within it: a second block that callers must remember to inject is a latent `ReferenceError`, and the injection instructions will not stay in sync with it.

### Known limitation: CTA band with supporting copy

A `?`-ending heading followed by a sibling paragraph in the same container is structurally
identical to a real FAQ item, so three CTA bands of the form
`<section><h2>Ready to get started?</h2><p>…copy…</p></section>` score
`faqRelevance: medium`. This is **accepted, not overlooked**:

- It predates the de-facto-FAQ tier (the original inline logic scored it the same way) and is
  unchanged by the consolidation.
- The consequence is bounded — `partial` with a "consider adding FAQ markup" suggestion,
  `faqSectionPresent` capped at `low`. It cannot produce a `critical`.
- Every available discriminator is worse: requiring the question cluster to share a container
  breaks accordions built as sibling wrappers, and pattern-matching CTA phrasing reintroduces
  the brittleness this file exists to remove.

This is a deliberate tradeoff, not an oversight. Revisit only with evidence from real
report runs that it misleads partners.

The matching **false negative** is the price of that choice: because `FALLBACK_ANSWER_TAGS`
excludes layout tags, a wrapped-heading accordion whose answer is also wrapped —
`<div><h3>Q?</h3></div><div><p>A</p></div>` — is not counted by the fallback. The two shapes are
structurally indistinguishable (heading alone in one band, prose alone in the next), so one of
them has to lose; a missed de-facto FAQ costs a suggestion, while a phantom one puts three
signals into `partial` on a site with no FAQ. Pages like that almost always carry an FAQ
container, heading, or `<details>` accordion, so `hasFaqMarkers` scores them `high` regardless.

## Cross-page aggregation

FAQ evidence is **never homepage-only**. Aggregate across every page probed in the run, taking the strongest observation on each axis independently:

| Axis | Order | Aggregate |
| --- | --- | --- |
| `faqRelevance` | `high` > `medium` > `absent` | Strongest observed on any page |
| `faqSchemaTier` | `valid` > `weak` > `none` | Strongest observed on any page |

Both must travel together. Raising relevance from an inner page without also probing that page's schema is what produced the contradiction where `faqSectionPresent: partial` ("there's an unmarked FAQ") sat alongside `faqSchema: na` ("this site has no FAQ") in one report. Because the probe returns both axes in a single call, running it per page keeps them in step by construction.

`FAQPage` is deliberately excluded from the `relevantSchemasApplied` coverage ratio (via `STANDALONE_SIGNALS`) — it has its own signals here, so that ratio is not a consumer of these values.

## Status mapping

`faqSchema` (Structured Data) and `faqSchemaApplied` (AEO Readiness) read the same aggregates but carry **different severities**: a `faqSchema` `fail` is `critical` (or `high` under the consolidation rule), while `faqSchemaApplied` `partial` is `medium` with effort `low`. Never apply one signal's severity to the other.

**Never fail a site merely for lacking an FAQ.** `faqRelevance: absent` with `faqSchemaTier: none` → `na` on both schema signals, no issue generated. That is the expected outcome for the many sites that legitimately have no FAQ.

The `na` row is qualified on the tier because the two conditions are independent: a site can emit plugin-generated `FAQPage` JSON-LD while its visible FAQ renders client-side, giving `faqRelevance: absent` alongside `faqSchemaTier: valid`. Unqualified, that state matched both the `na` row and the schema-without-visible-FAQ row — `na` emits nothing, `partial` emits a `medium` finding. `partial` is correct: there is markup the rendered page never substantiates.

| Aggregate state | `faqSchema` | `faqSchemaApplied` |
| --- | --- | --- |
| `faqRelevance: absent` **and** `faqSchemaTier: none` | `na` | `na` |
| relevance `high`/`medium` + tier `valid` | `pass` | `pass` |
| relevance `high`/`medium` + tier `weak` | `partial` (tier-weak notes) | `partial` |
| relevance `high` + tier `none` | `fail` | `partial` |
| relevance `medium` + tier `none` | `partial` (unmarked-FAQ notes) | `partial` |
| tier `valid`/`weak` but no visible FAQ (incl. `faqRelevance: absent`) | `partial` | `partial` |

### Notes and remedy per `partial` branch

The two `partial` branches have different root causes and therefore different remedies. `actionablePrompts` emits one paste-ready prompt per `partial` signal, so a single shared string would hand a partner a prompt to build markup they already have.

- **Tier `weak`** (malformed JSON-LD, microdata-only, or RDFa-only) — the FAQ *is* marked up; the markup just isn't in the form AI engines consume best.
  `notes`: `"Partial — FAQ markup found as <malformed JSON-LD | microdata | RDFa>, not valid JSON-LD FAQPage."`
  Remedy: re-express the existing microdata/RDFa FAQ as JSON-LD `FAQPage` with 2+ `mainEntity` `Question` nodes each carrying a non-empty `acceptedAnswer`, or repair the unparseable JSON-LD block. Name the format actually found (from `faqSchemaFormats`) — do not tell the site to add markup it has.
- **Relevance `medium` + tier `none`** (de facto FAQ, no markers, no schema) — there is a real Q&A cluster that nothing identifies as an FAQ.
  `notes`: `"Partial — question-style headings suggest an unmarked FAQ; no formal FAQ markup or schema found."`
  Remedy: add explicit FAQ markup (container/heading/accordion) plus `FAQPage` schema.

## Changing this file

Any change to the probe changes four signals at once. Bump the **Version** above, update the status table and the rubric rows for `faqSchema` / `faqSchemaApplied` / `faqSectionPresent` in `evaluation-rubric.md` in the same commit, and manually re-verify the probe against the scenarios described earlier in this file (the walkthrough and the "Known limitation" case above).
