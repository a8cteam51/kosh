// ponytail: PreToolUse pattern match that keeps runs from writing page captures; it stops a shortcut, not someone set on getting around it.
const fs = require('fs');
const path = require('path');
const { CAPTURE_NAME, reportsDir } = require('../collectors/capture.js');

// kosh's own layout, so it holds from any folder and in any checkout.
const IN_REPORTS = /reports\/data\/[^\s]*capture[^\s]*\.jsonl/i;

// Broader patterns only for commands that can reach a reports/ kosh has run in, since plugin hooks run in every project.
const IN_KOSH = [
  /capture[^\s]*\.jsonl/i,
  /capture[\w-]*\*/i,
  /[*?][^\s]*\.jsonl/i,
  /\b(?:rm|mv)\b[^|;&]*[\s/'"]reports(?:\/data(?:\/archive)?)?(?:\/[^\s;|&)'"\/]*[*?{][^\s;|&)'"\/]*)?\/?(?=[\s;|&)'"]|$)/i,
];

// This session's capture, by the variable or by its id: the file the merge reads, a name no other project uses, so it's refused everywhere.
const namesSession = (text, session) => new RegExp(`capture-["']?\\$\\{?CLAUDE_CODE_SESSION_ID\\b${/^[A-Za-z0-9-]+$/.test(session ?? '') ? `|capture-${session}` : ''}`, 'i').test(text);

// The real path with the case the disk uses, through the nearest folder that exists.
const real = (file) => {
  try { return fs.realpathSync.native(file); } catch {}
  const parent = path.dirname(file);
  return parent === file ? file : path.join(real(parent), path.basename(file));
};

const literal = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const names = (dir, command) => new RegExp(`(?:${[...new Set([dir, real(dir)])].map(literal).join('|')})(?=[/\\s'";&|)]|$)`, 'i').test(command);

const inside = (dir, file) => {
  const relative = path.relative(dir, file);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

// A reports/ kosh has run in holds a page capture; one that doesn't is some other project's.
const ranIn = (reports) => ['data', 'data/archive'].some((dir) => {
  try { return fs.readdirSync(path.join(reports, dir)).some((name) => CAPTURE_NAME.test(name)); } catch { return false; }
});

// The folder whose reports/ a path sits in, or the path itself. Never a parent beyond that: one run from the home folder would cover every project below it.
const ownerOf = (file) => {
  const parts = file.split(path.sep);
  const at = parts.lastIndexOf('reports');
  return at > 0 ? parts.slice(0, at).join(path.sep) || path.sep : file;
};

// Absolute paths the command names: quoted, or bare with backslash-escaped spaces.
const namedPaths = (command) => [...command.matchAll(/(?<=^|[\s=(])(?:"(\/[^"]*)"|'(\/[^']*)'|(\/(?:\\.|[^\s'";&|)\\])*))/g)]
  .map((match) => match[1] ?? match[2] ?? match[3].replace(/\\(.)/g, '$1'));

const reaches = (cwd, command) => {
  // Only a root someone set: reportsDir's look up from the cwd would let one run in the home folder cover every project below it.
  const project = (process.env.KOSH_REPORTS_DIR || process.env.CLAUDE_PROJECT_DIR) && reportsDir(process.env, cwd);
  if (project && ranIn(project) && (inside(real(path.dirname(project)), cwd) || names(path.dirname(project), command))) return true;
  return [cwd, ...namedPaths(command).map(real)].some((file) => ranIn(path.join(ownerOf(file), 'reports')));
};

const blocked = (call) => {
  const args = call?.tool_input ?? {};
  if (['Write', 'Edit', 'MultiEdit'].includes(call?.tool_name)) return typeof args.file_path === 'string' && (IN_REPORTS.test(args.file_path) || namesSession(args.file_path, call.session_id));
  if (call?.tool_name !== 'Bash' || typeof args.command !== 'string') return false;
  if (IN_REPORTS.test(args.command) || namesSession(args.command, call.session_id)) return true;
  return IN_KOSH.some((pattern) => pattern.test(args.command)) && reaches(real(call.cwd || process.cwd()), args.command);
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
