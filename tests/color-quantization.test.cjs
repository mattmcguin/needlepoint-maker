const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

// Exercise the same browser functions without loading the UI or adding a build step.
const source = readFileSync(path.join(__dirname, '../app.js'), 'utf8').split('// UI RENDERING')[0];
const { buildPalette, rgbToOklab, oklabToRgb, processImage } = vm.runInNewContext(
  `${source};({ buildPalette, rgbToOklab, oklabToRgb, processImage })`,
  { document: { getElementById: () => targetCanvas, createElement: () => sourceCanvas } }
);
const plain = value => JSON.parse(JSON.stringify(value));
const repeat = (rgb, count) => Array.from({ length: count }, () => rgb);
const isRed = ([r, g, b]) => r > 170 && r > g * 1.8 && r > b * 1.8;
const isWhite = ([r, g, b]) => Math.min(r, g, b) > 245 && Math.max(r, g, b) - Math.min(r, g, b) < 5;
const isGreen = ([r, g, b]) => g > r * 1.08 && g > b * 1.08;
const fixture = JSON.parse(readFileSync(path.join(__dirname, 'fixtures/christmas-ornament-colors.json')));
const ornament = fixture.flatMap(([r, g, b, count]) => repeat([r, g, b], count));

function assertOrnamentPalette(palette) {
  assert.equal(palette.length, 4);
  assert.equal(palette.filter(isRed).length, 1, 'keep the candy-cane red');
  assert.equal(palette.filter(isWhite).length, 1, 'keep white separate from pale green');
  const greens = palette.filter(isGreen);
  assert.equal(greens.length, 2);
  assert.ok(Math.min(...greens.map(rgb => rgb[1])) < 130, 'keep dark lettering');
  assert.ok(Math.max(...greens.map(rgb => rgb[1])) > 200, 'keep the pale background');
}

test('Christmas ornament keeps two greens, white, and red at four colors', () => {
  assertOrnamentPalette(plain(buildPalette(ornament, 4)));
});

test('a small accent survives shaded artwork with a dominant green background', () => {
  const pixels = [];
  for (let i = 0; i < 12; i++) {
    pixels.push(...repeat([200 + i, 225 + i, 186 + i], 350));
    pixels.push(...repeat([35 + i, 84 + i, 43 + i], 45));
    pixels.push(...repeat([232 + i, 36 + i, 46 + i], 8));
  }
  pixels.push(...repeat([255, 255, 255], 1200));
  assertOrnamentPalette(plain(buildPalette(pixels, 4)));
});

test('simple artwork combines near-identical shades and preserves distinct colors', () => {
  const colors = [[255, 255, 255], [20, 80, 30], [21, 81, 31], [220, 30, 40]];
  const pixels = colors.flatMap(color => repeat(color, 30));
  const palette = plain(buildPalette(pixels, 64));
  assert.equal(palette.length, 3);
  assert.ok(palette.some(isWhite));
  assert.ok(palette.some(isRed));
  assert.equal(palette.filter(isGreen).length, 1);
  assert.deepEqual(plain(buildPalette(repeat([42, 90, 123], 500), 4)), [[42, 90, 123]]);
  assert.deepEqual(plain(buildPalette([], 4)), []);
});

test('palette selection is repeatable and independent of pixel order', () => {
  const expected = plain(buildPalette(ornament, 4));
  assert.deepEqual(plain(buildPalette(ornament, 4)), expected);
  assert.deepEqual(plain(buildPalette([...ornament].reverse(), 4)), expected);
});

test('color limits produce finite, distinct RGB values', () => {
  for (const limit of [1, 2, 3, 4, 5, 8, 16, 32, 64]) {
    const palette = plain(buildPalette(ornament, limit));
    assert.ok(palette.length > 0 && palette.length <= limit);
    assert.equal(new Set(palette.map(rgb => rgb.join(','))).size, palette.length);
    for (const rgb of palette) {
      assert.ok(rgb.every(channel => Number.isInteger(channel) && channel >= 0 && channel <= 255));
    }
  }
});

test('grayscale gradients stay neutral and span highlights and shadows', () => {
  const pixels = Array.from({ length: 256 }, (_, i) => [i, i, i]);
  const palette = plain(buildPalette(pixels, 4));
  assert.equal(palette.length, 4);
  for (const rgb of palette) assert.ok(Math.max(...rgb) - Math.min(...rgb) <= 1);
  assert.ok(Math.min(...palette.map(rgb => rgb[0])) < 60);
  assert.ok(Math.max(...palette.map(rgb => rgb[0])) > 190);
});

test('Oklab conversion round-trips representative sRGB colors', () => {
  for (const rgb of [[0, 0, 0], [255, 255, 255], [255, 0, 0], [0, 255, 0], [0, 0, 255], [133, 88, 55]]) {
    const result = oklabToRgb(rgbToOklab(...rgb));
    result.forEach((channel, i) => assert.ok(Math.abs(channel - rgb[i]) <= 1));
  }
});

// Canvas stubs provide different source and stitch pixels. This catches the
// original failure mode of learning a palette only after detail is downsampled.
function canvasWith(pixels) {
  const data = new Uint8ClampedArray(pixels.flatMap(rgb => [...rgb, 255]));
  return { getContext: () => ({
    fillRect() {}, drawImage() {}, getImageData: () => ({ data: data.slice() }), putImageData() {}
  }) };
}
let targetCanvas;
let sourceCanvas;

test('stitch mapping uses the source palette and keeps grid, legend, and counts consistent', () => {
  sourceCanvas = canvasWith(ornament);
  // Most red stripes have been blended into green at stitch resolution, but
  // a surviving red pixel must still receive its own color rather than green.
  const targetPixels = [[210, 234, 196], [254, 254, 254], [48, 98, 55], [221, 70, 75]];
  targetCanvas = canvasWith(targetPixels);
  const result = plain(processImage({ naturalWidth: 512, naturalHeight: 512 }, 2, 2, 4));
  assert.equal(result.numColors, 4);
  assert.equal(result.grid.length, 2);
  assert.ok(result.grid.every(row => row.length === 2));
  assert.equal(Object.values(result.colorCounts).reduce((sum, count) => sum + count, 0), 4);
  const rgb = hex => hex.slice(1).match(/../g).map(channel => parseInt(channel, 16));
  assertOrnamentPalette(Object.values(result.colorMap).map(rgb));
  assert.ok(isRed(rgb(result.colorMap[result.grid[1][1]])));
  for (const [code, count] of Object.entries(result.colorCounts)) {
    assert.equal(result.grid.flat().filter(cell => cell === code).length, count);
  }
});

const generatedImages = JSON.parse(readFileSync(path.join(__dirname, 'fixtures/generated-image-colors.json')));
for (const [name, predicate, label] of [
  ['dog-photo', rgb => rgb[0] > 150 && rgb[0] > rgb[1] * 1.5 && rgb[0] > rgb[2] * 1.3, 'red bandana'],
  ['portrait-photo', ([r, g, b]) => r > 140 && g > 110 && b < Math.min(r, g) * 0.8, 'yellow flower'],
  ['watercolor-flowers', ([r, g, b]) => b > r * 1.2 && b > g * 1.02, 'blue butterfly']
]) {
  test(`${name} keeps its small ${label} at eight colors`, () => {
    const fixture = generatedImages.find(image => image.name === name);
    const pixels = fixture.histogram.flatMap(([r, g, b, count]) => repeat([r, g, b], count));
    const palette = plain(buildPalette(pixels, 8));
    assert.ok(palette.some(predicate), `Retain ${label}`);
  });
}

test('dark skin pixels map to a skin color instead of a blue background', () => {
  const palette = [[12, 9, 8], [230, 222, 211], [75, 110, 137], [165, 108, 78]];
  sourceCanvas = canvasWith(palette.flatMap(color => repeat(color, 100)));
  targetCanvas = canvasWith([[103, 67, 45], [90, 65, 48], [98, 62, 43], [165, 108, 78]]);
  const result = plain(processImage({ naturalWidth: 20, naturalHeight: 20 }, 2, 2, 4));
  assert.deepEqual(Object.values(result.colorMap), ['#A56C4E']);
});


test('the color ceiling does not inflate the ornament palette', () => {
  const low = plain(buildPalette(ornament, 4));
  assertOrnamentPalette(low);
  const automatic = plain(buildPalette(ornament, 30));
  assert.ok(automatic.length >= 6 && automatic.length <= 7);
  assert.ok(automatic.some(isRed) && automatic.some(isWhite));
  assert.deepEqual(plain(buildPalette(ornament, 64)), automatic);
  assert.deepEqual(plain(buildPalette(ornament, automatic.length)), automatic);
});

test('automatic palette sizing distinguishes simple art from detailed photographs', () => {
  const fixture = generatedImages.find(image => image.name === 'portrait-photo');
  const pixels = fixture.histogram.flatMap(([r, g, b, count]) => repeat([r, g, b], count));
  const palette = plain(buildPalette(pixels, 30));
  assert.ok(palette.length > 7 && palette.length < 30);
});

test('grayscale shading uses fewer colors than a generous ceiling without collapsing to a flat fill', () => {
  const pixels = Array.from({ length: 256 }, (_, i) => [i, i, i]);
  const palette = plain(buildPalette(pixels, 30));
  assert.ok(palette.length > 4 && palette.length < 20);
  for (const rgb of palette) assert.ok(Math.max(...rgb) - Math.min(...rgb) <= 1);
});
