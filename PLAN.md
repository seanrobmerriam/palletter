# Palletter Development Plan

This plan takes Palletter from the current Astro starter to a working v1, as described in the [README](./README.md).

## Goals for v1

- A user can describe a palette with the 8-step workflow and get copy-ready tokens.
- Generation runs through the user's own ACP agent. Palletter stores no API keys.
- Every color value Palletter shows is valid, exactly converted, and contrast-checked, whatever the model returns.
- The app is fast, accessible, and works with only step 1 filled in.

### Out of scope for v1

- Hosted or multi-user deployment. v1 runs locally because ACP agents run as local processes.
- Accounts and server-side storage of palettes.
- Editing individual colors by hand after generation. This is planned for after v1.

## Architecture

```
Browser (Astro page + UI island)
   │  POST /api/palettes  (PaletteRequest JSON)
   ▼
Astro server endpoint (Bun adapter)
   ├─ prompt/   build the prompt from the request + skills
   ├─ acp/      spawn the agent, open a session, send the prompt, stream updates
   ├─ prompt/   parse and validate the response (schema), retry once on failure
   ├─ color/    convert, gamut-map, and contrast-check every color
   └─ format/   render tokens for the chosen format and color system
   │  Server-sent events: progress → palettes → done | error
   ▼
Browser renders swatches, contrast badges, and token code blocks
```

### Key decisions

| Decision | Choice | Why |
| -------- | ------ | --- |
| Rendering | Astro with `output: 'server'` and `@igloczek/astro-bun-adapter` | ACP needs a server process to spawn the agent and talk to it over stdio. The browser can't do this. Bun's native server and `Bun.spawn` keep it simple and fast. |
| ACP client | The official TypeScript ACP SDK | Handles JSON-RPC framing, session setup, and update types. |
| Agent capabilities | Advertise no file system or terminal access | The agent only needs to think and answer. Reject any permission request. |
| Source of truth for colors | The model returns every color in **oklch**. Palletter converts to the other systems. | Models are unreliable at exact color math. Converting in code makes values exact and consistent across systems. |
| Response format | JSON in a fenced code block, validated with a schema | Easy to extract from a text response, and works with any agent. |
| Color math | [culori](https://culorijs.org) | Covers oklch, rgb, hsl, hex, gamut mapping, and WCAG contrast. Small and tree-shakeable. |
| CMYK | Naive conversion from sRGB, labeled as approximate, with a hex fallback | Browsers don't support CMYK in CSS. Accurate CMYK needs an ICC profile, which is out of scope. |
| Validation | [zod](https://zod.dev) | One schema for the request, the response, and TypeScript types. |
| UI interactivity | One Svelte island for the form and results, static Astro for the rest | The form has a lot of dependent state. Everything else can ship zero JavaScript. |
| Styling | Plain CSS in the existing cascade layers (`base`, `patterns`, `components`, `utilities`) | The layer setup is already in place. Palletter's own UI theme can be generated with Palletter. |
| Tests | Vitest for logic, Playwright for end-to-end | Playwright runs against a fake ACP agent so tests are fast and deterministic. |
| Runtime and package manager | Bun | There's already a `bun.lock`, and the server runs on Bun. |

## Data model

The shapes below are the contract between the UI, the prompt builder, and the response parser. They live in `src/lib/prompt/schema.ts`.

```ts
type PaletteRequest = {
  hues: Array<{ value?: string; name?: string }>; // at least 1; a color value, a color name, or both
  mood?: string;
  tokenFormat: 'css' | 'tailwind' | 'dtcg';
  namingPattern?: string;            // e.g. "--brand-[color]-[step]"; CSS only
  scale:
    | { kind: 'full' }               // 50–950
    | { kind: 'range'; from: Step; to: Step }
    | { kind: 'count'; count: number };
  saturation?: 'vivid' | 'pure' | 'muted' | 'pastel' | 'earthy' | { custom: string };
  colorSystem: 'oklch' | 'rgb' | 'hex' | 'hsl' | 'cmyk'; // default oklch
  roles?: Array<{ role: 'primary' | 'secondary' | 'tertiary' | string; temperature?: 'warm' | 'cool' | 'neutral' }>;
  schemes: Scheme[];                 // default ['monochromatic']
};

type Scheme = 'monochromatic' | 'analogous' | 'complementary'
            | 'split-complementary' | 'triadic' | 'tetradic';

// What the model must return (validated):
type ModelResponse = {
  palettes: Array<{
    scheme: Scheme;
    rationale: string;               // 1–2 sentences, shown in the UI
    colors: Array<{
      name: string;                  // e.g. "brand", "primary", "calm"
      role?: string;
      steps: Record<Step, string>;   // oklch strings only
    }>;
  }>;
};
```

Defaults when the user skips a step: CSS custom properties with `--color-[name]-[step]`, full scale, no saturation preference, oklch, a single primary role, monochromatic.

## Phases

Each phase ends with something you can run and check. Phases 2 and 3 can run in parallel once phase 1 is done.

### Phase 0: Project setup ✅

- [x] Rename the package from `14-astro-css` to `palletter`.
- [x] Set the page title and replace the Astro welcome page with an empty app shell.
- [x] Add `@igloczek/astro-bun-adapter` and set `output: 'server'`.
- [x] Add Vitest, Playwright, and `test`, `test:e2e`, and `check` scripts.
- [x] Add the Svelte integration, with a placeholder generator island.
- [x] Add CI (GitHub Actions): typecheck (`astro check`), unit tests, build, and end-to-end tests on every pull request.
- [x] Fill in `reset.css` and `base.css` with a minimal reset, base typography, and a placeholder light and dark theme.

**Done when:** `bun run dev`, `bun run test`, and `bun run build` all succeed, and CI is green.

Notes: `astro check` doesn't support TypeScript 7 yet, so TypeScript is pinned to 6.

### Phase 1: Domain model and color engine ✅

No UI and no model yet. This is pure, well-tested TypeScript.

- [x] `src/lib/prompt/schema.ts`: zod schemas and types for `PaletteRequest` and `ModelResponse`, plus `resolveSteps` to turn a scale into its steps.
- [x] `src/lib/color/convert.ts`: parse oklch, then convert to rgb, hex, hsl, and cmyk.
- [x] `src/lib/color/gamut.ts`: detect colors outside sRGB (and P3) and map them into sRGB (culori's `toGamut`). Record which colors were adjusted.
- [x] `src/lib/color/contrast.ts`: WCAG 2 contrast ratio for every pair in a palette, plus the best text color (white or black) for each step. Levels: AAA 7:1, AA 4.5:1, AA-large 3:1.
- [x] `src/lib/color/scheme.ts`: reference hue angles for each scheme, and a check that warns when a result is more than 35° from the requested scheme.
- [x] `src/lib/palette/resolve.ts`: turn a validated palette into converted values, gamut flags, text colors, and the scheme check. Used by the formatters now and the UI later.
- [x] `src/lib/format/`: `css.ts`, `tailwind.ts`, and `dtcg.ts`, with naming patterns in `naming.ts`. Each takes a resolved palette and returns a string.
- [x] Unit tests for every conversion, gamut edge cases (P3 colors, black, white, greys), naming patterns, and each formatter (snapshot tests for every format and color system).

**Done when:** a hard-coded `ModelResponse` fixture turns into correct output for every format and color system combination.

Notes:

- Naming patterns support `[name]`, `[role]`, and `[step]`. `[color]` and `[mood]` are aliases of `[name]`. If a pattern would give two tokens the same name, formatting fails with a message saying which ones clash.
- Tailwind ignores the naming pattern and always uses `--color-[name]-[step]`, because Tailwind only makes color utilities from `--color-*` variables.
- For cmyk, CSS and Tailwind output use the hex value with the CMYK value in a comment. DTCG output uses sRGB with the CMYK value under `$extensions["dev.palletter"]`.
- A scale with a count of steps spreads them evenly and symmetrically, e.g. 5 steps are 50, 300, 500, 700, 950.

### Phase 2: Palletter skills and prompt builder

The skills are the instructions that make the model good at this. They're versioned Markdown files in `skills/`.

- [ ] `skills/palletter/SKILL.md`: the entry point. The model's role, the steps to follow, and the exact response format with an example.
- [ ] `skills/palletter/color-theory.md`: how each scheme works, and why to adjust hue, lightness, and chroma instead of placing colors on exact angles.
- [ ] `skills/palletter/scales.md`: how to build a 50–950 scale in oklch. Even lightness steps, chroma that peaks in the middle, and slight hue shifts toward the ends so light steps don't look washed out and dark steps don't look muddy.
- [ ] `skills/palletter/saturation-and-mood.md`: what each saturation option means in oklch chroma ranges, and how to turn moods and temperatures into hue and chroma choices.
- [ ] `skills/palletter/accessibility.md`: make sure the scale includes steps usable for text on light and dark backgrounds.
- [ ] `src/lib/prompt/build.ts`: turn a `PaletteRequest` into a prompt. Include the skills, the request as structured data, and the response format. Leave out options the user didn't set, and tell the model to decide them.
- [ ] `src/lib/prompt/parse.ts`: extract the JSON block, validate it, and return a typed result or a list of problems.
- [ ] `src/lib/prompt/repair.ts`: build a follow-up prompt that lists the problems and asks for a corrected response.
- [ ] Tests: snapshot tests of built prompts. Parser tests with good, truncated, extra-text, and wrong-shape responses.

**Done when:** pasting a built prompt into any chat model returns a response the parser accepts, for each scheme.

### Phase 3: ACP integration

- [ ] `src/lib/acp/agent.ts`: start the agent process from `PALLETTER_AGENT_COMMAND`. Run `initialize` and `session/new`. Advertise no file system or terminal capabilities.
- [ ] `src/lib/acp/generate.ts`: send `session/prompt`, collect agent message chunks into the response text, and report progress as updates arrive. Support cancelling (`session/cancel`) and a timeout.
- [ ] Deny every permission request from the agent.
- [ ] Reuse one agent process for the server's lifetime, and start a new session for each palette request. Restart the process if it exits.
- [ ] Map failures to clear messages: command not set, agent not installed, agent not signed in, timeout, invalid response after retry.
- [ ] `test/fake-agent.ts`: a tiny ACP agent that returns fixture responses. Used by integration and end-to-end tests.
- [ ] `src/pages/api/palettes.ts`: `POST` endpoint. Validate the request, generate, parse (with one repair attempt), convert, check contrast, format. Stream server-sent events: `status`, `palette` (one per scheme), `done`, and `error`.
- [ ] `src/pages/api/agent.ts`: `GET` endpoint that reports whether an agent is configured and reachable, for the UI's connection indicator.

**Done when:** a `curl` to `/api/palettes` streams valid palettes from a real agent, and the integration tests pass against the fake agent.

### Phase 4: Generator UI

- [ ] Layout: inputs on the left and results on the right on wide screens, stacked on narrow screens.
- [ ] Agent connection indicator with setup help when no agent is configured.
- [ ] Step 1, hues: color picker, text input for values or names, add and remove hues, live swatch preview, and an optional mood field.
- [ ] Steps 2–7: token format and naming pattern, scale (full, range, count), saturation, color system, roles with temperatures, and schemes. Every step after step 1 is collapsed by default and shows its current value.
- [ ] Step 8: **Create** button. Shows progress while streaming, and becomes **Cancel** while running.
- [ ] Validate on the client with the same zod schema, with messages next to the field.
- [ ] Keyboard and screen reader support: real form controls, labels, visible focus, and `aria-live` for progress and errors.

**Done when:** you can fill in only step 1, press Create, and see results, using only a keyboard.

### Phase 5: Results

- [ ] One card per scheme with its rationale.
- [ ] Swatch grid for each color, showing step, value in the chosen system, and a mark on gamut-mapped colors.
- [ ] Contrast badges and a "best text color" indicator on each swatch. A palette-level matrix you can expand.
- [ ] Token code block with **Copy** (whole palette) and copy on click for a single token.
- [ ] Download as `.css` or `.json`.
- [ ] Switch the color system or token format on a finished palette without calling the model again. Formatting runs on the client using the same `format/` code.
- [ ] Preview: a small sample UI (buttons, card, text, alert) rendered with the palette, in light and dark.
- [ ] **Regenerate** a single scheme, and **refine** with a follow-up note (e.g. "make the secondary warmer") in the same ACP session.

**Done when:** a user can go from input to pasted tokens in a real stylesheet, and the pasted CSS works.

### Phase 6: Persistence and sharing

- [ ] Save the form state to the URL so a set of inputs can be shared or bookmarked.
- [ ] Keep the last 20 generated palettes in `localStorage`, with a history panel to reopen them.
- [ ] Remember the last-used token format, naming pattern, and color system.

### Phase 7: Polish and release

- [ ] Style Palletter itself with a palette generated by Palletter.
- [ ] Empty, loading, and error states for every view.
- [ ] Accessibility audit (axe in Playwright, plus a manual screen reader pass).
- [ ] End-to-end tests for the main flows against the fake agent.
- [ ] Test with at least two real ACP agents and document any agent-specific setup in the README.
- [ ] Update the README so it describes what was built, then tag `v1.0.0`.

## Testing strategy

| Layer | Tool | What's covered |
| ----- | ---- | -------------- |
| Color engine and formatters | Vitest | Conversions, gamut mapping, contrast, every format and system combination |
| Prompt builder and parser | Vitest | Prompt snapshots, response parsing, repair prompts |
| ACP client and API | Vitest with the fake agent | Session lifecycle, streaming, cancel, timeout, error mapping |
| UI | Playwright with the fake agent | Main flows, keyboard use, copy, accessibility (axe) |
| Prompt quality | Manual, with real agents | A fixed set of requests run before each release, reviewed by eye |

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| The model returns colors that look bad or ignore the scheme | Skills with concrete oklch guidance, a scheme-distance warning, and regenerate and refine actions |
| The model returns invalid or partial JSON | Schema validation and one automatic repair prompt, then a clear error with the raw response available |
| ACP agents differ in setup and behavior | The fake agent for tests, a connection check endpoint, and per-agent notes in the README |
| Generation is slow | Stream progress and each scheme as soon as it's ready, and support cancel |
| CMYK values are mistaken for print-accurate values | Label CMYK as approximate and always show a web fallback |
| The agent tries to use tools | Advertise no capabilities and deny all permission requests |

## Open questions

1. **Hosted version.** Should Palletter ever run as a hosted site? If so, it would need a server-side model connection (for example, the Claude API) as an alternative to ACP, plus accounts and rate limits. This plan assumes local-only for v1.
2. **Contrast standard.** v1 uses WCAG 2 ratios. Should Palletter also show APCA (the proposed WCAG 3 method) scores?
3. **Extra token formats.** Are SCSS variables, Tailwind v3 config, or Figma variables needed for v1?
4. **Naming.** The original README title used "Paletter". This plan assumes the name is "Palletter", matching the repository.
