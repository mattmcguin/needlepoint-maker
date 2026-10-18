// ============================================
// PERCEPTUAL COLOR QUANTIZATION
// ============================================

// Oklab measures visual differences in lightness and hue, so a small red detail
// can compete with large areas of similar greens. Matrices by Björn Ottosson:
// https://bottosson.github.io/posts/oklab/ (public domain implementation).
const LINEAR_RGB = Array.from({ length: 256 }, (_, value) => {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
});

function rgbToOklab(r, g, b) {
  r = LINEAR_RGB[r];
  g = LINEAR_RGB[g];
  b = LINEAR_RGB[b];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
  ];
}

function oklabToRgb([lightness, a, b]) {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  ].map(channel => {
    const srgb = channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
    return Math.round(Math.max(0, Math.min(1, srgb)) * 255);
  });
}

function colorDistance(first, second, chromaWeight = 1) {
  return (first[0] - second[0]) ** 2 +
    chromaWeight * ((first[1] - second[1]) ** 2 + (first[2] - second[2]) ** 2);
}

function nearestColorIndex(color, palette, chromaWeight = 1) {
  let nearest = 0;
  let minDistance = Infinity;
  for (let index = 0; index < palette.length; index++) {
    const distance = colorDistance(color, palette[index], chromaWeight);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = index;
    }
  }
  return nearest;
}

// Keep a supported hue before spending a slot on another nearby shade. Source
// colors below 0.5% support cannot displace a palette entry through this step.
function preserveAccentColors(samples, centers, pixelCount) {
  const groups = new Map();
  const hueDistance = (first, second) => {
    const difference = Math.abs(Math.atan2(first[2], first[1]) - Math.atan2(second[2], second[1]));
    return Math.min(difference, Math.PI * 2 - difference);
  };
  const hasChroma = color => Math.hypot(color[1], color[2]) >= 0.04;
  const covers = (color, group) => hasChroma(color) && hueDistance(color, group.lab) < Math.PI / 6;
  for (const sample of samples) {
    if (!hasChroma(sample.lab)) continue;
    const angle = (Math.atan2(sample.lab[2], sample.lab[1]) + Math.PI * 2) % (Math.PI * 2);
    const key = Math.floor(angle / (Math.PI / 6));
    const group = groups.get(key) || { count: 0, lab: [0, 0, 0] };
    group.count += sample.count;
    for (let channel = 0; channel < 3; channel++) group.lab[channel] += sample.lab[channel] * sample.count;
    groups.set(key, group);
  }
  // Merge neighboring sectors before checking support. A hue that straddles
  // a sector boundary should count as one accent, including across 0°/360°.
  const merged = [...groups.values()];
  while (merged.length > 1) {
    let first = -1, second = -1;
    let closest = Math.PI / 6;
    for (let i = 0; i < merged.length; i++) {
      for (let j = i + 1; j < merged.length; j++) {
        const distance = hueDistance(merged[i].lab, merged[j].lab);
        if (distance < closest) { closest = distance; first = i; second = j; }
      }
    }
    if (first === -1) break;
    merged[first].count += merged[second].count;
    for (let channel = 0; channel < 3; channel++) merged[first].lab[channel] += merged[second].lab[channel];
    merged.splice(second, 1);
  }
  const supported = merged
    .filter(group => group.count >= pixelCount * 0.005)
    .map(group => ({ count: group.count, lab: group.lab.map(value => value / group.count) }))
    .filter(group => hasChroma(group.lab))
    .sort((a, b) => b.count - a.count);

  for (const group of supported) {
    if (centers.some(center => covers(center, group))) continue;
    const populations = centers.map(() => 0);
    const removalCosts = centers.map(() => 0);
    for (const sample of samples) {
      const nearest = nearestColorIndex(sample.lab, centers);
      populations[nearest] += sample.count;
      let alternative = Infinity;
      for (let i = 0; i < centers.length; i++) {
        if (i !== nearest) alternative = Math.min(alternative, colorDistance(sample.lab, centers[i]));
      }
      removalCosts[nearest] += sample.count * (alternative - colorDistance(sample.lab, centers[nearest]));
    }
    const dominant = populations.indexOf(Math.max(...populations));
    const lightest = centers.reduce((best, color, i) => color[0] > centers[best][0] ? i : best, 0);
    const darkest = centers.reduce((best, color, i) => color[0] < centers[best][0] ? i : best, 0);
    let replace = -1;
    let lowestCost = Infinity;
    for (let i = 0; i < centers.length; i++) {
      // Protect the main field, highlights, and shadows, and every hue already
      // represented. Only a redundant nearby shade is eligible for replacement.
      if (i === dominant || i === lightest || i === darkest) continue;
      const remaining = centers.filter((_, index) => index !== i);
      if (supported.some(hue => centers.some(color => covers(color, hue)) && !remaining.some(color => covers(color, hue)))) continue;
      if (!remaining.some(color => colorDistance(color, centers[i]) < 0.0144)) continue;
      if (removalCosts[i] < lowestCost) {
        replace = i;
        lowestCost = removalCosts[i];
      }
    }
    if (replace !== -1) centers[replace] = group.lab.slice();
  }
}

function buildPalette(pixels, maxColors) {
  if (!pixels.length) return [];
  const limit = Math.max(1, Math.min(64, Math.floor(maxColors) || 1));
  const histogram = new Map();
  const exactColors = new Map();

  for (const [r, g, b] of pixels) {
    // Keep simple artwork exact when it already fits the requested palette.
    if (exactColors.size <= limit) exactColors.set((r << 16) | (g << 8) | b, [r, g, b]);
    // Four bits per channel pool shading and noise, bounding the histogram at 4,096 bins.
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bin = histogram.get(key);
    if (bin) {
      bin.count++;
      bin.r += r;
      bin.g += g;
      bin.b += b;
    } else {
      histogram.set(key, { key, count: 1, r, g, b });
    }
  }
  if (exactColors.size <= limit) {
    return [...exactColors.entries()].sort((a, b) => a[0] - b[0]).map(entry => entry[1]);
  }

  const samples = [...histogram.values()].sort((a, b) => a.key - b.key).map(bin => ({
    count: bin.count,
    lab: rgbToOklab(
      Math.round(bin.r / bin.count), Math.round(bin.g / bin.count), Math.round(bin.b / bin.count)
    )
  }));
  const centers = [];
  const distances = new Float64Array(samples.length).fill(Infinity);
  let next = 0;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].count > samples[next].count) next = i;
  }

  // Deterministic, frequency-aware farthest seeds. Square-root frequency keeps
  // real accent colors without letting a lone outlier dominate the palette.
  while (centers.length < Math.min(limit, samples.length)) {
    const center = samples[next].lab.slice();
    centers.push(center);
    let bestScore = 0;
    next = -1;
    for (let i = 0; i < samples.length; i++) {
      distances[i] = Math.min(distances[i], colorDistance(samples[i].lab, center));
      const score = distances[i] * Math.sqrt(samples[i].count);
      if (score > bestScore) {
        bestScore = score;
        next = i;
      }
    }
    if (next === -1) break;
  }

  // Refine with actual pixel counts so backgrounds and neutrals stay faithful.
  for (let iteration = 0; iteration < 24; iteration++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (const { lab, count } of samples) {
      const sum = sums[nearestColorIndex(lab, centers)];
      for (let channel = 0; channel < 3; channel++) sum[channel] += lab[channel] * count;
      sum[3] += count;
    }
    let movement = 0;
    for (let i = 0; i < centers.length; i++) {
      if (!sums[i][3]) continue;
      const updated = sums[i].slice(0, 3).map(value => value / sums[i][3]);
      movement = Math.max(movement, colorDistance(centers[i], updated));
      centers[i] = updated;
    }
    if (movement < 0.00000001) break;
  }

  preserveAccentColors(samples, centers, pixels.length);

  // Rounding can make nearby centers identical. Never emit duplicate colors.
  const palette = new Map();
  for (const center of centers) {
    const rgb = oklabToRgb(center);
    palette.set(rgb.join(','), rgb);
  }
  return [...palette.values()];
}

// ============================================
// IMAGE PROCESSING
// ============================================

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0').toUpperCase()).join('');
}

function processImage(img, targetHeight, targetWidth, maxColors) {
  const canvas = document.getElementById('processingCanvas');
  const ctx = canvas.getContext('2d');
  
  // Set canvas to target size
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  
  // Fill with white (handle transparency)
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  
  // Draw image resized with high quality
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
  
  // Get pixel data
  const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
  const data = imageData.data;
  
  // Collect all pixels as RGB tuples
  const pixels = [];
  for (let i = 0; i < data.length; i += 4) {
    pixels.push([data[i], data[i + 1], data[i + 2]]);
  }
  
  // Choose the palette before reducing to stitches: resizing first can blend
  // small accents into the background and remove them from consideration.
  const sampleCanvas = document.createElement('canvas');
  const sourceWidth = img.naturalWidth || img.width;
  const sourceHeight = img.naturalHeight || img.height;
  const sampleScale = Math.min(1, 512 / Math.max(sourceWidth, sourceHeight));
  sampleCanvas.width = Math.max(1, Math.round(sourceWidth * sampleScale));
  sampleCanvas.height = Math.max(1, Math.round(sourceHeight * sampleScale));
  const sampleCtx = sampleCanvas.getContext('2d');
  sampleCtx.fillStyle = '#FFFFFF';
  sampleCtx.fillRect(0, 0, sampleCanvas.width, sampleCanvas.height);
  sampleCtx.imageSmoothingQuality = 'high';
  sampleCtx.drawImage(img, 0, 0, sampleCanvas.width, sampleCanvas.height);
  const sampleData = sampleCtx.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height).data;
  const samplePixels = [];
  for (let i = 0; i < sampleData.length; i += 4) {
    samplePixels.push([sampleData[i], sampleData[i + 1], sampleData[i + 2]]);
  }
  const palette = buildPalette(samplePixels, maxColors);
  const paletteLabs = palette.map(rgb => rgbToOklab(...rgb));
  const nearestColors = new Map();
  
  // Map each pixel to nearest palette color and build grid
  const gridData = [];
  const colorCounts = new Map();
  let pixelIdx = 0;
  
  for (let row = 0; row < targetHeight; row++) {
    const rowData = [];
    for (let col = 0; col < targetWidth; col++) {
      const [r, g, b] = pixels[pixelIdx];
      const key = (r << 16) | (g << 8) | b;
      let nearest = nearestColors.get(key);
      if (!nearest) {
        // Favor hue when mapping stitches: a dark skin tone should not
        // become blue just because the background has a similar lightness.
        nearest = palette[nearestColorIndex(rgbToOklab(r, g, b), paletteLabs, 4)];
        nearestColors.set(key, nearest);
      }
      const [pr, pg, pb] = nearest;
      const hex = rgbToHex(pr, pg, pb);
      
      rowData.push(hex);
      colorCounts.set(hex, (colorCounts.get(hex) || 0) + 1);
      
      // Also update the canvas with quantized colors
      const dataIdx = pixelIdx * 4;
      data[dataIdx] = pr;
      data[dataIdx + 1] = pg;
      data[dataIdx + 2] = pb;
      
      pixelIdx++;
    }
    gridData.push(rowData);
  }
  
  // Put quantized image data back
  ctx.putImageData(imageData, 0, 0);
  
  // Sort colors by frequency and assign codes
  const sortedColors = [...colorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([hex, count], idx) => ({
      code: String(idx + 1),
      hex,
      count
    }));
  
  // Create color map (hex -> code)
  const hexToCode = new Map();
  const codeToHex = {};
  const codeCounts = {};
  
  for (const { code, hex, count } of sortedColors) {
    hexToCode.set(hex, code);
    codeToHex[code] = hex;
    codeCounts[code] = count;
  }
  
  // Convert grid from hex to codes
  const codeGrid = gridData.map(row => row.map(hex => hexToCode.get(hex)));
  
  return {
    grid: codeGrid,
    colorMap: codeToHex,
    colorCounts: codeCounts,
    numColors: sortedColors.length
  };
}

// ============================================
// UI RENDERING
// ============================================

let currentResult = null;
let showCodes = true;
let showGridLines = true;
let aspectLinked = true;
let imageAspectRatio = null;
let lastEditedDimension = 'width';
let meshCount = 18;
let unitMode = 'inches'; // 'inches' or 'stitches'
let currentProjectId = null;
let selectedLegendCode = null;
let completedCells = new Set();
let actionHistory = [];
const MAX_UNDO_HISTORY = 500;
let interactionMode = 'progress';
let paintColorCode = '1';
let updatePaintControls = null;

function trackProductEvent(eventName, properties = {}, projectId = currentProjectId) {
  window.NeedlepointAnalytics?.track(eventName, properties, projectId);
}

function fileTypeForAnalytics(file) {
  const type = file?.type?.toLowerCase() || '';
  if (type.includes('jpeg') || type.includes('jpg')) return 'jpeg';
  if (type.includes('png')) return 'png';
  if (type.includes('webp')) return 'webp';
  if (type.includes('gif')) return 'gif';
  if (type.includes('heic') || type.includes('heif')) return 'heic';
  return 'other';
}

function megapixelsBucket(width, height) {
  const megapixels = (width * height) / 1_000_000;
  if (megapixels < 1) return 'under_1';
  if (megapixels < 5) return '1_to_5';
  if (megapixels < 12) return '5_to_12';
  return 'over_12';
}

function durationBucket(durationMs) {
  if (durationMs < 1_000) return 'under_1s';
  if (durationMs < 3_000) return '1_to_3s';
  if (durationMs < 10_000) return '3_to_10s';
  return 'over_10s';
}

// Size presets for common needlepoint projects (in stitches at 18 mesh)
const SIZE_PRESETS = [
  { name: 'Coaster', width: 72, height: 72 },
  { name: 'Ornament', width: 54, height: 72 },
  { name: 'Pillow', width: 144, height: 144 },
  { name: 'Wall Art', width: 108, height: 144 }
];

// Convert stitches to inches based on current mesh count
function stitchesToInches(stitches) {
  return Math.round((stitches / meshCount) * 10) / 10;
}

// Convert inches to stitches based on current mesh count
function inchesToStitches(inches) {
  return Math.round(inches * meshCount);
}

// Find the preset that best matches the image aspect ratio
function findBestPreset(imgAspectRatio) {
  let bestPreset = null;
  let bestDiff = Infinity;
  
  for (const preset of SIZE_PRESETS) {
    const presetAspect = preset.width / preset.height;
    const diff = Math.abs(imgAspectRatio - presetAspect);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestPreset = preset;
    }
  }
  
  return bestPreset;
}

// Estimate color complexity by sampling the image
function estimateColorComplexity(img) {
  const canvas = document.createElement('canvas');
  const size = 50; // Sample at 50x50 for speed
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  ctx.drawImage(img, 0, 0, size, size);
  const imageData = ctx.getImageData(0, 0, size, size);
  const data = imageData.data;
  
  // Count unique colors (quantized to reduce noise)
  const colorSet = new Set();
  for (let i = 0; i < data.length; i += 4) {
    // Quantize to 32 levels per channel to group similar colors
    const r = Math.floor(data[i] / 8);
    const g = Math.floor(data[i + 1] / 8);
    const b = Math.floor(data[i + 2] / 8);
    colorSet.add(`${r},${g},${b}`);
  }
  
  const uniqueColors = colorSet.size;
  
  // Map unique colors to suggested max colors
  if (uniqueColors < 30) return 10;
  if (uniqueColors < 60) return 15;
  if (uniqueColors < 100) return 20;
  if (uniqueColors < 150) return 25;
  return 30;
}

function getTextColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000' : '#fff';
}

function updateCellAccessibility(cell, rowIdx, colIdx, code, hex, isCompleted) {
  if (!cell) return;
  cell.setAttribute('role', 'gridcell');
  cell.setAttribute(
    'aria-label',
    `Row ${rowIdx + 1}, column ${colIdx + 1}, color ${code} ${hex}${isCompleted ? ', completed' : ''}`
  );
}

function renderGrid(cellSize) {
  if (!currentResult) return;
  
  const gridEl = document.getElementById('grid');
  const { grid, colorMap } = currentResult;
  const cols = grid[0].length;
  
  gridEl.innerHTML = '';
  gridEl.setAttribute('role', 'grid');
  gridEl.setAttribute('aria-label', 'Needlepoint stitch grid');
  gridEl.setAttribute('aria-rowcount', String(grid.length));
  gridEl.setAttribute('aria-colcount', String(cols));
  gridEl.style.gridTemplateColumns = `repeat(${cols}, ${cellSize}px)`;
  
  grid.forEach((row, rowIdx) => {
    row.forEach((code, colIdx) => {
      const cell = document.createElement('div');
      const cellIndex = rowIdx * cols + colIdx;
      cell.className = 'cell' + (showCodes ? ' show-codes' : '');
      cell.style.backgroundColor = colorMap[code];
      cell.style.color = getTextColor(colorMap[code]);
      cell.style.width = cellSize + 'px';
      cell.style.height = cellSize + 'px';
      cell.style.borderWidth = showGridLines ? '1px' : '0';
      cell.dataset.code = code;
      cell.dataset.index = cellIndex.toString();
      cell.tabIndex = cellIndex === 0 ? 0 : -1;
      
      if (completedCells.has(cellIndex)) {
        cell.classList.add('completed');
      }
      
      if (selectedLegendCode) {
        if (code === selectedLegendCode) {
          cell.classList.add('highlight');
        } else {
          cell.classList.add('dimmed');
        }
      }
      if (showCodes) cell.textContent = code;
      cell.title = `Row ${rowIdx + 1}, Col ${colIdx + 1}\n${code}: ${colorMap[code]}`;
      updateCellAccessibility(cell, rowIdx, colIdx, code, colorMap[code], completedCells.has(cellIndex));
      gridEl.appendChild(cell);
    });
  });
  updateProgressSummary();
}

function fitGridToWidth() {
  if (!currentResult?.grid?.length) return;

  const gridWrapper = document.getElementById('gridWrapper');
  const cellSizeInput = document.getElementById('cellSize');
  const cellSizeVal = document.getElementById('cellSizeVal');
  const toggleCodesBtn = document.getElementById('toggleCodes');
  const cols = currentResult.grid[0].length;
  const wrapperStyles = window.getComputedStyle(gridWrapper);
  const horizontalPadding = parseFloat(wrapperStyles.paddingLeft) + parseFloat(wrapperStyles.paddingRight);
  const canvasFrame = 24;
  const availableWidth = Math.max(0, gridWrapper.clientWidth - horizontalPadding - canvasFrame);
  const fittedSize = Math.max(4, Math.min(30, Math.floor(availableWidth / cols)));

  if (fittedSize < 8 && showCodes) {
    showCodes = false;
    toggleCodesBtn.textContent = 'Show codes';
  }

  cellSizeInput.value = fittedSize;
  cellSizeVal.textContent = `${fittedSize}px`;
  renderGrid(fittedSize);
  gridWrapper.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
}

function updateProgressSummary() {
  if (!currentResult?.grid?.length) return;
  const total = currentResult.grid.length * currentResult.grid[0].length;
  const complete = completedCells.size;
  const percent = total ? Math.round((complete / total) * 100) : 0;
  const remaining = Math.max(0, total - complete);
  const ring = document.getElementById('progressRing');
  const percentEl = document.getElementById('progressPercent');
  const remainingEl = document.getElementById('remainingStitches');
  const completeEl = document.getElementById('completedStitches');
  const fill = document.getElementById('progressTrackFill');
  if (ring) {
    ring.style.setProperty('--progress', `${percent}%`);
    ring.setAttribute('aria-valuenow', String(percent));
  }
  if (percentEl) percentEl.textContent = `${percent}%`;
  if (remainingEl) remainingEl.textContent = remaining.toLocaleString();
  if (completeEl) completeEl.textContent = `${complete.toLocaleString()} of ${total.toLocaleString()} stitches marked`;
  if (fill) fill.style.width = `${percent}%`;
}

function renderLegend() {
  if (!currentResult) return;
  
  const legendEl = document.getElementById('legend');
  const { colorMap, colorCounts } = currentResult;
  
  legendEl.innerHTML = '';
  
  // Sort by code number
  const codes = Object.keys(colorMap).sort((a, b) => {
    return parseInt(a) - parseInt(b);
  });
  
  for (const code of codes) {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.dataset.code = code;
    if (selectedLegendCode === code) {
      item.classList.add('active');
    }
    item.innerHTML = `
      <label class="legend-swatch-control" title="Change color ${code}">
        <span class="sr-only">Change color ${code}</span>
        <input class="legend-color-picker" type="color" value="${colorMap[code]}" data-code="${code}" aria-label="Change color ${code}, currently ${colorMap[code]}">
        <span class="legend-edit-mark" aria-hidden="true">✎</span>
      </label>
      <button class="legend-focus" type="button" data-code="${code}" aria-pressed="${selectedLegendCode === code}" aria-label="Focus color ${code}, ${colorMap[code]}">
        <span class="legend-info">
          <strong>${code}</strong>
          <span class="hex">${colorMap[code]}</span>
          <span class="count">${colorCounts[code]} stitches</span>
        </span>
      </button>
    `;
    legendEl.appendChild(item);
  }
  
  if (typeof updatePaintControls === 'function') {
    updatePaintControls();
  }
}

function showStatus(message, type) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = 'status visible ' + type;
}

function hideStatus() {
  document.getElementById('status').className = 'status';
}

// ============================================
// CSV GENERATION
// ============================================

function generateGridCSV() {
  if (!currentResult) return '';
  
  const { grid } = currentResult;
  const cols = grid[0].length;
  
  let csv = 'row,' + Array.from({ length: cols }, (_, i) => `c${String(i + 1).padStart(2, '0')}`).join(',') + '\n';
  
  grid.forEach((row, idx) => {
    csv += `r${String(idx + 1).padStart(2, '0')},${row.join(',')}\n`;
  });
  
  return csv;
}

function generateLegendCSV() {
  if (!currentResult) return '';
  
  const { colorMap, colorCounts } = currentResult;
  let csv = 'code,hex,pixel_count\n';
  
  const codes = Object.keys(colorMap).sort((a, b) => {
    return parseInt(a) - parseInt(b);
  });
  
  for (const code of codes) {
    csv += `${code},${colorMap[code]},${colorCounts[code]}\n`;
  }
  
  return csv;
}

function downloadCSV(content, filename) {
  const blob = new Blob([content], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error('Could not create the PNG file.'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.hidden = true;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadCanvasPng(canvas, filename) {
  const blob = await canvasToPngBlob(canvas);
  downloadBlob(blob, filename);
  return blob.size;
}

function renderGridToCanvas(cellSize, options = {}) {
  if (!currentResult) return null;
  
  const { grid, colorMap } = currentResult;
  const rows = grid.length;
  const cols = grid[0].length;
  const includeGridLines = options.includeGridLines ?? showGridLines;
  const includeCodes = options.includeCodes ?? showCodes;
  
  const canvas = document.createElement('canvas');
  canvas.width = cols * cellSize;
  canvas.height = rows * cellSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  
  grid.forEach((row, rowIdx) => {
    row.forEach((code, colIdx) => {
      const x = colIdx * cellSize;
      const y = rowIdx * cellSize;
      
      // Fill cell with color
      ctx.fillStyle = colorMap[code];
      ctx.fillRect(x, y, cellSize, cellSize);
      
      // Draw grid lines
      if (includeGridLines) {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1);
      }
      
      // Draw codes if enabled
      if (includeCodes) {
        const hex = colorMap[code];
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        ctx.fillStyle = luminance > 0.5 ? '#000' : '#fff';
        ctx.font = `bold ${Math.max(6, cellSize * 0.4)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(code, x + cellSize / 2, y + cellSize / 2);
      }
    });
  });
  
  return canvas;
}

// ============================================
// PROJECT STORAGE
// ============================================

const STORAGE_KEY = 'needlepoint_projects';
const SIDEBAR_COLLAPSED_KEY = 'needlepoint_sidebar_collapsed';

function getProjects() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

function saveProjects(projects) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    return true;
  } catch (e) {
    console.error('Failed to save projects:', e);
    return false;
  }
}

function addProject(project) {
  const projects = getProjects();
  // Add to beginning (newest first)
  projects.unshift(project);
  // Limit to 20 projects to avoid storage limits
  while (projects.length > 20) {
    projects.pop();
  }
  
  // Try to save, if it fails due to quota, remove oldest projects
  let saved = saveProjects(projects);
  while (!saved && projects.length > 1) {
    projects.pop(); // Remove oldest
    saved = saveProjects(projects);
  }
  
  if (!saved) {
    console.error('Could not save project - storage full');
    showStatus('Warning: Could not save to history (storage full)', 'error');
  }
  
  renderProjectList();
}

function deleteProject(id) {
  const projects = getProjects();
  const project = projects.find(p => p.id === id);
  const name = project?.name || 'this project';
  if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
  
  const nextProjects = projects.filter(p => p.id !== id);
  saveProjects(nextProjects);
  renderProjectList();
}

function renderProjectList() {
  const listEl = document.getElementById('projectList');
  const projects = getProjects();
  
  listEl.innerHTML = '';
  
  if (projects.length === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'sidebar-empty';
    emptyEl.textContent = 'No projects yet';
    listEl.appendChild(emptyEl);
    return;
  }
  
  projects.forEach(project => {
    const item = document.createElement('div');
    item.className = 'project-item';
    item.dataset.id = project.id;

    const openBtn = document.createElement('button');
    openBtn.className = 'project-open';
    
    const thumb = document.createElement('img');
    thumb.className = 'project-thumb';
    thumb.src = project.thumbnail;
    thumb.alt = project.name;
    
    const info = document.createElement('div');
    info.className = 'project-info';
    
    const name = document.createElement('div');
    name.className = 'project-name';
    name.textContent = project.name;
    name.title = project.name;
    
    const date = document.createElement('div');
    date.className = 'project-date';
    const projectTotal = project.grid?.length && project.grid[0]?.length
      ? project.grid.length * project.grid[0].length
      : 0;
    const projectProgress = projectTotal
      ? Math.round(((project.completedCells?.length || 0) / projectTotal) * 100)
      : 0;
    date.textContent = `${projectProgress}% complete`;
    date.title = `Saved ${new Date(project.timestamp).toLocaleDateString()}`;
    
    info.appendChild(name);
    info.appendChild(date);
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'project-delete';
    deleteBtn.innerHTML = '×';
    deleteBtn.title = 'Delete project';
    deleteBtn.setAttribute('aria-label', `Delete ${project.name}`);
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      deleteProject(project.id);
    };
    
    openBtn.appendChild(thumb);
    openBtn.appendChild(info);
    openBtn.setAttribute('aria-label', `Open ${project.name}, ${projectProgress}% complete`);
    openBtn.onclick = () => loadProject(project);

    item.appendChild(openBtn);
    item.appendChild(deleteBtn);
    
    listEl.appendChild(item);
  });
}

function loadProject(project) {
  // Restore the project data
  currentResult = {
    grid: project.grid,
    colorMap: project.colorMap,
    colorCounts: project.colorCounts,
    numColors: Object.keys(project.colorMap).length
  };
  selectedLegendCode = null;
  completedCells = new Set(project.completedCells || []);
  actionHistory = [];
  
  // Set current project ID for editing
  currentProjectId = project.id;
  trackProductEvent('project_opened', { source: 'sidebar' }, project.id);
  
  // Restore mesh count if available
  if (project.meshCount) {
    meshCount = project.meshCount;
  }
  
  // Update UI with pattern info
  const height = project.grid.length;
  const width = project.grid[0].length;
  const projectMesh = project.meshCount || 18;
  const widthInches = Math.round((width / projectMesh) * 10) / 10;
  const heightInches = Math.round((height / projectMesh) * 10) / 10;
  document.getElementById('patternInfo').textContent = 
    `${height} rows × ${width} columns (${widthInches}" × ${heightInches}" at ${projectMesh} mesh) • ${currentResult.numColors} colors`;
  document.getElementById('patternTitle').textContent = project.name || 'Needlepoint canvas';
  
  // Hide upload section, show result sections
  document.querySelector('.upload-section').classList.add('hidden');
  document.getElementById('controls').classList.add('visible');
  document.getElementById('resultSection').classList.add('visible');
  document.getElementById('downloadSection').classList.add('visible');
  
  // Show/hide edit button based on whether original image is available
  const editBtn = document.getElementById('editProjectBtn');
  if (project.originalImage) {
    editBtn.style.display = '';
  } else {
    editBtn.style.display = 'none';
  }
  
  renderGrid(parseInt(document.getElementById('cellSize').value));
  renderLegend();
  
  // Highlight active project
  document.querySelectorAll('.project-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === project.id);
  });
}

// ============================================
// EVENT HANDLERS
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  const imageInput = document.getElementById('imageInput');
  const convertBtn = document.getElementById('convertBtn');
  const cellSizeInput = document.getElementById('cellSize');
  const cellSizeVal = document.getElementById('cellSizeVal');
  const fitCanvasBtn = document.getElementById('fitCanvas');
  const toggleCodesBtn = document.getElementById('toggleCodes');
  const toggleGridBtn = document.getElementById('toggleGrid');
  const downloadGridBtn = document.getElementById('downloadGrid');
  const downloadLegendBtn = document.getElementById('downloadLegend');
  const downloadPngBtn = document.getElementById('downloadPng');
  const downloadGridImageBtn = document.getElementById('downloadGridImage');
  const shareGridImageBtn = document.getElementById('shareGridImage');
  const newProjectBtn = document.getElementById('newProjectBtn');
  const legendEl = document.getElementById('legend');
  const gridEl = document.getElementById('grid');
  const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
  const sidebarEl = document.getElementById('sidebar');
  const colorContextMenu = document.getElementById('colorContextMenu');
  const progressModeBtn = document.getElementById('progressModeBtn');
  const paintModeBtn = document.getElementById('paintModeBtn');
  const paintControls = document.getElementById('paintControls');
  const paintColorLabel = document.getElementById('paintColorLabel');
  const paintSwatch = document.getElementById('paintSwatch');
  const researchDock = document.getElementById('researchDock');
  const intentPrompt = document.getElementById('intentPrompt');
  const outcomePrompt = document.getElementById('outcomePrompt');
  const feedbackDialog = document.getElementById('feedbackDialog');
  const privacyDialog = document.getElementById('privacyDialog');
  const privacyHeroBtn = document.getElementById('privacyHeroBtn');
  const continueStitchingBtn = document.getElementById('continueStitchingBtn');
  
  let loadedImage = null;
  let currentFileName = 'Untitled';
  let conversionStartedAt = 0;
  
  const heightInput = document.getElementById('heightInput');
  const widthInput = document.getElementById('widthInput');
  const widthLabel = document.getElementById('widthLabel');
  const heightLabel = document.getElementById('heightLabel');
  const aspectLinkCheckbox = document.getElementById('aspectLinkCheckbox');
  const colorsInput = document.getElementById('colorsInput');
  const editProjectBtn = document.getElementById('editProjectBtn');
  
  // Mesh and unit elements
  const meshBtns = document.querySelectorAll('.mesh-btn');
  const unitBtns = document.querySelectorAll('.unit-btn');
  
  // File upload elements
  const fileDropzone = document.getElementById('fileDropzone');
  const imageSelectedRow = document.getElementById('imageSelectedRow');
  const imagePreview = document.getElementById('imagePreview');
  const previewImg = document.getElementById('previewImg');
  const selectedFilename = document.getElementById('selectedFilename');
  const changeFileBtn = document.getElementById('changeFileBtn');
  
  // Click on dropzone triggers file input
  fileDropzone.addEventListener('click', () => {
    imageInput.click();
  });

  fileDropzone.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    imageInput.click();
  });
  
  // Change file button triggers file input
  changeFileBtn.addEventListener('click', () => {
    imageInput.click();
  });
  
  // Drag and drop handlers
  fileDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    fileDropzone.classList.add('dragover');
  });
  
  fileDropzone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    e.stopPropagation();
    fileDropzone.classList.add('dragover');
  });
  
  fileDropzone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    fileDropzone.classList.remove('dragover');
  });
  
  fileDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    fileDropzone.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type.startsWith('image/')) {
      // Create a new FileList-like object and assign to input
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(files[0]);
      imageInput.files = dataTransfer.files;
      
      // Trigger the change event manually
      imageInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  
  // Step group elements
  const presetsStep = document.getElementById('presetsStep');
  const meshStep = document.getElementById('meshStep');
  const dimensionsStep = document.getElementById('dimensionsStep');
  const colorsStep = document.getElementById('colorsStep');
  const convertStep = document.getElementById('convertStep');
  const presetBtns = document.querySelectorAll('.preset-btn');
  
  // Select a preset and update dimensions
  function selectPreset(btn) {
    // Update active state
    presetBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    // If it's not the custom preset, update dimensions
    if (!btn.hasAttribute('data-preset')) {
      const heightStitches = parseInt(btn.dataset.height);
      const widthStitches = parseInt(btn.dataset.width);
      
      // Convert to current unit mode
      if (unitMode === 'inches') {
        widthInput.value = stitchesToInches(widthStitches);
        heightInput.value = stitchesToInches(heightStitches);
      } else {
        widthInput.value = widthStitches;
        heightInput.value = heightStitches;
      }
      
      // If aspect linked, recalculate based on image aspect ratio
      if (aspectLinked && imageAspectRatio) {
        lastEditedDimension = 'width';
        recalculateDimensions();
      } else {
        heightInput.classList.remove('auto-calculated');
        widthInput.classList.remove('auto-calculated');
      }
    }
  }
  
  // Mark custom preset as active when user edits dimensions
  function markCustomPreset() {
    presetBtns.forEach(b => b.classList.remove('active'));
    const customBtn = document.querySelector('.preset-btn[data-preset="custom"]');
    if (customBtn) customBtn.classList.add('active');
  }
  
  // Preset button click handlers
  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => selectPreset(btn));
  });
  
  // Helper to clamp value between min and max
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
  
  // Recalculate dimensions based on aspect ratio and last edited field
  function recalculateDimensions() {
    if (!imageAspectRatio) return;
    
    const height = parseFloat(heightInput.value) || 4;
    const width = parseFloat(widthInput.value) || 4;
    
    // Set min/max based on unit mode
    const minVal = unitMode === 'inches' ? 1 : 10;
    const maxVal = unitMode === 'inches' ? 20 : 360;
    
    if (lastEditedDimension === 'height') {
      // Height is the driver, calculate width
      let newWidth = height * imageAspectRatio;
      if (unitMode === 'inches') {
        newWidth = Math.round(newWidth * 10) / 10; // Round to 1 decimal
      } else {
        newWidth = Math.round(newWidth);
      }
      newWidth = clamp(newWidth, minVal, maxVal);
      widthInput.value = newWidth;
      widthInput.classList.add('auto-calculated');
      heightInput.classList.remove('auto-calculated');
    } else {
      // Width is the driver, calculate height
      let newHeight = width / imageAspectRatio;
      if (unitMode === 'inches') {
        newHeight = Math.round(newHeight * 10) / 10; // Round to 1 decimal
      } else {
        newHeight = Math.round(newHeight);
      }
      newHeight = clamp(newHeight, minVal, maxVal);
      heightInput.value = newHeight;
      heightInput.classList.add('auto-calculated');
      widthInput.classList.remove('auto-calculated');
    }
  }
  
  // Height input handler
  heightInput.addEventListener('input', () => {
    lastEditedDimension = 'height';
    markCustomPreset();
    if (aspectLinked && imageAspectRatio) {
      recalculateDimensions();
    } else {
      heightInput.classList.remove('auto-calculated');
    }
  });
  
  // Width input handler
  widthInput.addEventListener('input', () => {
    lastEditedDimension = 'width';
    markCustomPreset();
    if (aspectLinked && imageAspectRatio) {
      recalculateDimensions();
    } else {
      widthInput.classList.remove('auto-calculated');
    }
  });
  
  // Load existing projects on startup
  renderProjectList();
  
  // Aspect ratio checkbox handler
  aspectLinkCheckbox.addEventListener('change', () => {
    aspectLinked = aspectLinkCheckbox.checked;
    
    if (aspectLinked && imageAspectRatio) {
      recalculateDimensions();
    } else {
      heightInput.classList.remove('auto-calculated');
      widthInput.classList.remove('auto-calculated');
    }
  });
  
  // Update preset button labels based on current mesh count
  function updatePresetLabels() {
    presetBtns.forEach(btn => {
      if (btn.hasAttribute('data-preset')) return; // Skip custom button
      
      const name = btn.dataset.name;
      const widthStitches = parseInt(btn.dataset.width);
      const heightStitches = parseInt(btn.dataset.height);
      const widthInches = Math.round((widthStitches / meshCount) * 10) / 10;
      const heightInches = Math.round((heightStitches / meshCount) * 10) / 10;
      const sizeLabel = btn.querySelector('.preset-size');
      if (sizeLabel) {
        sizeLabel.textContent = `${widthInches} × ${heightInches} in`;
        btn.setAttribute('aria-label', `${name}, ${widthInches} by ${heightInches} inches`);
      }
    });
  }
  
  // Update preset buttons based on image aspect ratio - disable non-matching ones
  function updatePresetAvailability() {
    const presetNote = document.getElementById('presetNote');
    
    if (!imageAspectRatio) {
      // No image loaded, enable all presets
      presetBtns.forEach(btn => {
        btn.disabled = false;
      });
      presetNote.classList.remove('visible');
      return null;
    }
    
    const tolerance = 0.15; // 15% tolerance
    let bestMatch = null;
    let bestDiff = Infinity;
    let hasDisabled = false;
    
    presetBtns.forEach(btn => {
      if (btn.hasAttribute('data-preset')) {
        // Custom button is always enabled
        btn.disabled = false;
        return;
      }
      
      const presetWidth = parseInt(btn.dataset.width);
      const presetHeight = parseInt(btn.dataset.height);
      const presetAspect = presetWidth / presetHeight;
      const aspectDiff = Math.abs(imageAspectRatio - presetAspect) / presetAspect;
      
      if (aspectDiff <= tolerance) {
        btn.disabled = false;
        // Track the best matching preset
        if (aspectDiff < bestDiff) {
          bestDiff = aspectDiff;
          bestMatch = btn;
        }
      } else {
        btn.disabled = true;
        hasDisabled = true;
      }
    });
    
    // Show/hide the note about disabled presets
    if (hasDisabled) {
      presetNote.classList.add('visible');
    } else {
      presetNote.classList.remove('visible');
    }
    
    return bestMatch;
  }
  
  // Select Custom preset with reasonable dimensions based on image
  function selectCustomWithDefaults() {
    const customBtn = document.querySelector('.preset-btn[data-preset="custom"]');
    if (customBtn) {
      presetBtns.forEach(b => b.classList.remove('active'));
      customBtn.classList.add('active');
    }
    
    // Set reasonable default dimensions based on image aspect ratio
    // Target approximately 4 inches on the shorter side at 18 mesh
    const targetShortSide = 4; // inches
    
    if (unitMode === 'inches') {
      if (imageAspectRatio >= 1) {
        // Landscape or square
        heightInput.value = targetShortSide;
        widthInput.value = Math.round(targetShortSide * imageAspectRatio * 10) / 10;
      } else {
        // Portrait
        widthInput.value = targetShortSide;
        heightInput.value = Math.round(targetShortSide / imageAspectRatio * 10) / 10;
      }
    } else {
      const targetStitches = inchesToStitches(targetShortSide);
      if (imageAspectRatio >= 1) {
        heightInput.value = targetStitches;
        widthInput.value = Math.round(targetStitches * imageAspectRatio);
      } else {
        widthInput.value = targetStitches;
        heightInput.value = Math.round(targetStitches / imageAspectRatio);
      }
    }
    
    heightInput.classList.remove('auto-calculated');
    widthInput.classList.remove('auto-calculated');
  }
  
  // Mesh button handlers
  meshBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const oldMesh = meshCount;
      meshCount = parseInt(btn.dataset.mesh);
      meshBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Update preset labels with new mesh count
      updatePresetLabels();
      
      // If in inches mode, no need to recalculate displayed values
      // If in stitches mode, convert current values to new mesh equivalent
      if (unitMode === 'stitches' && oldMesh !== meshCount) {
        // Keep the physical size the same, update stitch counts
        const currentWidthInches = parseInt(widthInput.value) / oldMesh;
        const currentHeightInches = parseInt(heightInput.value) / oldMesh;
        widthInput.value = Math.round(currentWidthInches * meshCount);
        heightInput.value = Math.round(currentHeightInches * meshCount);
      }
    });
  });
  
  // Update dimension labels based on unit mode
  function updateDimensionLabels() {
    if (unitMode === 'inches') {
      widthLabel.textContent = 'Width (inches)';
      heightLabel.textContent = 'Height (inches)';
      widthInput.step = '0.5';
      heightInput.step = '0.5';
      widthInput.min = '1';
      heightInput.min = '1';
      widthInput.max = '20';
      heightInput.max = '20';
    } else {
      widthLabel.textContent = 'Width (stitches)';
      heightLabel.textContent = 'Height (stitches)';
      widthInput.step = '1';
      heightInput.step = '1';
      widthInput.min = '10';
      heightInput.min = '10';
      widthInput.max = '360';
      heightInput.max = '360';
    }
  }
  
  // Unit toggle handlers
  unitBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const newUnit = btn.dataset.unit;
      if (newUnit === unitMode) return;
      
      // Convert current values
      const currentWidth = parseFloat(widthInput.value) || 4;
      const currentHeight = parseFloat(heightInput.value) || 4;
      
      if (newUnit === 'inches') {
        // Converting from stitches to inches
        widthInput.value = stitchesToInches(currentWidth);
        heightInput.value = stitchesToInches(currentHeight);
      } else {
        // Converting from inches to stitches
        widthInput.value = inchesToStitches(currentWidth);
        heightInput.value = inchesToStitches(currentHeight);
      }
      
      unitMode = newUnit;
      unitBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateDimensionLabels();
    });
  });
  
  newProjectBtn.addEventListener('click', () => {
    // Reset everything for a new project
    imageInput.value = '';
    loadedImage = null;
    currentFileName = 'Untitled';
    currentResult = null;
    currentProjectId = null;
    selectedLegendCode = null;
    completedCells = new Set();
    actionHistory = [];
    interactionMode = 'progress';
    paintColorCode = '1';
    convertBtn.disabled = true;
    imageAspectRatio = null;
    
    // Hide all step groups
    presetsStep.classList.remove('visible');
    meshStep.classList.remove('visible');
    dimensionsStep.classList.remove('visible');
    colorsStep.classList.remove('visible');
    convertStep.classList.remove('visible');
    
    // Clear preset selection and reset disabled states
    presetBtns.forEach(b => {
      b.classList.remove('active');
      b.disabled = false;
    });
    document.getElementById('presetNote').classList.remove('visible');
    
    // Reset to dropzone state
    imageSelectedRow.classList.remove('visible');
    previewImg.src = '';
    selectedFilename.textContent = '';
    fileDropzone.classList.remove('hidden');
    
    // Show upload section, hide result sections
    document.querySelector('.upload-section').classList.remove('hidden');
    document.getElementById('controls').classList.remove('visible');
    document.getElementById('resultSection').classList.remove('visible');
    document.getElementById('downloadSection').classList.remove('visible');
    hideResearchPrompts();
    
    // Clear content
    document.getElementById('grid').innerHTML = '';
    document.getElementById('legend').innerHTML = '';
    document.getElementById('patternTitle').textContent = 'Needlepoint canvas';
    
    // Clear active project highlight
    document.querySelectorAll('.project-item').forEach(el => el.classList.remove('active'));
  });

  function setSidebarCollapsed(isCollapsed) {
    if (!sidebarEl || !sidebarToggleBtn) return;
    sidebarEl.classList.toggle('collapsed', isCollapsed);
    sidebarToggleBtn.setAttribute('aria-label', isCollapsed ? 'Expand sidebar' : 'Collapse sidebar');
    const labelSpan = sidebarToggleBtn.querySelector('span');
    if (labelSpan) labelSpan.textContent = isCollapsed ? 'Expand' : 'Collapse';
    updateModeBarOffset();
    setTimeout(updateModeBarOffset, 220);
  }
  
  if (sidebarToggleBtn) {
    const storedCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (storedCollapsed === 'true') {
      setSidebarCollapsed(true);
    }
    
    sidebarToggleBtn.addEventListener('click', () => {
      const isCollapsed = !sidebarEl.classList.contains('collapsed');
      setSidebarCollapsed(isCollapsed);
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(isCollapsed));
    });
  }

  function updateModeBarOffset() {
    const root = document.documentElement;
    if (!sidebarEl) {
      root.style.setProperty('--sidebar-offset', '0px');
      return;
    }
    if (window.innerWidth <= 768) {
      root.style.setProperty('--sidebar-offset', '0px');
      return;
    }
    const sidebarWidth = sidebarEl.getBoundingClientRect().width;
    root.style.setProperty('--sidebar-offset', `${sidebarWidth}px`);
  }

  updateModeBarOffset();
  window.addEventListener('resize', updateModeBarOffset);
  if (sidebarEl) {
    sidebarEl.addEventListener('transitionend', (e) => {
      if (e.propertyName === 'width') {
        updateModeBarOffset();
      }
    });
  }
  
  imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) {
      convertBtn.disabled = true;
      return;
    }
    
    // Hide step groups (will be revealed after image loads)
    presetsStep.classList.remove('visible');
    meshStep.classList.remove('visible');
    dimensionsStep.classList.remove('visible');
    colorsStep.classList.remove('visible');
    convertStep.classList.remove('visible');
    presetBtns.forEach(b => b.classList.remove('active'));
    convertBtn.disabled = true;
    currentProjectId = null;
    selectedLegendCode = null;
    completedCells = new Set();
    actionHistory = [];
    interactionMode = 'progress';
    paintColorCode = '1';
    
    // Reset UI - hide results until convert is clicked
    document.getElementById('controls').classList.remove('visible');
    document.getElementById('resultSection').classList.remove('visible');
    document.getElementById('downloadSection').classList.remove('visible');
    document.getElementById('grid').innerHTML = '';
    document.getElementById('legend').innerHTML = '';
    currentResult = null;
    
    // Clear active project highlight
    document.querySelectorAll('.project-item').forEach(el => el.classList.remove('active'));
    
    // Capture filename
    currentFileName = file.name.replace(/\.[^/.]+$/, '') || 'Untitled';
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        loadedImage = img;
        loadedImage.dataUrl = event.target.result; // Store for saving
        trackProductEvent('image_selected', {
          fileType: fileTypeForAnalytics(file),
          megapixelsBucket: megapixelsBucket(img.width, img.height)
        }, null);
        
        // Calculate and store aspect ratio (width / height)
        imageAspectRatio = img.width / img.height;
        
        // Update preset availability based on image aspect ratio
        const bestMatchingPreset = updatePresetAvailability();
        
        if (bestMatchingPreset) {
          // Set dimensions from the best matching preset
          const presetWidth = parseInt(bestMatchingPreset.dataset.width);
          const presetHeight = parseInt(bestMatchingPreset.dataset.height);
          
          if (unitMode === 'inches') {
            widthInput.value = stitchesToInches(presetWidth);
            heightInput.value = stitchesToInches(presetHeight);
          } else {
            widthInput.value = presetWidth;
            heightInput.value = presetHeight;
          }
          
          // If aspect linked, adjust for actual image aspect ratio
          if (aspectLinked) {
            lastEditedDimension = 'width';
            recalculateDimensions();
          }
        } else {
          // No matching presets, will select custom with defaults
          selectCustomWithDefaults();
        }
        
        // Estimate color complexity and set default
        const suggestedColors = estimateColorComplexity(img);
        colorsInput.value = suggestedColors;
        
        // Switch from dropzone to selected state
        fileDropzone.classList.add('hidden');
        previewImg.src = event.target.result;
        selectedFilename.textContent = currentFileName;
        imageSelectedRow.classList.add('visible');
        
        // Reveal steps sequentially with delays
        setTimeout(() => {
          presetsStep.classList.add('visible');
          // Auto-select best matching preset or custom
          presetBtns.forEach(b => b.classList.remove('active'));
          if (bestMatchingPreset) {
            bestMatchingPreset.classList.add('active');
          } else {
            const customBtn = document.querySelector('.preset-btn[data-preset="custom"]');
            if (customBtn) customBtn.classList.add('active');
          }
        }, 100);
        
        setTimeout(() => {
          meshStep.classList.add('visible');
        }, 200);
        
        setTimeout(() => {
          dimensionsStep.classList.add('visible');
        }, 300);
        
        setTimeout(() => {
          colorsStep.classList.add('visible');
        }, 450);
        
        setTimeout(() => {
          convertStep.classList.add('visible');
          convertBtn.disabled = false;
        }, 600);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
  
  convertBtn.addEventListener('click', () => {
    if (!loadedImage) return;
    
    // Get dimensions and convert to stitches if in inches mode
    let heightVal = parseFloat(document.getElementById('heightInput').value) || 4;
    let widthVal = parseFloat(document.getElementById('widthInput').value) || 4;
    const maxColors = parseInt(document.getElementById('colorsInput').value) || 20;
    
    // Store original input values for saving
    const inputWidth = widthVal;
    const inputHeight = heightVal;
    
    // Convert to stitches if in inches mode
    let height, width;
    if (unitMode === 'inches') {
      width = inchesToStitches(widthVal);
      height = inchesToStitches(heightVal);
    } else {
      width = Math.round(widthVal);
      height = Math.round(heightVal);
    }
    
    showStatus('Processing image...', 'processing');
    convertBtn.disabled = true;
    conversionStartedAt = performance.now();
    const isEdit = Boolean(currentProjectId);
    const conversionAnalytics = {
      mesh: meshCount,
      widthStitches: width,
      heightStitches: height,
      maxColors,
      unitMode,
      isEdit
    };
    trackProductEvent('conversion_started', conversionAnalytics);
    
    // Use setTimeout to allow UI to update
    setTimeout(() => {
      try {
        currentResult = processImage(loadedImage, height, width, maxColors);
        selectedLegendCode = null;
        
        let preservedCompletedCells = [];
        if (currentProjectId) {
          const existingProject = getProjects().find(p => p.id === currentProjectId);
          if (existingProject && existingProject.grid) {
            const existingHeight = existingProject.grid.length;
            const existingWidth = existingProject.grid[0].length;
            if (existingHeight === height && existingWidth === width) {
              preservedCompletedCells = existingProject.completedCells || [];
            }
          }
        }
        completedCells = new Set(preservedCompletedCells);
        actionHistory = [];
        interactionMode = 'progress';
        
        // Update pattern info with both stitches and inches
        const widthInches = stitchesToInches(width);
        const heightInches = stitchesToInches(height);
        document.getElementById('patternInfo').textContent = 
          `${height} rows × ${width} columns (${widthInches}" × ${heightInches}" at ${meshCount} mesh) • ${currentResult.numColors} colors`;
        document.getElementById('patternTitle').textContent = currentFileName || 'Needlepoint canvas';
        
        // Hide upload section and show result sections
        document.querySelector('.upload-section').classList.add('hidden');
        document.getElementById('controls').classList.add('visible');
        document.getElementById('resultSection').classList.add('visible');
        document.getElementById('downloadSection').classList.add('visible');
        scrollWorkspaceToTop();
        
        // Show edit button (new conversions always have original image)
        editProjectBtn.style.display = '';
        
        // Render grid and legend
        renderGrid(parseInt(cellSizeInput.value));
        renderLegend();
        
        // Save project to local storage
        // Create a small thumbnail to save space (max 80x80, preserve aspect ratio)
        const thumbCanvas = document.createElement('canvas');
        const thumbSize = 80;
        const aspectRatio = loadedImage.width / loadedImage.height;
        if (aspectRatio > 1) {
          thumbCanvas.width = thumbSize;
          thumbCanvas.height = Math.round(thumbSize / aspectRatio);
        } else {
          thumbCanvas.height = thumbSize;
          thumbCanvas.width = Math.round(thumbSize * aspectRatio);
        }
        const thumbCtx = thumbCanvas.getContext('2d');
        thumbCtx.drawImage(loadedImage, 0, 0, thumbCanvas.width, thumbCanvas.height);
        
        // Create compressed original for editing (max 400px longest edge, preserve aspect ratio)
        const editCanvas = document.createElement('canvas');
        const maxEditSize = 400;
        const editScale = Math.min(maxEditSize / loadedImage.width, maxEditSize / loadedImage.height, 1);
        editCanvas.width = Math.round(loadedImage.width * editScale);
        editCanvas.height = Math.round(loadedImage.height * editScale);
        const editCtx = editCanvas.getContext('2d');
        editCtx.drawImage(loadedImage, 0, 0, editCanvas.width, editCanvas.height);
        
        const project = {
          id: currentProjectId || Date.now().toString(),
          name: currentFileName,
          timestamp: Date.now(),
          thumbnail: thumbCanvas.toDataURL('image/jpeg', 0.6),
          originalImage: editCanvas.toDataURL('image/jpeg', 0.7),
          quantizedImage: processingCanvas.toDataURL('image/jpeg', 0.8),
          grid: currentResult.grid,
          colorMap: currentResult.colorMap,
          colorCounts: currentResult.colorCounts,
          completedCells: [...completedCells],
          // Store settings for editing
          meshCount: meshCount,
          unitMode: unitMode,
          inputWidth: inputWidth,
          inputHeight: inputHeight,
          maxColors: maxColors
        };
        
        // If updating existing project, remove old one first
        if (currentProjectId) {
          const projects = getProjects().filter(p => p.id !== currentProjectId);
          saveProjects(projects);
        }
        
        currentProjectId = project.id;
        addProject(project);
        trackProductEvent('conversion_completed', {
          ...conversionAnalytics,
          colorCount: currentResult.numColors,
          durationBucket: durationBucket(performance.now() - conversionStartedAt)
        }, project.id);
        
        // Highlight the newly added project in sidebar
        document.querySelectorAll('.project-item').forEach(el => {
          el.classList.toggle('active', el.dataset.id === project.id);
        });
        
        showStatus('Conversion complete!', 'success');
        setTimeout(hideStatus, 2000);
      } catch (err) {
        showStatus('Error: ' + err.message, 'error');
        console.error(err);
        trackProductEvent('conversion_failed', {
          stage: 'processing',
          errorCode: 'processing_failed'
        });
      }
      
      convertBtn.disabled = false;
    }, 50);
  });
  
  cellSizeInput.addEventListener('input', () => {
    const size = cellSizeInput.value;
    cellSizeVal.textContent = size + 'px';
    renderGrid(parseInt(size));
  });

  fitCanvasBtn.addEventListener('click', fitGridToWidth);
  
  toggleCodesBtn.addEventListener('click', () => {
    showCodes = !showCodes;
    toggleCodesBtn.textContent = showCodes ? 'Hide Codes' : 'Show Codes';
    renderGrid(parseInt(cellSizeInput.value));
  });
  
  toggleGridBtn.addEventListener('click', () => {
    showGridLines = !showGridLines;
    renderGrid(parseInt(cellSizeInput.value));
  });
  
  downloadGridBtn.addEventListener('click', () => {
    const height = currentResult.grid.length;
    const width = currentResult.grid[0].length;
    const colors = currentResult.numColors;
    downloadCSV(generateGridCSV(), `needlepoint_grid_${height}x${width}_${colors}colors.csv`);
    recordExport('grid_csv');
  });
  
  downloadLegendBtn.addEventListener('click', () => {
    const height = currentResult.grid.length;
    const width = currentResult.grid[0].length;
    const colors = currentResult.numColors;
    downloadCSV(generateLegendCSV(), `needlepoint_legend_${height}x${width}_${colors}colors.csv`);
    recordExport('legend_csv');
  });
  
  downloadPngBtn.addEventListener('click', async () => {
    const height = currentResult.grid.length;
    const width = currentResult.grid[0].length;
    const colors = currentResult.numColors;
    const longestSide = Math.max(height, width);
    const previewCellSize = Math.max(2, Math.min(8, Math.floor(2048 / longestSide)));
    const canvas = renderGridToCanvas(previewCellSize, {
      includeGridLines: false,
      includeCodes: false
    });
    if (!canvas) return;
    try {
      await downloadCanvasPng(canvas, `needlepoint_preview_${height}x${width}_${colors}colors.png`);
      recordExport('preview_png');
    } catch (error) {
      showStatus(error.message, 'error');
    }
  });
  
  function gridImageFileMeta() {
    const cellSize = parseInt(cellSizeInput.value);
    const height = currentResult.grid.length;
    const width = currentResult.grid[0].length;
    const colors = currentResult.numColors;
    return {
      canvas: renderGridToCanvas(cellSize),
      filename: `needlepoint_grid_${height}x${width}_${colors}colors_${cellSize}px.png`
    };
  }

  downloadGridImageBtn.addEventListener('click', async () => {
    const image = gridImageFileMeta();
    if (!image.canvas) return;
    try {
      await downloadCanvasPng(image.canvas, image.filename);
      recordExport('grid_png');
    } catch (error) {
      showStatus(error.message, 'error');
    }
  });

  if (typeof navigator.share === 'function') {
    shareGridImageBtn.hidden = false;
  }
  const downloadMoreToggle = document.getElementById('downloadMoreToggle');
  const downloadSecondary = document.getElementById('downloadSecondary');
  const showExtraFormats = () => {
    const expand = window.matchMedia('(max-width: 768px)').matches
      ? downloadMoreToggle.getAttribute('aria-expanded') === 'true'
      : true;
    downloadSecondary.hidden = !expand;
  };
  downloadMoreToggle.addEventListener('click', () => {
    const next = downloadMoreToggle.getAttribute('aria-expanded') !== 'true';
    downloadMoreToggle.setAttribute('aria-expanded', String(next));
    downloadMoreToggle.textContent = next ? 'Hide extra formats' : 'CSV and preview';
    showExtraFormats();
  });
  window.matchMedia('(max-width: 768px)').addEventListener('change', showExtraFormats);
  showExtraFormats();
  shareGridImageBtn.addEventListener('click', async () => {
    const image = gridImageFileMeta();
    if (!image.canvas) return;
    try {
      const blob = await canvasToPngBlob(image.canvas);
      const file = new File([blob], image.filename, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Needlepoint pattern',
          text: 'A stitch chart from Needlepoint Maker'
        });
        recordExport('grid_share');
        return;
      }
      await downloadCanvasPng(image.canvas, image.filename);
      recordExport('grid_png');
    } catch (error) {
      if (error?.name === 'AbortError') return;
      showStatus(error.message || 'Could not share the pattern.', 'error');
    }
  });
  
  // Edit project button handler
  editProjectBtn.addEventListener('click', () => {
    // Find the current project to get settings
    const projects = getProjects();
    const project = projects.find(p => p.id === currentProjectId);
    
    if (!project || !project.originalImage) {
      showStatus('Cannot edit: original image not available', 'error');
      setTimeout(hideStatus, 3000);
      return;
    }
    
    // Load the original image
    const img = new Image();
    img.onload = () => {
      loadedImage = img;
      loadedImage.dataUrl = project.originalImage;
      
      // Calculate aspect ratio
      imageAspectRatio = img.width / img.height;
      
      // Restore settings
      if (project.meshCount) {
        meshCount = project.meshCount;
        meshBtns.forEach(b => {
          b.classList.toggle('active', parseInt(b.dataset.mesh) === meshCount);
        });
      }
      
      if (project.unitMode) {
        unitMode = project.unitMode;
        unitBtns.forEach(b => {
          b.classList.toggle('active', b.dataset.unit === unitMode);
        });
        updateDimensionLabels();
      }
      
      if (project.inputWidth !== undefined) {
        widthInput.value = project.inputWidth;
      }
      if (project.inputHeight !== undefined) {
        heightInput.value = project.inputHeight;
      }
      if (project.maxColors) {
        colorsInput.value = project.maxColors;
      }
      
      currentFileName = project.name;
      selectedLegendCode = null;
      completedCells = new Set(project.completedCells || []);
      actionHistory = [];
      interactionMode = 'progress';
      
      // Update preset availability and labels based on image aspect ratio
      updatePresetAvailability();
      updatePresetLabels();
      
      // Show upload section with image preview
      fileDropzone.classList.add('hidden');
      previewImg.src = project.originalImage;
      selectedFilename.textContent = currentFileName;
      imageSelectedRow.classList.add('visible');
      
      // Show all step groups
      presetsStep.classList.add('visible');
      meshStep.classList.add('visible');
      dimensionsStep.classList.add('visible');
      colorsStep.classList.add('visible');
      convertStep.classList.add('visible');
      convertBtn.disabled = false;
      
      // Mark custom preset since we're editing (user had custom dimensions)
      presetBtns.forEach(b => b.classList.remove('active'));
      const customBtn = document.querySelector('.preset-btn[data-preset="custom"]');
      if (customBtn) customBtn.classList.add('active');
      
      // Show upload section, hide result sections
      document.querySelector('.upload-section').classList.remove('hidden');
      document.getElementById('controls').classList.remove('visible');
      document.getElementById('resultSection').classList.remove('visible');
      document.getElementById('downloadSection').classList.remove('visible');
    };
    img.src = project.originalImage;
  });
  
  function updateLegendSelectionState() {
    legendEl.querySelectorAll('.legend-item').forEach((item) => {
      const isActive = item.dataset.code === selectedLegendCode;
      item.classList.toggle('active', isActive);
      item.querySelector('.legend-focus')?.setAttribute('aria-pressed', String(isActive));
    });
  }

  function selectLegendColor(code, shouldToggle) {
    selectedLegendCode = shouldToggle && selectedLegendCode === code ? null : code;
    renderGrid(parseInt(cellSizeInput.value));
    updateLegendSelectionState();
  }

  legendEl.addEventListener('click', (event) => {
    const focusButton = event.target.closest('.legend-focus');
    if (focusButton?.dataset.code) {
      selectLegendColor(focusButton.dataset.code, true);
      return;
    }

    const picker = event.target.closest('.legend-color-picker');
    if (picker?.dataset.code) {
      selectLegendColor(picker.dataset.code, false);
    }
  });
  
  function persistCompletedCells() {
    if (!currentProjectId) return;
    const projects = getProjects();
    const idx = projects.findIndex(p => p.id === currentProjectId);
    if (idx === -1) return;
    projects[idx].completedCells = [...completedCells];
    saveProjects(projects);
  }

  function persistProjectUpdate(updates) {
    if (!currentProjectId) return;
    const projects = getProjects();
    const idx = projects.findIndex(p => p.id === currentProjectId);
    if (idx === -1) return;
    projects[idx] = { ...projects[idx], ...updates };
    saveProjects(projects);
  }

  function applyPaletteColor(code, nextHex, options = {}) {
    if (!currentResult?.colorMap?.[code]) return;
    const normalizedHex = nextHex.toUpperCase();
    currentResult.colorMap[code] = normalizedHex;

    gridEl.querySelectorAll(`.cell[data-code="${code}"]`).forEach((cell) => {
      const index = parseInt(cell.dataset.index, 10);
      const cols = currentResult.grid[0].length;
      updateCellElement(cell, code, Math.floor(index / cols), index % cols);
    });

    const legendItem = legendEl.querySelector(`.legend-item[data-code="${code}"]`);
    const hexLabel = legendItem?.querySelector('.hex');
    const focusButton = legendItem?.querySelector('.legend-focus');
    const picker = legendItem?.querySelector('.legend-color-picker');
    if (hexLabel) hexLabel.textContent = normalizedHex;
    if (focusButton) {
      focusButton.setAttribute('aria-label', `Focus color ${code}, ${normalizedHex}`);
    }
    if (picker) {
      picker.setAttribute('aria-label', `Change color ${code}, currently ${normalizedHex}`);
    }

    updatePaintControls?.();
    if (options.persist) {
      persistProjectUpdate({ colorMap: currentResult.colorMap });
    }
  }

  legendEl.addEventListener('focusin', (event) => {
    const picker = event.target.closest('.legend-color-picker');
    if (!picker?.dataset.code) return;
    picker.dataset.previousColor = currentResult.colorMap[picker.dataset.code];
  });

  legendEl.addEventListener('pointerdown', (event) => {
    const picker = event.target.closest('.legend-color-picker');
    if (!picker?.dataset.code) return;
    picker.dataset.previousColor = currentResult.colorMap[picker.dataset.code];
  });

  legendEl.addEventListener('input', (event) => {
    const picker = event.target.closest('.legend-color-picker');
    if (!picker?.dataset.code) return;
    applyPaletteColor(picker.dataset.code, picker.value);
  });

  legendEl.addEventListener('change', (event) => {
    const picker = event.target.closest('.legend-color-picker');
    if (!picker?.dataset.code) return;
    const code = picker.dataset.code;
    const previousHex = picker.dataset.previousColor || currentResult.colorMap[code];
    const nextHex = picker.value.toUpperCase();
    applyPaletteColor(code, nextHex, { persist: true });
    picker.dataset.previousColor = nextHex;

    if (previousHex !== nextHex) {
      pushAction({ type: 'palette', code, previousHex, nextHex });
      trackProductEvent('palette_color_changed', { source: 'legend' });
    }
  });

  function pushAction(action) {
    actionHistory.push(action);
    if (actionHistory.length > MAX_UNDO_HISTORY) {
      actionHistory.shift();
    }
  }

  function getCellElementByIndex(index) {
    if (!gridEl) return null;
    return gridEl.children[index] || null;
  }

  function applyCompletion(index, shouldBeCompleted) {
    if (shouldBeCompleted) {
      completedCells.add(index);
    } else {
      completedCells.delete(index);
    }
    const cell = getCellElementByIndex(index);
    if (cell) {
      cell.classList.toggle('completed', shouldBeCompleted);
      const cols = currentResult.grid[0].length;
      const rowIdx = Math.floor(index / cols);
      const colIdx = index % cols;
      const code = currentResult.grid[rowIdx][colIdx];
      updateCellAccessibility(cell, rowIdx, colIdx, code, currentResult.colorMap[code], shouldBeCompleted);
    }
    persistCompletedCells();
    recordProgressMilestone();
    updateProgressSummary();
    const activeProject = document.querySelector('.project-item.active .project-date');
    if (activeProject && currentResult?.grid?.length) {
      const total = currentResult.grid.length * currentResult.grid[0].length;
      activeProject.textContent = `${Math.round((completedCells.size / total) * 100)}% complete`;
    }
  }

  function applyColorChange(rowIdx, colIdx, nextCode) {
    const cols = currentResult.grid[0].length;
    const index = rowIdx * cols + colIdx;
    const cell = getCellElementByIndex(index);
    currentResult.grid[rowIdx][colIdx] = nextCode;
    updateCellElement(cell, nextCode, rowIdx, colIdx);
    renderLegend();
    persistProjectUpdate({ grid: currentResult.grid, colorCounts: currentResult.colorCounts });
  }

  function undoLastAction() {
    const action = actionHistory.pop();
    if (!action) return;
    
    if (action.type === 'complete') {
      applyCompletion(action.index, action.prevCompleted);
      return;
    }
    
    if (action.type === 'color') {
      updateColorCounts(action.nextCode, action.prevCode);
      applyColorChange(action.rowIdx, action.colIdx, action.prevCode);
      return;
    }

    if (action.type === 'palette') {
      applyPaletteColor(action.code, action.previousHex, { persist: true });
      renderLegend();
    }
  }

  function updateCellElement(cell, code, rowIdx, colIdx) {
    if (!cell) return;
    const hex = currentResult.colorMap[code];
    cell.dataset.code = code;
    cell.style.backgroundColor = hex;
    cell.style.color = getTextColor(hex);
    cell.textContent = showCodes ? code : '';
    cell.title = `Row ${rowIdx + 1}, Col ${colIdx + 1}\n${code}: ${hex}`;
    updateCellAccessibility(cell, rowIdx, colIdx, code, hex, completedCells.has(rowIdx * currentResult.grid[0].length + colIdx));
    
    if (selectedLegendCode) {
      if (code === selectedLegendCode) {
        cell.classList.add('highlight');
        cell.classList.remove('dimmed');
      } else {
        cell.classList.add('dimmed');
        cell.classList.remove('highlight');
      }
    } else {
      cell.classList.remove('dimmed');
      cell.classList.remove('highlight');
    }
  }

  function updateColorCounts(oldCode, newCode) {
    if (!currentResult.colorCounts) currentResult.colorCounts = {};
    currentResult.colorCounts[oldCode] = Math.max(0, (currentResult.colorCounts[oldCode] || 0) - 1);
    currentResult.colorCounts[newCode] = (currentResult.colorCounts[newCode] || 0) + 1;
  }

  function hideColorContextMenu() {
    if (!colorContextMenu) return;
    colorContextMenu.classList.remove('visible');
    colorContextMenu.setAttribute('aria-hidden', 'true');
    colorContextMenu.innerHTML = '';
  }

  function showColorContextMenu(x, y, cell, rowIdx, colIdx) {
    if (!currentResult || !colorContextMenu) return;
    const { colorMap } = currentResult;
    const currentCode = cell.dataset.code;
    
    const codes = Object.keys(colorMap).sort((a, b) => parseInt(a) - parseInt(b));
    colorContextMenu.innerHTML = `
      <div class="color-context-title">Set Color</div>
      <div class="color-context-grid">
        ${codes.map(code => `
          <button type="button" class="color-context-item ${code === currentCode ? 'active' : ''}" data-code="${code}" aria-label="Color ${code}, ${colorMap[code]}">
            <span class="color-context-swatch" style="background:${colorMap[code]}"></span>
            <span>${code}</span>
          </button>
        `).join('')}
      </div>
    `;
    
    colorContextMenu.classList.add('visible');
    colorContextMenu.setAttribute('aria-hidden', 'false');
    
    const menuRect = colorContextMenu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const left = Math.min(x, viewportWidth - menuRect.width - 8);
    const top = Math.min(y, viewportHeight - menuRect.height - 8);
    
    colorContextMenu.style.left = `${Math.max(8, left)}px`;
    colorContextMenu.style.top = `${Math.max(8, top)}px`;
    
    colorContextMenu.querySelectorAll('.color-context-item').forEach(item => {
      item.addEventListener('click', () => {
        const nextCode = item.dataset.code;
        if (!nextCode || nextCode === currentCode) {
          hideColorContextMenu();
          return;
        }
        
        updateColorCounts(currentCode, nextCode);
        applyColorChange(rowIdx, colIdx, nextCode);
        pushAction({
          type: 'color',
          rowIdx,
          colIdx,
          prevCode: currentCode,
          nextCode
        });
        hideColorContextMenu();
      });
    });
  }

  function setInteractionMode(mode) {
    interactionMode = mode;
    if (progressModeBtn && paintModeBtn && paintControls) {
      progressModeBtn.classList.toggle('active', mode === 'progress');
      paintModeBtn.classList.toggle('active', mode === 'paint');
      paintControls.classList.toggle('visible', mode === 'paint');
    }
    const modeBar = document.getElementById('modeBar');
    if (modeBar) {
      modeBar.classList.toggle('paint-active', mode === 'paint');
    }
  }

  updatePaintControls = function () {
    if (!currentResult || !paintSwatch) return;
    const codes = Object.keys(currentResult.colorMap).sort((a, b) => parseInt(a) - parseInt(b));
    if (codes.length === 0) return;
    const shouldReset = !codes.includes(paintColorCode);
    if (shouldReset) {
      paintColorCode = codes.includes('1') ? '1' : codes[0];
    }

    if (paintColorLabel) {
      paintColorLabel.textContent = paintColorCode;
    }
    paintSwatch.style.background = currentResult.colorMap[paintColorCode];
  };

  if (progressModeBtn && paintModeBtn) {
    progressModeBtn.addEventListener('click', () => setInteractionMode('progress'));
    paintModeBtn.addEventListener('click', () => setInteractionMode('paint'));
    setInteractionMode('progress');
  }

  function showPaintColorMenu(x, y) {
    if (!currentResult || !colorContextMenu) return;
    const { colorMap } = currentResult;
    const codes = Object.keys(colorMap).sort((a, b) => parseInt(a) - parseInt(b));
    colorContextMenu.innerHTML = `
      <div class="color-context-title">Paint Color</div>
      <div class="color-context-grid">
        ${codes.map(code => `
          <button type="button" class="color-context-item ${code === paintColorCode ? 'active' : ''}" data-code="${code}" aria-label="Color ${code}, ${colorMap[code]}">
            <span class="color-context-swatch" style="background:${colorMap[code]}"></span>
            <span>${code}</span>
          </button>
        `).join('')}
      </div>
    `;
    
    colorContextMenu.classList.add('visible');
    colorContextMenu.setAttribute('aria-hidden', 'false');
    
    const menuRect = colorContextMenu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const left = Math.min(x, viewportWidth - menuRect.width - 8);
    const top = Math.max(8, y - menuRect.height);
    
    colorContextMenu.style.left = `${Math.max(8, left)}px`;
    colorContextMenu.style.top = `${Math.max(8, top)}px`;
    
    colorContextMenu.querySelectorAll('.color-context-item').forEach(item => {
      item.addEventListener('click', () => {
        const nextCode = item.dataset.code;
        if (!nextCode) return;
        paintColorCode = nextCode;
        if (paintColorLabel) paintColorLabel.textContent = paintColorCode;
        if (paintSwatch) paintSwatch.style.background = currentResult.colorMap[paintColorCode];
        hideColorContextMenu();
      });
    });
  }

  if (paintControls) {
    paintControls.addEventListener('click', (e) => {
      e.stopPropagation();
      const rect = paintControls.getBoundingClientRect();
      showPaintColorMenu(rect.left, rect.top - 6);
    });
  }
  
  gridEl.addEventListener('click', (e) => {
    if (colorContextMenu && colorContextMenu.classList.contains('visible')) {
      hideColorContextMenu();
      return;
    }
    const cell = e.target.closest('.cell');
    if (!cell || !cell.dataset.index) return;
    const index = parseInt(cell.dataset.index, 10);
    if (Number.isNaN(index)) return;
    
    if (interactionMode === 'paint') {
      const cols = currentResult.grid[0].length;
      const rowIdx = Math.floor(index / cols);
      const colIdx = index % cols;
      const currentCode = currentResult.grid[rowIdx][colIdx];
      if (paintColorCode && currentCode !== paintColorCode) {
        updateColorCounts(currentCode, paintColorCode);
        applyColorChange(rowIdx, colIdx, paintColorCode);
        pushAction({
          type: 'color',
          rowIdx,
          colIdx,
          prevCode: currentCode,
          nextCode: paintColorCode
        });
      }
      return;
    }
    
    if (completedCells.has(index)) {
      pushAction({ type: 'complete', index, prevCompleted: true });
      applyCompletion(index, false);
    } else {
      pushAction({ type: 'complete', index, prevCompleted: false });
      applyCompletion(index, true);
    }
  });

  gridEl.addEventListener('keydown', (event) => {
    const cell = event.target.closest('.cell');
    if (!cell || !currentResult?.grid?.length) return;

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      cell.click();
      return;
    }

    const cols = currentResult.grid[0].length;
    const total = currentResult.grid.length * cols;
    const currentIndex = parseInt(cell.dataset.index, 10);
    const column = currentIndex % cols;
    const moves = {
      ArrowLeft: column > 0 ? -1 : 0,
      ArrowRight: column < cols - 1 ? 1 : 0,
      ArrowUp: -cols,
      ArrowDown: cols,
      Home: -currentIndex,
      End: total - 1 - currentIndex
    };
    if (!(event.key in moves)) return;

    event.preventDefault();
    const nextIndex = Math.max(0, Math.min(total - 1, currentIndex + moves[event.key]));
    const nextCell = getCellElementByIndex(nextIndex);
    if (!nextCell || nextCell === cell) return;
    cell.tabIndex = -1;
    nextCell.tabIndex = 0;
    nextCell.focus({ preventScroll: true });
    nextCell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
  
  gridEl.addEventListener('contextmenu', (e) => {
    const cell = e.target.closest('.cell');
    if (!cell || !cell.dataset.index) return;
    e.preventDefault();
    const index = parseInt(cell.dataset.index, 10);
    if (Number.isNaN(index)) return;
    const cols = currentResult.grid[0].length;
    const rowIdx = Math.floor(index / cols);
    const colIdx = index % cols;
    showColorContextMenu(e.clientX, e.clientY, cell, rowIdx, colIdx);
  });
  
  document.addEventListener('click', (e) => {
    if (!colorContextMenu || !colorContextMenu.classList.contains('visible')) return;
    if (!e.target.closest('#colorContextMenu')) {
      hideColorContextMenu();
    }
  });
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideColorContextMenu();
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (colorContextMenu && colorContextMenu.classList.contains('visible')) {
        hideColorContextMenu();
        return;
      }
      undoLastAction();
    }
  });
  
  window.addEventListener('resize', hideColorContextMenu);

  // ============================================
  // PRODUCT RESEARCH AND PRIVACY CONTROLS
  // ============================================

  const progressBucketsSeen = new Set();
  let feedbackType = 'general';

  function scrollWorkspaceToTop() {
    const workspace = document.querySelector('.main-content');
    if (workspace) workspace.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  }

  const INTENT_ASKED_KEY = 'needlepoint_intent_prompt_asked';

  function promptStateKey(prompt, projectId) {
    return `needlepoint_${prompt}_${projectId || 'none'}`;
  }

  function promptStillOpen(prompt, projectId) {
    return !sessionStorage.getItem(promptStateKey(`${prompt}_answered`, projectId))
      && !sessionStorage.getItem(promptStateKey(`${prompt}_dismissed`, projectId));
  }

  function intentAlreadyAsked() {
    return localStorage.getItem(INTENT_ASKED_KEY) === 'true';
  }

  function markIntentAsked() {
    localStorage.setItem(INTENT_ASKED_KEY, 'true');
  }

  function syncResearchDock() {
    const open = Boolean(
      intentPrompt?.classList.contains('visible') ||
      outcomePrompt?.classList.contains('visible')
    );
    if (researchDock) {
      researchDock.hidden = !open;
      researchDock.classList.toggle('visible', open);
    }
    document.body.classList.toggle('research-dock-open', open);
  }

  function hideResearchPrompts() {
    intentPrompt?.classList.remove('visible');
    outcomePrompt?.classList.remove('visible');
    syncResearchDock();
  }

  function showIntentPrompt(projectId) {
    if (!intentPrompt || !projectId) return;
    if (intentAlreadyAsked()) return;
    if (!promptStillOpen('intent', projectId)) return;
    if (outcomePrompt?.classList.contains('visible')) return;
    const alreadyVisible = intentPrompt.classList.contains('visible');
    intentPrompt.classList.add('visible');
    markIntentAsked();
    syncResearchDock();
    if (alreadyVisible) return;
    trackProductEvent(
      'intent_prompt_viewed',
      { promptKey: 'post_conversion_features' },
      projectId
    );
  }

  async function submitIntent(selectedOption, optionalComment, email) {
    if (!currentProjectId) return;
    const buttons = intentPrompt.querySelectorAll('button');
    buttons.forEach((button) => { button.disabled = true; });
    const payload = {
      projectId: String(currentProjectId),
      promptKey: 'post_conversion_features',
      selectedOption,
      ...(optionalComment ? { optionalComment } : {}),
      ...(email ? { email } : {})
    };
    const sent = await window.NeedlepointAnalytics?.submitIntent(payload);
    buttons.forEach((button) => { button.disabled = false; });
    const status = document.getElementById('intentThanks');
    if (!sent) {
      status.textContent = 'That could not be sent right now. Please try again.';
      return;
    }
    sessionStorage.setItem(promptStateKey('intent_answered', currentProjectId), 'true');
    document.getElementById('intentOptions').style.display = 'none';
    document.getElementById('intentOtherForm').classList.remove('visible');
    document.getElementById('intentNotifyForm').classList.remove('visible');
    status.textContent = email
      ? 'Thanks. We will only use that email to tell you when printable patterns are ready.'
      : 'Thanks. This will help prioritize the next improvement.';
    window.setTimeout(() => {
      intentPrompt.classList.remove('visible');
      syncResearchDock();
    }, 1600);
  }

  function showOutcomePrompt() {
    if (!outcomePrompt || !currentProjectId) return;
    if (!promptStillOpen('outcome', currentProjectId)) return;
    const alreadyVisible = outcomePrompt.classList.contains('visible');
    intentPrompt.classList.remove('visible');
    document.getElementById('outcomePromptTitle').textContent = 'Does this feel ready to stitch?';
    document.getElementById('outcomeOptions').style.display = '';
    document.getElementById('outcomeReasons').hidden = true;
    document.getElementById('outcomeThanks').textContent = '';
    outcomePrompt.classList.add('visible');
    syncResearchDock();
    if (alreadyVisible) return;
    trackProductEvent(
      'outcome_prompt_viewed',
      { promptKey: 'post_export_ready' },
      currentProjectId
    );
  }

  function recordExport(exportType) {
    trackProductEvent('export_clicked', { exportType }, currentProjectId);
    if (promptStillOpen('outcome', currentProjectId)) showOutcomePrompt();
    else showIntentPrompt(currentProjectId);
  }

  function progressBucket() {
    if (!currentResult?.grid?.length) return null;
    const total = currentResult.grid.length * currentResult.grid[0].length;
    const percent = (completedCells.size / total) * 100;
    if (percent < 1) return 'under_1';
    if (percent < 25) return '1_to_24';
    if (percent < 50) return '25_to_49';
    if (percent < 75) return '50_to_74';
    if (percent < 100) return '75_to_99';
    return '100';
  }

  function recordProgressMilestone() {
    const bucket = progressBucket();
    if (!bucket || !currentProjectId) return;
    const key = `${currentProjectId}:${bucket}`;
    if (progressBucketsSeen.has(key)) return;
    progressBucketsSeen.add(key);
    trackProductEvent('progress_marked', { completedPercentBucket: bucket }, currentProjectId);
  }

  function openFeedback(type = 'general', placement = 'sidebar') {
    feedbackType = type;
    document.getElementById('feedbackStatus').textContent = '';
    trackProductEvent('feedback_opened', { placement }, currentProjectId);
    if (typeof feedbackDialog.showModal === 'function') feedbackDialog.showModal();
    else feedbackDialog.setAttribute('open', '');
  }

  document.getElementById('intentOptions').addEventListener('click', (event) => {
    const button = event.target.closest('[data-intent]');
    if (!button) return;
    if (button.dataset.intent === 'other') {
      document.getElementById('intentOtherForm').classList.add('visible');
      document.getElementById('intentNotifyForm').classList.remove('visible');
      document.getElementById('intentComment').focus();
      return;
    }
    if (button.dataset.intent === 'printable_pdf') {
      document.getElementById('intentOptions').style.display = 'none';
      document.getElementById('intentOtherForm').classList.remove('visible');
      document.getElementById('intentNotifyForm').classList.add('visible');
      document.getElementById('intentEmail').focus();
      return;
    }
    void submitIntent(button.dataset.intent);
  });

  document.getElementById('intentOtherForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const comment = document.getElementById('intentComment').value.trim();
    if (!comment) {
      document.getElementById('intentComment').focus();
      return;
    }
    void submitIntent('other', comment);
  });

  document.getElementById('intentNotifyForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const email = document.getElementById('intentEmail').value.trim();
    if (!email) {
      document.getElementById('intentEmail').focus();
      return;
    }
    void submitIntent('printable_pdf', undefined, email);
  });
  document.getElementById('skipIntentEmailBtn').addEventListener('click', () => {
    void submitIntent('printable_pdf');
  });

  document.getElementById('dismissIntentBtn').addEventListener('click', () => {
    if (currentProjectId) {
      sessionStorage.setItem(promptStateKey('intent_dismissed', currentProjectId), 'true');
      trackProductEvent(
        'intent_prompt_dismissed',
        { promptKey: 'post_conversion_features' },
        currentProjectId
      );
    }
    intentPrompt.classList.remove('visible');
    syncResearchDock();
  });

  function finishOutcomePrompt(response, reason) {
    if (!currentProjectId) return;
    sessionStorage.setItem(promptStateKey('outcome_answered', currentProjectId), 'true');
    trackProductEvent(
      'outcome_prompt_responded',
      {
        promptKey: 'post_export_ready',
        response,
        ...(reason ? { reason } : {})
      },
      currentProjectId
    );
    document.getElementById('outcomeOptions').style.display = 'none';
    document.getElementById('outcomeReasons').hidden = true;
    document.getElementById('outcomeThanks').textContent =
      response === 'yes'
        ? 'Great. Happy stitching!'
        : 'Thanks. That helps us decide what to fix next.';
    window.setTimeout(() => {
      outcomePrompt.classList.remove('visible');
      showIntentPrompt(currentProjectId);
      syncResearchDock();
    }, 1600);
  }

  document.getElementById('outcomeOptions').addEventListener('click', (event) => {
    const button = event.target.closest('[data-outcome]');
    if (!button || !currentProjectId) return;
    if (button.dataset.outcome === 'not_yet') {
      document.getElementById('outcomeOptions').style.display = 'none';
      document.getElementById('outcomePromptTitle').textContent = 'What is getting in the way?';
      document.getElementById('outcomeReasons').hidden = false;
      return;
    }
    finishOutcomePrompt('yes');
  });

  document.getElementById('outcomeReasons').addEventListener('click', (event) => {
    const button = event.target.closest('[data-reason]');
    if (!button || !currentProjectId) return;
    finishOutcomePrompt('not_yet', button.dataset.reason);
  });

  document.getElementById('dismissOutcomeBtn').addEventListener('click', () => {
    if (currentProjectId) {
      sessionStorage.setItem(promptStateKey('outcome_dismissed', currentProjectId), 'true');
      if (!document.getElementById('outcomeReasons').hidden) {
        trackProductEvent(
          'outcome_prompt_responded',
          { promptKey: 'post_export_ready', response: 'not_yet' },
          currentProjectId
        );
      }
    }
    outcomePrompt.classList.remove('visible');
    showIntentPrompt(currentProjectId);
    syncResearchDock();
  });

  document.getElementById('feedbackBtn').addEventListener('click', () => {
    openFeedback('general', 'sidebar');
  });

  document.getElementById('feedbackConsent').addEventListener('change', (event) => {
    const email = document.getElementById('feedbackEmail');
    email.disabled = !event.target.checked;
    if (!event.target.checked) email.value = '';
  });
  document.getElementById('feedbackEmail').disabled = true;

  document.getElementById('feedbackForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = document.getElementById('feedbackStatus');
    const submit = form.querySelector('.dialog-submit');
    const sentiment = new FormData(form).get('sentiment');
    const message = document.getElementById('feedbackMessage').value.trim();
    const followUpConsent = document.getElementById('feedbackConsent').checked;
    const email = document.getElementById('feedbackEmail').value.trim();
    if (!sentiment && !message) {
      status.textContent = 'Please choose an experience or add a short message.';
      return;
    }
    if (followUpConsent && !email) {
      status.textContent = 'Add an email address if you would like a follow-up.';
      return;
    }

    submit.disabled = true;
    status.textContent = 'Sending…';
    const sent = await window.NeedlepointAnalytics?.submitFeedback({
      ...(currentProjectId ? { projectId: String(currentProjectId) } : {}),
      feedbackType,
      ...(sentiment ? { sentiment } : {}),
      reasons: [],
      ...(message ? { message } : {}),
      ...(followUpConsent ? { email } : {}),
      followUpConsent,
      website: document.getElementById('feedbackWebsite').value
    });
    submit.disabled = false;
    if (!sent) {
      status.textContent = 'That could not be sent right now. Please try again.';
      return;
    }
    status.textContent = 'Thank you. Your feedback was sent.';
    form.reset();
    document.getElementById('feedbackEmail').disabled = true;
    window.setTimeout(() => feedbackDialog.close(), 900);
  });

  const analyticsEnabled = document.getElementById('analyticsEnabled');
  analyticsEnabled.checked = window.NeedlepointAnalytics?.isEnabled() ?? false;
  analyticsEnabled.addEventListener('change', () => {
    window.NeedlepointAnalytics?.setEnabled(analyticsEnabled.checked);
  });
  document.getElementById('privacyBtn').addEventListener('click', () => {
    analyticsEnabled.checked = window.NeedlepointAnalytics?.isEnabled() ?? false;
    if (typeof privacyDialog.showModal === 'function') privacyDialog.showModal();
    else privacyDialog.setAttribute('open', '');
  });
  privacyHeroBtn?.addEventListener('click', () => {
    document.getElementById('privacyBtn').click();
  });
  const entryAction = new URLSearchParams(window.location.search);
  if (entryAction.get('feedback') === '1') {
    window.setTimeout(() => openFeedback('general', 'sidebar'), 0);
  } else if (entryAction.get('privacy') === '1') {
    window.setTimeout(() => document.getElementById('privacyBtn').click(), 0);
  }
  continueStitchingBtn?.addEventListener('click', () => {
    document.getElementById('gridWrapper')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  
  // ============================================
  // MOBILE MENU TOGGLE
  // ============================================
  
  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  
  function openMobileMenu() {
    sidebar.classList.add('open');
    sidebarOverlay.classList.add('visible');
    mobileMenuToggle.classList.add('active');
    mobileMenuToggle.setAttribute('aria-label', 'Close projects');
    document.body.style.overflow = 'hidden';
  }
  
  function closeMobileMenu() {
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('visible');
    mobileMenuToggle.classList.remove('active');
    mobileMenuToggle.setAttribute('aria-label', 'Open projects');
    document.body.style.overflow = '';
  }
  
  mobileMenuToggle.addEventListener('click', () => {
    if (sidebar.classList.contains('open')) {
      closeMobileMenu();
    } else {
      openMobileMenu();
    }
  });
  
  sidebarOverlay.addEventListener('click', closeMobileMenu);
  
  // Close sidebar when a project is selected on mobile
  const originalLoadProject = loadProject;
  loadProject = function(project) {
    originalLoadProject(project);
    if (window.innerWidth <= 768) {
      closeMobileMenu();
    }
  };
});
