const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const MERGER = path.join(__dirname, '../scripts/merge-qa-reports.js');

const merge = (t, ...reports) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kosh-merge-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const files = reports.map((report, i) => {
    const file = path.join(dir, `${i}.json`);
    fs.writeFileSync(file, JSON.stringify({ websiteName: 'Merge Fixture', issues: {}, ...report }));
    return file;
  });
  const { status, stdout, stderr } = spawnSync('node', [MERGER, ...files], { encoding: 'utf8' });
  assert.equal(status, 0, stderr);
  return JSON.parse(stdout);
};

test('visitedPages is the union of all three reports, in order, without duplicates', (t) => {
  const merged = merge(t,
    { visitedPages: ['https://example.com/', 'https://example.com/products/'] },
    { visitedPages: ['https://example.com/', 'https://example.com/services/'] },
    { visitedPages: ['https://example.com/contact/', 'https://example.com/services/'] },
  );

  assert.deepEqual(merged.visitedPages, [
    'https://example.com/',
    'https://example.com/products/',
    'https://example.com/services/',
    'https://example.com/contact/',
  ]);
});

test('a report with no visitedPages contributes nothing', (t) => {
  const merged = merge(t, { visitedPages: ['https://example.com/'] }, {}, {});

  assert.deepEqual(merged.visitedPages, ['https://example.com/']);
});
