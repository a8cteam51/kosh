// ponytail: PreToolUse pattern match that keeps runs from writing page captures; it stops a shortcut, not someone set on getting around it.
const CAPTURE = [
  /capture[^\s]*\.jsonl/i,
  /capture[\w-]*\*/i,
  /[*?][^\s]*\.jsonl/i,
  /\b(?:rm|mv)\b[^|;&]*[\s/'"]reports(?:\/data(?:\/archive)?)?\/?(?=[\s;|&)'"]|$)/i,
];

let input = '';
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  let call;
  try { call = JSON.parse(input); } catch { return; }
  const args = call?.tool_input ?? {};
  const target = call?.tool_name === 'Bash' ? args.command : ['Write', 'Edit', 'MultiEdit'].includes(call?.tool_name) ? args.file_path : null;
  if (typeof target !== 'string' || !CAPTURE.some((pattern) => pattern.test(target))) return;
  process.stderr.write("Blocked: page capture files (reports/data/capture-*.jsonl and archive/*.capture.jsonl) are written only by the browser. Don't create, edit, move or delete them. If a page is missing from the capture, load it in the browser again. To look at one, use the Read tool.\n");
  process.exitCode = 2;
});
