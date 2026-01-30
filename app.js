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
  const borderWidth = showGridLines ? 1 : 0;
  
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
  
  // Use thumbnail as preview (original image not stored to save space)
  document.getElementById('originalPreview').src = project.thumbnail;
  document.getElementById('previewSection').classList.add('visible');
  
  // Render quantized preview
  const quantizedCanvas = document.getElementById('quantizedPreview');
  const img = new Image();
  img.onload = () => {
    quantizedCanvas.width = img.width;
    quantizedCanvas.height = img.height;
    quantizedCanvas.getContext('2d').drawImage(img, 0, 0);
  };
  img.src = project.quantizedImage;
  
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
  
  // Load existing projects on startup
  renderProjectList();
  
  clearAllBtn.addEventListener('click', clearAllProjects);
  
  newProjectBtn.addEventListener('click', () => {
    // Reset everything for a new project
    imageInput.value = '';
    loadedImage = null;
    currentFileName = 'Untitled';
    currentResult = null;
    convertBtn.disabled = true;
    
    // Hide all sections
    document.getElementById('previewSection').classList.remove('visible');
    document.getElementById('controls').classList.remove('visible');
    document.getElementById('resultSection').classList.remove('visible');
    document.getElementById('downloadSection').classList.remove('visible');
    
    // Clear content
    document.getElementById('originalPreview').src = '';
    document.getElementById('quantizedPreview').getContext('2d').clearRect(0, 0, 9999, 9999);
    document.getElementById('grid').innerHTML = '';
    document.getElementById('legend').innerHTML = '';
    
    // Clear active project highlight
    document.querySelectorAll('.project-item').forEach(el => el.classList.remove('active'));
    
    // Focus on file input
    imageInput.click();
  });
  
  imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) {
      convertBtn.disabled = true;
      return;
    }
    
    // Reset UI - hide results until convert is clicked
    document.getElementById('controls').classList.remove('visible');
    document.getElementById('resultSection').classList.remove('visible');
    document.getElementById('downloadSection').classList.remove('visible');
    document.getElementById('grid').innerHTML = '';
    document.getElementById('legend').innerHTML = '';
    document.getElementById('quantizedPreview').getContext('2d').clearRect(0, 0, 9999, 9999);
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
        convertBtn.disabled = false;
        
        // Show original preview
        document.getElementById('originalPreview').src = event.target.result;
        document.getElementById('previewSection').classList.add('visible');
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
        
        // Update quantized preview
        const quantizedCanvas = document.getElementById('quantizedPreview');
        const processingCanvas = document.getElementById('processingCanvas');
        quantizedCanvas.width = processingCanvas.width;
        quantizedCanvas.height = processingCanvas.height;
        quantizedCanvas.getContext('2d').drawImage(processingCanvas, 0, 0);
        
        // Update pattern info
        document.getElementById('patternInfo').textContent = 
          `${height} rows × ${width} columns • ${currentResult.numColors} colors`;
        
        // Show result sections
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
});
