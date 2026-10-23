// Usage: node check-links.js '<url>'…   each off-site link's status and final origin, never its page or path
const POOL = 6;
const TIMEOUT = 15000;

const check = async (url, timeout = TIMEOUT) => {
  let target;
  try { target = new URL(url); } catch { return `invalid ${url}`; }
  if (!/^https?:$/.test(target.protocol)) return `skipped ${url} (not http or https)`;
  if (target.username || target.password) return `skipped ${url} (has a user name or password)`;
  try {
    const res = await fetch(target, { redirect: 'follow', signal: AbortSignal.timeout(timeout), headers: { 'user-agent': 'Mozilla/5.0 (compatible; kosh-link-check)' } });
    await res.body?.cancel().catch(() => {});
    // Only the origin: a path the other site chose could carry text meant for the model.
    const final = new URL(res.url);
    const moved = final.origin === target.origin ? '' : ` -> ${final.origin}`;
    return `${res.status} ${url}${moved}${final.pathname === target.pathname ? '' : ' (path changed)'}`;
  } catch (error) {
    return `error ${url} ${error.cause?.code ?? error.cause?.message ?? error.name}`;
  }
};

module.exports = { check };

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
      lines[i] = await check(urls[i]);
      // In order, but as soon as each line and those before it are ready, so a Bash timeout still leaves the finished ones.
      while (lines[printed] !== undefined) console.log(lines[printed++]);
    }
  };
  Promise.all(Array.from({ length: Math.min(POOL, urls.length) }, worker));
}
