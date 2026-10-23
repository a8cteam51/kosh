// Usage: node check-links.js '<url>'…   each off-site link's status and final origin, never its page or path
const POOL = 6;
const TIMEOUT = 15000;

// Only the scheme and the end of the host: a long host name, like a path, is text the other site chose and could carry an instruction.
const shortOrigin = (url) => `${url.protocol}//${url.hostname.length > 40 ? `…${url.hostname.slice(-40)}` : url.hostname}${url.port ? `:${url.port}` : ''}`;
const bare = (path) => path.replace(/\/+$/, '');
const where = (target, final) => `${final.origin === target.origin ? '' : ` -> ${shortOrigin(final)}`}${bare(final.pathname) === bare(target.pathname) ? '' : ' (path changed)'}`;

const check = async (url, timeout = TIMEOUT) => {
  let target;
  try { target = new URL(url); } catch { return `invalid ${url}`; }
  if (!/^https?:$/.test(target.protocol)) return `skipped ${url} (not http or https)`;
  if (target.username || target.password) return `skipped ${url} (has a user name or password)`;
  try {
    const res = await fetch(target, { redirect: 'follow', signal: AbortSignal.timeout(timeout), headers: { 'user-agent': 'Mozilla/5.0 (compatible; kosh-link-check)' } });
    await res.body?.cancel().catch(() => {});
    return `${res.status} ${url}${where(target, new URL(res.url))}`;
  } catch (error) {
    return `error ${url} ${error.cause?.code ?? error.cause?.message ?? error.name}`;
  }
};

module.exports = { check, where };

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
