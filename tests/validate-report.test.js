const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { schemaFor, validate } = require('../scripts/validate-report.js');

const ROOT = path.join(__dirname, '..');

const jsonSchemaTypes = fs.readdirSync(path.join(ROOT, 'schemas'))
  .map((file) => file.match(/^qa-report-(.+)-schema\.json$/)?.[1])
  .filter((type) => type && schemaFor(type));

const plainReport = {
  url: 'https://example.com/',
  websiteName: 'Validate Fixture',
  timestamp: '2026-01-01T00:00:00Z',
  issues: { critical: [], high: [], medium: [], low: [] },
};

const shopReport = (edit = () => {}) => {
  const report = {
    ...structuredClone(plainReport),
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
  };
  edit(report);
  return report;
};

// `prepare` runs copies of scripts/ and schemas/ outside the repo, where ajv can't be resolved.
const run =(t, filename, report, { space = 2, prepare, generatorFlags } = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kosh-validate-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  if (prepare) {
    for (const dir of ['scripts', 'schemas']) fs.cpSync(path.join(ROOT, dir), path.join(root, dir), { recursive: true });
    prepare(root);
  }
  const reportsDir = path.join(root, 'reports');
  const json = path.join(root, filename);
  const written = JSON.stringify(report, null, space);
  fs.writeFileSync(json, written);
  const scripts = path.join(prepare ? root : ROOT, 'scripts');
  const [command, commandArgs] = generatorFlags
    ? ['node', [path.join(scripts, 'generate-report.js'), json, ...generatorFlags]]
    : [path.join(scripts, 'run-qa-report.sh'), [json]];
  const { status, stdout, stderr, error } = spawnSync(command, commandArgs, { encoding: 'utf8', env: { ...process.env, KOSH_REPORTS_DIR: reportsDir } });
  assert.ifError(error);
  return { status, output: (stdout + stderr).replace(/\x1b\[[0-9;]*m/g, ''), json, written, reportsDir };
};

test('shop and aeo are JSON Schema', () => {
  assert.ok(jsonSchemaTypes.includes('shop') && jsonSchemaTypes.includes('aeo'), jsonSchemaTypes.join(', '));
});

for (const type of jsonSchemaTypes) {
  test(`the ${type} schema compiles in ajv strict mode`, () => assert.ok(Array.isArray(validate({}, type))));
}

for (const timestamp of ['2026-09-22T17:41:30Z', '2026-09-22T17:41:30.123Z', '2026-09-22T17:41:30+02:00', '2028-02-29T00:00:00Z']) {
  test(`timestamp ${timestamp} is a date-time`, () => assert.deepEqual(validate(shopReport((r) => { r.timestamp = timestamp; }), 'shop'), []));
}

for (const [field, value, format] of [
  ['timestamp', 'YYYY-MM-DDTHH:MM:SSZ', 'date-time'],
  ['timestamp', '2026-13-01T00:00:00Z', 'date-time'],
  ['timestamp', '2026-02-30T00:00:00Z', 'date-time'],
  ['timestamp', '2026-02-29T00:00:00Z', 'date-time'],
  ['timestamp', '2026-09-22T24:00:00Z', 'date-time'],
  ['timestamp', '2026-09-22', 'date-time'],
  ['url', '/shop/', 'uri'],
  ['url', ' https://example.com/ ', 'uri'],
]) {
  test(`${field} ${JSON.stringify(value)} is not a ${format}`, () => {
    assert.deepEqual(validate(shopReport((r) => { r[field] = value; }), 'shop'), [`/${field} must match format "${format}"`]);
  });
}

test('a const mismatch names the expected value', () => {
  const issue = { criterion: 'technicalHealth', signal: 'organizationSchema', issue: 'Gap.', impact: 'Cost.', effort: 'low' };
  const errors = validate({ issues: { critical: [issue], high: [], medium: [], low: [] } }, 'aeo');
  assert.ok(errors.includes('/issues/critical/0/criterion must be equal to constant: structuredData'), errors.join('\n'));
});

test('a report that fails its schema is refused: nothing rendered or archived', (t) => {
  const report = shopReport((r) => {
    r.explorationPass[0].outcome = 'fine';
    delete r.shop.cartOperations.totalsVerified;
  });

  const { status, output, reportsDir } = run(t, 'qa-report-shop.json', report);

  assert.notEqual(status, 0, output);
  assert.match(output, /\/explorationPass\/0\/outcome must be equal to one of the allowed values: no-issue, finding-raised, inconclusive, out-of-scope/);
  assert.match(output, /\/shop\/cartOperations must have required property 'totalsVerified'/);
  assert.match(output, /Fix these fields in .*qa-report-shop\.json, then re-run\./);
  assert.match(output, /Nothing was rendered\./);
  assert.ok(!fs.existsSync(reportsDir), 'refused report still wrote under reports/');
});

test('the renderer refuses a report that fails its schema when called directly', (t) => {
  const { status, output, reportsDir } = run(t, 'report.json', shopReport((r) => { delete r.shop; }), { generatorFlags: ['--shop'] });

  assert.notEqual(status, 0, output);
  assert.match(output, /\/ must have required property 'shop'/);
  assert.ok(!fs.existsSync(reportsDir), 'refused report still wrote under reports/');
});

for (const flags of [[], ['--functional']]) {
  test(`the renderer validates a shop report from its shop block, flags: ${flags.join(' ') || 'none'}`, (t) => {
    const { status, output, reportsDir } = run(t, 'report.json', shopReport((r) => { delete r.shop.checkoutStop; }), { generatorFlags: flags });

    assert.notEqual(status, 0, output);
    assert.match(output, /\/shop must have required property 'checkoutStop'/);
    assert.ok(!fs.existsSync(reportsDir), 'refused report still wrote under reports/');
  });
}

test('a refusal longer than a pipe buffer still ends with its last line', (t) => {
  const findings = Array.from({ length: 1500 }, () => ({ category: 'Nowhere', issue: 'x', impact: 'y', device: 'both', pages: ['https://example.com/'] }));

  const { status, output } = run(t, 'report.json', shopReport((r) => { r.issues.low = findings; }), { generatorFlags: ['--shop'] });

  assert.notEqual(status, 0);
  assert.ok(output.length > 65536, `refusal only ${output.length} bytes, too short to test the cut-off`);
  assert.match(output, /Nothing was rendered\.\n$/);
});

test('--skip-validation renders a report its schema would refuse', (t) => {
  const { status, output } = run(t, 'report.json', shopReport((r) => { delete r.shop; }), { generatorFlags: ['--shop', '--skip-validation'] });

  assert.equal(status, 0, output);
  assert.match(output, /^HTML report generated: /m);
  assert.doesNotMatch(output, /Schema:/);
});

test('the renderer validates an aeo report from its mode when called without a flag', (t) => {
  const { status, output } = run(t, 'report.json', { ...plainReport, mode: 'aeo' }, { generatorFlags: [] });

  assert.notEqual(status, 0, output);
  assert.match(output, /does not match schemas\/qa-report-aeo-schema\.json/);
});

test('a report that matches its schema is rendered', (t) => {
  const { status, output, reportsDir } = run(t, 'qa-report-shop.json', shopReport());

  assert.equal(status, 0, output);
  assert.match(output, /✓ Schema: valid against schemas\/qa-report-shop-schema\.json/);
  assert.ok(fs.readdirSync(reportsDir).some((file) => file.endsWith('.html')));
});

test('an aeo report is validated from its mode when neither a flag nor the filename names the type', (t) => {
  const { status, output, reportsDir } = run(t, 'report.json', { ...plainReport, mode: 'aeo' });

  assert.notEqual(status, 0, output);
  assert.match(output, /does not match schemas\/qa-report-aeo-schema\.json/);
  assert.match(output, /\/ must have required property 'criteria'/);
  assert.ok(!fs.existsSync(reportsDir), 'refused report still wrote under reports/');
});

test('a report with no detectable type renders with a note that it was not validated', (t) => {
  const { status, output } = run(t, 'report.json', plainReport);

  assert.equal(status, 0, output);
  assert.match(output, /no test type given, not validated/);
});

test('a type whose schema is still an example document renders without validation', (t) => {
  const { status, output } = run(t, 'qa-report-functional.json', plainReport);

  assert.equal(status, 0, output);
  assert.match(output, /no JSON Schema for functional yet, not validated/);
});

test('a compact report with no websiteName still reaches the renderer', (t) => {
  const { websiteName, ...report } = plainReport;

  const { status, output } = run(t, 'qa-report-functional.json', report, { space: 0 });

  assert.equal(status, 0, output);
  assert.match(output, /^HTML report generated: /m);
});

test('without ajv installed, a type that is never validated still renders', (t) => {
  const { status, output } = run(t, 'qa-report-functional.json', plainReport, { prepare: () => {} });

  assert.equal(status, 0, output);
  assert.match(output, /^HTML report generated: /m);
});

test('without ajv installed, a validated type is refused with an install hint, not a request to edit the report', (t) => {
  const { status, output, reportsDir } = run(t, 'qa-report-shop.json', shopReport(), { prepare: () => {} });

  assert.notEqual(status, 0, output);
  assert.match(output, /ajv is not installed: run `npm ci`/);
  assert.doesNotMatch(output, /Fix these fields/);
  assert.ok(!fs.existsSync(reportsDir), 'refused report still wrote under reports/');
});

test('a schema that will not compile is reported as a kosh problem, not a report problem', (t) => {
  const breakShopSchema = (root) => {
    fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(root, 'node_modules'), 'dir');
    fs.writeFileSync(path.join(root, 'schemas/qa-report-shop-schema.json'), JSON.stringify({
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: { url: { type: 'link' } },
    }));
  };

  const { status, output } = run(t, 'qa-report-shop.json', shopReport(), { prepare: breakShopSchema });

  assert.notEqual(status, 0, output);
  assert.match(output, /Could not validate against schemas\/qa-report-shop-schema\.json/);
  assert.match(output, /problem with kosh, not with the report/);
  assert.doesNotMatch(output, /Fix these fields/);
});
