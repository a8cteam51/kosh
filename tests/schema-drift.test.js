const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Only the example-document schemas; aeo and shop are real JSON Schema and declare their own `required` list.
const EXAMPLE_SCHEMAS = { functional: 'functional-design', performance: 'performance', accessibility: 'a11y' };

const keyPaths = (obj, prefix = '') => Object.entries(obj).flatMap(([k, v]) => {
  const key = prefix + k;
  return v && typeof v === 'object' && !Array.isArray(v) ? [key, ...keyPaths(v, key + '.')] : [key];
});

for (const [type, skill] of Object.entries(EXAMPLE_SCHEMAS)) {
  test(`${type} schema carries every field the ${skill} skill's report example does`, () => {
    const md = fs.readFileSync(path.join(ROOT, 'skills', skill, 'SKILL.md'), 'utf8');
    const examples = [...md.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => m[1]).filter((b) => b.includes('"websiteName"'));
    assert.equal(examples.length, 1, `expected one report example in the ${skill} skill`);

    const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'schemas', `qa-report-${type}-schema.json`), 'utf8'));
    const schemaKeys = new Set(keyPaths(schema));
    const missing = keyPaths(JSON.parse(examples[0])).filter((k) => !k.startsWith('issues.') && !schemaKeys.has(k));
    assert.deepEqual(missing, []);
  });
}
