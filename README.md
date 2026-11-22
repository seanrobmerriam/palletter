# Paletter Color Palette Generator For the Web

Palletter is a web application for generating color palettes for use on the web. Choose a base color, the relationship you want the colors to have, and any other rules or constraints you want on the palette. Palletter will give you a set of tokens along with their color values that you can copy and paste into your CSS. 

##  How it works

Palletter generates a prompt from your input and sends it via ACP to your connected model, which then generates the palette by following the palletter skills and it's training data, and creates the tokens for you.

## Workflow

The basic workflow can be as objective or subjective as you want. Your model will do all the heavy lifting. All but step 1 are optional, though you will get better results with more information provided.

1. Choose a single hue or a set of hues you want included in your palette. You can even add a mood or feeling you want the palette to convey.
2. Choose the type of tokens you want e.g. tailwindcss or an actual token `--brand-[color]` or `--color-[mood]`
3. Choose between a full value set (e.g. --color-50 to --color-900), or a specific number of values (e.g. --color-100 to --color-300)
4. Choose saturation e.g. vivid, muted, pure, etc.
5. Choose a color system e.g. oklch, cmyk, rgb, etc.
6. Choose the relationships you need e.g. primary, secondary, tertiary and the temperatures you want
7. Finally, choose the schemes you need. This will decide the actual outputs you get e.g. monochromatic, analogous, completmentary, split-complimentary, triadic, or tetradic.
8. Hit `Create`

## Color Systems

The supported systems are:

- oklch
- rgb
- hex
- hsl
- cmyk

## Palette Types
