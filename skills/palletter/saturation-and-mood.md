# Saturation, temperature, and mood

## Saturation

The request may name a saturation. Values are chroma at the peak step of the primary color's scale (usually 500 or 600). Supporting colors peak lower, as [color-theory.md](color-theory.md) (Balance) describes, except with `pure`. Scale the other steps along the chroma curve in [scales.md](scales.md).

| Saturation | Peak chroma | Notes |
| ---------- | ----------- | ----- |
| vivid | 0.18–0.25 | Bold and energetic. |
| pure | the sRGB limit for that hue and step | The cleanest, most saturated version of each hue. Use the limits table in [scales.md](scales.md). |
| muted | 0.06–0.12 | Calm and sophisticated. Keep lightness the same as a normal scale. |
| pastel | 0.04–0.10 | Soft. Move steps 300–700 up by about 5% lightness. |
| earthy | 0.04–0.10 | Natural. Nudge hues toward warm (between 30° and 90°), and keep greens toward olive. |

A custom saturation is described in the user's own words. Interpret it with the table as a guide.

The sRGB limits in [scales.md](scales.md) always win: if the table above asks for more chroma than a hue allows, use the limit. Teals and cyans in particular can't go above about 0.11 at step 500.

If the request doesn't name a saturation, choose what suits the hues and mood. Most UI palettes work well around 0.14–0.20.

## Temperature

The request may give a temperature for a role.

- **Warm:** hues from about 0° to 100° (pinks, reds, oranges, yellows). To warm a color without changing it completely, move its hue up to 15° toward 60°.
- **Cool:** hues from about 150° to 300° (greens, teals, blues, violets). To cool a color, move its hue up to 15° toward 230°.
- **Neutral:** chroma from 0.005 to 0.02, in the hue of the palette's leading color. A neutral is a tinted grey, not a pure grey.

## Mood

The request may describe a mood. Use it to choose hues where the request leaves them open, and to choose chroma and lightness. Some starting points:

| Mood | Hue | Chroma | Lightness |
| ---- | --- | ------ | --------- |
| Calm, peaceful | blues, teals, soft greens | low to medium | slightly lighter |
| Trustworthy, professional | blues, navy | medium | normal, with strong dark steps |
| Energetic, exciting | reds, oranges, magentas | high | normal |
| Playful, friendly | yellows, corals, bright teals | medium to high | slightly lighter |
| Luxurious, elegant | deep purples, emerald, gold | low to medium | darker |
| Natural, organic | greens, browns, ochres | low | normal |
| Serious, technical | greys, blue-greys | low | normal |
| Warm, welcoming | oranges, terracotta, warm yellows | medium | normal |

When the mood conflicts with the user's hues, keep the hues and express the mood with chroma and lightness.
