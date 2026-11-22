# Accessibility

People use palette steps for text, backgrounds, borders, and buttons. Text needs enough contrast with its background to be readable. WCAG 2 asks for a contrast ratio of at least 4.5:1 for normal text and 3:1 for large text and UI components such as borders and icons.

Palletter calculates contrast for every pair of steps and shows the results to the user. Build scales so these common pairs work:

| Use | Pair | Target |
| --- | ---- | ------ |
| Body text on a light background | 700–950 on white or 50 | 4.5:1 or more |
| Light text on a dark background | 50–100 on 800–950 | 4.5:1 or more |
| White text on a button | white on 600 | 4.5:1 or more |
| Button or border on a light background | 500 on white | 3:1 or more |
| Text on a tinted background | 800 or 900 on 100 | 4.5:1 or more |

In practice:

- White text needs a background at about 55% lightness or darker. This is why step 600 should sit near 55%.
- Black text needs a background at about 65% lightness or lighter.
- Yellows and limes at 500 are often too light for white text. That's fine: their 700 and 800 steps can carry white text instead. Don't darken a yellow 500 until it looks brown just to pass.
- Color alone shouldn't carry meaning. Pairs such as red and green differ mainly in hue, so give them different lightness when both appear in one palette.
