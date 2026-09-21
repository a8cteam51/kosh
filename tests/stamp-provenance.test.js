const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { describeProvenance, hashSkill, stamp } = require('../scripts/stamp-provenance.js');

const HASH = /^[0-9a-f]{64}$/;
const freshRun = () => ({ timestamp: '2026-09-21T12:00:00Z', provenance: { model: 'claude-test-1' } });

const tempSkillDir = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kosh-skill-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'references'));
  fs.writeFileSync(path.join(dir, 'SKILL.md'), 'procedure');
  fs.writeFileSync(path.join(dir, 'references', 'rubric.md'), 'v1');
  return dir;
};

test('a fresh run is stamped with version, model, skill hash and seal', () => {
  const report = freshRun();

  assert.equal(stamp(report, ['--functional']), 'stamped');
  assert.equal(report.provenance.model, 'claude-test-1');
  assert.match(report.provenance.pluginVersion, /^\d+\.\d+\.\d+$/);
  assert.match(report.provenance.skills['functional-design'], HASH);
  assert.match(report.provenance.seal, HASH);
});

test('a sealed report is never restamped, whatever flags the re-render passes', () => {
  const report = freshRun();
  stamp(report, ['--functional']);
  const sealed = structuredClone(report);

  assert.equal(stamp(report, ['--aeo']), 'kept');
  assert.equal(stamp(report, []), 'kept');
  assert.deepEqual(report, sealed);
});

test('a sealed report with no skills is not restamped either', () => {
  const report = freshRun();
  stamp(report, []);
  assert.deepEqual(report.provenance.skills, {});

  assert.equal(stamp(report, ['--functional']), 'kept');
  assert.deepEqual(report.provenance.skills, {});
});

test('a report from before provenance existed is left untouched', () => {
  const report = { timestamp: '2026-06-22T09:00:00Z', issues: {} };
  const original = structuredClone(report);

  assert.equal(stamp(report, ['--functional']), 'absent');
  assert.deepEqual(report, original);
});

test('model-written version, plausible hash and fake seal do not block the real stamp', () => {
  const invented = { model: 'claude-test-1', pluginVersion: '9.9.9', skills: { aeo: 'a'.repeat(64) }, seal: 'b'.repeat(64) };
  const report = { timestamp: '2026-09-21T12:00:00Z', provenance: invented };

  assert.equal(stamp(report, ['--aeo']), 'stamped');
  assert.notEqual(report.provenance.pluginVersion, '9.9.9');
  assert.notEqual(report.provenance.skills.aeo, 'a'.repeat(64));
  assert.notEqual(report.provenance.seal, 'b'.repeat(64));
});

test('a sealed block copied forward into a new run is restamped', () => {
  const previous = freshRun();
  stamp(previous, ['--functional']);
  const copied = { timestamp: '2026-10-01T08:00:00Z', provenance: structuredClone(previous.provenance) };

  assert.equal(stamp(copied, ['--functional']), 'stamped');
  assert.notEqual(copied.provenance.seal, previous.provenance.seal);
});

test('a missing model reads as unknown', () => {
  const report = { timestamp: '2026-09-21T12:00:00Z', provenance: {} };
  stamp(report, []);
  assert.equal(report.provenance.model, 'unknown');
});

test('skill hash covers reference files', (t) => {
  const dir = tempSkillDir(t);
  const first = hashSkill(dir);
  assert.equal(hashSkill(dir), first);

  fs.writeFileSync(path.join(dir, 'references', 'rubric.md'), 'v2');
  assert.notEqual(hashSkill(dir), first);
});

test('skill hash ignores dotfiles, hidden directories and broken symlinks', (t) => {
  const dir = tempSkillDir(t);
  const first = hashSkill(dir);

  fs.writeFileSync(path.join(dir, '.DS_Store'), 'junk');
  fs.mkdirSync(path.join(dir, '.cache'));
  fs.writeFileSync(path.join(dir, '.cache', 'index.json'), 'junk');
  fs.symlinkSync(path.join(dir, 'gone.md'), path.join(dir, 'references', 'dangling.md'));

  assert.equal(hashSkill(dir), first);
});

test('describeProvenance shortens hashes and tolerates partial blocks', () => {
  assert.equal(
    describeProvenance({ model: 'm', pluginVersion: '1.1.0', skills: { aeo: 'abcdef0123456789' } }),
    'kosh 1.1.0 · model m · skill aeo@abcdef012345'
  );
  assert.equal(describeProvenance({ model: 'm' }), 'kosh ? · model m');
});
