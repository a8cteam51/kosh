const fs = require('fs');
const path = require('path');

const SCHEMAS = path.join(__dirname, '../schemas');
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/i;

// Only a schema file that declares $schema is JSON Schema; the rest are still example documents.
function schemaFor(type) {
  const file = path.join(SCHEMAS, `qa-report-${type}-schema.json`);
  if (!fs.existsSync(file)) return null;
  const schema = JSON.parse(fs.readFileSync(file, 'utf8'));
  return schema.$schema ? schema : null;
}

// Date.parse rolls Feb 30 over to Mar 2 and accepts 24:00, so the day and hour are checked here.
function isDateTime(value) {
  const match = DATE_TIME.exec(value);
  if (!match || Number.isNaN(Date.parse(value))) return false;
  const [, year, month, day, hour] = match.map(Number);
  return hour < 24 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function describe(error) {
  const { additionalProperty, allowedValues, allowedValue } = error.params;
  const detail = additionalProperty ?? allowedValues?.join(', ') ?? allowedValue;
  return `${error.instancePath || '/'} ${error.message}${detail === undefined ? '' : `: ${detail}`}`;
}

// null when the type has no JSON Schema yet, otherwise every mismatch (empty when valid).
function validate(report, type) {
  const schema = schemaFor(type);
  if (!schema) return null;
  // Required here, not at the top, so types that are never validated render without ajv installed.
  const Ajv = require('ajv');
  const ajv = new Ajv({ allErrors: true, strict: true });
  // URL.canParse trims surrounding whitespace, so whitespace is rejected first.
  ajv.addFormat('uri', (value) => !/\s/.test(value) && URL.canParse(value));
  ajv.addFormat('date-time', isDateTime);
  const check = ajv.compile(schema);
  return check(report) ? [] : check.errors.map(describe);
}

// The flagged test types, or aeo when no type is flagged and the report says `mode: "aeo"`.
function typesFor(flags, report) {
  const types = flags.map((flag) => flag.replace(/^--/, ''));
  return types.length || report.mode !== 'aeo' ? types : ['aeo'];
}

// Prints the outcome for each type; false when the report must not be rendered.
function checkReport(report, reportPath, types) {
  if (types.length === 0) console.log('Schema: no test type given, not validated.');
  let ok = true;

  for (const type of types) {
    const schemaPath = `schemas/qa-report-${type}-schema.json`;
    let errors;
    try {
      errors = validate(report, type);
    } catch (error) {
      ok = false;
      console.error(error.code === 'MODULE_NOT_FOUND'
        ? '✗ ajv is not installed: run `npm ci` in the kosh folder, then re-run.'
        : `✗ Could not validate against ${schemaPath}: ${error.message}\nThis is a problem with kosh, not with the report: leave the JSON as it is and tell the user.`);
      continue;
    }

    if (errors === null) {
      console.log(`Schema: no JSON Schema for ${type} yet, not validated.`);
    } else if (errors.length === 0) {
      console.log(`✓ Schema: valid against ${schemaPath}`);
    } else {
      ok = false;
      console.error(`✗ ${reportPath} does not match ${schemaPath}:\n${errors.map((e) => `  ${e}`).join('\n')}\nFix these fields in ${reportPath}, then re-run.`);
    }
  }

  if (!ok) console.error('Nothing was rendered.');
  return ok;
}

module.exports = { checkReport, typesFor, validate };
