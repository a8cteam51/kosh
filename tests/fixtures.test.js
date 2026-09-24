const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { schemaFor, validate } = require('../scripts/validate-report.js');

const FIXTURES = path.join(__dirname, 'fixtures');
const names = fs.readdirSync(FIXTURES).filter((name) => name.endsWith('.json')).sort();
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));
const typeOf = (name) => name.replace(/\.json$/, '').split('-')[0];

// Opus 5 run 1 invented a top-level `summary` that nothing reads; the schema exists partly to refuse that.
const EXPECTED_ERRORS = { 'performance-opus-5-run-1.json': ['/ must NOT have additional properties: summary'] };

test('every fixture is checked against a JSON Schema', () => {
  assert.ok(names.length > 0, 'no fixtures found');
  assert.deepEqual(names.filter((name) => !schemaFor(typeOf(name))), []);
});

for (const name of names) {
  test(`${name} ${EXPECTED_ERRORS[name] ? 'is refused by' : 'passes'} the ${typeOf(name)} schema`, () => {
    assert.deepEqual(validate(fixture(name), typeOf(name)), EXPECTED_ERRORS[name] ?? []);
  });
}

const performance = (edit) => {
  const report = fixture('performance-opus-5-5-run-3.json');
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

test('a load time of 0 is refused, since it means loadEventEnd was read too early', () => {
  assert.deepEqual(performance((r) => { r.mobile.loadTime = 0; }), ['/mobile/loadTime must be > 0']);
});

test('a URL observed on the site is kept as written, whatever its scheme or shape', () => {
  const observed = [
    { url: 'wss://example.com/socket', status: null, type: 'websocket' },
    { url: 'http://exa mple.com/broken href', status: 404, type: 'image' },
  ];
  assert.deepEqual(performance((r) => { r.mobile.network = observed; }), []);
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
  for (const name of names) {
    assert.deepEqual(strayHosts(fs.readFileSync(path.join(FIXTURES, name), 'utf8')), [], name);
  }
});
