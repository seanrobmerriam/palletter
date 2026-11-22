# Palletter: Color Palette Generator for the Web

Palletter is a web application for generating color palettes for use on the web. Choose a base color, the relationship you want the colors to have, and any other rules or constraints you want on the palette. Palletter will give you a set of tokens along with their color values that you can copy and paste into your CSS.

> **Status:** early development. The workflow below describes the intended v1 behavior. See [PLAN.md](./PLAN.md) for the development plan and current milestones.

## How it works

Palletter turns your input into a prompt and sends it over the [Agent Client Protocol (ACP)](https://agentclientprotocol.com) to your connected model. The model generates the palette by following the Palletter skills and its own training, then returns the colors and tokens.

Palletter doesn't take the model's output on faith. Before you see a palette, Palletter:

1. **Validates** the response against a strict schema. If the response is malformed, it asks the model to fix it.
2. **Converts** each color into the color system you picked, so the values are exact and consistent instead of approximated by the model.
3. **Checks** contrast between the colors in the palette and flags pairs that won't meet WCAG AA for text.
4. **Formats** the tokens in your chosen format, ready to paste.

```
┌──────────┐  palette request  ┌──────────────────┐   prompt + skills   ┌──────────────┐
│ Browser  │ ────────────────► │ Palletter server │ ──────── ACP ─────► │  Your agent  │
│   (UI)   │ ◄──── stream ──── │  (Astro / Node)  │ ◄──── response ──── │   / model    │
└──────────┘  tokens + preview └──────────────────┘                     └──────────────┘
                                validate · convert · contrast · format
```

Because ACP agents run as local processes, Palletter runs on your machine and uses the agent you already have installed and signed in. Palletter never sees or stores your API keys.

## Workflow

The basic workflow can be as objective or subjective as you want. Your model will do all the heavy lifting. All but step 1 are optional, though you will get better results with more information provided.

1. **Hues.** Choose a single hue or a set of hues you want included in your palette. You can enter a color value, use the picker, or name a color (`"terracotta"`). You can also add a mood or feeling you want the palette to convey (`"calm, trustworthy, a little playful"`).
2. **Token format.** Choose the type of tokens you want, e.g. Tailwind CSS, or plain custom properties such as `--brand-[color]` or `--color-[mood]`.
3. **Scale.** Choose between a full value set (e.g. `--color-50` to `--color-950`), or a specific range of values (e.g. `--color-100` to `--color-300`).
4. **Saturation.** Choose saturation, e.g. vivid, muted, pure, pastel, or earthy.
5. **Color system.** Choose a color system, e.g. oklch, hex, rgb, hsl, or cmyk.
6. **Relationships.** Choose the roles you need, e.g. primary, secondary, and tertiary, and the temperature you want for each (warm, cool, or neutral).
7. **Schemes.** Finally, choose the schemes you need. This decides the actual outputs you get, e.g. monochromatic, analogous, complementary, split-complementary, triadic, or tetradic.
8. Hit **Create**.

Each scheme you select produces its own palette, so you can compare them side by side and copy the one you like.

## Color Systems

The supported systems are:

| System | Example | Notes |
| ------ | ------- | ----- |
| oklch  | `oklch(62.8% 0.177 259.8)` | Default. Perceptually uniform, so scales step evenly in lightness. Supports wide-gamut (P3) colors. |
| rgb    | `rgb(37 99 235)` | Modern space-separated syntax. |
| hex    | `#2563eb` | Most widely supported. |
| hsl    | `hsl(221 83% 53%)` | Easy to adjust by hand. |
| cmyk   | `cmyk(84% 58% 0% 8%)` | For reference and print handoff. Browsers don't support CMYK in CSS yet, so Palletter also outputs a web-safe value next to each CMYK token. |

When a color from the model is outside the sRGB gamut and you choose an sRGB-based system (rgb, hex, hsl), Palletter maps it into gamut and marks it so you know the value was adjusted.

## Palette Types

A palette type (or scheme) describes how the hues in the palette relate to each other on the color wheel. Pick one or more.

| Scheme | Hues | What it's good for |
| ------ | ---- | ------------------ |
| **Monochromatic** | 1 hue, many lightness and chroma steps | Calm, cohesive interfaces. The safest choice for UI. |
| **Analogous** | 3 neighboring hues (about 30° apart) | Harmonious, low-tension palettes, common in nature. |
| **Complementary** | 2 opposite hues (180°) | High contrast. A strong accent against a base color. |
| **Split-complementary** | Base plus the 2 hues next to its complement (about 150° and 210°) | Contrast with less tension than complementary. |
| **Triadic** | 3 evenly spaced hues (120°) | Vibrant, balanced palettes. Usually one hue dominates. |
| **Tetradic** | 4 hues in two complementary pairs (rectangle or square) | Rich palettes with many options. Hardest to balance. |

The angles are a starting point. The Palletter skills tell the model to adjust hues, lightness, and chroma so the result looks good, rather than placing colors on exact angles.

## Saturation

| Option | Description |
| ------ | ----------- |
| Vivid  | High chroma. Bold and energetic. |
| Pure   | The most saturated version of each hue that still works on screen. |
| Muted  | Reduced chroma. Sophisticated and calm. |
| Pastel | High lightness, low chroma. Soft and friendly. |
| Earthy | Low chroma, shifted toward warm. Natural and grounded. |
| Custom | Describe what you want in your own words. |

## Token Formats

Palletter can output tokens as:

- **CSS custom properties.** You choose the naming pattern, e.g. `--brand-[color]-[step]`, `--color-[role]-[step]`, or `--color-[mood]-[step]`.
- **Tailwind CSS v4.** An `@theme` block, so the colors are available as utilities such as `bg-brand-500`.
- **Design Tokens JSON.** In the [W3C Design Tokens Community Group](https://www.designtokens.org) format, for tools such as Style Dictionary and Figma plugins.

### Example output

A monochromatic `brand` palette in oklch, as CSS custom properties, with the range `100` to `300`:

```css
:root {
  --brand-100: oklch(93.2% 0.032 255.6);
  --brand-200: oklch(88.2% 0.059 254.1);
  --brand-300: oklch(80.9% 0.105 251.8);
}
```

The same palette as a Tailwind v4 theme:

```css
@theme {
  --color-brand-100: oklch(93.2% 0.032 255.6);
  --color-brand-200: oklch(88.2% 0.059 254.1);
  --color-brand-300: oklch(80.9% 0.105 251.8);
}
```

## Scales

| Option | Steps |
| ------ | ----- |
| Full   | `50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950` |
| Range  | Any contiguous range of the full scale, e.g. `100` to `300` |
| Count  | A specific number of evenly spaced steps, e.g. 5 |

Step `500` is anchored to your base hue unless you say otherwise. Lower numbers are lighter and higher numbers are darker, so the same token works the way you'd expect from Tailwind.

## Getting Started

### Requirements

- [Node.js](https://nodejs.org) 22 or later, or [Bun](https://bun.sh)
- An ACP-compatible agent installed and signed in on your machine, such as Claude Code (through its ACP adapter), Gemini CLI, or any other agent that speaks ACP

### Install and run

```bash
bun install
```

```bash
bun run dev
```

Then open <http://localhost:4321>.

### Connect your agent

Tell Palletter how to start your agent by setting the command in a `.env` file at the project root:

```bash
PALLETTER_AGENT_COMMAND="<command that starts your agent in ACP mode>"
```

Check your agent's documentation for its ACP command.

Palletter starts the agent when you create a palette and shuts it down when you're done. The agent is given only the palette request and the Palletter skills. It isn't given access to your files or terminal.

## Development

| Command | Action |
| ------- | ------ |
| `bun install` | Install dependencies |
| `bun run dev` | Start the dev server at `localhost:4321` |
| `bun run build` | Build the production site to `./dist/` |
| `bun run preview` | Preview the build locally |
| `bun run test` | Run the unit tests |

### Project structure

```
/
├── public/              Static assets
├── skills/              The Palletter skills the agent follows
├── src/
│   ├── components/      Astro components and UI islands
│   ├── layouts/
│   ├── lib/
│   │   ├── acp/         ACP client and agent process management
│   │   ├── color/       Conversion, gamut mapping, and contrast
│   │   ├── format/      Token formatters (CSS, Tailwind, JSON)
│   │   └── prompt/      Prompt builder and response schema
│   ├── pages/
│   │   ├── api/         Server endpoints
│   │   └── index.astro  The generator
│   └── styles/          Layered CSS (base, patterns, components, utilities)
└── PLAN.md              Development plan
```

Full Astro documentation: <https://docs.astro.build>.

## Roadmap

See [PLAN.md](./PLAN.md).
