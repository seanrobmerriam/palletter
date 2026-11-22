# Color theory for Palletter

All hues in this guide are oklch hue angles in degrees. Some landmarks:

| Hue | Color |
| --- | ----- |
| 25 | red |
| 50 | orange-red |
| 70 | orange |
| 95 | yellow |
| 130 | yellow-green |
| 145 | green |
| 180 | teal |
| 210 | cyan |
| 250 | blue |
| 280 | indigo |
| 305 | violet |
| 330 | magenta |
| 0 | pink |

## Schemes

Each scheme places its hues around a base hue. The base hue is the user's first hue, unless the request says otherwise. The request gives reference hues for each scheme when it can calculate them.

| Scheme | Offsets from the base hue | Notes |
| ------ | ------------------------- | ----- |
| Monochromatic | 0° | One hue. Variety comes only from lightness and chroma. |
| Analogous | −30°, 0°, +30° | Neighbours. Harmonious and low in tension. |
| Complementary | 0°, 180° | Opposites. Use one as the dominant color and the other as an accent. |
| Split-complementary | 0°, +150°, +210° | The base plus the two neighbours of its complement. Contrast with less tension. |
| Triadic | 0°, +120°, +240° | Evenly spaced. Vibrant, so usually one color dominates and the others support. |
| Tetradic | 0°, +60°, +180°, +240° | Two complementary pairs (a rectangle). Rich, but hardest to balance. Let one color lead. |

## The angles are a starting point

oklch hue is perceptual, but some hues still look better when nudged. Move a hue up to about 15° from its reference angle when it makes the palette look better. For example:

- Pure yellow (around 95–100°) is hard to use. Nudge it toward gold (85–90°) or toward lime.
- Greens around 145° can look artificial. Nudge toward 155–165° for a fresher green, or toward 130° for olive.
- Reds read as more confident around 25–30° than at exactly 20°.

Palletter warns the user when a palette strays more than 35° from the scheme, so stay within that.

## Balance

- Decide which color leads. In most palettes one color is the brand or primary color, and the others support it.
- Supporting colors can have less chroma than the leading color, so they don't compete with it.
- If the user wants a neutral, make it a grey with a little chroma (0.005–0.02) in the leading color's hue. This makes it feel part of the palette. A neutral doesn't count toward the scheme's hues.
