// Guard for kosh's browser tools: the model reads text from the pages it tests, so a page can ask it to reach past the page.
const path = require('path');

const SCREENSHOTS = 'kosh-reports/screenshots/';
const RUN_CODE = "Blocked: kosh doesn't use browser_run_code_unsafe, which runs code in Playwright's own Node process with full access to this computer. Do it with browser_evaluate, which runs in the page, or another browser_ tool.\n";
const PATHS = "Blocked: kosh's browser tools don't hand files from this computer to a page, and kosh's tests never upload or drop files.\n";
const FILENAME = "Blocked: kosh's browser tools don't save files, since Playwright writes them into the project without asking and they'd hold text from the page. Leave out filename to get the result back as text.\n";
const SCREENSHOT = `Blocked: a screenshot's filename must be under ${SCREENSHOTS} (for example ${SCREENSHOTS}homepage-desktop.png), so it can't overwrite another file in the project.\n`;
const SERVER = 'plugin:kosh:playwright';
const APPROVE = JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } });

// Read in every install, not just a clone, so a tool a Playwright bump adds still asks.
const allowlist = () => {
  try { return require(path.join(__dirname, '../.claude/settings.json')).permissions?.allow ?? []; } catch { return []; }
};

// mcp_server is Claude Code's record of where the server came from; the matcher only sees the tool name.
const approved = (call) => process.env.CLAUDE_PLUGIN_OPTION_APPROVE_BROWSER_TOOLS === 'true' && call?.mcp_server?.source === 'plugin' && call.mcp_server.name === SERVER && allowlist().includes(call.tool_name);

const refusal = (call) => {
  const name = String(call?.tool_name ?? '');
  const args = call?.tool_input ?? {};
  // Part of the name, so browser_run_code and browser_run_code_unsafe are both caught.
  if (name.includes('browser_run_code')) return RUN_CODE;
  if (args.paths?.length) return PATHS;
  if (!args.filename) return null;
  if (!name.endsWith('__browser_take_screenshot')) return FILENAME;
  // Backslashes as slashes: on Windows Playwright treats them as separators, so ..\ climbs out too.
  return path.posix.normalize(String(args.filename).replace(/\\/g, '/')).startsWith(SCREENSHOTS) ? null : SCREENSHOT;
};

let input = '';
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  let call;
  try { call = JSON.parse(input); } catch { return; }
  // PermissionRequest runs only for a call Claude Code would otherwise ask about, or deny where nobody can be asked.
  if (call?.hook_event_name === 'PermissionRequest') {
    if (approved(call) && !refusal(call)) process.stdout.write(APPROVE);
    return;
  }
  const reason = refusal(call);
  if (!reason) return;
  process.stderr.write(reason);
  process.exitCode = 2;
});
