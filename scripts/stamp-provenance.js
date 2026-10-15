#!/usr/bin/env node

// Usage: node stamp-provenance.js <report.json> [--functional|--performance|--accessibility|--shop|--aeo]

const fs = require('fs');
const os = require('os');
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

// No hook or env var carries the model, so it comes from Claude Code's session log; the message running this command isn't in it yet, earlier ones are.
function sessionFacts(env = process.env) {
  const effort = env.CLAUDE_EFFORT || undefined;
  const session = env.CLAUDE_CODE_SESSION_ID;
  if (!/^[A-Za-z0-9-]+$/.test(session ?? '')) return { effort };

  const projects = path.join(env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'projects');
  // ponytail: main thread only; a skill run inside a subagent (replies in <session>/subagents/) gets the parent's model.
  let lines = [];
  try {
    const transcript = fs.readdirSync(projects)
      .map((dir) => path.join(projects, dir, `${session}.jsonl`))
      .find((file) => fs.existsSync(file));
    if (transcript) lines = fs.readFileSync(transcript, 'utf8').split('\n');
  } catch {
    return { effort };
  }

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    let entry;
    try { entry = JSON.parse(lines[i]); } catch { continue; }
    const model = entry?.message?.model;
    if (entry?.type === 'assistant' && !entry.isSidechain && typeof model === 'string' && model && model !== '<synthetic>') {
      // requestedModel adds the context variant ([1m]); after a fallback to another model, the served one stands.
      const id = typeof entry.requestedModel === 'string' && entry.requestedModel.startsWith(model) ? entry.requestedModel : model;
      return { model: id, effort: typeof entry.effort === 'string' && entry.effort ? entry.effort : effort };
    }
  }
  return { effort };
}

// Catches accidental copy-forward and echoed blocks (new run, new timestamp, seal mismatch); unkeyed, so not proof against deliberate forgery.
function sealFor(report, { model, modelSource, effort, pluginVersion, skills, collectors, playwrightMcp, captureSha256 }) {
  const fields = [report.timestamp, pluginVersion, Object.entries(skills || {}).sort()];
  // Blocks sealed before these fields existed keep their seal.
  if (collectors !== undefined || playwrightMcp !== undefined) fields.push(collectors, playwrightMcp);
  if (captureSha256 !== undefined) fields.push(captureSha256);
  if (modelSource !== undefined) fields.push(model, modelSource, effort);
  return crypto.createHash('sha256').update(JSON.stringify(fields)).digest('hex');
}

function stamp(report, flags, env = process.env) {
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
  const mcp = JSON.parse(fs.readFileSync(path.join(ROOT, '.mcp.json'), 'utf8'));
  const facts = sessionFacts(env);
  const stamped = {
    model: facts.model || String(existing.model || 'unknown'),
    modelSource: facts.model ? 'transcript' : 'self-report',
    ...(facts.effort && { effort: facts.effort }),
    pluginVersion: plugin.version,
    skills,
    collectors: hashSkill(path.join(ROOT, 'collectors')),
    playwrightMcp: mcp.mcpServers.playwright.args,
    // Hashed from the capture before the stamp runs; the stamp can't recompute it.
    ...(existing.captureSha256 !== undefined && { captureSha256: existing.captureSha256 }),
  };
  report.provenance = { ...stamped, seal: sealFor(report, stamped) };
  return 'stamped';
}

function describeProvenance(provenance) {
  const skills = Object.entries(provenance.skills || {})
    .map(([name, hash]) => `${name}@${String(hash).slice(0, 12)}`)
    .join(', ');
  const selfReported = provenance.modelSource !== 'transcript' ? ' (self-reported)' : '';
  const parts = [`kosh ${provenance.pluginVersion || '?'}`, `model ${provenance.model || 'unknown'}${selfReported}`];
  if (provenance.effort) parts.push(`effort ${provenance.effort}`);
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
