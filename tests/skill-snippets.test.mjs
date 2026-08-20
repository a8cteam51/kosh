/**
 * Lint for every `javascript` fenced block in the skill docs.
 *
 * WHY THIS EXISTS
 * Each snippet is executed as its own `browser_evaluate`, so definitions do NOT persist
 * between snippets. A snippet referencing a helper defined in another block throws
 * ReferenceError at runtime and silently kills whatever signal it feeds. That bug shipped
 * twice — first `isSchemaOrgRdfa`, then `koshFaqProbe` — because the checks looked for the
 * one identifier already known to be broken instead of the class of defect.
 *
 * A snippet passes if it is either:
 *   1. SELF-CONTAINED — evaluates in a DOM without ReferenceError; or
 *   2. INJECTED-DEPENDENCY — references an identifier in EXTERNAL_INJECTABLES *and* names
 *      it in an explicit injection instruction in its own comments. Implicit reliance on
 *      another block is a failure.
 *
 * There is exactly ONE classification path: `classify()`. The self-tests at the bottom call
 * it, so they assert on the code that actually grades snippets. An earlier version of this
 * file duplicated the classification inside the self-test loop, which made the self-test
 * unable to detect the very regression it claimed to guard — reverting the realm check
 * still printed four `selftest ok` lines and exited 0.
 *
 * Usage:  node tests/skill-snippets.test.mjs
 *         (requires jsdom, e.g. `npm install jsdom`)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { JSDOM } from 'jsdom';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

/** Identifiers a snippet may rely on, if it says so — each defined in a reference doc. */
const EXTERNAL_INJECTABLES = {
  koshFaqProbe: 'skills/aeo/references/faq-detection.md'
};

/** A representative page: enough shape that snippets exercise real branches. */
const FIXTURE_HTML = `<!doctype html><html lang="en"><head>
  <title>Example</title><meta name="description" content="d">
  <meta property="og:title" content="t"><meta name="viewport" content="width=device-width">
  <link rel="canonical" href="https://example.test/">
  <script type="application/ld+json">{"@type":"Organization","name":"X"}</script>
</head><body>
  <h1>Heading</h1><h2>How do I do the thing?</h2><p>An answer longer than twenty characters.</p>
  <h3>Another question?</h3><p>Another answer longer than twenty characters.</p>
  <div vocab="https://schema.org/"><div typeof="Organization"></div></div>
  <div typeof="schema:Thing"></div>
  <div itemscope itemtype="https://schema.org/Question"></div>
  <details><summary>a</summary><p>x</p></details><details><summary>b</summary><p>y</p></details>
  <dl><dt>q</dt><dd>a</dd></dl>
  <nav><a href="/inner">link</a></nav><a href="https://ext.test/">ext</a>
  <img src="a.png" alt="a"><table><tr><td>c</td></tr></table>
  <form><label for="i">L</label><input id="i" name="i"></form>
  <main><article><p>Body copy that is long enough to be treated as real content here.</p></article></main>
</body></html>`;

/**
 * `const x = /* elided *\/;` marks an expression the doc deliberately leaves out (a value
 * carried over from an earlier section). Such blocks are still executable code the agent
 * runs, so they are NOT exempt from checking — the placeholder is replaced with a neutral
 * stub and the block is evaluated like any other. Exempting them left the two largest
 * schema snippets in SKILL.md with zero identifier coverage.
 */
const PLACEHOLDER = /=\s*\/\*[^*]*\*\/\s*;/g;
const stubPlaceholders = src => src.replace(PLACEHOLDER, '= {};');

/**
 * Does this snippet tell the agent to inject `name`?
 * `[\s/]*` tolerates comment wrapping — "// Inject\n// koshFaqProbe alongside…" is the
 * same instruction as one on a single line.
 * The looser "inject it verbatim" phrasing is accepted only when the snippet references a
 * single injectable, so it can never be ambiguous about which one it authorises.
 */
function declaresInjection(src, name, referencedInjectables) {
  if (new RegExp(`inject[\\s/]*(?:the[\\s/]*)?\`?${name}\`?`, 'i').test(src)) return true;
  return referencedInjectables.length === 1 &&
    referencedInjectables[0] === name &&
    /inject[\s/]*it[\s/]*verbatim/i.test(src);
}

function makeWindow() {
  const dom = new JSDOM(FIXTURE_HTML, { url: 'https://example.test/', runScripts: 'outside-only' });
  // jsdom has no innerText; browsers do. Shim it so missing-innerText TypeErrors don't
  // masquerade as snippet defects — unresolved identifiers are what this lint looks for.
  dom.window.eval(
    'Object.defineProperty(window.HTMLElement.prototype,"innerText",' +
    '{get(){return this.textContent;},configurable:true});'
  );
  return dom.window;
}

/**
 * THE single classification path. Returns { verdict, reason }.
 *   verdict 'ok'   — snippet resolves every identifier it uses (fatal-free)
 *   verdict 'fail' — unresolved identifier, or an undeclared injectable  (fatal)
 *   verdict 'note' — ran into a fixture gap (e.g. TypeError); reported, not fatal, since
 *                    this lint's contract is identifier resolution, not full simulation
 */
export function classify(rawSrc) {
  const src = stubPlaceholders(rawSrc);
  let error = null;
  try { makeWindow().eval(`(function(){${src}\n})();`); }
  catch (e) { error = e; }

  if (!error) return { verdict: 'ok', reason: 'self-contained' };

  // NOTE: `instanceof ReferenceError` would be WRONG here — the error is constructed inside
  // the jsdom realm and fails an instanceof check against this realm's constructor. The
  // self-tests below exercise this exact line, so reverting it fails the run.
  if (error.constructor.name === 'ReferenceError') {
    const name = (error.message.match(/^(\w+) is not defined/) || [])[1];
    if (!name || !EXTERNAL_INJECTABLES[name]) {
      return {
        verdict: 'fail',
        reason: `${error.message}. Not a known injectable — define it in this snippet, or ` +
                'register it in EXTERNAL_INJECTABLES and state the injection in the comments.'
      };
    }
    const referenced = Object.keys(EXTERNAL_INJECTABLES).filter(k => new RegExp(`\\b${k}\\b`).test(src));
    if (declaresInjection(src, name, referenced)) {
      return { verdict: 'ok', reason: `declares injection of ${name} (${EXTERNAL_INJECTABLES[name]})` };
    }
    return {
      verdict: 'fail',
      reason: `uses ${name} without an explicit injection instruction. Each snippet is its ` +
              `own browser_evaluate; add "Inject ${name} verbatim alongside this snippet" to ` +
              'its comments, or make the snippet self-contained.'
    };
  }

  return { verdict: 'note', reason: `${error.constructor.name}: ${error.message.slice(0, 70)} (fixture gap)` };
}

// --- collect docs -------------------------------------------------------------
// Whole skills/ tree, per the "test the class of defect" rule in tests/README.md.
function skillDocs(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return skillDocs(p);
    return e.isFile() && p.endsWith('.md') ? [relative(root, p)] : [];
  });
}
const DOCS = skillDocs(join(root, 'skills')).sort();

const snippets = relPath => {
  const md = readFileSync(join(root, relPath), 'utf8');
  return [...md.matchAll(/```javascript\n([\s\S]*?)```/g)].map(m => ({
    src: m[1],
    line: md.slice(0, m.index).split('\n').length
  }));
};

// --- run ----------------------------------------------------------------------
const tally = { ok: 0, fail: 0, note: 0 };
const notes = [];

for (const doc of DOCS) {
  for (const { src, line } of snippets(doc)) {
    const where = `${doc}:${line}`;
    const { verdict, reason } = classify(src);
    tally[verdict]++;
    if (verdict === 'ok') console.log(`ok    ${where} — ${reason}`);
    else if (verdict === 'note') notes.push(`note  ${where} — ${reason}`);
    else {
      console.error(`FAIL  ${where} — ${reason}`);
    }
  }
}
notes.forEach(n => console.log(n));

// --- self-tests ---------------------------------------------------------------
// These call classify(), the same function that graded every snippet above, so a change
// that neuters the grader fails here instead of passing quietly.
const SELF_TESTS = [
  { name: 'undefined helper is caught', src: 'return someUndefinedHelper();', want: 'fail' },
  { name: 'injectable without instruction is caught', src: 'return koshFaqProbe();', want: 'fail' },
  { name: 'injectable named in an instruction passes',
    src: '// Inject koshFaqProbe verbatim alongside this snippet.\nreturn koshFaqProbe();', want: 'ok' },
  { name: '"inject it verbatim" passes for a single injectable',
    src: '// Inject it verbatim.\nreturn koshFaqProbe();', want: 'ok' },
  { name: 'self-contained snippet passes', src: 'return document.querySelectorAll("p").length;', want: 'ok' },
  { name: 'elided expression is stubbed, not skipped',
    src: 'const relevance = /* from 0.4 */;\nreturn Object.keys(relevance).length;', want: 'ok' },
  { name: 'unresolved identifier inside an elided-expression block is still caught',
    src: 'const relevance = /* from 0.4 */;\nreturn missingHelper(relevance);', want: 'fail' }
];

let selfFailures = 0;
for (const t of SELF_TESTS) {
  const got = classify(t.src).verdict;
  if (got !== t.want) {
    selfFailures++;
    console.error(`SELFTEST FAIL  ${t.name} — expected '${t.want}', got '${got}'`);
  } else {
    console.log(`selftest ok    ${t.name}`);
  }
}

console.log(`\n${tally.ok} ok · ${tally.fail} failed · ${tally.note} noted (fixture gaps, not fatal)`);
console.log(`across ${DOCS.length} skill docs`);
if (selfFailures) console.error(`${selfFailures} self-test(s) failed — this runner is not trustworthy as written`);
process.exit(tally.fail || selfFailures ? 1 : 0);
