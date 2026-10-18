# Retaining dark lettering and outlines

The Christmas ornament exposed a spatial regression that a correct palette alone could not prevent. High-quality RGB downsampling mixed thin dark-green marks with the pale field. Mapping those averages to the palette then selected a medium green, or the background at a four-color ceiling.

The converter now measures area-weighted source palette coverage for each stitch in predominantly flat artwork. A supported dark majority, or a narrow dark mark against a light field, can retain its ink thread instead of its diluted average. The correction applies to lightened stitches of a compatible hue; already-dark stitches, bright fields, and other colored details retain normal mapping. It does not add threads or prescribe green-specific colors.

The artwork gate requires at least 80% of sampled source pixels to be within 0.03 hue-weighted Oklab distance of a palette with at most 12 colors, and at least two source samples per stitch in each dimension. Dark ink has Oklab lightness below 0.6. A minority stroke requires 20% source coverage against at least 25% lighter coverage (a lightness difference of at least 0.15); a dark majority requires 50%. Only target pixels currently assigned a light thread (lightness at least 0.6), whose average is at least 0.04 lighter than the ink and below 0.9, with chroma distance below 0.08 from that ink are corrected. Dark source pixels blurred by compression can map to a nearby dark thread within 0.12 perceptual distance. These are practical needlepoint heuristics, not a guarantee for every line drawing. Detailed photographs continue through normal image resampling.

## Evidence

- All 26 Node tests pass: `node --test tests/*.test.cjs`.
- Three new tests independently specify a narrow E, a continuous square border, and red/white controls in green, navy, and black. Source strokes are two pixels wide within eight-pixel stitch cells. All three fail against the preceding release and pass at ceilings of 4, 30, and 64 with this change.
- The browser suite passes 4,695 checks across 26 images and 624 conversions. A lossless spatial ornament fixture and the actual 400px JPEG stored by the project-save flow supplement the existing color histogram. At three sizes and ceilings from 4 to 64, at least 95% of supported lettering and circular-border stitches must remain dark green.
- All 96 original source/ideal reference comparisons still pass. All 12 comparisons against the previously attributed published tartan chart still recover its three colors with 100% stitch classification accuracy. Reference provenance and limitations remain in [adaptive-palette-validation.md](adaptive-palette-validation.md).
- Measurements against the original 1254px customer PNG cover 52, 72, and 144 stitches at ceilings of 4, 30, and 64. At least 99% of supported text stitches and 100% of supported border stitches remain dark. Red/white candy-cane stitch classifications stay unchanged. Before/after comparisons warm browser resize caches at each size to compare consistent resampling.
- At 144 stitches and ceiling 30, measured text retention improves from 62.5% to 99.8%; border retention improves from 50.7% to 100%. Four-color output still uses two greens, white, and red, and a generous ceiling still uses six source colors.

Self-contained before/after images, full browser reports, and JSON measurements are retained in the originating BB thread's `artifacts/ink-contrast/` directory. Existing patterns require reconversion to apply the change; the saved pattern's chosen colors are not silently altered.
