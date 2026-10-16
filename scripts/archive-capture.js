// Usage: node archive-capture.js <archived-report.json> <destination.capture.jsonl>
const fs = require('fs');
const { archiveText, host, readEntries, reportEntries, takenFile, visitCount } = require('./page-capture.js');

const [reportPath, destination] = process.argv.slice(2);
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const reportUrl = report.url;
const taken = takenFile();

if (!fs.existsSync(taken)) process.exit(0);

const entries = readEntries(taken);
const kept = reportEntries(entries, reportUrl);
const visits = visitCount(kept);

try {
  // Overwritten, not appended: the report's captureSha256 is over exactly this text.
  if (visits) fs.writeFileSync(destination, archiveText(kept));
} catch (error) {
  console.warn(`Warning: could not write ${destination} (${error.code ?? error.message}); this run's capture is still at ${taken}`);
  process.exit(1);
}
fs.unlinkSync(taken);

const site = host(reportUrl);
if (!site) console.warn(`Warning: the report has no usable url, so this session's page capture (${entries.length} entries) was dropped`);
else if (!visits) console.log(`No page capture for ${site} (${entries.length} entries for other hosts dropped)`);
else console.log(`Page capture archived: ${destination} (${visits} visits on ${site}, ${entries.length - kept.length} entries for other hosts or an earlier browser dropped)`);
