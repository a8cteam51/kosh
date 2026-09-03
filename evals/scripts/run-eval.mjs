import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const evalsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const executable = process.platform === 'win32' ? 'promptfoo.cmd' : 'promptfoo';
const binDir = path.join(evalsDir, 'node_modules', '.bin');
const requestedRepeats = Number.parseInt(process.argv[2] || '1', 10);
const repeats = Number.isFinite(requestedRepeats) && requestedRepeats > 0 ? requestedRepeats : 1;
const htmlFile = path.join(evalsDir, 'results', 'functional-design.html');
const jsonFile = path.join(evalsDir, 'results', 'raw', 'functional-design.json');

fs.mkdirSync(path.dirname(jsonFile), { recursive: true });
fs.rmSync(htmlFile, { force: true });
fs.rmSync(jsonFile, { force: true });

const reset = spawnSync(process.execPath, [path.join(evalsDir, 'scripts', 'reset-workspace.mjs')], {
  cwd: evalsDir,
  stdio: 'inherit',
});
if (reset.status !== 0) {
  process.exit(reset.status ?? 1);
}

const result = spawnSync(executable, [
  'eval',
  '--config',
  'promptfooconfig.yaml',
  '--no-cache',
  '--repeat',
  String(repeats),
  '--output',
  htmlFile,
  jsonFile,
], {
  cwd: evalsDir,
  env: {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH}`,
  },
  stdio: 'inherit',
});

if (!fs.existsSync(jsonFile)) {
  process.exit(result.status ?? 1);
}

const output = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
const errors = output.results?.stats?.errors || 0;
const failures = output.results?.stats?.failures || 0;

console.log(`Report: ${htmlFile}`);

if (errors > 0) {
  console.error(`The eval completed with ${errors} provider error${errors === 1 ? '' : 's'}.`);
  process.exit(1);
}
if (failures > 0) {
  console.error(`${failures} assertion failure${failures === 1 ? '' : 's'} — the skill regressed on those cases.`);
  process.exit(1);
}
console.log('All cases passed.');
