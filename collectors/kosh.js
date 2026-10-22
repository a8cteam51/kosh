// Playwright MCP's --init-script runs this in every page before the page's own scripts.
(() => {
  const host = (url) => new URL(url).host.replace(/^www\./, '');

  const gate = (requestedUrl) => {
    const bodyClass = document.body?.className ?? '';
    let found = null;
    if (bodyClass.includes('wpcom-coming-soon-body')) found = 'coming-soon';
    else if (bodyClass.includes('login-password-protected') || location.href.includes('password-protected=login')) found = 'password-protected';
    else if (bodyClass.includes('private-login') || document.title === 'Private Site') found = 'private';
    // A gate can live on a login host, so the gate is the finding, not the redirect.
    const moved = host(location.href) !== host(requestedUrl);
    return { gate: found, redirectedTo: moved && !found ? location.href : null };
  };

  // What a crawler that doesn't run JavaScript reads at `url`: its HTML fetched and parsed, which never runs it, so <noscript> counts and script-built content doesn't.
  // ponytail: parsed HTML has no layout, so markup CSS hides (a closed mega-menu) still counts; a JS-off browser context would leave it out.
  const staticHtml = async (url) => {
    try {
      // fetch is called before any await, while the model's evaluate is still on the stack, so the capture can tell the request is the model's.
      const response = await fetch(new URL(url));
      if (!response.ok) return { url: response.url, status: response.status, error: `HTTP ${response.status}` };
      // A sitemap, robots.txt or llms.txt means the browser wasn't on the homepage; an error says so where a parse would score it.
      const type = response.headers.get('content-type') ?? '';
      if (!/html/i.test(type)) return { url: response.url, status: response.status, error: `not HTML: ${type || 'no content type'}` };
      const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
      doc.querySelectorAll('script, style, template').forEach((element) => element.remove());
      const text = (element) => element?.textContent.replace(/\s+/g, ' ').trim() ?? null;
      const h1 = doc.querySelector('h1');
      return { url: response.url, status: response.status, h1Present: Boolean(h1), h1Text: text(h1), bodyTextLength: text(doc.body).length };
    } catch (error) {
      return { error: String(error) };
    }
  };

  Object.defineProperty(window, '__kosh', { value: Object.freeze({ gate, staticHtml }) });
})();
