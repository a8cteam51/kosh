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
        sizesAttr: sizesAttr || 'missing',
        ...(picksFromSrcset && !measured && { sizeUnconfirmed: true })
      });
    });

    return results.length
      ? results
      : 'All images are sufficiently sized for their rendered dimensions';
  };

  const shown = (element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility === 'visible';
  const clip = (text, length) => (text.length > length ? `${text.slice(0, length)}…` : text);
  const label = (element) => {
    if (element.id) return `#${element.id}`;
    const classes = [...element.classList].slice(0, 2).map((name) => `.${name}`).join('');
    return `${element.tagName.toLowerCase()}${classes}`;
  };

  const splitOuterCommas = (text) => {
    const parts = [''];
    let depth = 0;
    for (const character of text) {
      if (character === '(') depth += 1;
      if (character === ')') depth -= 1;
      if (character === ',' && !depth) parts.push('');
      else parts[parts.length - 1] += character;
    }
    return parts;
  };

  // Each layer of a background-image as a list of axe's Colors, top layer first, or null if one isn't a gradient: an image can't be worked out from CSS alone.
  const gradientLayers = (image, opacity) => {
    const { Color } = window.axe.commons.color;
    const layers = [];
    for (const layer of splitOuterCommas(image)) {
      const gradient = /^\s*(?:repeating-)?(?:linear|radial|conic)-gradient\((.*)\)\s*$/.exec(layer);
      if (!gradient) return null;
      const stops = splitOuterCommas(gradient[1]).flatMap((part) => {
        const written = /^\s*([a-z-]+\([^)]*\)|#[0-9a-f]+|[a-z]+)/i.exec(part)?.[1];
        if (!written) return [];
        try {
          const color = new Color();
          color.parseString(written);
          color.alpha *= opacity;
          return [color];
        } catch {
          return [];
        }
      });
      layers.push(stops);
    }
    return layers;
  };

  const MAX_GRADIENT_LAYERS = 3;
  // Each background `element`'s text could sit on, sampled along any gradient, from the same stack axe resolves. Null when something in it can't be worked out.
  const backgroundsBehind = (element) => {
    const { Color, flattenColors, getBackgroundStack, getOwnBackgroundColor } = window.axe.commons.color;
    const stack = getBackgroundStack(element);
    if (!stack) return null;
    const opaque = (color) => color.alpha === 1;
    const layers = [];
    walk: for (const item of stack) {
      const style = getComputedStyle(item);
      if (style.backgroundImage !== 'none') {
        const gradients = gradientLayers(style.backgroundImage, Number(style.opacity));
        if (!gradients) return null;
        for (const stops of gradients) {
          layers.push(stops);
          if (stops.every(opaque)) break walk;
        }
      }
      const color = getOwnBackgroundColor(style);
      if (color.alpha > 0) layers.push(color);
      if (opaque(color)) break;
    }
    // Every combination of stops is sampled, so a pile of layers would hang the page.
    if (layers.filter(Array.isArray).length > MAX_GRADIENT_LAYERS) return null;
    // Text's luminance gap can peak or vanish between two stops, so a segment's ends aren't enough.
    const SAMPLES = 10;
    const mix = (from, to, t) => {
      const alpha = from.alpha + (to.alpha - from.alpha) * t;
      const channel = (name) => (alpha ? (from[name] * from.alpha * (1 - t) + to[name] * to.alpha * t) / alpha : 0);
      return new Color(channel('red'), channel('green'), channel('blue'), alpha);
    };
    return layers.reduceRight((below, layer) => below.flatMap((back) => {
      if (!Array.isArray(layer)) return [flattenColors(layer, back)];
      return layer.slice(1).flatMap((stop, i) => Array.from({ length: SAMPLES + 1 }, (_, n) => flattenColors(mix(layer[i], stop, n / SAMPLES), back)));
    }), [new Color(255, 255, 255, 1)]);
  };

  const ratioRange = (foreground, element) => {
    const { flattenColors, getContrast } = window.axe.commons.color;
    const backgrounds = backgroundsBehind(element);
    if (!backgrounds?.length) return null;
    const ratios = backgrounds.map((back) => getContrast(back, flattenColors(foreground, back)));
    return { min: +Math.min(...ratios).toFixed(2), max: +Math.max(...ratios).toFixed(2), flat: backgrounds.length === 1 ? backgrounds[0].toHexString() : null };
  };

  // axe gives no text color for text it couldn't measure, so it's read here, as the browser paints it. Null for text with no paint of its own, like a background-clip gradient.
  const gradientRange = (node, data) => {
    if (data.messageKey !== 'bgGradient' || !node.element) return null;
    try {
      const { Color } = window.axe.commons.color;
      const foreground = new Color();
      foreground.parseString(getComputedStyle(node.element).getPropertyValue('-webkit-text-fill-color'));
      if (!foreground.alpha) return null;
      const range = ratioRange(foreground, node.element);
      return range && { textColor: foreground.toHexString(), ratioRange: { min: range.min, max: range.max } };
    } catch {
      return null;
    }
  };

  // axe doesn't check ::placeholder. A disabled field is exempt from 1.4.3, and a filled one isn't showing its placeholder.
  const placeholders = () => {
    const found = { violations: [], incomplete: [] };
    const { Color } = window.axe.commons.color;
    for (const field of document.querySelectorAll('input[placeholder], textarea[placeholder]')) {
      if (field.disabled || field.value || !field.placeholder.trim() || !shown(field)) continue;
      const style = getComputedStyle(field, '::placeholder');
      const foreground = new Color();
      foreground.parseString(style.color);
      foreground.alpha *= Number(style.opacity);
      const px = parseFloat(style.fontSize);
      const bold = parseInt(style.fontWeight, 10) >= 700;
      const pt = px * 0.75;
      const threshold = pt >= 18 || (bold && pt >= 14) ? 3 : 4.5;
      const range = ratioRange(foreground, field);
      if (range && range.min >= threshold) continue;
      const entry = {
        selector: label(field),
        html: clip(field.outerHTML, 150),
        ratio: range?.flat ? range.min : null,
        threshold,
        textColor: foreground.toHexString(),
        background: range?.flat ?? null,
        fontSize: `${pt.toFixed(1)}pt (${px}px)`,
        fontWeight: bold ? 'bold' : 'normal',
        reason: 'placeholder',
        ...(range && !range.flat && { ratioRange: { min: range.min, max: range.max } })
      };
      found[range && range.max < threshold ? 'violations' : 'incomplete'].push(entry);
    }
    return found;
  };

  const MAX_CONTRAST_NODES = 50;
  // axe-core's color-contrast rule; kosh's capture loads axe into the page before a browser_evaluate that calls this.
  const contrast = async () => {
    if (typeof window.axe?.run !== 'function') return 'axe-core is not loaded: call this as `() => __kosh.contrast()` with browser_evaluate, which loads it first.';
    const { violations, incomplete } = await window.axe.run(document, { runOnly: { type: 'rule', values: ['color-contrast'] }, resultTypes: ['violations', 'incomplete'], iframes: false, elementRef: true });
    const all = (rules) => rules.flatMap((rule) => rule.nodes);
    const nodes = (rules, more, measure) => [...more, ...all(rules).slice(0, MAX_CONTRAST_NODES).map((node) => {
      const data = [...node.any, ...node.all, ...node.none].find((check) => check.data)?.data ?? {};
      const range = measure ? gradientRange(node, data) : null;
      return {
        selector: node.target.map((part) => [part].flat().join(' >>> ')).join(' '),
        html: clip(node.html, 150),
        ratio: data.contrastRatio || null,
        threshold: parseFloat(data.expectedContrastRatio) || null,
        textColor: data.fgColor ?? null,
        background: data.bgColor ?? null,
        fontSize: data.fontSize ?? null,
        fontWeight: data.fontWeight ?? null,
        reason: data.messageKey ?? null,
        ...range
      };
    })].slice(0, MAX_CONTRAST_NODES);
    const build = (extra, measure) => ({
      violations: nodes(violations, extra.violations, measure),
      incomplete: nodes(incomplete, extra.incomplete, measure),
      counts: { violations: all(violations).length + extra.violations.length, incomplete: all(incomplete).length + extra.incomplete.length }
    });
    // axe.run tears its tree down when it finishes, and its stack helpers need one. Axe's own results stand if they can't run.
    try {
      window.axe.setup(document);
    } catch {
      return build({ violations: [], incomplete: [] }, false);
    }
    try {
      return build(placeholders(), true);
    } catch {
      return build({ violations: [], incomplete: [] }, false);
    } finally {
      window.axe.teardown();
    }
  };

  const MAX_HEADINGS = 40;
  const headings = () => [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].filter(shown).slice(0, MAX_HEADINGS).map((heading) => {
    const { fontSize, fontWeight } = getComputedStyle(heading);
    return `${heading.tagName.toLowerCase()} ${Math.round(parseFloat(fontSize) * 10) / 10}px/${fontWeight} ${clip(heading.textContent.replace(/\s+/g, ' ').trim(), 80)}`;
  });

  const MAX_LAYOUT_ROWS = 20;
  // ponytail: only an element holding its own text counts, so text cut off by a wrapper is left to the screenshot; walking every wrapper flags each carousel.
  const clippedText = () => {
    const rows = [];
    for (const element of document.body.querySelectorAll('*')) {
      if (rows.length === MAX_LAYOUT_ROWS) break;
      if (![...element.childNodes].some((child) => child.nodeType === 3 && child.textContent.trim())) continue;
      const { overflowX, overflowY } = getComputedStyle(element);
      const hides = (value) => value === 'hidden' || value === 'clip';
      const { clientWidth, clientHeight, scrollWidth, scrollHeight } = element;
      // A 1px box is a screen-reader-only label, hidden on purpose.
      if (clientWidth <= 1 || clientHeight <= 1) continue;
      const cut = (hides(overflowX) && scrollWidth > clientWidth + 1) || (hides(overflowY) && scrollHeight > clientHeight + 1);
      if (cut && shown(element)) rows.push({ selector: label(element), text: clip(element.textContent.replace(/\s+/g, ' ').trim(), 80), box: `${clientWidth}x${clientHeight}`, content: `${scrollWidth}x${scrollHeight}` });
    }
    return rows;
  };

  const heldBack = (element) => {
    for (let item = element; item && item !== document.body; item = item.parentElement) {
      const { position, overflowX } = getComputedStyle(item);
      if (position === 'fixed' || (item !== element && overflowX !== 'visible')) return true;
    }
    return false;
  };
  const overflow = () => {
    const width = document.documentElement.clientWidth;
    const past = new Set();
    const elements = [];
    for (const element of document.body.querySelectorAll('*')) {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height || (rect.right <= width + 1 && rect.left >= -1)) continue;
      if (!shown(element) || heldBack(element)) continue;
      past.add(element);
      // The outermost one is the cause; what's inside it just moved with it.
      if (!past.has(element.parentElement) && elements.length < MAX_LAYOUT_ROWS) elements.push({ selector: label(element), left: Math.round(rect.left), right: Math.round(rect.right) });
    }
    return { viewportWidth: width, pageWidth: document.documentElement.scrollWidth, elements };
  };

  // Elements with the same measurement read as one: the color choice is the finding, not each element.
  const grouped = (nodes) => {
    const groups = new Map();
    for (const { fontSize, fontWeight, ...node } of nodes) {
      const key = JSON.stringify([node.ratio, node.threshold, node.textColor, node.background, node.reason, node.ratioRange]);
      if (groups.has(key)) groups.get(key).count += 1;
      else groups.set(key, { ...node, html: clip(node.html, 80), count: 1 });
    }
    return [...groups.values()];
  };

  const pause = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
  const MAX_SCROLL_STEPS = 30;
  const IMAGE_WAIT_MS = 2000;
  // Scrolls first, since lazy images and text are what the rest measures, and ends back at the top for the next screenshot.
  const page = async () => {
    const root = document.documentElement;
    for (let step = 0, y = 0; step < MAX_SCROLL_STEPS && y < root.scrollHeight; step += 1) {
      window.scrollTo({ top: y, behavior: 'instant' });
      await pause(100);
      y += Math.max(window.innerHeight * 0.8, root.scrollHeight / MAX_SCROLL_STEPS);
    }
    const waited = Date.now() + IMAGE_WAIT_MS;
    while (Date.now() < waited && [...document.images].some((image) => image.currentSrc && !image.complete)) await pause(100);
    window.scrollTo({ top: 0, behavior: 'instant' });

    const pictures = images();
    let measured;
    try {
      measured = await contrast();
    } catch (error) {
      measured = { error: String(error) };
    }
    return {
      url: location.href,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      // Long diagnosis text is what models trimmed by hand; the category decides what to say, and `__kosh.images()` still has the words.
      images: Array.isArray(pictures) ? pictures.map(({ diagnosis, ...image }) => image) : pictures,
      contrast: measured.violations ? { violations: grouped(measured.violations), incomplete: grouped(measured.incomplete), counts: measured.counts } : measured,
      headings: headings(),
      clipped: clippedText(),
      overflow: overflow()
    };
  };

  // Playwright serializes an unawaited Promise as its own properties, so one left inside a returned object says so instead of reading as `{}`.
  // Its rejection is marked handled, or the page would log it as the site's error; an await still gets it.
  const noted = (call, fn) => (...args) => {
    const promise = fn(...args);
    promise.catch(() => {});
    return Object.assign(promise, { notAwaited: `This is a Promise: inside an async function write \`await __kosh.${call}\`, or call it on its own.` });
  };

  Object.defineProperty(window, '__kosh', { value: Object.freeze({ gate, staticHtml: noted('staticHtml(url)', staticHtml), imageSize: noted('imageSize(url)', imageSize), images, contrast: noted('contrast()', contrast), page: noted('page()', page) }) });
})();
