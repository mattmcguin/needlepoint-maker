/* Open browser-color-validation.html through a local static server.
 * Optional ?baseline=/path/to/previous-app.js enables before/after comparison.
 */
(async () => {
  const summary = document.getElementById('summary');
  const loadProcessor = async url => {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Could not load ${url}`);
    return new Function(`${(await response.text()).split('// UI RENDERING')[0]};return processImage;`)();
  };
  const process = await loadProcessor('../app.js');
  const baselineUrl = new URLSearchParams(location.search).get('baseline');
  const baseline = baselineUrl ? await loadProcessor(baselineUrl) : null;
  const fixtures = [];
  const add = (name, paint, options = {}) => {
    const canvas = document.createElement('canvas');
    canvas.width = options.width || 512;
    canvas.height = options.height || 512;
    const ctx = canvas.getContext('2d');
    if (!options.transparent) { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    paint(ctx, canvas.width, canvas.height);
    fixtures.push({ name, image: canvas, ...options });
  };
  const fill = (ctx, color, x, y, width, height) => {
    ctx.fillStyle = color; ctx.fillRect(x, y, width, height);
  };
  const circle = (ctx, color, x, y, radius) => {
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
  };
  const red = ([r, g, b]) => r > 150 && r > g * 1.5 && r > b * 1.3;
  const blue = ([r, g, b]) => b > r * 1.2 && b > g * 1.02;
  const yellow = ([r, g, b]) => r > 140 && g > 110 && b < Math.min(r, g) * 0.8;
  const white = rgb => Math.min(...rgb) > 235 && Math.max(...rgb) - Math.min(...rgb) < 18;
  const black = rgb => Math.max(...rgb) < 65;
  const green = ([r, g, b]) => g > r * 1.08 && g > b * 1.08;
  const paletteOf = result => Object.values(result.colorMap).map(hex => hex.slice(1).match(/../g).map(v => parseInt(v, 16)));
  const expect = (condition, description) => ({ pass: Boolean(condition), description });
  const mustKeep = (tests, minimumColors = 4) => (palette, limit) => limit < minimumColors ? [] :
    tests.map(([predicate, label]) => expect(palette.some(predicate), `Retain ${label} at ${limit} colors`));

  add('Green ornament with red ribbons', ctx => {
    circle(ctx, '#D3EDC6', 256, 256, 240);
    ctx.strokeStyle = '#2F6539'; ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(256, 256, 240, 0, 7); ctx.stroke();
    ctx.fillStyle = '#2F6539'; ctx.font = 'bold 60px serif'; ctx.textAlign = 'center';
    ctx.fillText('Merry', 256, 215); ctx.fillText('Christmas', 256, 290); ctx.fillText('2026', 256, 370);
    fill(ctx, '#E82B40', 90, 235, 30, 100); fill(ctx, '#FFFFFF', 90, 255, 30, 20);
    fill(ctx, '#E82B40', 392, 235, 30, 100); fill(ctx, '#FFFFFF', 392, 275, 30, 20);
  }, { check: mustKeep([[red, 'red ribbons'], [white, 'white'], [green, 'green']]) });
  add('Navy emblem with small yellow stars', ctx => {
    fill(ctx, '#182941', 0, 0, 512, 512); circle(ctx, '#F7F0D9', 256, 256, 145);
    ctx.fillStyle = '#182941'; ctx.font = 'bold 105px serif'; ctx.textAlign = 'center'; ctx.fillText('M', 256, 295);
    for (const x of [80, 432]) circle(ctx, '#F5C534', x, 256, 22);
  }, { check: mustKeep([[yellow, 'yellow stars'], [blue, 'navy']]) });
  const blocks = ['#E22A37', '#258847', '#2366C8', '#E6C531', '#C24BAA', '#31B6C9', '#141414', '#FFFFFF'];
  add('Eight flat colors with unequal coverage', ctx => {
    const widths = [160, 110, 80, 55, 45, 32, 20, 10]; let x = 0;
    blocks.forEach((color, i) => { fill(ctx, color, x, 0, widths[i], 512); x += widths[i]; });
  }, { check: (palette, limit) => limit < 8 ? [] : [expect(palette.length === 8, 'Preserve all eight exact flat colors')] });
  add('Black line art on white', ctx => {
    ctx.strokeStyle = '#101010'; ctx.lineWidth = 10; ctx.strokeRect(100, 150, 300, 270);
    ctx.beginPath(); ctx.moveTo(70, 150); ctx.lineTo(250, 25); ctx.lineTo(435, 150); ctx.stroke();
    ctx.strokeRect(220, 280, 65, 140); ctx.strokeRect(130, 200, 50, 50); ctx.strokeRect(320, 200, 50, 50);
  }, { check: mustKeep([[white, 'white paper'], [black, 'dark outlines']], 2) });
  add('Smooth grayscale ramp', ctx => {
    const gradient = ctx.createLinearGradient(0, 0, 512, 0); gradient.addColorStop(0, '#000000'); gradient.addColorStop(1, '#FFFFFF');
    fill(ctx, gradient, 0, 0, 512, 512);
  }, { check: palette => [expect(palette.every(rgb => Math.max(...rgb) - Math.min(...rgb) <= 1), 'Keep grayscale neutral')] });
  add('Sunset gradient with dark silhouette', ctx => {
    const gradient = ctx.createLinearGradient(0, 0, 0, 512); gradient.addColorStop(0, '#2D2A76'); gradient.addColorStop(.45, '#D74382'); gradient.addColorStop(1, '#FFD37C');
    fill(ctx, gradient, 0, 0, 512, 512); circle(ctx, '#FFD66C', 365, 340, 52);
    fill(ctx, '#171C30', 0, 450, 512, 62); fill(ctx, '#171C30', 140, 280, 16, 200); circle(ctx, '#171C30', 150, 280, 64);
  });
  add('Blue sailboat with a red flag', ctx => {
    fill(ctx, '#9DCBE3', 0, 0, 512, 280); fill(ctx, '#225B98', 0, 280, 512, 232);
    fill(ctx, '#23384D', 255, 100, 8, 250); fill(ctx, '#E53739', 263, 100, 65, 30);
    ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.moveTo(245, 130); ctx.lineTo(120, 310); ctx.lineTo(245, 310); ctx.fill();
    fill(ctx, '#23384D', 130, 330, 250, 30);
  }, { check: mustKeep([[red, 'red flag'], [white, 'white sail'], [blue, 'blue water']], 6) });
  add('Transparent flower cutout', ctx => {
    fill(ctx, '#298647', 245, 180, 20, 300); circle(ctx, '#298647', 205, 340, 40);
    for (let i = 0; i < 6; i++) circle(ctx, '#E9374B', 256 + Math.cos(i) * 55, 170 + Math.sin(i) * 55, 42);
    circle(ctx, '#E2BE33', 256, 170, 28);
  }, { transparent: true, check: mustKeep([[red, 'red petals'], [white, 'composited white'], [green, 'green stem'], [yellow, 'yellow center']]) });
  add('Low-contrast pastel blocks', ctx => {
    ['#F5D8DE', '#D8EBD5', '#DBE2F4', '#F3E9CF'].forEach((color, i) => fill(ctx, color, i * 128, 0, 128, 512));
  }, { check: (palette, limit) => limit < 4 ? [] : [expect(palette.length === 4, 'Keep four distinct pastel colors')] });
  add('Skin tones from light to dark', ctx => {
    ['#F6D2B4', '#EAB88E', '#BD8059', '#895036', '#563425', '#2A1C18'].forEach((color, i) => fill(ctx, color, i * 86, 0, 86, 512));
  });
  add('Nearby colors in one RGB histogram bin', ctx => {
    ['#505452', '#515553', '#535755', '#565A58'].forEach((color, i) => fill(ctx, color, i * 128, 0, 128, 512));
  }, { check: (palette, limit) => limit < 4 ? [] : [expect(palette.length < 4, 'Combine nearby shades instead of filling the color ceiling')] });
  add('Single solid teal', ctx => fill(ctx, '#248C88', 0, 0, 512, 512), {
    check: palette => [expect(palette.length === 1, 'Do not invent extra shades for a solid image')]
  });
  add('Small red accent on shaded greens', ctx => {
    const gradient = ctx.createLinearGradient(0, 0, 512, 512); gradient.addColorStop(0, '#CDE7BE'); gradient.addColorStop(1, '#D7F1C8');
    fill(ctx, gradient, 0, 0, 512, 512); fill(ctx, '#2C6237', 60, 80, 350, 55);
    fill(ctx, '#FFFFFF', 60, 360, 350, 55); fill(ctx, '#E82D40', 380, 225, 32, 40);
  }, { check: mustKeep([[red, 'small red accent'], [white, 'white strip'], [green, 'green']]) });
  add('Seeded texture with red accent', ctx => {
    const data = ctx.createImageData(512, 512); let seed = 973;
    for (let i = 0; i < data.data.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const shade = seed % 24; data.data.set([170 + shade, 197 + shade, 152 + shade, 255], i);
    }
    ctx.putImageData(data, 0, 0); fill(ctx, '#21452C', 100, 70, 320, 60); fill(ctx, '#ED3447', 230, 230, 42, 42);
  }, { check: mustKeep([[red, 'red accent amid texture'], [green, 'greens']]) });
  add('Red and white checkerboard', ctx => {
    for (let y = 0; y < 512; y += 32) for (let x = 0; x < 512; x += 32) fill(ctx, (x / 32 + y / 32) % 2 ? '#E22A37' : '#FFFFFF', x, y, 32, 32);
  }, { check: mustKeep([[red, 'red squares'], [white, 'white squares']], 2) });
  add('Transparent empty canvas', () => {}, {
    transparent: true, check: palette => [expect(palette.length === 1 && white(palette[0]), 'Transparent canvas becomes white')]
  });
  add('Wide banner with red badge', (ctx, width, height) => {
    fill(ctx, '#D3EDC6', 0, 0, width, height); fill(ctx, '#285D36', 40, 35, 560, 45); circle(ctx, '#DE3444', 690, 64, 35);
  }, { width: 768, height: 128, check: mustKeep([[red, 'red badge'], [green, 'green']]) });
  add('Tall bookmark with yellow accent', (ctx, width, height) => {
    fill(ctx, '#1E365A', 0, 0, width, height); fill(ctx, '#DBE7F2', 35, 40, 55, 560); circle(ctx, '#F2C337', 64, 690, 35);
  }, { width: 128, height: 768, check: mustKeep([[yellow, 'yellow badge'], [blue, 'blue']]) });
  add('Almost white with thin dark lettering', ctx => {
    fill(ctx, '#FDFCF8', 0, 0, 512, 512); ctx.font = '40px serif'; ctx.fillStyle = '#20252B'; ctx.textAlign = 'center'; ctx.fillText('Needlepoint', 256, 260);
  }, { check: mustKeep([[white, 'light background'], [rgb => Math.max(...rgb) < 170, 'visible dark type']], 2) });
  for (const [file, name, check] of [
    ['christmas-ornament', 'Customer Christmas ornament', mustKeep([[red, 'candy-cane red'], [white, 'white'], [green, 'greens']])],
    ['dog-photo', 'Generated golden retriever photograph', mustKeep([[red, 'red bandana']], 8)],
    ['portrait-photo', 'Generated portrait with dark skin tones', mustKeep([[yellow, 'yellow flower'], [black, 'dark hair']], 8)],
    ['watercolor-flowers', 'Generated watercolor flowers', mustKeep([[blue, 'blue butterfly'], [white, 'white paper'], [green, 'green leaves']], 8)]
  ]) {
    const image = new Image(); image.src = `fixtures/generated/${file}.jpg`; await image.decode(); fixtures.push({ name, image, check });
  }
  // Keep spatial evidence: a color histogram cannot detect lightened text.
  const strokeSource = new Image(); strokeSource.src = 'fixtures/christmas-ornament-strokes.png'; await strokeSource.decode();
  const strokeCanvas = document.createElement('canvas'); strokeCanvas.width = strokeCanvas.height = 512;
  strokeCanvas.getContext('2d').drawImage(strokeSource, 0, 0);
  const strokeData = strokeCanvas.getContext('2d').getImageData(0, 0, 512, 512).data;
  const darkGreen = ([r, g, b]) => green([r, g, b]) && r < 110 && g < 145;
  const checkStrokes = (result, size, limit) => {
    if (limit < 4) return [];
    const counts = { text: [0, 0], border: [0, 0] };
    const textRects = [[.21,.21,.8,.39],[.32,.4,.68,.57],[.18,.59,.85,.735],[.35,.76,.67,.88]];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const nx = (x + .5) / size, ny = (y + .5) / size;
      const radius = Math.hypot(nx - .5, ny - .5);
      const kind = radius > .437 && radius < .47 ? 'border' :
        textRects.some(([l,t,r,b]) => nx > l && nx < r && ny > t && ny < b) ? 'text' : null;
      if (!kind) continue;
      let ink = 0;
      const left = x * 512 / size, right = (x + 1) * 512 / size;
      const top = y * 512 / size, bottom = (y + 1) * 512 / size;
      for (let sy = Math.floor(top); sy < Math.ceil(bottom); sy++) for (let sx = Math.floor(left); sx < Math.ceil(right); sx++) {
        const i = (sy * 512 + sx) * 4;
        if (darkGreen(strokeData.slice(i, i + 3))) ink +=
          (Math.min(bottom, sy + 1) - Math.max(top, sy)) * (Math.min(right, sx + 1) - Math.max(left, sx));
      }
      if (ink < (512 / size) ** 2 * .2) continue;
      counts[kind][0]++;
      const hex = result.colorMap[result.grid[y][x]];
      if (darkGreen(hex.slice(1).match(/../g).map(v => parseInt(v, 16)))) counts[kind][1]++;
    }
    return Object.entries(counts).map(([kind, [total, dark]]) =>
      expect(total > 0 && dark / total >= .95, `Keep at least 95% of supported ${kind} stitches dark (${dark}/${total})`));
  };
  fixtures.push({ name: 'Lossless ornament: text and border contrast', image: strokeSource,
    check: mustKeep([[red, 'candy-cane red'], [white, 'white'], [green, 'greens']]), checkStrokes });
  const savedSource = new Image(); savedSource.src = 'fixtures/christmas-ornament-saved.jpg'; await savedSource.decode();
  fixtures.push({ name: 'Saved-project ornament: compressed image contrast', image: savedSource,
    check: mustKeep([[red, 'candy-cane red'], [white, 'white'], [green, 'greens']]), checkStrokes });
  const bear = new Image(); bear.src = '../images/needlepoint-bear.jpg'; await bear.decode(); fixtures.push({ name: 'Existing bear artwork', image: bear });

  const output = { cases: [], runs: 0, checks: 0, failures: [], timings: [], generatedAt: new Date().toISOString() };
  const canvas = document.getElementById('processingCanvas');
  const render = (processor, fixture, size, limit) => {
    const img = fixture.image;
    const width = img.naturalWidth || img.width, height = img.naturalHeight || img.height;
    const targetWidth = Math.max(1, Math.round(size * width / Math.max(width, height)));
    const targetHeight = Math.max(1, Math.round(size * height / Math.max(width, height)));
    const start = performance.now();
    const result = processor(img, targetHeight, targetWidth, limit);
    const ms = performance.now() - start;
    return { result, ms, targetWidth, targetHeight };
  };
  const figure = (label, png, result, original = false) => {
    const fig = document.createElement('figure'); const image = document.createElement('img'); image.src = png;
    image.alt = label; if (!original) image.className = 'pattern'; fig.append(image);
    const caption = document.createElement('figcaption'); caption.textContent = label; fig.append(caption);
    if (result) {
      const swatches = document.createElement('div'); swatches.className = 'swatches';
      Object.values(result.colorMap).forEach(hex => { const swatch = document.createElement('i'); swatch.style.background = hex; swatch.title = hex; swatches.append(swatch); });
      fig.append(swatches);
    }
    return fig;
  };
  for (const fixture of fixtures) {
    const row = { name: fixture.name, checks: 0, failures: [], results: [], visuals: [] };
    for (const size of [52, 72, 144]) {
      for (const limit of [2, 3, 4, 6, 8, 16, 30, 64]) {
        const { result, ms, targetWidth, targetHeight } = render(process, fixture, size, limit);
        output.runs++; output.timings.push(ms);
        const palette = paletteOf(result);
        const counts = new Map(); for (const line of result.grid) for (const code of line) counts.set(code, (counts.get(code) || 0) + 1);
        const checks = [
          expect(result.numColors > 0 && result.numColors <= limit, 'Respect color limit'),
          expect(new Set(Object.values(result.colorMap)).size === result.numColors, 'No duplicate palette colors'),
          expect(result.grid.length === targetHeight && result.grid.every(line => line.length === targetWidth), 'Correct grid dimensions'),
          expect([...counts.keys()].every(code => result.colorMap[code]), 'Every stitch has a legend color'),
          expect(Object.entries(result.colorCounts).every(([code, count]) => counts.get(code) === count), 'Legend counts match stitches'),
          expect(Object.values(result.colorCounts).reduce((a, b) => a + b, 0) === targetWidth * targetHeight, 'No missing stitches'),
          ...(fixture.check ? fixture.check(palette, limit) : []),
          ...(fixture.checkStrokes ? fixture.checkStrokes(result, size, limit) : [])
        ];
        output.checks += checks.length; row.checks += checks.length;
        for (const check of checks.filter(check => !check.pass)) {
          const failure = `${fixture.name}, ${size} stitches, ${limit} colors: ${check.description}`;
          output.failures.push(failure); row.failures.push(failure);
        }
        if (fixture.name === 'Customer Christmas ornament' && limit >= 8) {
          const check = expect(result.numColors >= 6 && result.numColors <= 7, 'Use six or seven colors under a generous ceiling');
          output.checks++; row.checks++;
          if (!check.pass) { const failure = `${fixture.name}, ${size} stitches, ${limit} colors: ${check.description}`; output.failures.push(failure); row.failures.push(failure); }
        }
        row.results.push({ size, limit, ms: Math.round(ms * 10) / 10, actual: result.numColors, palette: result.colorMap });
      }
    }
    const article = document.createElement('article'); article.className = 'case';
    const title = document.createElement('h2'); title.textContent = fixture.name; article.append(title);
    const images = document.createElement('div'); images.className = 'images';
    let original;
    if (fixture.image instanceof HTMLCanvasElement) original = fixture.image.toDataURL(); else original = fixture.image.src;
    images.append(figure('Original', original, null, true));
    for (const limit of [4, 30]) {
      for (const [label, processor] of [['Before', baseline], ['After', process]]) {
        if (!processor) continue;
        const { result } = render(processor, fixture, 144, limit); const png = canvas.toDataURL();
        images.append(figure(`${label}: ${result.numColors} colors (max ${limit})`, png, result));
        row.visuals.push({ label, limit, png, palette: result.colorMap });
      }
    }
    article.append(images);
    const status = document.createElement('p'); status.className = row.failures.length ? 'fail' : 'pass';
    status.textContent = row.failures.length ? row.failures.join('\n') : `${row.checks} checks passed across 24 conversions.`; article.append(status);
    const details = document.createElement('details'); const label = document.createElement('summary'); label.textContent = 'Palettes and processing times'; details.append(label);
    const pre = document.createElement('pre'); pre.textContent = JSON.stringify(row.results, null, 2); details.append(pre); article.append(details);
    document.getElementById('cases').append(article); output.cases.push(row);
    summary.textContent = `${output.cases.length}/${fixtures.length} images · ${output.runs} conversions · ${output.failures.length} failed checks`;
    await new Promise(resolve => requestAnimationFrame(resolve));
  }
  output.timings.sort((a, b) => a - b);
  output.medianMs = Math.round(output.timings[Math.floor(output.timings.length / 2)] * 10) / 10;
  output.p95Ms = Math.round(output.timings[Math.floor(output.timings.length * 0.95)] * 10) / 10;
  summary.textContent = `${output.cases.length} images · ${output.runs} conversions · ${output.checks} checks · ${output.failures.length} failures · median ${output.medianMs} ms / p95 ${output.p95Ms} ms`;
  window.validationResult = output;
  window.validationDone = true;
})().catch(error => {
  document.getElementById('summary').textContent = error.stack;
  window.validationError = error.message;
  window.validationDone = true;
});
