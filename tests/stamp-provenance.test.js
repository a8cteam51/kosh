const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { describeProvenance, hashSkill, stamp } = require('../scripts/stamp-provenance.js');
const { schemaFor } = require('../scripts/validate-report.js');

const ROOT = path.join(__dirname, '..');

// Inside Claude Code these point the stamp at the real session's transcript.
delete process.env.CLAUDE_CODE_SESSION_ID;
delete process.env.CLAUDE_EFFORT;

const HASH = /^[0-9a-f]{64}$/;
const SESSION = '0bfb41e4-test-session';
const freshRun = () => ({ timestamp: '2026-09-21T12:00:00Z', provenance: { model: 'claude-test-1' } });

const assistant = (model, effort, extra = {}) => JSON.stringify({ type: 'assistant', message: { model }, effort, ...extra });

// Claude Code writes a subagent's replies to <session>/subagents/, never to the main transcript.
const sessionLog = (t, lines, subagentLines = []) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kosh-claude-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const project = path.join(dir, 'projects', '-kosh');
  fs.mkdirSync(path.join(dir, 'projects', '-another-project'), { recursive: true });
  fs.mkdirSync(path.join(project, SESSION, 'subagents'), { recursive: true });
  fs.writeFileSync(path.join(project, `${SESSION}.jsonl`), lines.join('\n'));
  fs.writeFileSync(path.join(project, SESSION, 'subagents', 'agent-a1.jsonl'), subagentLines.join('\n'));
  return { CLAUDE_CODE_SESSION_ID: SESSION, CLAUDE_CONFIG_DIR: dir };
};

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
  assert.equal(report.provenance.modelSource, 'self-report');
  assert.equal('effort' in report.provenance, false);
  assert.match(report.provenance.pluginVersion, /^\d+\.\d+\.\d+$/);
  assert.match(report.provenance.skills['functional-design'], HASH);
  assert.equal(report.provenance.collectors, hashSkill(path.join(ROOT, 'collectors')));
  assert.deepEqual(report.provenance.playwrightMcp, require('../.mcp.json').mcpServers.playwright.args);
  assert.match(report.provenance.seal, HASH);
});

// The merge writes the hash before the stamp seals it, and only the merge may change it.
test('a capture hash is sealed, and editing or removing it breaks the seal', () => {
  const report = freshRun();
  report.provenance.captureSha256 = 'e'.repeat(64);
  assert.equal(stamp(report, ['--performance']), 'stamped');
  assert.equal(report.provenance.captureSha256, 'e'.repeat(64));
  assert.equal(stamp(report, ['--performance']), 'kept');

  for (const edit of [(p) => { p.captureSha256 = 'f'.repeat(64); }, (p) => { delete p.captureSha256; }]) {
    const edited = structuredClone(report);
    edit(edited.provenance);
    assert.equal(stamp(edited, ['--performance']), 'stamped');
  }
});

test('a block sealed before collectors and playwrightMcp existed is kept', () => {
  const skills = { 'functional-design': 'c'.repeat(64) };
  const report = freshRun();
  const seal = crypto.createHash('sha256').update(JSON.stringify([report.timestamp, '1.3.0', Object.entries(skills)])).digest('hex');
  report.provenance = { model: 'claude-test-1', pluginVersion: '1.3.0', skills, seal };
  const sealed = structuredClone(report);

  assert.equal(stamp(report, ['--functional']), 'kept');
  assert.deepEqual(report, sealed);
});

test("on Claude Code the model and effort come from the session log's latest main-thread reply", (t) => {
  const env = sessionLog(t, [
    JSON.stringify({ type: 'user', message: { content: 'run the performance test' } }),
    assistant('claude-earlier', 'high'),
    assistant('claude-served', 'xhigh', { requestedModel: 'claude-served[1m]' }),
    JSON.stringify({ type: 'assistant', message: { model: '<synthetic>' }, isApiErrorMessage: true }),
    JSON.stringify({ type: 'attachment' }),
    '{"type":"assistant","message":{"mod',
  ], [assistant('claude-subagent', 'low')]);
  const report = freshRun();

  assert.equal(stamp(report, ['--performance'], { ...env, CLAUDE_EFFORT: 'medium' }), 'stamped');
  assert.equal(report.provenance.model, 'claude-served[1m]');
  assert.equal(report.provenance.modelSource, 'transcript');
  assert.equal(report.provenance.effort, 'xhigh');
});

test('with no session log the self-report stays, labelled, and effort comes from CLAUDE_EFFORT', (t) => {
  const log = sessionLog(t, [assistant('claude-served', 'xhigh')]);
  fs.writeFileSync(path.join(log.CLAUDE_CONFIG_DIR, 'projects', 'escaped.jsonl'), assistant('claude-escaped', 'max'));
  const envs = [
    {},
    { CLAUDE_CODE_SESSION_ID: 'no-such-session', CLAUDE_CONFIG_DIR: log.CLAUDE_CONFIG_DIR },
    { CLAUDE_CODE_SESSION_ID: '../escaped', CLAUDE_CONFIG_DIR: log.CLAUDE_CONFIG_DIR },
    { CLAUDE_CODE_SESSION_ID: SESSION, CLAUDE_CONFIG_DIR: path.join(log.CLAUDE_CONFIG_DIR, 'missing') },
    sessionLog(t, [JSON.stringify({ type: 'user' })], [assistant('claude-subagent', 'low')]),
  ];

  for (const env of envs) {
    for (const effort of [undefined, 'medium']) {
      const report = freshRun();
      stamp(report, ['--performance'], effort ? { ...env, CLAUDE_EFFORT: effort } : env);
      assert.equal(report.provenance.model, 'claude-test-1');
      assert.equal(report.provenance.modelSource, 'self-report');
      assert.equal(report.provenance.effort, effort);
    }
  }
});

test('the requested model, with its context variant, is recorded only when it is the one that served', (t) => {
  for (const [line, expected] of [
    [assistant('claude-fallback', 'xhigh', { requestedModel: 'claude-requested[1m]' }), 'claude-fallback'],
    [assistant('claude-opus-5', 'xhigh', { requestedModel: 'claude-opus-5-5[1m]' }), 'claude-opus-5'],
    [assistant('claude-served', 'xhigh'), 'claude-served'],
  ]) {
    const report = freshRun();
    stamp(report, ['--performance'], sessionLog(t, [line]));
    assert.equal(report.provenance.model, expected);
  }
});

test('a sealed block with its model, modelSource or effort edited is restamped', (t) => {
  const env = sessionLog(t, [assistant('claude-served', 'xhigh')]);
  for (const edit of [(p) => { p.model = 'claude-other'; }, (p) => { p.modelSource = 'self-report'; }, (p) => { p.effort = 'low'; }, (p) => { delete p.effort; }]) {
    const report = freshRun();
    stamp(report, ['--performance'], env);
    assert.equal(stamp(report, ['--performance'], {}), 'kept');
    edit(report.provenance);

    assert.equal(stamp(report, ['--performance'], {}), 'stamped');
  }
});

test('a block sealed before modelSource existed keeps its seal and its self-reported model', (t) => {
  const report = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'performance-opus-5-5-2026-10-14.json'), 'utf8'));
  const sealed = structuredClone(report);

  assert.equal(stamp(report, ['--performance'], sessionLog(t, [assistant('claude-served', 'xhigh')])), 'kept');
  assert.deepEqual(report, sealed);
});

test('a sealed block with collectors or playwrightMcp edited is restamped', () => {
  for (const edit of [(p) => { p.collectors = 'd'.repeat(64); }, (p) => { p.playwrightMcp = ['@playwright/mcp@latest']; }, (p) => { delete p.collectors; }]) {
    const report = freshRun();
    stamp(report, ['--functional']);
    const stamped = structuredClone(report.provenance);
    edit(report.provenance);

    assert.equal(stamp(report, ['--functional']), 'stamped');
    assert.deepEqual(report.provenance, stamped);
  }
});

for (const flags of [['--functional', '--performance'], ['--functional', '--a11y'], ['--skip-validation']]) {
  test(`a fresh run is not stamped with ${flags.join(' ')}`, () => {
    const report = freshRun();

    assert.equal(stamp(report, flags), 'refused');
    assert.deepEqual(report, freshRun());
  });
}

test('a repeated type flag stamps that one skill', () => {
  const report = freshRun();

  assert.equal(stamp(report, ['--functional', '--functional']), 'stamped');
  assert.deepEqual(Object.keys(report.provenance.skills), ['functional-design']);
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
    'kosh 1.1.0 · model m (self-reported) · skill aeo@abcdef012345'
  );
  assert.equal(describeProvenance({ model: 'm' }), 'kosh ? · model m (self-reported)');
  assert.equal(describeProvenance({ model: 'm', modelSource: 'transcript', effort: 'xhigh' }), 'kosh ? · model m · effort xhigh');
  assert.equal(describeProvenance({ model: 'm', modelSource: 'self-report' }), 'kosh ? · model m (self-reported)');
});

test('every JSON Schema documents exactly the fields the stamp writes, the same way', () => {
  const report = freshRun();
  report.provenance.captureSha256 = 'e'.repeat(64);
  stamp(report, ['--shop'], { CLAUDE_EFFORT: 'high' });
  const schemas = ['shop', 'aeo', 'performance'].map((type) => schemaFor(type).properties.provenance);

  assert.deepEqual(Object.keys(schemas[0].properties).sort(), Object.keys(report.provenance).sort());
  for (const schema of schemas.slice(1)) assert.deepEqual(schema, schemas[0]);
});
