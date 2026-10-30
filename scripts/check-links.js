// Usage: node check-links.js '<url>'…   each off-site link's status and final origin, never its page or path
const fs = require('fs');
const path = require('path');
const { captureFile, makeReportsDir, redactUrl } = require('../collectors/capture.js');

const POOL = 6;
const TIMEOUT = 15000;

// Only the scheme and the end of the host: a long host name, like a path, is text the other site chose and could carry an instruction.
const shortOrigin = (url) => `${url.protocol}//${url.hostname.length > 40 ? `…${url.hostname.slice(-40)}` : url.hostname}${url.port ? `:${url.port}` : ''}`;
const bare = (path) => path.replace(/\/+$/, '');
const where = (target, final) => `${final.origin === target.origin ? '' : ` -> ${shortOrigin(final)}`}${bare(final.pathname) === bare(target.pathname) ? '' : ' (path changed)'}`;

// One link's result, as the report keeps it: the status and where it ended up, never that page's path or content.
const inspect = async (url, timeout = TIMEOUT) => {
  const result = { url, status: null, redirectedTo: null, pathChanged: false };
  let target;
  try { target = new URL(url); } catch { return { ...result, outcome: 'invalid' }; }
  if (!/^https?:$/.test(target.protocol)) return { ...result, outcome: 'skipped', reason: 'not http or https' };
  if (target.username || target.password) return { ...result, outcome: 'skipped', reason: 'has a user name or password' };
  try {
    const res = await fetch(target, { redirect: 'follow', signal: AbortSignal.timeout(timeout), headers: { 'user-agent': 'Mozilla/5.0 (compatible; kosh-link-check)' } });
    await res.body?.cancel().catch(() => {});
    const final = new URL(res.url);
    return { ...result, outcome: 'checked', status: res.status, redirectedTo: final.origin === target.origin ? null : shortOrigin(final), pathChanged: bare(final.pathname) !== bare(target.pathname), where: where(target, final) };
  } catch (error) {
    return { ...result, outcome: 'error', reason: String(error.cause?.code ?? error.cause?.message ?? error.name) };
  }
};

const line = ({ outcome, url, status, reason, where: to }) => (outcome === 'checked' ? `${status} ${url}${to}` : outcome === 'invalid' ? `invalid ${url}` : outcome === 'skipped' ? `skipped ${url} (${reason})` : `error ${url} ${reason}`);
const check = async (url, timeout) => line(await inspect(url, timeout));

// Beside the session's page capture, so the merge can put the results in the report without the model copying them.
const recordFile = () => {
  const capture = captureFile();
  const session = process.env.CLAUDE_CODE_SESSION_ID;
  return path.join(path.dirname(capture), /^[A-Za-z0-9-]+$/.test(session ?? '') ? `links-${session}.jsonl` : 'links.jsonl');
};
// The link is checked as given, but recorded like every URL the capture keeps, without credential query pairs.
const record = (result) => {
  const kept = { ...result, url: redactUrl(result.url) || result.url };
  delete kept.where;
  try {
    const file = recordFile();
    makeReportsDir(path.dirname(path.dirname(file)));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), ...kept })}\n`);
  } catch {}
};

module.exports = { check, inspect, where, recordFile };

if (require.main === module) {
  const urls = [...new Set(process.argv.slice(2))];
  if (!urls.length) {
    console.error("Usage: node check-links.js '<url>'…");
    process.exit(1);
  }
  const lines = [];
  let next = 0;
  let printed = 0;
  const worker = async () => {
    while (next < urls.length) {
      const i = next++;
      const result = await inspect(urls[i]);
      record(result);
      lines[i] = line(result);
      // In order, but as soon as each line and those before it are ready, so a Bash timeout still leaves the finished ones.
      while (lines[printed] !== undefined) console.log(lines[printed++]);
    }
  };
  Promise.all(Array.from({ length: Math.min(POOL, urls.length) }, worker));
}
