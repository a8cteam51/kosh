#!/usr/bin/env node

// Usage: node stamp-provenance.js <report.json> [--functional|--performance|--accessibility|--shop|--aeo]

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SKILL_DIRS = { functional: 'functional-design', accessibility: 'a11y' };
const TYPE_FLAGS = ['--functional', '--performance', '--accessibility', '--shop', '--aeo'];

function hashSkill(dir) {
  const hash = crypto.createHash('sha256');
  const files = fs.readdirSync(dir, { recursive: true })
    .map((file) => file.split(path.sep).join('/'))
    .filter((file) => !file.split('/').some((segment) => segment.startsWith('.')))
    .filter((file) => fs.statSync(path.join(dir, file), { throwIfNoEntry: false })?.isFile())
    .sort();

  for (const file of files) {
    hash.update(`${file}\0`).update(fs.readFileSync(path.join(dir, file)));
  }
  return hash.digest('hex');
}

// Catches accidental copy-forward and echoed blocks (new run, new timestamp, seal mismatch); unkeyed, so not proof against deliberate forgery.
function sealFor(report, { pluginVersion, skills }) {
  return crypto.createHash('sha256')
    .update(JSON.stringify([report.timestamp, pluginVersion, Object.entries(skills || {}).sort()]))
    .digest('hex');
}

function stamp(report, flags) {
  const existing = report.provenance;
  if (!existing || typeof existing !== 'object') return 'absent';
  if (existing.seal && existing.seal === sealFor(report, existing)) return 'kept';
  // A seal is never rewritten, so a wrong skill in it would stay; any other flag would be hashed as a skill folder.
  const unique = [...new Set(flags)];
  if (unique.length > 1 || unique.some((flag) => !TYPE_FLAGS.includes(flag))) return 'refused';

  const skills = {};
  for (const flag of flags) {
    const type = flag.replace(/^--/, '');
    const name = SKILL_DIRS[type] || type;
    const dir = path.join(ROOT, 'skills', name);
    if (fs.existsSync(dir)) skills[name] = hashSkill(dir);
  }

  const plugin = JSON.parse(fs.readFileSync(path.join(ROOT, '.claude-plugin/plugin.json'), 'utf8'));
  const stamped = { model: String(existing.model || 'unknown'), pluginVersion: plugin.version, skills };
  report.provenance = { ...stamped, seal: sealFor(report, stamped) };
  return 'stamped';
}

function describeProvenance(provenance) {
  const skills = Object.entries(provenance.skills || {})
    .map(([name, hash]) => `${name}@${String(hash).slice(0, 12)}`)
    .join(', ');
  const parts = [`kosh ${provenance.pluginVersion || '?'}`, `model ${provenance.model || 'unknown'}`];
  if (skills) parts.push(`skill ${skills}`);
  return parts.join(' · ');
}

if (require.main === module) {
  const [reportPath, ...flags] = process.argv.slice(2);
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const status = stamp(report, flags);

  if (status === 'refused') {
    console.error(`✗ Provenance: not stamped. Pass at most one of ${TYPE_FLAGS.join(' ')}; got ${flags.join(' ')}.`);
    process.exit(1);
  } else if (status === 'absent') {
    console.log('⚠ Provenance: report has no provenance.model, so it was not stamped. A fresh run must set it and re-run; a report from before provenance existed stays as it is.');
  } else {
    if (status === 'stamped') fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`✓ Provenance (${status}): ${describeProvenance(report.provenance)}`);
  }
}

module.exports = { TYPE_FLAGS, describeProvenance, hashSkill, stamp };
