#!/usr/bin/env node

// Usage: node validate-report.js <report.json> [--functional|--performance|--accessibility|--shop|--aeo]

const fs = require('fs');
const path = require('path');

let Ajv;
try {
  Ajv = require('ajv');
} catch {
  console.error('✗ ajv is not installed: run `npm install` in the kosh folder, then re-run.');
  process.exit(1);
}

const SCHEMAS = path.join(__dirname, '../schemas');
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/i;

// Only a schema file that declares $schema is JSON Schema; the rest are still example documents.
function schemaFor(type) {
  const file = path.join(SCHEMAS, `qa-report-${type}-schema.json`);
  if (!fs.existsSync(file)) return null;
  const schema = JSON.parse(fs.readFileSync(file, 'utf8'));
  return schema.$schema ? schema : null;
}

function describe(error) {
  const detail = error.params.additionalProperty ?? error.params.allowedValues?.join(', ');
  return `${error.instancePath || '/'} ${error.message}${detail ? `: ${detail}` : ''}`;
}

// null when the type has no JSON Schema yet, otherwise every mismatch (empty when valid).
function validate(report, type) {
  const schema = schemaFor(type);
  if (!schema) return null;
  const ajv = new Ajv({ allErrors: true, strict: true });
  ajv.addFormat('uri', (value) => URL.canParse(value));
  ajv.addFormat('date-time', (value) => DATE_TIME.test(value) && !Number.isNaN(Date.parse(value)));
  const check = ajv.compile(schema);
  return check(report) ? [] : check.errors.map(describe);
}

if (require.main === module) {
  const [reportPath, ...flags] = process.argv.slice(2);
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  let failed = false;

  for (const type of flags.map((flag) => flag.replace(/^--/, ''))) {
    const schemaPath = `schemas/qa-report-${type}-schema.json`;
    const errors = validate(report, type);
    if (errors === null) {
      console.log(`Schema: no JSON Schema for ${type} yet, not validated.`);
    } else if (errors.length === 0) {
      console.log(`✓ Schema: valid against ${schemaPath}`);
    } else {
      failed = true;
      console.error(`✗ ${reportPath} does not match ${schemaPath}:\n${errors.map((e) => `  ${e}`).join('\n')}`);
    }
  }
  process.exit(failed ? 1 : 0);
}

module.exports = { validate };
