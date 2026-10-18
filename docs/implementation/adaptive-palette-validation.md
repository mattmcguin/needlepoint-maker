# Automatic palette sizing — 2026-10-18

Maximum colors is a ceiling. The converter tries successively larger palettes and stops when a smaller palette retains enough perceptual detail, rather than filling every available slot with another shade. This is a practical fidelity budget, not a mathematically unique optimum.

## Selection rule

Palette candidates use the existing deterministic source-color seeds, weighted Oklab refinement, and supported-hue protection. A candidate can stop growing only when supported hue families are represented and either the source-color sample or the stitch-grid sample meets both criteria:

- Weighted RMS error at most 0.025 in Oklab with chroma differences weighted by four, matching stitch assignment.
- At least 95% of sampled pixels have distance at most 0.06.

For a source containing at most 64 exact colors, fields representing at least 5% of the source must also stay within distance 0.03. This keeps distinct pastel fields separate while allowing nearly identical shades to share a thread. Exact-color detection is independent of the user's ceiling, so increasing the ceiling does not change the sampling method.

Checking source colors avoids overfitting resampling blends; checking stitches avoids adding threads for source texture and compression artifacts that disappear at stitch resolution. The previous accent-color protection still applies. Existing saved patterns keep their colors until reconverted.

## Reference-pair benchmark

Eight original designs define ideal stitch grids independently of the converter: a holiday ornament, sailboat and red flag, sunflower, monogram badge, tartan heart, illustrated portrait, eight-color quilt, and four pastel fields. Their intended palettes contain three to eight colors.

Each target is rendered as clean, shaded/textured, lit, and JPEG-compressed source artwork. Each variant is converted at its intended thread budget and ceilings of 30 and 64. Passing requires:

- No more threads than the intended target palette.
- At least 98% of stitches classified as their intended target color.
- Perceptual RMS color error no greater than 0.035 against the ideal grid.

All 96 browser comparisons pass. The dependency-free Node runner covers clean, shaded, and lit sources; the browser adds Canvas resizing and JPEG decoding.

## Published-design reference

[Brooke Thorn McGowan's free Tartan Heart](https://brookethorn.substack.com/p/free-needlepoint-pattern-tartan-heart) provides an external reference with a documented 47 × 47 stitch grid and three thread pairings. The chart was sampled at cell centers to establish the expected three-color grid; clean, shaded, lit, and JPEG source variants were rendered from that grid. This validates recovery from controlled degradations of a published design. It does not claim to reconstruct a photograph of the physical stitched piece, which includes weave, lighting, and geometric distortion.

All 12 external comparisons use three colors at ceilings of 3, 30, and 64, with 100% stitch-color classification accuracy. The external image and extracted grid are retained in the originating thread's private validation artifacts, rather than vendored into the repository. The report credits the original author and links to the source. Published [Rainbow Gallery free charts](https://www.rainbowgallery.com/free-charts/free-needlepoint-charts/) were also inspected as style references; their decorative stitch diagrams were not treated as simple per-cell color ground truth.

## Regression coverage and observed results

- All 23 Node tests pass: `node --test tests/*.test.cjs`.
- The varied-image suite passes 4,227 checks across 24 images and 576 conversions, including three stitch sizes and ceilings of 2, 3, 4, 6, 8, 16, 30, and 64.
- Nine reference pairs pass 108 browser comparisons in total, including the external chart check.
- The original Christmas ornament selects six colors from its original source; its compressed 512px fixture selects seven. Increasing the ceiling to 30 or 64 does not inflate the palette. A ceiling of four still retains two greens, white, and red.
- The generated portrait needs 20 colors under a ceiling of 30 in the source-histogram test; detailed photo inputs can still use their full ceiling.
- Large flat pastels stay distinct; near-identical shades merge; gradients retain multiple tones; transparent pixels composite onto white.

## Rerunning and review

Serve the repository and open `tests/browser-color-validation.html` for the varied-image suite, or `tests/paired-pattern-validation.html` for the reference-pair suite. Both accept `?baseline=/path/to/previous-app.js` for before/after comparisons. Original fixture geometry is in `tests/paired-pattern-fixtures.js`; generated photo provenance remains in `tests/fixtures/image-prompts.json`.

The originating BB thread retains self-contained HTML reports, JSON scores, the external chart sampling script and source attribution, and live-site verification. The quality thresholds encode the current preference for fewer threads with useful detail; unusual artwork and finer work may warrant future tuning.
