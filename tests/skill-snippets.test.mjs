/**
 * Static + runtime lint for every javascript fenced block in the skill docs.
 *
 * WHY THIS EXISTS
 * Each snippet is executed as its own `browser_evaluate`, so function definitions do NOT
 * persist between snippets. A snippet that references a helper defined in another block
 * throws ReferenceError at runtime and silently kills whatever signal it feeds. That bug
 * shipped twice in a row (first `isSchemaOrgRdfa`, then `koshFaqProbe`) because the checks
 * looked for the one identifier already known to be broken instead of the class of defect.
 * This runner catches the class: every snippet must resolve every identifier it uses.
 *
 * A snippet passes if it is one of:
 *   1. SELF-CONTAINED — evaluates in a DOM without ReferenceError.
 *   2. INJECTED-DEPENDENCY — references an identifier from EXTERNAL_INJECTABLES *and*
 *      carries an explicit "inject <name>" instruction in its own comments, so the agent
 *      is told to supply it. Implicit reliance is a failure.
 *   3. ILLUSTRATIVE — contains a `/* ... *\/` placeholder standing in for elided code, so
 *      it is documentation rather than something to run.
 *
 * Usage:  node tests/skill-snippets.test.mjs
 *         (requires jsdom, e.g. `npm install jsdom`)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

/** Identifiers a snippet may rely on, if it says so — each defined in a reference doc. */
const EXTERNAL_INJECTABLES = {
  koshFaqProbe: 'skills/aeo/references/faq-detection.md'
};

const DOCS = ['skills/aeo/SKILL.md'];

/** A representative page: enough shape that snippets exercise real branches. */
const FIXTURE_HTML = `<!doctype html><html lang="en"><head>
  <title>Example</title><meta name="description" content="d">
  <link rel="canonical" href="https://example.test/">
  <script type="application/ld+json">{"@type":"Organization","name":"X"}</script>
</head><body>
  <h1>Heading</h1><h2>How do I do the thing?</h2><p>An answer longer than twenty characters.</p>
  <div vocab="https://schema.org/"><div typeof="Organization"></div></div>
  <div typeof="schema:Thing"></div>
  <div itemscope itemtype="https://schema.org/Question"></div>
  <details><summary>a</summary><p>x</p></details><details><summary>b</summary><p>y</p></details>
  <dl><dt>q</dt><dd>a</dd></dl>
  <a href="/inner">link</a><img src="a.png" alt="a"><table><tr><td>c</td></tr></table>
</body></html>`;

const PLACEHOLDER = /\/\*[^*]*\*\/\s*;/;   // `const x = /* elided */;`

function snippets(relPath) {
  const md = readFileSync(join(root, relPath), 'utf8');
  return [...md.matchAll(/```javascript\n([\s\S]*?)```/g)].map(m => ({
    src: m[1],
    line: md.slice(0, m.index).split('\n').length
  }));
}

function makeWindow() {
  const dom = new JSDOM(FIXTURE_HTML, { url: 'https://example.test/', runScripts: 'outside-only' });
  // jsdom has no innerText; browsers do. Shim it so missing-innerText TypeErrors don't
  // masquerade as snippet defects — ReferenceError is what this runner is looking for.
  dom.window.eval(
    'Object.defineProperty(window.HTMLElement.prototype,"innerText",' +
    '{get(){return this.textContent;},configurable:true});'
  );
  return dom.window;
}

/**
 * Does this snippet tell the agent to inject `name`?
 * `[\s/]*` tolerates comment wrapping — "// Inject\n// koshFaqProbe alongside…" is the
 * same instruction as one on a single line, and requiring one line would push authors
 * toward long unwrapped comments.
 */
const declaresInjection = (src, name) =>
  new RegExp(`inject[\\s/]*(?:the[\\s/]*)?\`?${name}\`?`, 'i').test(src) ||
  (new RegExp(`\\b${name}\\b`).test(src) && /inject[\s/]*it[\s/]*verbatim/i.test(src));

let failures = 0, checked = 0;
const note = [];

for (const doc of DOCS) {
  for (const { src, line } of snippets(doc)) {
    checked++;
    const where = `${doc}:${line}`;

    if (PLACEHOLDER.test(src)) { note.push(`skip  ${where} — illustrative (elided code)`); continue; }

    let error = null;
    try { makeWindow().eval(`(function(){${src}\n})();`); }
    catch (e) { error = e; }

    if (!error) { console.log(`ok    ${where} — self-contained`); continue; }

    // NOTE: `instanceof ReferenceError` is WRONG here — the error is constructed inside the
    // jsdom realm, so it fails an instanceof check against this realm's constructor. Match
    // on the name instead. (Caught by the negative self-test below.)
    if (error.constructor.name === 'ReferenceError') {
      const name = (error.message.match(/^(\w+) is not defined/) || [])[1];
      if (name && EXTERNAL_INJECTABLES[name]) {
        if (declaresInjection(src, name)) {
          console.log(`ok    ${where} — declares injection of ${name} (${EXTERNAL_INJECTABLES[name]})`);
        } else {
          failures++;
          console.error(`FAIL  ${where} — uses ${name} without an explicit injection instruction.`);
          console.error(`        Each snippet is its own browser_evaluate; add "Inject ${name} verbatim`);
          console.error(`        alongside this snippet" to its comments, or make the snippet self-contained.`);
        }
      } else {
        failures++;
        console.error(`FAIL  ${where} — ${error.message}`);
        console.error(`        Not a known injectable. Define it in this snippet, or register it in`);
        console.error(`        EXTERNAL_INJECTABLES and state the injection in the snippet's comments.`);
      }
      continue;
    }

    // Anything else (TypeError from fixture gaps, etc.) is reported but not fatal: this
    // runner's contract is identifier resolution, not full behavioral simulation.
    note.push(`note  ${where} — ${error.constructor.name}: ${error.message.slice(0, 70)} (fixture gap, not fatal)`);
  }
}

note.forEach(n => console.log(n));

// --- negative self-test ------------------------------------------------------
// A linter that cannot fail is not a linter. Prove both failure modes fire before
// reporting success, so a future refactor can't silently neuter this runner.
const selfTests = [
  { name: 'undefined helper is caught', src: 'return someUndefinedHelper();', expectFail: true },
  { name: 'injectable without instruction is caught', src: 'return koshFaqProbe();', expectFail: true },
  { name: 'injectable with instruction passes', src: '// Inject koshFaqProbe verbatim alongside this snippet.\nreturn koshFaqProbe();', expectFail: false },
  { name: 'self-contained snippet passes', src: 'return document.querySelectorAll("p").length;', expectFail: false }
];
let selfFailures = 0;
for (const t of selfTests) {
  let err = null;
  try { makeWindow().eval(`(function(){${t.src}\n})();`); } catch (e) { err = e; }
  let flagged = false;
  if (err && err.constructor.name === 'ReferenceError') {
    const n = (err.message.match(/^(\w+) is not defined/) || [])[1];
    flagged = !(n && EXTERNAL_INJECTABLES[n] && declaresInjection(t.src, n));
  } else if (err) {
    flagged = false;
  }
  if (flagged !== t.expectFail) {
    selfFailures++;
    console.error(`SELFTEST FAIL  ${t.name} — expected ${t.expectFail ? 'a failure' : 'a pass'}, got the opposite`);
  } else {
    console.log(`selftest ok    ${t.name}`);
  }
}

console.log(`\n${checked - failures} of ${checked} snippets OK`);
if (selfFailures) console.error(`${selfFailures} self-test(s) failed — this runner is not trustworthy as written`);
process.exit(failures || selfFailures ? 1 : 0);
