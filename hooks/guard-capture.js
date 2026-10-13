// ponytail: PreToolUse pattern match that keeps runs from writing page captures; it stops a shortcut, not someone set on getting around it.
const fs = require('fs');
const path = require('path');
const { captureFile } = require('../collectors/capture.js');

// kosh's own layout, so it holds from any folder and in any checkout.
const IN_REPORTS = /reports\/data\/[^\s]*capture[^\s]*\.jsonl/i;

// Broader patterns, for commands that can reach the folder holding kosh's reports/.
const IN_KOSH = [
  /capture[^\s]*\.jsonl/i,
  /capture[\w-]*\*/i,
  /[*?][^\s]*\.jsonl/i,
  /\b(?:rm|mv)\b[^|;&]*[\s/'"]reports(?:\/data(?:\/archive)?)?\/?(?=[\s;|&)'"]|$)/i,
];

// The real path with the case the disk uses, through the nearest folder that exists.
const real = (file) => {
  try { return fs.realpathSync.native(file); } catch {}
  const parent = path.dirname(file);
  return parent === file ? file : path.join(real(parent), path.basename(file));
};

const configuredRoot = path.resolve(path.dirname(captureFile()), '../..');
const root = real(configuredRoot);
const literal = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const namesRoot = new RegExp(`(?:${[...new Set([configuredRoot, root])].map(literal).join('|')})(?=[/\\s'";&|)]|$)`, 'i');

const inside = (dir, file) => {
  const relative = path.relative(dir, file);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

const blocked = (call) => {
  const args = call?.tool_input ?? {};
  if (['Write', 'Edit', 'MultiEdit'].includes(call?.tool_name)) return typeof args.file_path === 'string' && IN_REPORTS.test(args.file_path);
  if (call?.tool_name !== 'Bash' || typeof args.command !== 'string') return false;
  if (IN_REPORTS.test(args.command)) return true;
  const reaches = inside(root, real(call.cwd || process.cwd())) || namesRoot.test(args.command);
  return reaches && IN_KOSH.some((pattern) => pattern.test(args.command));
};

let input = '';
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  let call;
  try { call = JSON.parse(input); } catch { return; }
  if (!blocked(call)) return;
  process.stderr.write("Blocked: page capture files (reports/data/capture-*.jsonl and archive/*.capture.jsonl) are written only by the browser. Don't create, edit, move or delete them. If a page is missing from the capture, load it in the browser again. To look at one, use the Read tool.\n");
  process.exitCode = 2;
});
