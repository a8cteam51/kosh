const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SHARED = path.join(ROOT, 'shared');
const SKILLS = path.join(ROOT, 'skills');

const blocks = fs.readdirSync(SHARED).filter((name) => name.endsWith('.md'));
const skills = fs.readdirSync(SKILLS, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

test('shared/ and skills/ are not empty', () => {
  assert.ok(blocks.length > 0, 'no blocks in shared/');
  assert.ok(skills.length > 0, 'no skills in skills/');
});

for (const block of blocks) {
  const canonical = fs.readFileSync(path.join(SHARED, block), 'utf8').replace(/\n?$/, '\n');
  const [first] = canonical.split('\n');

  for (const skill of skills) {
    test(`skills/${skill}/SKILL.md carries shared/${block} verbatim`, () => {
      assert.ok(canonical.trim(), `shared/${block} is empty`);
      // A newline on both sides pins the copy to whole lines, so nothing can be added before or after it.
      const source = '\n' + fs.readFileSync(path.join(SKILLS, skill, 'SKILL.md'), 'utf8');
      const missing = canonical.split('\n').find((line) => !source.includes(line));
      assert.ok(source.includes('\n' + canonical), missing ? `first line not found: ${missing}` : 'every line is there, but not as one block');
      assert.strictEqual(source.split(`\n${first}\n`).length - 1, 1, `a second block starts with: ${first}`);
    });
  }
}
