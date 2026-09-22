const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { validate } = require('../scripts/validate-report.js');

const ROOT = path.join(__dirname, '..');
const RUN = path.join(ROOT, 'scripts/run-qa-report.sh');

const jsonSchemaTypes = fs.readdirSync(path.join(ROOT, 'schemas'))
  .map((file) => file.match(/^qa-report-(.+)-schema\.json$/)?.[1])
  .filter((type) => type && JSON.parse(fs.readFileSync(path.join(ROOT, 'schemas', `qa-report-${type}-schema.json`), 'utf8')).$schema);

const shopReport = (edit = () => {}) => {
  const report = {
    url: 'https://example.com/',
    websiteName: 'Validate Fixture',
    timestamp: '2026-01-01T00:00:00Z',
    provenance: { model: 'claude-test-1' },
    environment: 'production',
    testMethodology: 'Guest shopping journey.',
    visitedPages: ['https://example.com/', 'https://example.com/shop/', 'https://example.com/cart/', 'https://example.com/checkout/'],
    shop: {
      platform: 'woocommerce',
      shopUrl: 'https://example.com/shop/',
      cartUrl: 'https://example.com/cart/',
      checkoutUrl: 'https://example.com/checkout/',
      implementation: { cart: 'blocks', checkout: 'blocks' },
      productsTested: [
        { url: 'https://example.com/product/one/', name: 'One', type: 'simple' },
        { url: 'https://example.com/product/two/', name: 'Two', type: 'variable' },
      ],
      cartOperations: { quantityUpdated: true, itemRemoved: true, totalsVerified: true },
      checkoutStop: 'Stopped at the payment step.',
    },
    explorationPass: ['Catalog', 'Cart', 'Checkout'].map((area) => ({ check: `${area} works`, outcome: 'no-issue', detail: 'Checked.', area })),
    issues: { critical: [], high: [], medium: [], low: [] },
  };
  edit(report);
  return report;
};

// The filename is what run-qa-report.sh detects the test type from.
const run = (t, filename, report) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kosh-validate-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const reportsDir = path.join(root, 'reports');
  const json = path.join(root, filename);
  const written = JSON.stringify(report, null, 2);
  fs.writeFileSync(json, written);
  const { status, stdout, stderr, error } = spawnSync(RUN, [json], { encoding: 'utf8', env: { ...process.env, KOSH_REPORTS_DIR: reportsDir } });
  assert.ifError(error);
  return { status, output: (stdout + stderr).replace(/\x1b\[[0-9;]*m/g, ''), json, written, reportsDir };
};

test('shop and aeo are JSON Schema', () => {
  assert.ok(jsonSchemaTypes.includes('shop') && jsonSchemaTypes.includes('aeo'), jsonSchemaTypes.join(', '));
});

for (const type of jsonSchemaTypes) {
  test(`the ${type} schema compiles in ajv strict mode`, () => assert.ok(Array.isArray(validate({}, type))));
}

for (const timestamp of ['2026-09-22T17:41:30Z', '2026-09-22T17:41:30.123Z', '2026-09-22T17:41:30+02:00']) {
  test(`timestamp ${timestamp} is a date-time`, () => assert.deepEqual(validate(shopReport((r) => { r.timestamp = timestamp; }), 'shop'), []));
}

for (const [field, value, format] of [
  ['timestamp', 'YYYY-MM-DDTHH:MM:SSZ', 'date-time'],
  ['timestamp', '2026-13-01T00:00:00Z', 'date-time'],
  ['timestamp', '2026-09-22', 'date-time'],
  ['url', '/shop/', 'uri'],
]) {
  test(`${field} ${value} is not a ${format}`, () => {
    assert.deepEqual(validate(shopReport((r) => { r[field] = value; }), 'shop'), [`/${field} must match format "${format}"`]);
  });
}

test('a report that fails its schema is refused: nothing rendered, stamped or archived', (t) => {
  const report = shopReport((r) => {
    r.explorationPass[0].outcome = 'fine';
    delete r.shop.cartOperations.totalsVerified;
  });

  const { status, output, json, written, reportsDir } = run(t, 'qa-report-shop.json', report);

  assert.notEqual(status, 0, output);
  assert.match(output, /\/explorationPass\/0\/outcome must be equal to one of the allowed values: no-issue, finding-raised, inconclusive, out-of-scope/);
  assert.match(output, /\/shop\/cartOperations must have required property 'totalsVerified'/);
  assert.match(output, /nothing was rendered/);
  assert.equal(fs.readFileSync(json, 'utf8'), written);
  assert.ok(!fs.existsSync(reportsDir), 'refused report still wrote under reports/');
});

test('a report that matches its schema is rendered', (t) => {
  const { status, output, reportsDir } = run(t, 'qa-report-shop.json', shopReport());

  assert.equal(status, 0, output);
  assert.match(output, /✓ Schema: valid against schemas\/qa-report-shop-schema\.json/);
  assert.ok(fs.readdirSync(reportsDir).some((file) => file.endsWith('.html')));
});

test('a type whose schema is still an example document renders without validation', (t) => {
  const { status, output } = run(t, 'qa-report-functional.json', { ...shopReport(), shop: undefined, explorationPass: 'not checked' });

  assert.equal(status, 0, output);
  assert.match(output, /no JSON Schema for functional yet, not validated/);
});
