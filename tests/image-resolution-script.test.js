const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SKILL = path.join(__dirname, '../skills/functional-design/SKILL.md');

const blocks = fs.readFileSync(SKILL, 'utf8')
  .split('```javascript')
  .slice(1)
  .map((chunk) => chunk.split('```')[0])
  .filter((code) => code.includes('resolutionRatio:'));
assert.equal(blocks.length, 1, 'expected exactly one javascript block containing "resolutionRatio:" in functional-design/SKILL.md');
const [script] = blocks;

// Defaults: a 100x50 source in a 200x100 slot at 2x DPR, flagged unless the SVG guard skips it.
const stubImg = (src, { natural = [100, 50], slot = [200, 100], srcset = null, pictureSources = 0, crossOrigin = null } = {}) => ({
  currentSrc: src,
  crossOrigin,
  alt: '',
  complete: true,
  naturalWidth: natural[0],
  naturalHeight: natural[1],
  getBoundingClientRect: () => ({ width: slot[0], height: slot[1] }),
  getAttribute: (name) => (name === 'srcset' ? srcset : null),
  parentElement: pictureSources ? { tagName: 'PICTURE', querySelectorAll: () => ({ length: pictureSources }) } : null,
});

// A fresh Image reads an already-loaded url synchronously, at its real size, only when the CORS mode matches too; a miss leaves naturalWidth at 0.
const stubProbe = (img, real) => class {
  crossOrigin = null;
  naturalWidth = 0;
  naturalHeight = 0;
  set src(url) {
    if (real && url === img.currentSrc && this.crossOrigin === img.crossOrigin) [this.naturalWidth, this.naturalHeight] = real;
  }
};

// trim() matters: a newline straight after `return` would end the statement.
// `real` defaults to `natural` (a density-1 pick); `real: null` is a probe miss.
const run = (src, stub = {}) => {
  const img = stubImg(src, stub);
  const real = stub.real === undefined ? [img.naturalWidth, img.naturalHeight] : stub.real;
  return new Function('window', 'document', 'getComputedStyle', 'Image', `return ${script.trim()}`)(
    { devicePixelRatio: 2 },
    { querySelectorAll: () => [img] },
    () => ({ objectFit: 'fill' }),
    stubProbe(img, real)
  );
};

const isFlagged = (src) => {
  const result = run(src);
  return Array.isArray(result) && result[0].status === 'flag';
};

for (const src of [
  'https://example.com/logo.svg',
  'https://example.com/header-logo.svg?ver=1.3.0',
  'https://example.com/sprite.svg#icon',
  'https://example.com/LOGO.SVG?ver=2',
  'https://example.com/logo.svgz',
  'https://example.com/logo.svgz?ver=1',
  'data:image/svg+xml;base64,AAAA',
  'data:image/SVG+xml;base64,AAAA',
]) {
  test(`skips SVG: ${src}`, () => assert.equal(isFlagged(src), false));
}

for (const src of [
  'https://example.com/photo.png',
  'https://example.com/photo.png?fallback=logo.svg',
  'https://example.com/thumb.php?fallback=image/svg%2Bxml&w=100',
  'https://example.com/a/image/svg/thumb.png',
]) {
  test(`still flags raster: ${src}`, () => assert.equal(isFlagged(src), true));
}

const THUMB = ['https://cdn.example.com/thumb.jpg?resize=350%2C200&ssl=1', { natural: [350, 200], slot: [305, 172] }];
const DENSITY = [THUMB[0], { ...THUMB[1], srcset: `${THUMB[0]} 1x, https://cdn.example.com/thumb.jpg?resize=700%2C400&ssl=1 2x` }];

for (const [name, src, stub, category] of [
  ['resize= below what the slot needs', ...THUMB, 'request'],
  ['fit= below what the slot needs', 'https://cdn.example.com/thumb.jpg?fit=350%2C200', { natural: [300, 200], slot: [305, 172] }, 'request'],
  ['w= below what the slot needs', 'https://example.com/chart.png?w=1024', { natural: [1024, 645], slot: [877, 552] }, 'request'],
  ['resize= whose height is the cap', 'https://cdn.example.com/thumb.jpg?resize=700%2C200', { natural: [700, 200], slot: [305, 172] }, 'request'],
  ['density-only srcset', ...DENSITY, 'request'],
  ['w= below the need, but the CDN returned even less', 'https://example.com/chart.png?w=1024', { natural: [600, 378], slot: [877, 552] }, 'source'],
  ['w= already at least what the slot needs', 'https://example.com/photo.jpg?w=2000', { natural: [485, 303], slot: [800, 500] }, 'source'],
  ['w= that is not a width cap', 'https://example.com/image.php?w=3', {}, 'source'],
  ['w= in the fragment, not the query', 'https://example.com/photo.png#w=100', {}, 'source'],
  ['no resize param', 'https://example.com/photo.png', {}, 'source'],
  [
    'srcset already offers a large-enough candidate',
    'https://example.com/hero.jpg?w=485',
    { natural: [485, 303], slot: [800, 500], srcset: 'https://example.com/hero.jpg?w=485 485w, https://example.com/hero.jpg?w=1600 1600w' },
    'markup',
  ],
]) {
  test(`diagnosis: ${name} → ${category}`, () => assert.equal(run(src, stub)[0].diagnosisCategory, category));
}

test('request diagnosis names the param, the delivered size and the needed size', () => {
  const [{ diagnosis }] = run(...THUMB);
  for (const part of ['`resize=350,200`', '350x200px', '610x344px']) {
    assert.ok(diagnosis.includes(part), `"${part}" missing from: ${diagnosis}`);
  }
});

for (const [name, src, stub] of [
  ['request', ...DENSITY],
  ['source', 'https://example.com/photo.png', { srcset: 'https://example.com/photo.png 1x, https://example.com/photo-2x.png 2x' }],
]) {
  test(`a density-only srcset is not reported as missing (${name})`, () => {
    const [{ diagnosisCategory, diagnosis }] = run(src, stub);
    assert.equal(diagnosisCategory, name);
    assert.ok(!diagnosis.includes('No srcset present'), diagnosis);
  });
}

// For a srcset pick the DOM reports `natural` (real pixels divided by the picked density) while a fresh Image reports `real`; both figures were observed in Chrome.
const HERO = 'https://example.com/hero.jpg?w=768';
const HERO_PICK = { natural: [374, 172], real: [766, 353], slot: [375, 173], srcset: `${HERO} 768w` };
const THUMB_2X = 'https://example.com/thumb.jpg?resize=700%2C400';
const ALL_FINE = 'All images are sufficiently sized for their rendered dimensions';
const UNMEASURED = 'could not be read';

for (const [name, src, stub] of [
  ['768w pick the DOM reports as 374 wide', HERO, HERO_PICK],
  ['2x pick', THUMB_2X, { natural: [350, 200], real: [700, 400], slot: [305, 172], srcset: `${THUMB_2X} 2x` }],
  ['2x pick from a <picture> <source>', 'https://example.com/hero.webp', { natural: [350, 200], real: [700, 400], slot: [300, 171], pictureSources: 1 }],
  ['pick on an <img crossorigin>', HERO, { ...HERO_PICK, crossOrigin: 'anonymous' }],
]) {
  test(`a srcset pick is measured in real pixels: ${name}`, () => assert.equal(run(src, stub), ALL_FINE));
}

test('an odd-width 2x pick reports its exact size and still reaches the request diagnosis', () => {
  const src = 'https://example.com/thumb.jpg?resize=701%2C401';
  const [{ naturalSize, diagnosisCategory }] = run(src, { natural: [351, 201], real: [701, 401], slot: [400, 229], srcset: `${src} 2x` });
  assert.deepEqual([naturalSize, diagnosisCategory], ['701x401px', 'request']);
});

test('a w descriptor that overstates what the CDN delivered is still flagged', () => {
  const src = 'https://example.com/hero.jpg?w=1024';
  const [{ naturalSize, resolutionRatio, status }] = run(src, { natural: [293, 195], real: [600, 400], slot: [500, 333], srcset: `${src} 1024w` });
  assert.deepEqual([naturalSize, resolutionRatio, status], ['600x400px', 0.6, 'flag']);
});

test('a w descriptor smaller than the slot cannot inflate the measurement', () => {
  const src = 'https://example.com/small.jpg';
  const [{ naturalSize }] = run(src, { natural: [1200, 600], real: [300, 150], slot: [600, 300], srcset: `${src} 300w` });
  assert.equal(naturalSize, '300x150px');
});

test('a probe miss falls back to the DOM size and says so', () => {
  const [{ naturalSize, diagnosis }] = run(HERO, { ...HERO_PICK, real: null });
  assert.equal(naturalSize, '374x172px');
  assert.ok(diagnosis.includes(UNMEASURED), diagnosis);
});

test('an image with no srcset is never probed', () => {
  const [{ diagnosis }] = run('https://example.com/photo.png', { real: null });
  assert.ok(!diagnosis.includes(UNMEASURED), diagnosis);
});
