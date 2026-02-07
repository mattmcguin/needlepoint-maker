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
      const cellIndex = rowIdx * cols + colIdx;
      cell.className = 'cell' + (showCodes ? ' show-codes' : '');
      cell.style.backgroundColor = colorMap[code];
      cell.style.color = getTextColor(colorMap[code]);
      cell.style.width = cellSize + 'px';
      cell.style.height = cellSize + 'px';
      cell.style.borderWidth = showGridLines ? '1px' : '0';
      cell.dataset.code = code;
      cell.dataset.index = cellIndex.toString();
      
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
    return parseInt(a) - parseInt(b);
  });
  
  for (const code of codes) {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.dataset.code = code;
    item.setAttribute('role', 'button');
    item.tabIndex = 0;
    if (selectedLegendCode === code) {
      item.classList.add('active');
      item.setAttribute('aria-pressed', 'true');
    } else {
      item.setAttribute('aria-pressed', 'false');
    }
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
const SIDEBAR_COLLAPSED_KEY = 'needlepoint_sidebar_collapsed';

function migrateProjectCodes(project) {
  if (!project || !project.grid || !project.colorMap) return { project, changed: false };
  
  const codes = Object.keys(project.colorMap);
  const hasPadded = codes.some(code => /^0\d+$/.test(code));
  if (!hasPadded) return { project, changed: false };
  
  const codeMap = new Map();
  codes.forEach(code => {
    const normalized = String(parseInt(code, 10));
    codeMap.set(code, normalized);
  });
  
  const nextColorMap = {};
  const nextColorCounts = {};
  codes.forEach(code => {
    const nextCode = codeMap.get(code);
    nextColorMap[nextCode] = project.colorMap[code];
    if (project.colorCounts && project.colorCounts[code] !== undefined) {
      nextColorCounts[nextCode] = project.colorCounts[code];
    }
  });
  
  const nextGrid = project.grid.map(row => row.map(code => codeMap.get(code) || code));
  
  return {
    project: {
      ...project,
      grid: nextGrid,
      colorMap: nextColorMap,
      colorCounts: Object.keys(nextColorCounts).length ? nextColorCounts : project.colorCounts
    },
    changed: true
  };
}

function migrateProjects(projects) {
  let changed = false;
  const nextProjects = projects.map(project => {
    const result = migrateProjectCodes(project);
    if (result.changed) changed = true;
    return result.project;
  });
  return { projects: nextProjects, changed };
}

function getProjects() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    const projects = data ? JSON.parse(data) : [];
    const migrated = migrateProjects(projects);
    if (migrated.changed) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated.projects));
    }
    return migrated.projects;
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
  selectedLegendCode = null;
  completedCells = new Set(project.completedCells || []);
  actionHistory = [];
  
  // Set current project ID for editing
  currentProjectId = project.id;
  
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
  const toggleCodesBtn = document.getElementById('toggleCodes');
  const toggleGridBtn = document.getElementById('toggleGrid');
  const downloadGridBtn = document.getElementById('downloadGrid');
  const downloadLegendBtn = document.getElementById('downloadLegend');
  const downloadPngBtn = document.getElementById('downloadPng');
  const downloadGridImageBtn = document.getElementById('downloadGridImage');
  const newProjectBtn = document.getElementById('newProjectBtn');
  const legendEl = document.getElementById('legend');
  const gridEl = document.getElementById('grid');
  const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
  const sidebarEl = document.getElementById('sidebar');
  const colorContextMenu = document.getElementById('colorContextMenu');
  
  let loadedImage = null;
  let currentFileName = 'Untitled';
  
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
      btn.textContent = `${name} (${widthInches}" × ${heightInches}")`;
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
    
    // Clear content
    document.getElementById('grid').innerHTML = '';
    document.getElementById('legend').innerHTML = '';
    
    // Clear active project highlight
    document.querySelectorAll('.project-item').forEach(el => el.classList.remove('active'));
  });

  function setSidebarCollapsed(isCollapsed) {
    if (!sidebarEl || !sidebarToggleBtn) return;
    sidebarEl.classList.toggle('collapsed', isCollapsed);
    sidebarToggleBtn.setAttribute('aria-label', isCollapsed ? 'Expand sidebar' : 'Collapse sidebar');
    const labelSpan = sidebarToggleBtn.querySelector('span');
    if (labelSpan) labelSpan.textContent = isCollapsed ? 'Expand' : 'Collapse';
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
        
        // Update pattern info with both stitches and inches
        const widthInches = stitchesToInches(width);
        const heightInches = stitchesToInches(height);
        document.getElementById('patternInfo').textContent = 
          `${height} rows × ${width} columns (${widthInches}" × ${heightInches}" at ${meshCount} mesh) • ${currentResult.numColors} colors`;
        
        // Hide upload section and show result sections
        document.querySelector('.upload-section').classList.add('hidden');
        document.getElementById('controls').classList.add('visible');
        document.getElementById('resultSection').classList.add('visible');
        document.getElementById('downloadSection').classList.add('visible');
        
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
  
  legendEl.addEventListener('click', (e) => {
    const item = e.target.closest('.legend-item');
    if (!item || !item.dataset.code) return;
    const code = item.dataset.code;
    selectedLegendCode = selectedLegendCode === code ? null : code;
    renderGrid(parseInt(cellSizeInput.value));
    renderLegend();
  });
  
  legendEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const item = e.target.closest('.legend-item');
    if (!item || !item.dataset.code) return;
    e.preventDefault();
    const code = item.dataset.code;
    selectedLegendCode = selectedLegendCode === code ? null : code;
    renderGrid(parseInt(cellSizeInput.value));
    renderLegend();
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
    }
    persistCompletedCells();
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
          <div class="color-context-item ${code === currentCode ? 'active' : ''}" data-code="${code}">
            <span class="color-context-swatch" style="background:${colorMap[code]}"></span>
            <span>${code}</span>
          </div>
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
  
  gridEl.addEventListener('click', (e) => {
    if (colorContextMenu && colorContextMenu.classList.contains('visible')) {
      hideColorContextMenu();
      return;
    }
    const cell = e.target.closest('.cell');
    if (!cell || !cell.dataset.index) return;
    const index = parseInt(cell.dataset.index, 10);
    if (Number.isNaN(index)) return;
    
    if (completedCells.has(index)) {
      pushAction({ type: 'complete', index, prevCompleted: true });
      applyCompletion(index, false);
    } else {
      pushAction({ type: 'complete', index, prevCompleted: false });
      applyCompletion(index, true);
    }
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
