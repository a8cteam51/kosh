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

// A 100x50 source in a 200x100 slot at 2x DPR is flagged unless the SVG guard skips it.
const lowResImg = (src) => ({
  currentSrc: src,
  alt: '',
  complete: true,
  naturalWidth: 100,
  naturalHeight: 50,
  getBoundingClientRect: () => ({ width: 200, height: 100 }),
  getAttribute: () => null,
  parentElement: null,
});

// trim() matters: a newline straight after `return` would end the statement.
const isFlagged = (src) => {
  const result = new Function('window', 'document', 'getComputedStyle', `return ${script.trim()}`)(
    { devicePixelRatio: 2 },
    { querySelectorAll: () => [lowResImg(src)] },
    () => ({ objectFit: 'fill' })
  );
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
