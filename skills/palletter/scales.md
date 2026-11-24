# Building scales in oklch

A scale is one color at several lightness steps, from step 50 (lightest) to step 950 (darkest). Each step must look like the same color, just lighter or darker.

## Lightness

Space lightness so each step looks evenly different from the next. Aim for these values and stay within about 3% of them:

| Step | Lightness |
| ---- | --------- |
| 50 | 97% |
| 100 | 94% |
| 200 | 88% |
| 300 | 81% |
| 400 | 71% |
| 500 | 63% |
| 600 | 55% |
| 700 | 48% |
| 800 | 42% |
| 900 | 37% |
| 950 | 27% |

Adjust for the hue:

- Yellows, limes, and oranges look darker than other hues at the same chroma, and they need more lightness to stay recognisable. Move their 400–600 steps up by 5–10%, so yellow 500 sits around 75–80%.
- Blues, indigos, and violets can sit a few percent lower at 500.
- If the user's exact color is much lighter or darker than the step it was placed at, shift neighbouring steps so the scale stays evenly spaced.

## Chroma

Chroma is how colorful the color is. In a good scale, chroma follows a curve:

- Low at the light end: steps 50–100 have about 10–20% of the peak chroma, and 200 about 35%.
- Highest in the middle, usually at 500 or 600.
- Falling again at the dark end: 900 has about 60% of the peak, and 950 about 45%.

If the dark steps keep full chroma, they look neon. If they lose too much, they look muddy.

## Hue drift

Palletter adds a small hue drift along every scale itself, the way real pigments shift: dark steps move toward blue-violet (yellows and ambers move toward orange and brown instead), and light steps move a little the other way. The drift is up to about 7° at the dark end and 5° at the light end, measured from the most colorful step.

So keep each color's hue the same at every step. Don't add drift of your own, or it will be doubled.

## Gamut

Most screens can only show sRGB colors, and how much chroma fits in sRGB depends on both lightness and hue. These are the highest chroma values that fit at each step's target lightness:

| Step | Red 25° | Orange 50° | Amber 70° | Yellow 95° | Green 145° | Teal 180° | Cyan 210° | Blue 250° | Indigo 280° | Violet 305° | Pink 330° |
| ---- | ------- | ---------- | --------- | ---------- | ---------- | --------- | --------- | --------- | ----------- | ----------- | --------- |
| 50 | 0.015 | 0.017 | 0.023 | 0.050 | 0.054 | 0.044 | 0.028 | 0.015 | 0.015 | 0.019 | 0.025 |
| 100 | 0.031 | 0.035 | 0.045 | 0.098 | 0.111 | 0.090 | 0.055 | 0.031 | 0.030 | 0.037 | 0.050 |
| 200 | 0.064 | 0.072 | 0.093 | 0.181 | 0.248 | 0.160 | 0.110 | 0.062 | 0.060 | 0.074 | 0.105 |
| 300 | 0.108 | 0.120 | 0.154 | 0.166 | 0.255 | 0.147 | 0.140 | 0.100 | 0.098 | 0.120 | 0.178 |
| 400 | 0.184 | 0.188 | 0.154 | 0.146 | 0.223 | 0.129 | 0.123 | 0.158 | 0.155 | 0.191 | 0.302 |
| 500 | 0.256 | 0.167 | 0.137 | 0.129 | 0.198 | 0.114 | 0.109 | 0.178 | 0.204 | 0.252 | 0.287 |
| 600 | 0.223 | 0.146 | 0.119 | 0.113 | 0.173 | 0.100 | 0.095 | 0.156 | 0.256 | 0.286 | 0.251 |
| 700 | 0.195 | 0.127 | 0.104 | 0.099 | 0.151 | 0.087 | 0.083 | 0.136 | 0.291 | 0.250 | 0.219 |
| 800 | 0.171 | 0.111 | 0.091 | 0.086 | 0.132 | 0.076 | 0.073 | 0.119 | 0.254 | 0.218 | 0.192 |
| 900 | 0.150 | 0.098 | 0.080 | 0.076 | 0.117 | 0.067 | 0.064 | 0.105 | 0.224 | 0.193 | 0.169 |
| 950 | 0.110 | 0.072 | 0.059 | 0.056 | 0.086 | 0.049 | 0.047 | 0.077 | 0.164 | 0.141 | 0.124 |

- For hues between the columns, use the lower of the two neighbouring values.
- If you move a step's lightness, the limit moves too: lighter steps near the top of the scale, and darker steps near the bottom, allow less chroma.
- Stay a little below the limit, about 90% of it, unless the saturation is pure.
- When the chroma curve from the section above asks for more than the limit, use the limit. This happens most at the light end of blues, indigos, and reds, and across the scale for teals and cyans.

Palletter adjusts colors that don't fit and tells the user, but it's better to choose colors that don't need adjusting.
