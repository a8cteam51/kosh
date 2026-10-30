const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { fences } = require('./fences');
const { validate } = require('../scripts/validate-report.js');

const ROOT = path.join(__dirname, '..');

// Only the example-document schemas; aeo, shop, performance and functional are real JSON Schema and declare their own `required` list.
const EXAMPLE_SCHEMAS = { accessibility: 'a11y' };

// Every key path in a document, with array elements folded into one `[]` segment.
const keyPaths = (value, prefix = '') => {
  if (Array.isArray(value)) return value.flatMap((el) => keyPaths(el, prefix + '[]'));
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return [key, ...keyPaths(v, key)];
  });
};

for (const [type, skill] of Object.entries(EXAMPLE_SCHEMAS)) {
  test(`${type} schema carries every field the ${skill} skill's report examples do`, () => {
    const examples = fences(path.join(ROOT, 'skills', skill, 'SKILL.md'), 'json').filter((f) => f.code.includes('"websiteName"'));
    assert.ok(examples.length > 0, `no report example found in the ${skill} skill`);

    const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'schemas', `qa-report-${type}-schema.json`), 'utf8'));
    const schemaKeys = new Set(keyPaths(schema));
    for (const example of examples) {
      const missing = [...new Set(keyPaths(JSON.parse(example.code)))].filter((k) => !schemaKeys.has(k));
      assert.deepEqual(missing, [], `example at SKILL.md:${example.line}`);
    }
  });
}

// The example's timestamp is a placeholder a real report never carries, and pages[] is the wrapper's to write, so both are filled in before validating.
test('performance skill report examples validate against the performance schema', () => {
  const examples = fences(path.join(ROOT, 'skills', 'performance', 'SKILL.md'), 'json').filter((f) => f.code.includes('"websiteName"'));
  assert.ok(examples.length > 0, 'no report example found in the performance skill');

  for (const example of examples) {
    const report = JSON.parse(example.code.replace('"YYYY-MM-DDTHH:MM:SSZ"', '"2026-01-01T00:00:00Z"'));
    assert.equal(report.pages, undefined, `example at SKILL.md:${example.line} writes pages[], which the wrapper builds`);
    assert.deepEqual(validate({ ...report, pages: [] }, 'performance'), [], `example at SKILL.md:${example.line}`);
  }
});

// inventory[], linkChecks[] and finding ids are the wrapper's to write, so the example leaves them out.
test('functional-design skill report examples validate against the functional schema', () => {
  const examples = fences(path.join(ROOT, 'skills', 'functional-design', 'SKILL.md'), 'json').filter((f) => f.code.includes('"websiteName"'));
  assert.ok(examples.length > 0, 'no report example found in the functional-design skill');

  for (const example of examples) {
    const report = JSON.parse(example.code.replace('"YYYY-MM-DDTHH:MM:SSZ"', '"2026-01-01T00:00:00Z"'));
    for (const field of ['inventory', 'linkChecks']) assert.equal(report[field], undefined, `example at SKILL.md:${example.line} writes ${field}[], which the wrapper builds`);
    const ids = Object.values(report.issues ?? {}).flat().filter((finding) => finding?.id);
    assert.deepEqual(ids, [], `example at SKILL.md:${example.line} writes finding ids, which the wrapper assigns`);
    assert.deepEqual(validate(report, 'functional'), [], `example at SKILL.md:${example.line}`);
  }
});
