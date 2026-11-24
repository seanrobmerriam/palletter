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
| Tonal | −15°, 0°, +15° | Close hues that differ strongly in lightness and chroma: one deep and saturated, one soft and light, one dusty in between. More refined than analogous. |

## Schemes defined by character

These schemes describe what each color does, not where it sits on the wheel. Palletter doesn't check their hues against reference angles, but the balance rules below still apply.

### Neutral + accent

What most products ship. A primary in the base hue, a neutral scale tinted with it, and at most one accent.

- The neutral does most of the work: backgrounds, surfaces, borders, and text. Give it a full, even scale, with chroma 0.005–0.02 in the primary's hue.
- Add an accent only when it helps: a hue that suits the mood, often warm against a cool primary or the other way round. Keep it for small things such as badges and highlights.

### Functional

A palette for application UI: a primary, a neutral, and four semantic colors with the roles `success`, `warning`, `danger`, and `info`.

- Each semantic color must still read as what it means: success green (about 145–160°), warning amber (about 70–85°), danger red (about 20–30°), and info blue (about 230–250°).
- Tune them to the primary within those ranges. A warm primary gets a warmer red, a golden amber, and an olive-leaning green. A cool primary gets a crimson red, a cleaner yellow-amber, and a teal-leaning green. If the primary is itself blue, move info toward cyan or indigo so they don't clash.
- Match the semantic colors' chroma to each other, at about the primary's level for the saturation, and give red and green different lightness at the same step (see [accessibility.md](accessibility.md)).
- Palletter leaves semantic colors' hue and chroma as you give them, apart from the hue drift along each scale.

### Sourced

A palette drawn from something real: a landscape, a material, a film stock, an interior, or an art movement. Use the scene the user names in the mood or note. If there isn't one, choose a scene that fits the hues and mood.

- Pick 3 to 5 colors the way they appear in the scene, including its quiet colors (shadows, stone, paper) and not only its brightest ones. One of them leads, and at least one should be a near-neutral.
- Name the colors after what they are in the scene, unless the request asks for another kind of name, and say in the rationale what the palette was drawn from.
- Keep the user's hues: make the scene one in which they belong.

## The angles are a starting point

oklch hue is perceptual, but some hues still look better when nudged. Move a hue up to about 15° from its reference angle when it makes the palette look better. For example:

- Pure yellow (around 95–100°) is hard to use. Nudge it toward gold (85–90°) or toward lime.
- Greens around 145° can look artificial. Nudge toward 155–165° for a fresher green, or toward 130° for olive.
- Reds read as more confident around 25–30° than at exactly 20°.

Stay within 35° of the reference angles. Palletter then pulls supporting and accent hues up to 12° toward the primary's hue (a common cast), and warns the user only when a palette strays further than both allow.

## Balance

Palettes look harsh when every color is equally loud. Real designs give each color a job, and the job sets how much chroma it gets. The scheme decides the hues; the roles decide how loud each one is.

| Role | Peak chroma | Used for |
| ---- | ----------- | -------- |
| Primary (leads) | The full chroma the saturation asks for | Brand, main actions. The one color people remember. |
| Secondary, tertiary (support) | About 50–70% of the primary's peak | Secondary actions, illustrations, charts, highlights that sit behind the primary. |
| Accent | Up to the primary's peak | Small doses only: a badge, a call to action, a focus ring. |
| Neutral | 0.005–0.02 | Backgrounds, surfaces, borders, body text. Most of the screen. |

- Exactly one color leads. If the request lists roles, the first role leads unless another role is clearly the primary or brand.
- Palletter moves the middle steps (300–700) of supporting and accent colors toward the primary's lightness, so give them about the same lightness as the primary at each step, except yellows, ambers, and limes, which sit lighter (see [scales.md](scales.md)).
- Palletter caps supporting colors at 70% of the primary's peak chroma, unless the saturation is `pure` or the color holds the user's exact value. Choose supporting colors that look right at that level instead of relying on the cap.
- In complementary, triadic, and tetradic schemes, soften the colors opposite the primary. A muted complement looks designed; two full-chroma opposites look like a sports kit.
- Make neutrals a grey with a little chroma in the primary's hue. This makes them feel part of the palette. A neutral doesn't count toward the scheme's hues.
