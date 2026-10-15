const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { schemaFor, validate } = require('../scripts/validate-report.js');
const { buildPages, readEntries } = require('../scripts/page-capture.js');

const FIXTURES = path.join(__dirname, 'fixtures');
const names = fs.readdirSync(FIXTURES).filter((name) => name.endsWith('.json')).sort();
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));
const typeOf = (name) => name.replace(/\.json$/, '').split('-')[0];

// Runs from before pages[] are refused for their shape and re-render with --skip-validation.
const OLD_SHAPE = ["/ must have required property 'pages'", '/ must NOT have additional properties: mobile', '/ must NOT have additional properties: desktop'];
// Opus 5 run 1 also invented a top-level `summary` that nothing reads; the schema exists partly to refuse that.
const EXPECTED_ERRORS = {
  'performance-opus-5-run-1.json': [...OLD_SHAPE, '/ must NOT have additional properties: summary'],
  'performance-opus-5-run-3.json': OLD_SHAPE,
  'performance-opus-5-5-run-3.json': OLD_SHAPE,
};

test('every fixture is checked against a JSON Schema', () => {
  assert.ok(names.length > 0, 'no fixtures found');
  assert.deepEqual(names.filter((name) => !schemaFor(typeOf(name))), []);
});

for (const name of names) {
  test(`${name} ${EXPECTED_ERRORS[name] ? 'is refused by' : 'passes'} the ${typeOf(name)} schema`, () => {
    assert.deepEqual(validate(fixture(name), typeOf(name)), EXPECTED_ERRORS[name] ?? []);
  });
}

const PAGES = 'performance-opus-5-5-2026-10-13.json';
const performance = (edit) => {
  const report = fixture(PAGES);
  edit(report);
  return validate(report, 'performance');
};

for (const [value, errors] of [
  ['/about/', ['/visitedPages/0 must match pattern "^https?://"', '/visitedPages/0 must match format "uri"']],
  ['ftp://example.com/', ['/visitedPages/0 must match pattern "^https?://"']],
]) {
  test(`a page kosh navigated to must be an http(s) URL, not ${value}`, () => {
    assert.deepEqual(performance((r) => { r.visitedPages[0] = value; }), errors);
  });
}

test('a report must list at least one page it covered', () => {
  assert.deepEqual(performance((r) => { r.visitedPages = []; }), ['/visitedPages must NOT have fewer than 1 items']);
});

for (const name of names.filter((file) => fs.existsSync(path.join(FIXTURES, file.replace(/\.json$/, '.capture.jsonl'))))) {
  test(`${name}'s pages[] is what the merge builds from its capture`, () => {
    assert.deepEqual(buildPages(readEntries(path.join(FIXTURES, name.replace(/\.json$/, '.capture.jsonl')))), fixture(name).pages);
  });
}

test('a URL observed on the site is kept as written, whatever its scheme or shape', () => {
  const observed = [
    { url: 'wss://example.com/socket', status: null, failure: 'net::ERR_FAILED', resourceType: 'websocket' },
    { url: 'http://exa mple.com/broken href', status: 404, resourceType: 'image' },
  ];
  assert.deepEqual(performance((r) => { r.pages[0].network = observed; }), []);
});

// No trailing \b: an underscore is a word character, so `site.com_backup` would slip past one.
const HOST = /(?:[a-z0-9-]+\.)+[a-z]{2,}(?![a-z0-9-])|\b(?:\d{1,3}\.){3}\d{1,3}\b|\blocalhost\b/gi;
const FILE = /\.(png|jpe?g|gif|svg|webp|js|css|json|txt|xml|woff2?|php|html?)$/i;
const EXAMPLE = /(^|\.)example\.(com|net|org)$/i;
const strayHosts = (text) => [...new Set(text.match(HOST) ?? [])].filter((host) => !FILE.test(host) && !EXAMPLE.test(host));

test('the host scan finds hostnames, IP addresses and localhost, and skips file names and numbers', () => {
  assert.deepEqual(strayHosts('see realsite.com_backup, 203.0.113.7 and http://localhost:8080/'), ['realsite.com', '203.0.113.7', 'localhost']);
  assert.deepEqual(strayHosts('font.woff2, robots.txt, plugin 1.1.0, CLS 0.05, e.g. this, cdn.example.net'), []);
});

// Fixtures are real runs in a public repo, so any other host means the redaction missed one. Site names are checked by hand.
test('fixtures name no hosts but example domains', () => {
  for (const name of fs.readdirSync(FIXTURES).filter((file) => /\.jsonl?$/.test(file))) {
    assert.deepEqual(strayHosts(fs.readFileSync(path.join(FIXTURES, name), 'utf8')), [], name);
  }
});
