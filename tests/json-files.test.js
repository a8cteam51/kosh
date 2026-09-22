const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const files = execFileSync('git', ['ls-files', '-z', '--', '*.json'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);

test('git lists the tracked json files', () => {
  assert.ok(files.length > 0);
});

for (const file of files) {
  test(`${file} is valid JSON`, () => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8')));
}
