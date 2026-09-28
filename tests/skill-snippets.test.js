const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { fences } = require('./fences.js');

const SKILLS = path.join(__dirname, '../skills');
const FILES = fs.readdirSync(SKILLS, { recursive: true }).filter((name) => name.endsWith('.md'));

// Exact counts of blocks longer than one line: code belongs in collectors/, so an entry can only shrink.
const MULTI_LINE = {
  'a11y/SKILL.md': 8,
  'aeo/SKILL.md': 34,
  'aeo/references/faq-detection.md': 1,
  'functional-design/SKILL.md': 2,
  'performance/SKILL.md': 1,
  'shop/SKILL.md': 3,
};

let found = 0;
let opened = 0;
for (const name of FILES) {
  const file = path.join(SKILLS, name);
  opened += fs.readFileSync(file, 'utf8').split('```javascript').length - 1;
  const blocks = fences(file);
  for (const { code, line } of blocks) {
    found++;
    // Function, not AsyncFunction: top-level `return` is how the snippets hand results to browser_evaluate, but none use top-level `await`.
    test(`${name}:${line} compiles`, () => new Function(code));
  }
  test(`${name} has no new multi-line javascript blocks`, () => {
    const lines = blocks.filter(({ code }) => code.trimEnd().includes('\n')).map(({ line }) => line);
    const allowed = MULTI_LINE[name] ?? 0;
    const where = lines.length > allowed ? `move the new one into collectors/ (blocks on lines ${lines.join(', ')})` : 'lower its MULTI_LINE count';
    assert.strictEqual(lines.length, allowed, `${lines.length} multi-line blocks, allowed ${allowed}: ${where}`);
  });
}

test('every opened javascript fence was extracted', () => {
  assert.ok(opened > 0, 'no fenced javascript blocks under skills/');
  assert.equal(found, opened);
});

test('MULTI_LINE names only real files', () => {
  for (const name of Object.keys(MULTI_LINE)) assert.ok(FILES.includes(name), `no skills/${name}`);
});
