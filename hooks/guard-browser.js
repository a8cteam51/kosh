// PreToolUse guard for kosh's browser tools: the model reads text from the pages it tests, so a page can ask it to reach past the page.
const path = require('path');

const SCREENSHOTS = 'kosh-reports/screenshots/';
const RUN_CODE = "Blocked: kosh doesn't use browser_run_code_unsafe, which runs code in Playwright's own Node process with full access to this computer. Do it with browser_evaluate, which runs in the page, or another browser_ tool.\n";
const PATHS = "Blocked: kosh's browser tools don't hand files from this computer to a page, and kosh's tests never upload or drop files.\n";
const FILENAME = "Blocked: kosh's browser tools don't save files, since Playwright writes them into the project without asking and they'd hold text from the page. Leave out filename to get the result back as text.\n";
const SCREENSHOT = `Blocked: a screenshot's filename must be under ${SCREENSHOTS} (for example ${SCREENSHOTS}homepage-desktop.png), so it can't overwrite another file in the project.\n`;

const refusal = (call) => {
  const name = String(call?.tool_name ?? '');
  const args = call?.tool_input ?? {};
  // Part of the name, so browser_run_code and browser_run_code_unsafe are both caught.
  if (name.includes('browser_run_code')) return RUN_CODE;
  if (args.paths?.length) return PATHS;
  if (!args.filename) return null;
  if (!name.endsWith('__browser_take_screenshot')) return FILENAME;
  return path.posix.normalize(String(args.filename)).startsWith(SCREENSHOTS) ? null : SCREENSHOT;
};

let input = '';
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  let call;
  try { call = JSON.parse(input); } catch { return; }
  const reason = refusal(call);
  if (!reason) return;
  process.stderr.write(reason);
  process.exitCode = 2;
});
