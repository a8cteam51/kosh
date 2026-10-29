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
      // The image is drawn inside the padding and border, so only the content box needs its pixels.
      const inset = (...sides) => sides.reduce((sum, side) => sum + (parseFloat(cs[side]) || 0), 0);
      const renderedW = Math.round(rect.width - inset('paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth'));
      const renderedH = Math.round(rect.height - inset('paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth'));
      if (renderedW <= 0 || renderedH <= 0) return;

      const srcUrl = img.currentSrc || img.src || '';
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

      // A finished image with no pixels failed to load; waiting won't change it.
      if (img.complete && img.naturalWidth === 0) {
        results.push({
          src: srcUrl.split('/').pop().substring(0, 60),
          renderedCSS: `${renderedW}x${renderedH}px`,
          status: 'broken',
          reason: 'the image finished loading with no pixels: its URL is broken or is not an image',
          alt: (img.alt || '(no alt)').substring(0, 40)
        });
        return;
      }
      if (!img.complete) {
        results.push({
          src: srcUrl.split('/').pop().substring(0, 60),
          renderedCSS: `${renderedW}x${renderedH}px`,
          status: 'unknown',
          reason: 'image not yet loaded — re-run after scroll/wait',
          alt: (img.alt || '(no alt)').substring(0, 40)
        });
        return;
      }

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
      // contain and scale-down letterbox the image inside its box, so it needs only the size it's drawn at; scale-down never enlarges it.
      const fit = { contain: Infinity, 'scale-down': 1 }[objectFit];
      const drawn = fit ? Math.min(renderedW / img.naturalWidth, renderedH / img.naturalHeight, fit) : null;
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

      const objectFitNote = (objectFit === 'cover' || objectFit === 'contain')
        ? ` object-fit: ${objectFit} is in effect — the visible image is cropped/scaled to fit the slot, but this does not change the underlying resolution problem.`
        : '';

      let pictureNote = '';
      if (pictureSourceCount > 0) {
        // <picture> <source srcset> siblings override the img's srcset selection without being read here, so source/markup attribution isn't reliable.
        diagnosis.category = 'unknown';
        pictureNote = ` This \`<img>\` is inside a \`<picture>\` element with ${pictureSourceCount} \`<source srcset>\` sibling(s) that this script doesn't read — inspect those before attributing the cause, since the loaded image may have come from a \`<source>\` rather than the \`<img>\`'s own \`src\`/\`srcset\`.`;
      }

      results.push({
        src: srcUrl.split('/').pop().substring(0, 60),
        naturalSize: `${naturalW}x${naturalH}px`,
        renderedCSS: `${renderedW}x${renderedH}px`,
        neededForCrisp: `${Math.round(neededW)}x${Math.round(neededH)}px (${dpr}x DPR)`,
        resolutionRatio: +ratio.toFixed(2),
        status: ratio < 0.75 ? 'flag' : 'needs visual review',
        diagnosisCategory: diagnosis.category,
        diagnosis: diagnosis.explanation + objectFitNote + pictureNote + unmeasuredNote,
        objectFit,
        largestSrcsetCandidate: largestCandidate ? `${largestCandidate}w` : 'none',
        sizesAttr: sizesAttr || 'missing',
        alt: (img.alt || '(no alt)').substring(0, 40)
      });
    });

    return results.length
      ? results
      : 'All images are sufficiently sized for their rendered dimensions';
  };

  // functional-design's contrast check: text against its first opaque background, any translucent layers composited on top.
  const contrast = () => {
    // Parse an rgb/rgba string into {r, g, b, a}
    function parseColor(str) {
      const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (!m) return null;
      return { r: +m[1], g: +m[2], b: +m[3], a: m[4] !== undefined ? +m[4] : 1 };
    }

    // Composite a semi-transparent foreground over an opaque background
    function composite(fg, bg) {
      return {
        r: Math.round(fg.r * fg.a + bg.r * (1 - fg.a)),
        g: Math.round(fg.g * fg.a + bg.g * (1 - fg.a)),
        b: Math.round(fg.b * fg.a + bg.b * (1 - fg.a)),
        a: 1
      };
    }

    // Walk up the DOM to resolve the effective background color
    function resolveBackground(el) {
      let layers = [];
      let current = el;
      while (current) {
        const bg = parseColor(window.getComputedStyle(current).backgroundColor);
        if (bg) {
          layers.push(bg);
          if (bg.a === 1) break; // found an opaque layer, stop
        }
        current = current.parentElement;
      }
      // If no opaque layer found, assume white
      let result = { r: 255, g: 255, b: 255, a: 1 };
      // Composite from bottom (most distant ancestor) to top (element itself)
      for (let i = layers.length - 1; i >= 0; i--) {
        result = composite(layers[i], result);
      }
      return result;
    }

    // Relative luminance per WCAG 2.x
    function luminance(c) {
      const [rs, gs, bs] = [c.r, c.g, c.b].map(v => {
        v = v / 255;
        return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    }

    // Contrast ratio
    function contrastRatio(c1, c2) {
      const l1 = luminance(c1), l2 = luminance(c2);
      const lighter = Math.max(l1, l2), darker = Math.min(l1, l2);
      return +((lighter + 0.05) / (darker + 0.05)).toFixed(2);
    }

    // Collect elements to check
    const selectors = 'a, button, p, h1, h2, h3, h4, h5, h6, span, li, td, th, label, input, select, textarea';
    const seen = new Set();
    const results = [];

    document.querySelectorAll(selectors).forEach(el => {
      const text = el.textContent?.trim().substring(0, 40);
      if (!text || seen.has(el)) return;
      seen.add(el);

      const styles = window.getComputedStyle(el);
      const textColor = parseColor(styles.color);
      const effectiveBg = resolveBackground(el);
      if (!textColor || !effectiveBg) return;

      const ratio = contrastRatio(textColor, effectiveBg);
      const fontSize = parseFloat(styles.fontSize);
      const fontWeight = parseInt(styles.fontWeight) || 400;
      const isLarge = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
      const threshold = isLarge ? 3 : 4.5;

      if (ratio < threshold) {
        results.push({
          tag: el.tagName.toLowerCase(),
          text: text,
          textColor: `rgb(${textColor.r},${textColor.g},${textColor.b})`,
          effectiveBg: `rgb(${effectiveBg.r},${effectiveBg.g},${effectiveBg.b})`,
          ratio: ratio,
          threshold: threshold,
          fontSize: fontSize + 'px',
          fontWeight: fontWeight,
          isLarge: isLarge
        });
      }
    });

    return results.length ? results : 'All checked elements meet contrast thresholds';
  };

  Object.defineProperty(window, '__kosh', { value: Object.freeze({ gate, staticHtml, imageSize, images, contrast }) });
})();
