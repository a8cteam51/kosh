// Usage: node archive-capture.js <archived-report.json> <destination.capture.jsonl>
const fs = require('fs');
const path = require('path');
const { captureFile } = require('../collectors/capture.js');

const [reportPath, destination] = process.argv.slice(2);
const host = (url) => {
  try { return new URL(url).host.replace(/^www\./, ''); } catch { return null; }
};
const reportHost = host(JSON.parse(fs.readFileSync(reportPath, 'utf8')).url);
const source = captureFile();

if (!fs.existsSync(source)) {
  let others = [];
  try { others = fs.readdirSync(path.dirname(source)).filter((name) => /^capture.*\.jsonl$/.test(name)); } catch {}
  console.warn(`Warning: no page capture at ${source}, so none was archived${others.length ? ` (left alone: ${others.join(', ')})` : ''}. A browser started before kosh added the capture records none: restart Claude Code.`);
  process.exit(0);
}

// The browser opens the file by name on every write, so anything it records from here on starts the next run's capture.
const taken = `${source}.${process.pid}`;
fs.renameSync(source, taken);

const entries = fs.readFileSync(taken, 'utf8').split('\n').flatMap((line) => {
  try { return [JSON.parse(line)]; } catch { return []; }
});
// A page can redirect off the report's host mid-run, and it's still a page the run asked for.
const onReportHost = (visit) => [visit.url, ...(visit.redirectedFrom ?? [])].some((url) => host(url) === reportHost);
const visits = new Set(entries.filter((entry) => entry.type === 'visit' && reportHost && onReportHost(entry)).map((entry) => entry.visit));
const kept = entries.filter((entry) => (entry.visit ? visits.has(entry.visit) : entry.type === 'truncated'));

try {
  if (visits.size) fs.appendFileSync(destination, kept.map((entry) => JSON.stringify(entry)).join('\n') + '\n');
} catch (error) {
  console.warn(`Warning: could not write ${destination} (${error.code ?? error.message}); this run's capture is still at ${taken}`);
  process.exit(1);
}
fs.unlinkSync(taken);

if (!reportHost) console.warn(`Warning: the report has no usable url, so this session's page capture (${entries.length} entries) was dropped`);
else if (!visits.size) console.log(`No page capture for ${reportHost} (${entries.length} entries for other hosts dropped)`);
else console.log(`Page capture archived: ${destination} (${visits.size} visits on ${reportHost}, ${entries.length - kept.length} entries for other hosts dropped)`);
