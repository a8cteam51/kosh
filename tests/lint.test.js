const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { ESLint } = require('eslint');
const globals = require('globals');
const { fences } = require('./fences.js');

const ROOT = path.join(__dirname, '..');
const SKILLS = path.join(ROOT, 'skills');

// Exact uses of undefined names per file, each a known gap the model fills in at run time: a count can only shrink.
const UNDEFINED = {
  'skills/aeo/SKILL.md': { applicableSchemas: 2, koshFaqProbe: 4 },
};

// Window properties named like a local (`status`, `name`), so a missing local would silently read the window's.
const AMBIGUOUS = ['blur', 'close', 'closed', 'event', 'external', 'find', 'focus', 'frames', 'length', 'name', 'open', 'opener', 'origin', 'parent', 'print', 'screen', 'self', 'status', 'stop', 'top'];

// Only no-undef: a typo'd name compiles and fails only live, mid-run; the recommended rules flag mostly deliberate code.
const rules = { 'no-undef': 'error' };
const PAGE = { ...Object.fromEntries(Object.entries(globals.browser).filter(([name]) => !AMBIGUOUS.includes(name))), __kosh: 'readonly' };
const config = [
  { files: ['**/*.js'], ignores: ['collectors/kosh.js', 'skills/**'], languageOptions: { sourceType: 'commonjs', globals: globals.node }, rules },
  { files: ['**/*.mjs'], languageOptions: { globals: globals.node }, rules },
  { files: ['collectors/kosh.js', 'skills/**/*.js'], languageOptions: { sourceType: 'script', globals: PAGE }, rules },
  // The callbacks capture.js hands to page.evaluate run in the page.
  { files: ['collectors/capture.js'], languageOptions: { globals: { __kosh: 'readonly', document: 'readonly', location: 'readonly', innerWidth: 'readonly', innerHeight: 'readonly' } } },
];

const lint = async () => {
  const eslint = new ESLint({ cwd: ROOT, overrideConfigFile: true, overrideConfig: config });
  const found = {};
  const add = (file, messages) => (found[file] ??= []).push(...messages.filter((message) => message.ruleId === 'no-undef' || message.fatal));
  for (const { filePath, messages } of await eslint.lintFiles(['collectors', 'hooks', 'scripts', 'tests', 'evals/scripts'])) {
    add(path.relative(ROOT, filePath), messages);
  }
  for (const name of fs.readdirSync(SKILLS, { recursive: true }).filter((name) => name.endsWith('.md'))) {
    const file = `skills/${name}`;
    for (const { code, line } of fences(path.join(SKILLS, name))) {
      // A snippet is a function body the model wraps, as skill-snippets.test.js compiles it; the wrapper shifts lines by one.
      const [{ messages }] = await eslint.lintText(`(function () {\n${code}\n})();`, { filePath: path.join(ROOT, `${file}.js`) });
      add(file, messages.map((message) => ({ ...message, line: message.line + line - 1 })));
    }
  }
  return found;
};

test('no undefined names in kosh code or skill snippets', async (t) => {
  const found = await lint();
  assert.ok(Object.keys(found).length > 20, 'lint found almost nothing to check');
  for (const file of new Set([...Object.keys(found), ...Object.keys(UNDEFINED)])) {
    await t.test(file, () => {
      const allowed = UNDEFINED[file] ?? {};
      const messages = (found[file] ?? []).map((message) => ({ ...message, name: message.message.match(/^'(.+)' is not defined\.$/)?.[1] }));
      const unexpected = messages.filter(({ name }) => !Object.hasOwn(allowed, name));
      assert.deepStrictEqual(unexpected.map(({ line, message }) => `${file}:${line} ${message}`), []);
      const counts = Object.fromEntries(Object.keys(allowed).map((name) => [name, messages.filter((message) => message.name === name).length]));
      assert.deepStrictEqual(counts, allowed, 'uses of known undefined names changed: lower UNDEFINED when one is fixed, never raise it');
    });
  }
});
