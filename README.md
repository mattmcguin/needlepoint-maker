# Needlepoint Pattern Converter

A web application that transforms any image into a needlepoint canvas pattern, complete with color-coded stitch guides and downloadable outputs. Built with HTML, CSS, and JavaScript because why use many tools when few do trick?

**Live Demo:** [needlepointmaker.com](https://needlepointmaker.com/)

## Why I Built This

My wife enjoys needlepoint as a hobby, but finding patterns for specific images she wanted to stitch was difficult. Commercial pattern generators often produce results with too many colors or awkward dimensions. This tool gives her full control over the conversion process—she can adjust the canvas size, limit the color palette, and export everything needed to start stitching.

## Features

- **Image to Pattern Conversion**: Upload any image and convert it to a grid-based needlepoint pattern
- **Configurable Dimensions**: Set custom height (rows) and width (columns) for the canvas
- **Color Palette Control**: Limit the number of colors using median cut quantization
- **Interactive Grid**: Zoom in/out, toggle color codes, and show/hide grid lines
- **Color Legend**: View all colors with their codes, hex values, and stitch counts
- **Project Management**: Automatically saves projects to browser storage for later access
- **Multiple Export Options**:
  - Grid CSV (stitch-by-stitch color codes)
  - Legend CSV (color reference chart)
  - Preview PNG (quantized image)
  - Grid Image PNG (full pattern with codes)

## Usage

### Running the Application

Open `index.html` in a web browser. No build step or server required.

```bash
# macOS
open index.html

# Linux
xdg-open index.html

# Or simply double-click index.html in your file manager
```

### Converting an Image

1. Click **+ New Project** or select an image file
2. Set the desired canvas dimensions:
   - **Height (rows)**: Number of stitch rows (default: 72)
   - **Width (cols)**: Number of stitch columns (default: 60)
   - **Max Colors**: Upper limit for the color palette (default: 20)
3. Click **Convert**
4. Use the controls to adjust the display:
   - **Cell Size**: Slider to zoom the grid view
   - **Hide/Show Codes**: Toggle color code labels on each cell
   - **Toggle Grid Lines**: Show or hide the grid borders

### Exporting Patterns

After conversion, use the download buttons:

- **Download Grid CSV**: A spreadsheet with color codes for each stitch position
- **Download Legend CSV**: A reference table mapping codes to hex colors and counts
- **Download Preview PNG**: The quantized image at canvas resolution
- **Download Grid Image**: A high-resolution image of the pattern grid with codes

### Managing Projects

- Projects are automatically saved to browser local storage
- Click any project in the sidebar to reload it
- Click the **×** button to delete a project
- Use **Clear All Projects** to remove all saved data

## Technical Details

### Color Quantization

The application uses the **median cut algorithm** to reduce the image's color palette:

1. Collect all pixels from the resized image
2. Recursively split the color space along the axis with the largest range
3. Continue until reaching the target number of color "boxes"
4. Average the colors in each box to produce the final palette
5. Map each original pixel to its nearest palette color

### File Structure

```
needlepoint/
├── images/       # Favicon, logo, and OG images
├── index.html    # Application markup
├── styles.css    # UI styling
├── app.js        # Core logic (quantization, rendering, storage)
└── README.md     # This file
```

### Browser Requirements

- Modern browser with ES6 support
- Canvas API for image processing
- LocalStorage for project persistence

## License

MIT
