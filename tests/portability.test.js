const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SHARED = fs.readdirSync(path.join(ROOT, 'shared')).filter((name) => name.endsWith('.md')).map((name) => `shared/${name}`);
const SKILLS = fs.readdirSync(path.join(ROOT, 'skills'), { recursive: true }).filter((name) => name.endsWith('.md')).map((name) => `skills/${name}`);
const BLOCKS = SHARED.map((file) => fs.readFileSync(path.join(ROOT, file), 'utf8'));

// Claude Code-only constructs, matched case-insensitively: other hosts load a skill's text verbatim.
const RULES = ['PushNotification', 'AskUserQuestion', 'TodoWrite', '/kosh:', 'Claude prompt', 'mcp__', 'CLAUDE_', '$ARGUMENTS'];

// Exact counts, so an entry can only shrink as its file is rewritten.
const ALLOWED = {
  'shared/gate-check.md': { PushNotification: 1 },
  'shared/preamble.md': { $ARGUMENTS: 2 },
  'skills/aeo/SKILL.md': { 'Claude prompt': 9 },
  'skills/functional-design/SKILL.md': { '/kosh:': 1 },
  'skills/shop/SKILL.md': { '/kosh:': 7 },
};

for (const file of [...SHARED, ...SKILLS]) {
  test(`${file} has no new Claude Code-only constructs`, () => {
    let source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    // Shared blocks are counted once, in shared/; blanking keeps the copy's line numbers.
    if (file.startsWith('skills/')) for (const block of BLOCKS) source = source.replace(block, () => block.replace(/[^\n]/g, ''));
    const lines = source.toLowerCase().split('\n');
    for (const rule of RULES) {
      const hits = lines.flatMap((line, i) => Array(line.split(rule.toLowerCase()).length - 1).fill(i + 1));
      const allowed = ALLOWED[file]?.[rule] ?? 0;
      const where = hits.length > allowed ? `on lines ${hits.join(', ')}` : 'lower its ALLOWED count';
      assert.strictEqual(hits.length, allowed, `${rule} found ${hits.length}×, allowed ${allowed}: ${where}`);
    }
  });
}

test('ALLOWED names only real files and rules', () => {
  for (const [file, counts] of Object.entries(ALLOWED)) {
    assert.ok(SHARED.includes(file) || SKILLS.includes(file), `no ${file}`);
    for (const rule of Object.keys(counts)) assert.ok(RULES.includes(rule), `no rule ${rule}`);
  }
});
