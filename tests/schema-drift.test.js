const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { fences } = require('./fences');

const ROOT = path.join(__dirname, '..');

// Only the example-document schemas; aeo and shop are real JSON Schema and declare their own `required` list.
const EXAMPLE_SCHEMAS = { functional: 'functional-design', performance: 'performance', accessibility: 'a11y' };

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
