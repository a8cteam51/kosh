const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { fences } = require('./fences.js');

const SKILLS = path.join(__dirname, '../skills');

let found = 0;
let opened = 0;
for (const name of fs.readdirSync(SKILLS, { recursive: true }).filter((name) => name.endsWith('.md'))) {
  const file = path.join(SKILLS, name);
  opened += fs.readFileSync(file, 'utf8').split('```javascript').length - 1;
  for (const { code, line } of fences(file)) {
    found++;
    // Function, not AsyncFunction: top-level `return` is how the snippets hand results to browser_evaluate, but none use top-level `await`.
    test(`${name}:${line} compiles`, () => new Function(code));
  }
}

test('every opened javascript fence was extracted', () => {
  assert.ok(opened > 0, 'no fenced javascript blocks under skills/');
  assert.equal(found, opened);
});
