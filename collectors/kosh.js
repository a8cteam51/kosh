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

  // An image's real pixels, on any host: an image isn't held to the site like a fetch, and only its size comes back, never its bytes.
  const imageSize = (url) => new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ error: 'timed out' }), 10000);
    const done = (result) => { clearTimeout(timer); resolve(result); };
    try {
      const image = new Image();
      image.onload = () => done({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => done({ error: 'not loaded as an image' });
      image.src = new URL(url, location.href).href;
    } catch (error) {
      done({ error: String(error) });
    }
  });

  // functional-design's image check: each image's picked pixels against what its slot needs at this device pixel ratio.
  const images = () => {
    const dpr = window.devicePixelRatio || 1;
    const results = [];

    // Density (`2x`) descriptors are dropped — they don't give absolute pixel counts.
    const parseSrcset = (srcset) => {
      if (!srcset) return [];
      return srcset.split(',')
        .map(s => s.trim())
        .map(s => {
          const m = s.match(/^(\S+)\s+(\d+)w$/);
          return m ? { url: m[1], width: parseInt(m[2], 10) } : null;
        })
        .filter(Boolean)
        .sort((a, b) => a.width - b.width);
    };

    document.querySelectorAll('img').forEach(img => {
      const rect = img.getBoundingClientRect();
      const cs = getComputedStyle(img);
      // The image is drawn inside the padding and border, which a transform scales with it, so the content box's share of the on-screen box is what needs pixels.
      const inset = (...sides) => sides.reduce((sum, side) => sum + (parseFloat(cs[side]) || 0), 0);
      const content = (onScreen, laidOut, ...sides) => (laidOut ? onScreen * (1 - inset(...sides) / laidOut) : onScreen - inset(...sides));
      const renderedW = Math.max(0, Math.round(content(rect.width, img.offsetWidth, 'paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth')));
      const renderedH = Math.max(0, Math.round(content(rect.height, img.offsetHeight, 'paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth')));
      // display:none leaves no layout box, so a hidden image stays out.
      if (!img.getClientRects().length) return;

      const srcUrl = img.currentSrc || img.src || '';
      const about = { src: srcUrl.split('/').pop().substring(0, 60), renderedCSS: `${renderedW}x${renderedH}px`, alt: (img.alt || '(no alt)').substring(0, 40) };
      // A finished image with a source but no pixels failed, whatever its size: Chrome lays out a broken alt="" image at 0x0.
      if (img.currentSrc && img.complete && img.naturalWidth === 0) {
        results.push({ ...about, status: 'broken', reason: 'the image finished loading with no pixels: its URL is broken or is not an image' });
        return;
      }
      if (renderedW <= 0 || renderedH <= 0) return;
      // No currentSrc means nothing to load yet, like a lazy-load placeholder.
      if (!img.currentSrc || !img.complete) {
        results.push({ ...about, status: 'unknown', reason: img.currentSrc ? 'image not yet loaded — re-run after scroll/wait' : 'no image source yet (a lazy-load placeholder?) — re-run after scroll/wait' });
        return;
      }

      // SVGs scale losslessly.
      if (/\.svgz?$/i.test(srcUrl.split(/[?#]/)[0]) || /^data:image\/svg/i.test(srcUrl)) return;

      const objectFit = cs.objectFit;
      const srcset = img.getAttribute('srcset');
      const sizesAttr = img.getAttribute('sizes');
      const candidates = parseSrcset(srcset);
      const largestCandidate = candidates.length ? candidates[candidates.length - 1].width : null;
      const pictureSourceCount = img.parentElement?.tagName === 'PICTURE'
        ? img.parentElement.querySelectorAll('source[srcset]').length
        : 0;

      // naturalWidth/Height are density-corrected (a 2x pick reports half its real pixels), but a fresh Image reads an already-loaded URL synchronously at density 1.
      const picksFromSrcset = Boolean(srcset) || pictureSourceCount > 0;
      const probe = new Image();
      if (picksFromSrcset) {
        probe.crossOrigin = img.crossOrigin; // The loaded-image cache is keyed by CORS mode, so a mismatch misses.
        probe.src = srcUrl;
      }
      const measured = probe.naturalWidth > 0;
      const naturalW = measured ? probe.naturalWidth : img.naturalWidth;
      const naturalH = measured ? probe.naturalHeight : img.naturalHeight;
      const unmeasuredNote = picksFromSrcset && !measured
        ? ' The real pixel size of this srcset pick could not be read, so `naturalSize` is the density-corrected figure the DOM reports and may under-count — check the real dimensions of the picked src with `__kosh.imageSize` before reporting.'
        : '';
      // contain and scale-down letterbox the image inside its box, and none draws it at its own size, so it needs only the size it's drawn at; scale-down never enlarges it.
      const fit = { contain: Infinity, 'scale-down': 1 }[objectFit];
      const drawn = objectFit === 'none' ? 1 : fit ? Math.min(renderedW / img.naturalWidth, renderedH / img.naturalHeight, fit) : null;
      const neededW = (drawn ? img.naturalWidth * drawn : renderedW) * dpr;
      const neededH = (drawn ? img.naturalHeight * drawn : renderedH) * dpr;
      const ratio = Math.min(naturalW / neededW, naturalH / neededH);
      if (ratio >= 1.0) return;

      const sizesIsAuto = /\bauto\b/i.test(sizesAttr || '');

      // A CDN that delivers the size the URL asks for is capped by the request; one that returns less is capped by the upload.
      const params = new URLSearchParams(srcUrl.split('#')[0].split('?')[1] || '');
      const resizeKey = ['resize', 'fit', 'w'].find(k => params.has(k));
      const resizeValue = resizeKey ? params.get(resizeKey) : '';
      const [reqW, reqH] = resizeValue.split(',').map(n => parseInt(n, 10));
      // Photon floors one axis and derives the other from it, so the shortfall is at most the aspect ratio.
      const tolerance = Math.ceil(Math.max(naturalW / naturalH, naturalH / naturalW));
      const within = (req, got) => req - got >= 0 && req - got <= tolerance;
      const deliveredInFull = within(reqW, naturalW) || within(reqH, naturalH);
      const requestCaps = deliveredInFull && (reqW < neededW || reqH < neededH);
      const noCandidates = srcset ? 'The srcset has no width (`w`) descriptors, so there is no larger candidate to pick' : 'No srcset present';

      let diagnosis;
      if (!candidates.length && requestCaps) {
        diagnosis = {
          category: 'request',
          explanation: `${noCandidates}, and the picked src asks the image CDN for a derivative capped by \`${resizeKey}=${resizeValue}\` and got back ${naturalW}x${naturalH}px, but the slot needs ${Math.round(neededW)}x${Math.round(neededH)}px at ${dpr}x DPR — the request caps the image before the upload does. Fix the size the template or block requests. Do NOT recommend re-uploading unless the original, measured with \`__kosh.imageSize\` with the resize parameters stripped, is itself smaller than the slot needs.`
        };
      } else if (!candidates.length) {
        diagnosis = {
          category: 'source',
          explanation: `${noCandidates}. The picked src is too small for the slot at this DPR. Investigate the upload (is the original large enough?), the srcset generator (is it producing sized variants?), or the src URL itself (does it point to a small derivative like \`-300x200.jpg\`?).`
        };
      } else if (largestCandidate >= neededW * 0.95) { // 5% slack absorbs browser candidate-selection rounding (e.g. 768w vs. an 800px slot need).
        const sizesNote = sizesIsAuto
          ? `The \`sizes\` attribute uses \`auto\` (which normally picks based on layout width), so the cause may be subtler: lazy-load timing, an aspect-ratio mismatch under \`object-fit: cover\`, or a \`<picture>\`/\`<source>\` selecting badly. Investigate before recommending a sizes change.`
          : `Likely cause: \`sizes\` attribute (${sizesAttr || 'missing'}) under-declares the rendered width (actually ${renderedW}px). Fix: correct \`sizes\` so the browser picks the larger candidate.`;
        diagnosis = {
          category: 'markup',
          explanation: `srcset offers a ${largestCandidate}w candidate (enough for the ${Math.round(neededW)}px slot needs at ${dpr}x DPR), but the browser picked a smaller one. ${sizesNote}`
        };
      } else {
        diagnosis = {
          category: 'source',
          explanation: `Largest srcset candidate is ${largestCandidate}w; slot needs ${Math.round(neededW)}px at ${dpr}x DPR. Investigate the upload (is the original large enough?) or the srcset generator (is it producing the larger sizes it should?).`
        };
      }

      const objectFitNote = objectFit === 'cover'
        ? ' object-fit: cover is in effect — the visible image is cropped to fill the slot, but it is still scaled up to cover it, so the resolution problem stands.'
        : drawn
          ? ` object-fit: ${objectFit} is in effect — the image is measured at the size it is drawn inside the slot, not the slot itself.`
          : '';

      let pictureNote = '';
      if (pictureSourceCount > 0) {
        // <picture> <source srcset> siblings override the img's srcset selection without being read here, so source/markup attribution isn't reliable.
        diagnosis.category = 'unknown';
        pictureNote = ` This \`<img>\` is inside a \`<picture>\` element with ${pictureSourceCount} \`<source srcset>\` sibling(s) that this script doesn't read — inspect those before attributing the cause, since the loaded image may have come from a \`<source>\` rather than the \`<img>\`'s own \`src\`/\`srcset\`.`;
      }

      results.push({
        ...about,
        naturalSize: `${naturalW}x${naturalH}px`,
        neededForCrisp: `${Math.round(neededW)}x${Math.round(neededH)}px (${dpr}x DPR)`,
        resolutionRatio: +ratio.toFixed(2),
        status: ratio < 0.75 ? 'flag' : 'needs visual review',
        diagnosisCategory: diagnosis.category,
        diagnosis: diagnosis.explanation + objectFitNote + pictureNote + unmeasuredNote,
        objectFit,
        largestSrcsetCandidate: largestCandidate ? `${largestCandidate}w` : 'none',
        sizesAttr: sizesAttr || 'missing'
      });
    });

    return results.length
      ? results
      : 'All images are sufficiently sized for their rendered dimensions';
  };

  const MAX_CONTRAST_NODES = 50;
  // axe-core's color-contrast rule; kosh's capture loads axe into the page before a browser_evaluate that calls this.
  const contrast = async () => {
    if (typeof window.axe?.run !== 'function') return 'axe-core is not loaded: call this as `() => __kosh.contrast()` with browser_evaluate, which loads it first.';
    const { violations, incomplete } = await window.axe.run(document, { runOnly: { type: 'rule', values: ['color-contrast'] }, resultTypes: ['violations', 'incomplete'], iframes: false });
    const nodes = (rules) => rules.flatMap((rule) => rule.nodes).slice(0, MAX_CONTRAST_NODES).map((node) => {
      const data = [...node.any, ...node.all, ...node.none].find((check) => check.data)?.data ?? {};
      return {
        selector: node.target.map((part) => [part].flat().join(' >>> ')).join(' '),
        html: node.html.length > 150 ? `${node.html.slice(0, 150)}…` : node.html,
        ratio: data.contrastRatio || null,
        threshold: parseFloat(data.expectedContrastRatio) || null,
        textColor: data.fgColor ?? null,
        background: data.bgColor ?? null,
        fontSize: data.fontSize ?? null,
        fontWeight: data.fontWeight ?? null,
        reason: data.messageKey ?? null
      };
    });
    const count = (rules) => rules.reduce((total, rule) => total + rule.nodes.length, 0);
    return { violations: nodes(violations), incomplete: nodes(incomplete), counts: { violations: count(violations), incomplete: count(incomplete) } };
  };
  // Playwright serializes an unawaited Promise as its own properties, so one left inside a returned object says so instead of reading as `{}`.
  // Its rejection is marked handled, or the page would log it as the site's error; an await still gets it.
  const noted = (name, fn) => (...args) => {
    const promise = fn(...args);
    promise.catch(() => {});
    return Object.assign(promise, { notAwaited: `This is a Promise: inside an async function write \`await __kosh.${name}(…)\`, or call it on its own.` });
  };

  Object.defineProperty(window, '__kosh', { value: Object.freeze({ gate, staticHtml: noted('staticHtml', staticHtml), imageSize: noted('imageSize', imageSize), images, contrast: noted('contrast', contrast) }) });
})();
