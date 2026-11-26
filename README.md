# Palletter: Color Palette Generator for the Web

<img src="docs/images/built-with-claude.png" alt="Built with Claude" height="40">

Palletter is a web application for building color palettes for the web. Enter colors you like, and your agent suggests colors you didn't pick that work with them, in a few different directions, and says why each one works. Keep the ones you like, and Palletter builds your palette: a scale for each color, contrast checks, and tokens you can paste into your CSS.

> **Status:** in development. Suggesting, curating, and building palettes works end to end. Saving and sharing palettes is next. See [PLAN.md](./PLAN.md) for the plan and milestones.

![Palletter with three colors (mint, aqua, and bronze) and "Tropical, calm, but vivid." Claude Code suggests two directions. The first, "Shallows & driftwood", adds a warm sand background, deep lagoon text, a reef teal call to action, and a wet sand border, each with a reason, a Keep checkbox, and More like this.](docs/images/suggestions.png)

![The palette built from the first direction: a 50–950 scale for each of the seven colors with its role, a note on what balancing changed, and the Preview tab, where warm sand is the page, deep lagoon the text, reef teal the buttons, and lagoon mint the accent, in light and dark.](docs/images/palette.png)

## How it works

The agent does what only an agent can: it looks at your colors and has taste. Palletter does everything that can be calculated.

1. **The agent suggests.** Palletter sends your colors, what they're for, and any hints to your agent over the [Agent Client Protocol (ACP)](https://agentclientprotocol.com). Following the Palletter suggestion skill ([`skills/palletter/suggest.md`](./skills/palletter/suggest.md)), the agent comes back with a few **directions**: each a different idea for completing your palette, with 3 to 5 new colors, a role for each (background, text, call to action…), and a sentence on why it works with yours.
2. **Palletter checks the suggestions.** It validates the reply against a strict schema and asks the agent to fix it once if needed, keeps your exact colors exactly, and drops any suggestion that's barely different from a color you already have.
3. **You curate.** Keep the colors you like, from any direction. **More like this** asks for variations on one color, and **More directions** asks for new ideas. Both continue the same agent session, so the agent knows what it already suggested.
4. **Palletter builds the palette, in your browser.** No agent is involved, so it's instant and updates as you keep colors. Each color gets a 50–950 scale with the color itself, unchanged, at its nearest step. Palletter then adds a gentle hue shift along each scale (see [Balance](#balance)), converts the colors into your color system, checks contrast, and formats the tokens.

```
┌──────────┐  your colors      ┌──────────────────┐   prompt + skills   ┌──────────────┐
│ Browser  │ ────────────────► │ Palletter server │ ──────── ACP ─────► │  Your agent  │
│   (UI)   │ ◄──── stream ──── │  (Astro / Bun)   │ ◄──── response ──── │   / model    │
└──────────┘  suggestions      └──────────────────┘                     └──────────────┘
     │                          validate · repair
     └── keep colors → scales · balance · convert · contrast · tokens (in the browser)
```

Because ACP agents run as local processes, Palletter runs on your machine and uses the agent you already have installed and signed in. Palletter doesn't store API keys. Claude Code uses its own login. A MiniMax key stays in your local `.env`, and Palletter passes it only to the agent process it starts.

## Workflow

1. **Colors you like.** Enter one or more: a color value, the picker, or a name (`"terracotta"`).
2. **What's it for?** Optional, but it helps: the product, the mood, or both, e.g. "a bakery website, warm and a little playful".
3. Press **Suggest colors**. The agent suggests 2 directions by default.
4. **Keep** the suggestions you like, from any direction, or **Keep all** of a direction. Use **More like this** on a color that's close but not quite right, and **More directions** for new ideas.
5. **Your palette** builds below as you keep colors: your colors and the ones you kept, as scales, with a preview, a contrast matrix, and tokens to copy or download.

Everything else is under **Advanced options**, and all of it is optional:

| Option | What it does |
| ------ | ------------ |
| **Directions** | How many directions to suggest at a time (1–5). |
| **Saturation** | A hint for the agent, e.g. vivid, muted, pure, pastel, or earthy. Also has the **Balance the palette** switch. |
| **Roles** | Jobs you need colors for, e.g. "background" or "call to action", each with an optional temperature. A hint for the agent. |
| **Relationships** | Color-wheel relationships for the agent to lean on (see [Palette Types](#palette-types)). A hint, not a rule. |
| **Scale** | The steps each color gets: the full 50–950 set, a range, or a number of steps. |
| **Token format** | CSS custom properties (with a naming pattern such as `--brand-[color]-[step]`), Tailwind CSS v4, or Design Tokens JSON. |
| **Color system** | oklch, hex, rgb, hsl, or cmyk. |

Scale, token format, and color system only affect how the palette is built and exported, so changing them never asks the agent again.

## Your palette

Your palette has one row of swatches per color: yours first, then the ones you kept. Each swatch shows its step, with buttons to copy its value or open its details: the value in your color system, its token name, hex and oklch, and contrast with white and black text. Below the swatches are three tabs:

- **Tokens.** The tokens in your format, with **Copy** and **Download**. Switching the format or color system above them reformats in place.
- **Preview.** A small sample page in light and dark, colored by role: the background color you kept for the page, the text color for text, the primary or call-to-action color for buttons and links, and the accent for the badge and the alert's stripe. Without roles, the first color leads and the second is the accent. A note under the preview says which color does what.
- **Contrast.** A matrix of WCAG contrast ratios between any two colors' steps, for checking text and background pairs.

If balancing changed anything, a note says what, and **Show before balancing** lets you compare.

## Color Systems

The supported systems are:

| System | Example | Notes |
| ------ | ------- | ----- |
| oklch  | `oklch(62.8% 0.177 259.8)` | Default. Perceptually uniform, so scales step evenly in lightness. Supports wide-gamut (P3) colors. |
| rgb    | `rgb(37 99 235)` | Modern space-separated syntax. |
| hex    | `#2563eb` | Most widely supported. |
| hsl    | `hsl(221 83% 53%)` | Easy to adjust by hand. |
| cmyk   | `cmyk(84% 58% 0% 8%)` | For reference and print handoff. Browsers don't support CMYK in CSS yet, so Palletter also outputs a web-safe value next to each CMYK token. |

When a color is outside the sRGB gamut and you choose an sRGB-based system (rgb, hex, hsl), Palletter maps it into gamut and marks it so you know the value was adjusted.

## Palette Types

A palette type (or scheme) describes how the hues in a palette relate to each other on the color wheel. In the app, they're optional hints under **Advanced options → Relationships**: the agent leans on the ones you pick when it suggests colors. The [palette API](#api) still makes one palette per scheme.

| Scheme | Hues | What it's good for |
| ------ | ---- | ------------------ |
| **Monochromatic** | 1 hue, many lightness and chroma steps | Calm, cohesive interfaces. The safest choice for UI. |
| **Analogous** | 3 neighboring hues (about 30° apart) | Harmonious, low-tension palettes, common in nature. |
| **Complementary** | 2 opposite hues (180°) | High contrast. A strong accent against a base color. |
| **Split-complementary** | Base plus the 2 hues next to its complement (about 150° and 210°) | Contrast with less tension than complementary. |
| **Triadic** | 3 evenly spaced hues (120°) | Vibrant, balanced palettes. Usually one hue dominates. |
| **Tetradic** | 4 hues in two complementary pairs (rectangle or square) | Rich palettes with many options. Hardest to balance. |
| **Tonal** | 3 close hues (about 15° apart) that differ in depth and softness | A more refined take on analogous. |

Some palettes are better described by what each color does than by angles on the wheel. Palletter doesn't check these against reference angles:

| Scheme | Colors | What it's good for |
| ------ | ------ | ------------------ |
| **Neutral + accent** | A brand color, a tinted neutral scale, and an optional accent | What most products ship. Neutrals carry the screen and the brand color stands out. |
| **Functional UI** | A brand color, a neutral, and success, warning, danger, and info | Application UI. The status colors still read as green, amber, red, and blue, but are tuned to your brand. |
| **Sourced** | 3 to 5 colors drawn from a scene, material, or style | Palettes with a story, such as "desert dusk" or "Scandinavian interior". Name the source in the mood. |

The angles are a starting point. The Palletter skills tell the model to adjust hues, lightness, and chroma so the result looks good, rather than placing colors on exact angles. Palletter warns when a palette's hues stray more than 47° from the scheme: 35° of leeway for the model, plus up to 12° from Palletter's own common cast.

## Balance

When Palletter builds your palette from the colors you chose, every one of them is exact, so balancing never changes them. It only adds **hue drift** to the steps around each color, so the scales look natural rather than computed. The full set of rules below applies to palettes from the [palette API](#api), where the agent makes whole palettes:

- **Chroma hierarchy.** The primary color leads at full chroma. Supporting colors (secondary, tertiary, and other roles) peak at no more than 70% of the primary's chroma. Accents stay bright, because they're used in small doses, and neutrals stay quiet.
- **Hue drift.** Each scale shifts hue slightly from light to dark, as real pigments do. Dark steps move toward blue-violet (yellows and ambers move toward orange and brown instead), and light steps move a little the other way, up to about 7° and 5°.
- **Common cast.** Supporting and accent hues are pulled a tenth of the way toward the primary's hue, up to 12°, like one light falling on a whole scene. Even triadic and tetradic palettes look related.
- **Lightness band.** The middle steps (300–700) of supporting and accent colors move toward the primary's lightness, so no color looks heavier than the others. Yellows, ambers, and limes are allowed to sit lighter, and a step never moves if that would make its text contrast worse.

Your exact colors are never changed, and a color that contains one isn't capped, pulled, or moved.

Each balanced palette says what Palletter changed, and **Show before balancing** switches the swatches and tokens to the palette before balancing, so you can compare and copy either one. To skip balancing altogether, turn off **Balance the palette** under Saturation. With **Pure** saturation, supporting colors aren't capped either. Colors that fit in sRGB still fit after balancing.

## Saturation

Saturation is a hint for the agent when it suggests colors. It doesn't change the colors you keep.

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

- **CSS custom properties.** You choose the naming pattern, e.g. `--color-[name]-[step]`, `--brand-[color]-[step]`, or `--color-[role]-[step]`. `[name]` and `[color]` use each color's name, `[role]` its role (such as `background` or `accent`), and `[step]` the step.
- **Tailwind CSS v4.** An `@theme` block, so the colors are available as utilities such as `bg-brand-500`. Tailwind needs names in the form `--color-[name]-[step]`, so the naming pattern doesn't apply.
- **Design Tokens JSON.** In the [W3C Design Tokens Community Group](https://www.designtokens.org) format, for tools such as Style Dictionary and Figma plugins.

### Example output

A `brand` color in oklch, as CSS custom properties, with the range `100` to `300`:

```css
:root {
  --brand-100: oklch(93.2% 0.032 255.6);
  --brand-200: oklch(88.2% 0.059 254.1);
  --brand-300: oklch(80.9% 0.105 251.8);
}
```

The same color as a Tailwind v4 theme:

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
| Count  | A specific number of evenly spaced steps, e.g. 5 gives `50, 300, 500, 700, 950` |

Each color you keep sits unchanged at the step nearest its lightness, and the other steps are built around it: a light background lands near `50`, a dark text color near `950`, and a mid-tone near `500`. Lower numbers are lighter and higher numbers are darker, so the same token works the way you'd expect from Tailwind.

## Getting Started

### Requirements

- [Bun](https://bun.sh) 1.4.4 or later (Palletter's server runs on Bun)
- [Node.js](https://nodejs.org) 22 or later (used by Astro's build tooling)
- One of these agents:
  - **Claude Code**, signed in on your machine (run `claude` once and log in), or an `ANTHROPIC_API_KEY`
  - **MiniMax**, with a MiniMax API key
  - Any other agent that speaks ACP

### Install and run

```bash
bun install
```

```bash
bun run dev
```

Then open <http://localhost:4321>.

### Connect your agent

Palletter talks to agents over ACP. It comes with the [Claude Code ACP adapter](https://github.com/agentclientprotocol/claude-agent-acp), installed by `bun install`, and has three agent settings. Put your settings in a `.env` file at the project root. [`.env.example`](./.env.example) lists them all.

**Claude Code** is the default. If you're signed in to Claude Code, there's nothing to set up.

**MiniMax** runs through the same Claude Code adapter, pointed at [MiniMax's Anthropic-compatible API](https://platform.minimax.io/docs/api-reference/text-anthropic-api). Add your key:

```bash
MINIMAX_API_KEY=your-minimax-key
```

The model is `MiniMax-M3.1-Flash` unless you set `PALLETTER_MINIMAX_MODEL`. In mainland China, also set `PALLETTER_MINIMAX_BASE_URL=https://api.minimax.cn/anthropic`.

**Any other ACP agent** can be started with a command:

```bash
PALLETTER_AGENT_COMMAND="gemini --experimental-acp"
```

Check your agent's documentation for its ACP command.

With more than one agent set up, `PALLETTER_AGENT` (`claude`, `minimax`, or `custom`) picks the default, and each request can name its own.

#### Choosing a model

When the agent offers a choice of models over ACP, a **Model** picker appears next to the agent picker, listing exactly the models that agent offers. Claude Code lists the models your account can use, starting with **Default (recommended)**, which uses Claude Code's own default model. That depends on your account, and the picker shows which model it is.

Palletter sends a model only when you pick something other than the default, so Claude Code's default stays in charge otherwise. MiniMax has no picker: it always uses `PALLETTER_MINIMAX_MODEL`.

#### What the agent can do

Palletter starts the agent the first time you ask for suggestions and keeps it running until the server stops. Each **Suggest colors** gets its own session, in an empty temporary folder. **More directions** and **More like this** continue that session, so the agent remembers what it already suggested. Sessions close 30 minutes after their last use; if one has closed, **More directions** starts a new one.

The agent is given only your request and the Palletter skills:

- Palletter doesn't offer the agent any access to your files or terminal, and it refuses every permission request.
- For Claude Code and MiniMax, Claude Code's built-in tools are switched off. Your Claude settings, `CLAUDE.md` files, and hooks aren't loaded.

#### Settings

| Variable | Default | What it does |
| -------- | ------- | ------------ |
| `PALLETTER_AGENT` | `claude`, or `custom` if `PALLETTER_AGENT_COMMAND` is set | The default agent |
| `MINIMAX_API_KEY` | | Turns on the MiniMax agent |
| `PALLETTER_MINIMAX_MODEL` | `MiniMax-M3.1-Flash` | The MiniMax model |
| `PALLETTER_MINIMAX_BASE_URL` | `https://api.minimax.io/anthropic` | The MiniMax API address |
| `PALLETTER_AGENT_COMMAND` | | The command for a custom ACP agent |
| `PALLETTER_AGENT_TIMEOUT_MS` | `180000` | How long to wait for the agent's reply |

### API

The UI uses three endpoints, which you can also call directly. All of them stream [server-sent events](https://developer.mozilla.org/docs/Web/API/Server-sent_events) except `GET /api/agent`.

`GET /api/agent` lists the agents and which one is the default. Add `?check=claude` (or another agent) to start it and check that it answers. If the agent offers a choice of models, the check also returns `models`: the one new sessions use (`current`) and every choice (`choices`, each with a `value` and `name`).

`POST /api/suggest` takes `{ "hues", "purpose", "directions", "saturation", "roles", "schemes" }` (only `hues` is required; `directions` defaults to 2), with an optional `agent` and `model`. It streams `status` events, one `direction` event per direction (`{ name, summary, yours, colors }`, where `yours` names your colors and gives each a role, and each of `colors` has a `name`, `role`, oklch `value`, and `reason`), then `session` with an id for follow-ups, then `done` or `error`.

`POST /api/suggest/more` continues that session. `{ "sessionId", "kind": "directions", "count" }` streams `count` more `direction` events. `{ "sessionId", "kind": "like", "color": { "name", "role", "value" }, "direction" }` streams one `alternatives` event with colors like `color`. A closed session returns 404 with `code: "session_expired"`.

```bash
curl -N localhost:4321/api/suggest -H 'content-type: application/json' \
  -d '{"hues":[{"value":"#84f5a6"},{"value":"#bf8645"}],"purpose":"a bakery website"}'
```

The palette API makes whole palettes with the agent, one per scheme. The app doesn't use it any more, but it still works. `POST /api/palettes` takes a palette request as JSON, with an optional `agent` and an optional `model` (a `value` from that agent's `choices`). It responds in this order:

1. `status` events as the agent starts, thinks, and writes
2. One `palette` event per scheme, with the converted colors, the formatted tokens, the balanced oklch palette (`source`), the agent's own palette when balancing changed it (`original`), and what balancing changed (`notes`)
3. `session`, with an id you can use to refine the palettes
4. `done`, or `error` with a `code` and a message

`POST /api/palettes/refine` takes `{ "sessionId", "scheme", "note" }` and streams the same events for that one scheme. Without a note, the agent makes a different version. Sessions close 30 minutes after their last use; a closed session returns 404 with `code: "session_expired"`.

```bash
curl -N localhost:4321/api/palettes -H 'content-type: application/json' \
  -d '{"hues":[{"value":"#2563eb"}],"schemes":["complementary"],"colorSystem":"hex"}'
```

If the agent's reply has problems, Palletter asks it to fix them once before reporting an error.

## Development

| Command | Action |
| ------- | ------ |
| `bun install` | Install dependencies |
| `bun run dev` | Start the dev server at `localhost:4321` |
| `bun run build` | Build the production server to `./dist/` |
| `bun run start` | Run the built server with Bun |
| `bun run preview` | Preview the build locally |
| `bun run check` | Typecheck Astro, Svelte, and TypeScript files |
| `bun run test` | Run the unit tests (Vitest) |
| `bun run test:e2e` | Run the end-to-end tests (Playwright) |
| `bun run prompt` | Print the prompt for a request, or check a model's reply (see `scripts/prompt.ts`) |
| `bun run icons` | Rebuild the bundled icon set after adding an icon (see `scripts/icons.ts`) |

The end-to-end tests need a Chromium for Playwright. Run `bunx playwright install chromium` once, or set `PW_CHROMIUM_PATH` to a Chromium that's already installed.

### Trying the prompt without the app

`bun run prompt` works with the palette prompt (the one behind the [palette API](#api)), not the suggestion prompt. You can test it with any chat model:

```bash
bun run prompt '{"hues":[{"value":"#2563eb"}],"schemes":["analogous"]}' > prompt.txt
```

Paste `prompt.txt` into the model, save its whole reply as `reply.txt`, then check it:

```bash
bun run prompt '{"hues":[{"value":"#2563eb"}],"schemes":["analogous"]}' reply.txt
```

If the reply is good, this prints the tokens. If not, it lists the problems and prints a repair prompt to send back to the model.

### UI components

The UI uses [SV5UI](https://sv5ui.vercel.app) components with Tailwind CSS 4, inside Astro's Svelte islands. Components use SV5UI's default styles: Palletter doesn't set their `variant`, `color`, `size`, or `ui` slot classes, except an Alert's color for errors and warnings and two layout fixes: the hue input's picker slot, and the Advanced options labels, so long summaries truncate. Palletter's own classes only lay out the page. Theme colors come from SV5UI's tokens (`bg-surface`, `text-on-surface`, `border-outline-variant`, `bg-primary`, and so on); see [SV5UI theming](https://sv5ui.vercel.app/docs/theming) to change them in `src/styles/global.css`.

SV5UI is built for SvelteKit, so Palletter adds two small pieces to run it on Astro:

- `src/lib/shims/app-state.ts` stands in for SvelteKit's `$app/state`, which a few SV5UI components read. It's wired up as a Vite alias in `astro.config.mjs`.
- A script in `src/layouts/Layout.astro` applies the saved light or dark mode before the page paints.

Icons are bundled rather than fetched from the Iconify API, so the app works offline and makes no third-party requests. To use a new [Lucide](https://lucide.dev/icons) icon, add its name to `scripts/icons.ts` and run `bun run icons`. A unit test fails if a `lucide:` icon is used but not bundled.

### Project structure

```
/
├── e2e/                 Playwright end-to-end tests
├── public/              Static assets
├── scripts/             Developer scripts
├── skills/              The Palletter skills the agent follows
├── src/
│   ├── components/      Astro components and UI islands
│   ├── layouts/
│   ├── lib/
│   │   ├── acp/         ACP client and agent process management
│   │   ├── color/       Conversion, gamut mapping, and contrast
│   │   ├── format/      Token formatters (CSS, Tailwind, JSON) and naming
│   │   ├── palette/     Scales, balancing, and resolving palettes into values and contrast
│   │   ├── prompt/      Palette prompt builder and response schema
│   │   └── suggest/     Suggestion schema, prompts, parser, and flow
│   ├── pages/
│   │   ├── api/         Server endpoints
│   │   └── index.astro  The generator
│   └── styles/          Tailwind CSS 4 and the SV5UI theme
├── test/                Shared test fixtures
└── PLAN.md              Development plan
```

Full Astro documentation: <https://docs.astro.build>.

## Roadmap

See [PLAN.md](./PLAN.md).
