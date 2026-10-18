# Perceptual color quantization validation — 2026-10-18

The previous median-cut implementation chose its palette after shrinking the image to stitches. Large green regions were split repeatedly, averaging away small red details. The customer Christmas ornament could not retain its candy canes even at four colors.

The replacement samples the source before resizing, uses bounded Oklab clustering, checks for supported missing hue families, and favors hue when assigning stitches. The hue coverage check can replace a redundant nearby shade while protecting the dominant color, lightest and darkest centers, and hues already represented. It requires at least 0.5% source support after merging adjacent hue sectors. This is a heuristic, not semantic recognition or a guarantee that every small detail survives.

## Validation

- 12 dependency-free Node regression tests pass: `node --test tests/color-quantization.test.cjs`.
- The browser suite covers 24 images: 19 reproducible Canvas inputs, three generated images, the customer ornament, and the existing bear artwork.
- Each image runs at 52, 72, and 144 stitches on its longest edge with limits of 2, 3, 4, 6, 8, 16, 32, and 64 colors: 576 conversions and 4,215 passing assertions.
- Inputs cover shaded ornaments, flat logos, nearby pastel shades, grayscale and sunset gradients, line art, transparent and empty canvases, texture, small accents, wide/tall formats, skin tones, a pet photograph, and watercolor flowers.
- Source image generation used the built-in imagegen tool. Prompts are in `tests/fixtures/image-prompts.json`; reusable inputs and histograms are in `tests/fixtures/`.
- The ornament was also checked from its full-resolution original at 39, 52, 54, 72, 144, and 216 stitches. Four-color output retains pale green, dark green, white, and red.
- A saved project's 400px JPEG source retains the same four color families after editing; transparent pixels composite onto white.
- Visual review caught blue patches in dark portrait skin at four colors. Increasing hue weight during stitch assignment corrected that case, and a dedicated regression test covers it.
- The generated portrait retains its yellow flower at eight colors, the dog retains its red bandana, and the watercolor retains its blue butterfly.
- Local headless Chrome timings for the complete suite: median 7.9ms, 95th percentile 14.8ms per conversion. These timings exclude DOM grid rendering and do not predict mobile performance.

Open `tests/browser-color-validation.html` through a local static server to rerun the suite. An optional `?baseline=/path/to/previous-app.js` produces side-by-side comparisons. The originating BB thread retains a self-contained `artifacts/color-validation/report.html`, detailed JSON results, and the full-resolution generated originals.

## Limits

Low color budgets flatten photographs, and strokes finer than a stitch can blend into gray or disappear. A larger stitch grid or palette remains necessary for detailed photos and fine text. Existing saved patterns are not recolored until the user converts them again. The change does not perform automatic confetti cleanup, OCR, or thread-brand matching.
