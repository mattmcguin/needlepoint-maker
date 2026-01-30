// ============================================
// MEDIAN CUT COLOR QUANTIZATION ALGORITHM
// ============================================

class ColorBox {
  constructor(pixels) {
    this.pixels = pixels;
    this.computeBounds();
  }
  
  computeBounds() {
    let rMin = 255, rMax = 0;
    let gMin = 255, gMax = 0;
    let bMin = 255, bMax = 0;
    
    for (const [r, g, b] of this.pixels) {
      if (r < rMin) rMin = r;
      if (r > rMax) rMax = r;
      if (g < gMin) gMin = g;
      if (g > gMax) gMax = g;
      if (b < bMin) bMin = b;
      if (b > bMax) bMax = b;
    }
    
    this.rRange = rMax - rMin;
    this.gRange = gMax - gMin;
    this.bRange = bMax - bMin;
  }
  
  get longestAxis() {
    if (this.rRange >= this.gRange && this.rRange >= this.bRange) return 0;
    if (this.gRange >= this.rRange && this.gRange >= this.bRange) return 1;
    return 2;
  }
  
  get volume() {
    return this.rRange * this.gRange * this.bRange;
  }
  
  split() {
    const axis = this.longestAxis;
    const sorted = [...this.pixels].sort((a, b) => a[axis] - b[axis]);
    const mid = Math.floor(sorted.length / 2);
    return [
      new ColorBox(sorted.slice(0, mid)),
      new ColorBox(sorted.slice(mid))
    ];
  }
  
  average() {
    let rSum = 0, gSum = 0, bSum = 0;
    for (const [r, g, b] of this.pixels) {
      rSum += r;
      gSum += g;
      bSum += b;
    }
    const n = this.pixels.length;
    return [
      Math.round(rSum / n),
      Math.round(gSum / n),
      Math.round(bSum / n)
    ];
  }
}

function medianCut(pixels, maxColors) {
  if (pixels.length === 0) return [];
  
  let boxes = [new ColorBox(pixels)];
  
  while (boxes.length < maxColors) {
    // Find box with largest volume that can be split
    let maxVolume = -1;
    let maxIdx = -1;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].pixels.length > 1 && boxes[i].volume > maxVolume) {
        maxVolume = boxes[i].volume;
        maxIdx = i;
      }
    }
    
    if (maxIdx === -1) break; // Can't split any further
    
    const [box1, box2] = boxes[maxIdx].split();
    boxes.splice(maxIdx, 1, box1, box2);
  }
  
  return boxes.map(box => box.average());
}

// Find nearest palette color for a pixel
function findNearestColor(r, g, b, palette) {
  let minDist = Infinity;
  let nearest = palette[0];
  
  for (const [pr, pg, pb] of palette) {
    const dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (dist < minDist) {
      minDist = dist;
      nearest = [pr, pg, pb];
    }
  }
  
  return nearest;
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
  
  // Quantize colors using median cut
  const palette = medianCut(pixels, maxColors);
  
  // Map each pixel to nearest palette color and build grid
  const gridData = [];
  const colorCounts = new Map();
  let pixelIdx = 0;
  
  for (let row = 0; row < targetHeight; row++) {
    const rowData = [];
    for (let col = 0; col < targetWidth; col++) {
      const [r, g, b] = pixels[pixelIdx];
      const [pr, pg, pb] = findNearestColor(r, g, b, palette);
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
      code: `C${String(idx + 1).padStart(2, '0')}`,
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
let lastEditedDimension = 'height';

// Size presets for common needlepoint projects
const SIZE_PRESETS = [
  { name: 'Coaster', width: 50, height: 50 },
  { name: 'Ornament', width: 40, height: 50 },
  { name: 'Pillow', width: 120, height: 120 },
  { name: 'Wall Art', width: 100, height: 125 }
];

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

function renderGrid(cellSize) {
  if (!currentResult) return;
  
  const gridEl = document.getElementById('grid');
  const { grid, colorMap } = currentResult;
  const cols = grid[0].length;
  
  gridEl.innerHTML = '';
  gridEl.style.gridTemplateColumns = `repeat(${cols}, ${cellSize}px)`;
  
  grid.forEach((row, rowIdx) => {
    row.forEach((code, colIdx) => {
      const cell = document.createElement('div');
      cell.className = 'cell' + (showCodes ? ' show-codes' : '');
      cell.style.backgroundColor = colorMap[code];
      cell.style.color = getTextColor(colorMap[code]);
      cell.style.width = cellSize + 'px';
      cell.style.height = cellSize + 'px';
      cell.style.borderWidth = showGridLines ? '1px' : '0';
      if (showCodes) cell.textContent = code;
      cell.title = `Row ${rowIdx + 1}, Col ${colIdx + 1}\n${code}: ${colorMap[code]}`;
      gridEl.appendChild(cell);
    });
  });
}

function renderLegend() {
  if (!currentResult) return;
  
  const legendEl = document.getElementById('legend');
  const { colorMap, colorCounts } = currentResult;
  
  legendEl.innerHTML = '';
  
  // Sort by code number
  const codes = Object.keys(colorMap).sort((a, b) => {
    return parseInt(a.slice(1)) - parseInt(b.slice(1));
  });
  
  for (const code of codes) {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `
      <div class="legend-swatch" style="background:${colorMap[code]}"></div>
      <div class="legend-info">
        <strong>${code}</strong>
        <span class="hex">${colorMap[code]}</span>
        <span class="count">${colorCounts[code]} stitches</span>
      </div>
    `;
    legendEl.appendChild(item);
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
    return parseInt(a.slice(1)) - parseInt(b.slice(1));
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

function renderGridToCanvas(cellSize) {
  if (!currentResult) return null;
  
  const { grid, colorMap } = currentResult;
  const rows = grid.length;
  const cols = grid[0].length;
  
  const canvas = document.createElement('canvas');
  canvas.width = cols * cellSize;
  canvas.height = rows * cellSize;
  const ctx = canvas.getContext('2d');
  
  grid.forEach((row, rowIdx) => {
    row.forEach((code, colIdx) => {
      const x = colIdx * cellSize;
      const y = rowIdx * cellSize;
      
      // Fill cell with color
      ctx.fillStyle = colorMap[code];
      ctx.fillRect(x, y, cellSize, cellSize);
      
      // Draw grid lines
      if (showGridLines) {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1);
      }
      
      // Draw codes if enabled
      if (showCodes) {
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
  const projects = getProjects().filter(p => p.id !== id);
  saveProjects(projects);
  renderProjectList();
}

function clearAllProjects() {
  if (confirm('Delete all saved projects?')) {
    saveProjects([]);
    renderProjectList();
  }
}

function renderProjectList() {
  const listEl = document.getElementById('projectList');
  const clearBtn = document.getElementById('clearAllBtn');
  const projects = getProjects();
  
  listEl.innerHTML = '';
  
  if (projects.length === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'sidebar-empty';
    emptyEl.textContent = 'No projects yet';
    listEl.appendChild(emptyEl);
    clearBtn.style.display = 'none';
    return;
  }
  
  clearBtn.style.display = 'block';
  
  projects.forEach(project => {
    const item = document.createElement('div');
    item.className = 'project-item';
    item.dataset.id = project.id;
    
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
    date.textContent = new Date(project.timestamp).toLocaleDateString();
    
    info.appendChild(name);
    info.appendChild(date);
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'project-delete';
    deleteBtn.innerHTML = '×';
    deleteBtn.title = 'Delete project';
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      deleteProject(project.id);
    };
    
    item.appendChild(thumb);
    item.appendChild(info);
    item.appendChild(deleteBtn);
    
    item.onclick = () => loadProject(project);
    
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
  
  // Update UI
  document.getElementById('patternInfo').textContent = 
    `${project.grid.length} rows × ${project.grid[0].length} columns • ${currentResult.numColors} colors`;
  
  // Hide upload section, show result sections
  document.querySelector('.upload-section').classList.add('hidden');
  document.getElementById('controls').classList.add('visible');
  document.getElementById('resultSection').classList.add('visible');
  document.getElementById('downloadSection').classList.add('visible');
  
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
  const toggleCodesBtn = document.getElementById('toggleCodes');
  const toggleGridBtn = document.getElementById('toggleGrid');
  const downloadGridBtn = document.getElementById('downloadGrid');
  const downloadLegendBtn = document.getElementById('downloadLegend');
  const downloadPngBtn = document.getElementById('downloadPng');
  const downloadGridImageBtn = document.getElementById('downloadGridImage');
  const clearAllBtn = document.getElementById('clearAllBtn');
  const newProjectBtn = document.getElementById('newProjectBtn');
  
  let loadedImage = null;
  let currentFileName = 'Untitled';
  
  const heightInput = document.getElementById('heightInput');
  const widthInput = document.getElementById('widthInput');
  const aspectLinkBtn = document.getElementById('aspectLinkBtn');
  const colorsInput = document.getElementById('colorsInput');
  
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
      const height = parseInt(btn.dataset.height);
      const width = parseInt(btn.dataset.width);
      
      heightInput.value = height;
      widthInput.value = width;
      
      // If aspect linked, recalculate based on image aspect ratio
      if (aspectLinked && imageAspectRatio) {
        lastEditedDimension = 'height';
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
    
    const height = parseInt(heightInput.value) || 72;
    const width = parseInt(widthInput.value) || 60;
    
    if (lastEditedDimension === 'height') {
      // Height is the driver, calculate width
      const newWidth = clamp(Math.round(height * imageAspectRatio), 10, 200);
      widthInput.value = newWidth;
      widthInput.classList.add('auto-calculated');
      heightInput.classList.remove('auto-calculated');
    } else {
      // Width is the driver, calculate height
      const newHeight = clamp(Math.round(width / imageAspectRatio), 10, 200);
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
  
  clearAllBtn.addEventListener('click', clearAllProjects);
  
  // Aspect link toggle handler
  aspectLinkBtn.addEventListener('click', () => {
    aspectLinked = !aspectLinked;
    aspectLinkBtn.classList.toggle('linked', aspectLinked);
    
    if (aspectLinked) {
      aspectLinkBtn.title = 'Link dimensions (maintain aspect ratio)';
      // Recalculate when linking
      if (imageAspectRatio) {
        recalculateDimensions();
      }
    } else {
      aspectLinkBtn.title = 'Dimensions unlinked';
      // Remove auto-calculated styling from both
      heightInput.classList.remove('auto-calculated');
      widthInput.classList.remove('auto-calculated');
    }
  });
  
  newProjectBtn.addEventListener('click', () => {
    // Reset everything for a new project
    imageInput.value = '';
    loadedImage = null;
    currentFileName = 'Untitled';
    currentResult = null;
    convertBtn.disabled = true;
    imageAspectRatio = null;
    
    // Hide all step groups
    presetsStep.classList.remove('visible');
    dimensionsStep.classList.remove('visible');
    colorsStep.classList.remove('visible');
    convertStep.classList.remove('visible');
    
    // Clear preset selection
    presetBtns.forEach(b => b.classList.remove('active'));
    
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
    
    // Clear content
    document.getElementById('grid').innerHTML = '';
    document.getElementById('legend').innerHTML = '';
    
    // Clear active project highlight
    document.querySelectorAll('.project-item').forEach(el => el.classList.remove('active'));
  });
  
  imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) {
      convertBtn.disabled = true;
      return;
    }
    
    // Hide step groups (will be revealed after image loads)
    presetsStep.classList.remove('visible');
    dimensionsStep.classList.remove('visible');
    colorsStep.classList.remove('visible');
    convertStep.classList.remove('visible');
    presetBtns.forEach(b => b.classList.remove('active'));
    convertBtn.disabled = true;
    
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
        
        // Calculate and store aspect ratio (width / height)
        imageAspectRatio = img.width / img.height;
        
        // Find best matching preset and auto-select it
        const bestPreset = findBestPreset(imageAspectRatio);
        const bestPresetBtn = Array.from(presetBtns).find(btn => 
          parseInt(btn.dataset.width) === bestPreset.width && 
          parseInt(btn.dataset.height) === bestPreset.height
        );
        
        if (bestPresetBtn) {
          // Set dimensions from preset
          heightInput.value = bestPreset.height;
          widthInput.value = bestPreset.width;
          
          // If aspect linked, adjust for actual image aspect ratio
          if (aspectLinked) {
            lastEditedDimension = 'height';
            recalculateDimensions();
          }
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
          // Auto-select best preset button
          if (bestPresetBtn) {
            presetBtns.forEach(b => b.classList.remove('active'));
            bestPresetBtn.classList.add('active');
          }
        }, 100);
        
        setTimeout(() => {
          dimensionsStep.classList.add('visible');
        }, 250);
        
        setTimeout(() => {
          colorsStep.classList.add('visible');
        }, 400);
        
        setTimeout(() => {
          convertStep.classList.add('visible');
          convertBtn.disabled = false;
        }, 550);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
  
  convertBtn.addEventListener('click', () => {
    if (!loadedImage) return;
    
    const height = parseInt(document.getElementById('heightInput').value) || 72;
    const width = parseInt(document.getElementById('widthInput').value) || 60;
    const maxColors = parseInt(document.getElementById('colorsInput').value) || 20;
    
    showStatus('Processing image...', 'processing');
    convertBtn.disabled = true;
    
    // Use setTimeout to allow UI to update
    setTimeout(() => {
      try {
        currentResult = processImage(loadedImage, height, width, maxColors);
        
        // Update pattern info
        document.getElementById('patternInfo').textContent = 
          `${height} rows × ${width} columns • ${currentResult.numColors} colors`;
        
        // Hide upload section and show result sections
        document.querySelector('.upload-section').classList.add('hidden');
        document.getElementById('controls').classList.add('visible');
        document.getElementById('resultSection').classList.add('visible');
        document.getElementById('downloadSection').classList.add('visible');
        
        // Render grid and legend
        renderGrid(parseInt(cellSizeInput.value));
        renderLegend();
        
        // Save project to local storage
        // Create a small thumbnail to save space (max 80x80)
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
        
        const project = {
          id: Date.now().toString(),
          name: currentFileName,
          timestamp: Date.now(),
          thumbnail: thumbCanvas.toDataURL('image/jpeg', 0.6),
          quantizedImage: processingCanvas.toDataURL('image/jpeg', 0.8),
          grid: currentResult.grid,
          colorMap: currentResult.colorMap,
          colorCounts: currentResult.colorCounts
        };
        addProject(project);
        
        // Highlight the newly added project in sidebar
        document.querySelectorAll('.project-item').forEach(el => {
          el.classList.toggle('active', el.dataset.id === project.id);
        });
        
        showStatus('Conversion complete!', 'success');
        setTimeout(hideStatus, 2000);
      } catch (err) {
        showStatus('Error: ' + err.message, 'error');
        console.error(err);
      }
      
      convertBtn.disabled = false;
    }, 50);
  });
  
  cellSizeInput.addEventListener('input', () => {
    const size = cellSizeInput.value;
    cellSizeVal.textContent = size + 'px';
    renderGrid(parseInt(size));
  });
  
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
  });
  
  downloadLegendBtn.addEventListener('click', () => {
    const height = currentResult.grid.length;
    const width = currentResult.grid[0].length;
    const colors = currentResult.numColors;
    downloadCSV(generateLegendCSV(), `needlepoint_legend_${height}x${width}_${colors}colors.csv`);
  });
  
  downloadPngBtn.addEventListener('click', () => {
    const height = currentResult.grid.length;
    const width = currentResult.grid[0].length;
    const colors = currentResult.numColors;
    const canvas = document.getElementById('processingCanvas');
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `needlepoint_preview_${height}x${width}_${colors}colors.png`;
    a.click();
  });
  
  downloadGridImageBtn.addEventListener('click', () => {
    const cellSize = parseInt(cellSizeInput.value);
    const canvas = renderGridToCanvas(cellSize);
    if (!canvas) return;
    
    const height = currentResult.grid.length;
    const width = currentResult.grid[0].length;
    const colors = currentResult.numColors;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `needlepoint_grid_${height}x${width}_${colors}colors_${cellSize}px.png`;
    a.click();
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
    document.body.style.overflow = 'hidden';
  }
  
  function closeMobileMenu() {
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('visible');
    mobileMenuToggle.classList.remove('active');
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
