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

  Object.defineProperty(window, '__kosh', { value: Object.freeze({ gate }) });
})();
