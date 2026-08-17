/**
 * Fixture checks for the canonical FAQ probe.
 *
 * The probe under test is EXTRACTED FROM the documentation
 * (skills/aeo/references/faq-detection.md), not copied here, so the code these
 * fixtures exercise is by construction the same code the skill instructs the agent
 * to run. If someone edits the snippet in the doc, these checks cover the edit.
 *
 * Usage:  node --experimental-vm-modules tests/faq-detection.test.mjs
 *         (requires jsdom on NODE_PATH, e.g. `npm i jsdom`)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

const here = dirname(fileURLToPath(import.meta.url));
const DOC = join(here, '..', 'skills', 'aeo', 'references', 'faq-detection.md');

/** Pull every ```javascript fenced block out of the reference doc, in order. */
function extractJsBlocks(path) {
  const md = readFileSync(path, 'utf8');
  return [...md.matchAll(/```javascript\n([\s\S]*?)```/g)].map(m => m[1]);
}

const blocks = extractJsBlocks(DOC);
if (blocks.length < 2) {
  throw new Error(`expected 2 javascript blocks in ${DOC} (probe + isSchemaOrgRdfa), found ${blocks.length}`);
}
// Order-independent: identify blocks by the function they define.
const probeSrc = blocks.find(b => /function koshFaqProbe/.test(b));
const rdfaSrc = blocks.find(b => /function isSchemaOrgRdfa/.test(b));
if (!probeSrc || !rdfaSrc) throw new Error('could not locate koshFaqProbe / isSchemaOrgRdfa in the reference doc');

function runProbe(html) {
  const dom = new JSDOM(html, { url: 'https://example.test/', runScripts: 'outside-only' });
  const { window } = dom;
  // Evaluate the documented source inside the page context.
  window.eval(`${rdfaSrc}\n${probeSrc}\nwindow.__result = koshFaqProbe();`);
  return window.__result;
}

// --- fixtures ----------------------------------------------------------------

const QA = (q, a) => `<h3>${q}</h3><p>${a}</p>`;
const ANSWER = 'This is a real answer with more than twenty characters of body text.';
const THREE_QUESTIONS = QA('How do I donate?', ANSWER) + QA('Where does my money go?', ANSWER) + QA('Can I give monthly?', ANSWER);

const jsonLdFaq = pairs => `<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: pairs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } }))
})}</script>`;

const cases = [
  {
    name: 'no FAQ at all → absent / none (never fail a site for lacking an FAQ)',
    html: `<h2>Our Mission</h2><p>${ANSWER}</p><h2>Questions?</h2><a href="/contact">Contact us</a>`,
    expect: { faqRelevance: 'absent', faqSchemaTier: 'none', visibleFaq: false }
  },
  {
    name: 'CTA-only "?" headings do not manufacture an FAQ',
    html: `<h2>Ready to get started?</h2><a href="/x">Sign up</a><h2>Questions?</h2><a href="/y">Call</a>`,
    expect: { faqRelevance: 'absent', answeredQuestionHeadingCount: 0 }
  },
  {
    name: 'unmarked de facto FAQ (3 answered ? headings) → medium, surfaces as partial',
    html: THREE_QUESTIONS,
    expect: { faqRelevance: 'medium', hasFaqMarkers: false, answeredQuestionHeadingCount: 3, faqSchemaTier: 'none' }
  },
  {
    name: 'REGRESSION: answers wrapped in a per-heading container still count',
    html: `<div><h3>How do I donate?</h3></div><p>${ANSWER}</p>
           <div><h3>Where does it go?</h3></div><p>${ANSWER}</p>
           <div><h3>Monthly giving?</h3></div><p>${ANSWER}</p>`,
    expect: { faqRelevance: 'medium', answeredQuestionHeadingCount: 3 }
  },
  {
    name: 'uppercase FAQ class matches (case-insensitive selector, was per-copy divergence)',
    html: `<section class="FAQ-Section"><h3>Anything?</h3><p>${ANSWER}</p></section>`,
    expect: { faqRelevance: 'high', hasFaqMarkers: true, faqSectionFound: true }
  },
  {
    name: 'valid JSON-LD FAQPage with 2 real Q&A pairs → valid',
    html: `<section class="faq">${THREE_QUESTIONS}</section>${jsonLdFaq([['Q1', 'A1'], ['Q2', 'A2']])}`,
    expect: { faqRelevance: 'high', faqSchemaTier: 'valid' }
  },
  {
    name: 'REGRESSION: empty mainEntity objects must NOT reach valid',
    html: `<section class="faq">${THREE_QUESTIONS}</section>
           <script type="application/ld+json">{"@type":"FAQPage","mainEntity":[{},{}]}</script>`,
    expect: { faqSchemaTier: 'weak' }
  },
  {
    name: 'Question node without acceptedAnswer text must NOT reach valid',
    html: `<section class="faq">${THREE_QUESTIONS}</section>
           <script type="application/ld+json">{"@type":"FAQPage","mainEntity":[
             {"@type":"Question","name":"Q1","acceptedAnswer":{"@type":"Answer","text":""}},
             {"@type":"Question","name":"Q2"}]}</script>`,
    expect: { faqSchemaTier: 'weak' }
  },
  {
    name: 'array-typed @type inside @graph is still found',
    html: `<section class="faq">${THREE_QUESTIONS}</section>
           <script type="application/ld+json">{"@graph":[{"@type":["WebPage","FAQPage"],"mainEntity":[
             {"@type":"Question","name":"Q1","acceptedAnswer":{"@type":"Answer","text":"A1"}},
             {"@type":"Question","name":"Q2","acceptedAnswer":{"@type":"Answer","text":"A2"}}]}]}</script>`,
    expect: { faqSchemaTier: 'valid' }
  },
  {
    name: 'malformed FAQPage JSON-LD → weak, flagged as malformed (not silently none)',
    html: `<section class="faq">${THREE_QUESTIONS}</section>
           <script type="application/ld+json">{"@type":"FAQPage", mainEntity: [oops}</script>`,
    expect: { faqSchemaTier: 'weak' },
    formats: { malformedJsonLd: true }
  },
  {
    name: 'microdata-only FAQPage → weak',
    html: `<section class="faq" itemscope itemtype="https://schema.org/FAQPage">${THREE_QUESTIONS}</section>`,
    expect: { faqSchemaTier: 'weak' },
    formats: { microdata: true }
  },
  {
    name: 'microdata Question-only (no FAQPage wrapper) → weak',
    html: `<section class="faq"><div itemscope itemtype="https://schema.org/Question">${QA('Q?', ANSWER)}</div></section>`,
    expect: { faqSchemaTier: 'weak' },
    formats: { microdata: true }
  },
  {
    name: 'REGRESSION: RDFa schema:Question-only FAQ → weak, not a false critical',
    html: `<section class="faq"><div typeof="schema:Question" property="mainEntity">${QA('Q?', ANSWER)}</div></section>`,
    expect: { faqSchemaTier: 'weak' },
    formats: { rdfa: true }
  },
  {
    name: 'RDFa Question inside an explicit schema.org vocab → weak',
    html: `<div vocab="https://schema.org/"><section class="faq"><div typeof="Question">${QA('Q?', ANSWER)}</div></section></div>`,
    expect: { faqSchemaTier: 'weak' },
    formats: { rdfa: true }
  },
  {
    name: 'bare typeof="Question" with no schema.org scope is NOT schema.org RDFa',
    html: `<section class="faq"><div typeof="Question">${QA('Q?', ANSWER)}</div></section>`,
    expect: { faqSchemaTier: 'none' },
    formats: { rdfa: false }
  }
];

// --- runner ------------------------------------------------------------------

let failed = 0;
for (const c of cases) {
  const result = runProbe(`<!doctype html><html><body>${c.html}</body></html>`);
  const problems = [];
  for (const [k, v] of Object.entries(c.expect)) {
    if (result[k] !== v) problems.push(`${k}: expected ${JSON.stringify(v)}, got ${JSON.stringify(result[k])}`);
  }
  for (const [k, v] of Object.entries(c.formats || {})) {
    if (result.faqSchemaFormats[k] !== v) problems.push(`faqSchemaFormats.${k}: expected ${v}, got ${result.faqSchemaFormats[k]}`);
  }
  if (problems.length) {
    failed++;
    console.error(`FAIL  ${c.name}`);
    problems.forEach(p => console.error(`        ${p}`));
  } else {
    console.log(`ok    ${c.name}`);
  }
}

console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
