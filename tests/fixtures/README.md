# Color regression fixtures

`christmas-ornament-colors.json` is a compact color histogram from the customer-provided Christmas ornament that exposed the missing-red bug. The image was sampled on white at 512 × 512 pixels in Chrome, grouped into 16-value RGB bins, and recorded as `[meanR, meanG, meanB, pixelCount]`. The unit tests expand this histogram and require a four-color palette containing two greens, white, and red. No palette colors are prescribed by exact hex value.

`generated/` contains 512 × 512 JPEG inputs for the browser validation suite. `christmas-ornament.jpg` is the customer example; the three other fixtures were created with the built-in imagegen tool on 2026-10-18, then resized with Canvas and saved at JPEG quality 0.88. Full-resolution originals and the visual report are retained in the originating BB thread's `artifacts/color-validation/` directory. Prompts are recorded in `image-prompts.json`.

The visual suite also generates deterministic flat artwork, gradients, seeded texture, transparency, small accents, and wide/tall patterns directly in Canvas. Assertions cover important color families, geometry, palette limits, unique colors, and agreement between grid and legend counts. Visual review complements these assertions; passing them does not establish perceptual quality for every possible photograph.
