# Only Yes: logo kit

Open `brand-board.svg` in a browser to see everything at once.

## The idea

The logo is the wax seal every guest breaks, pressed with a single letter: **Y**. Yes is the only answer the
invite accepts, and the Y's open arms are the envelope flap lifting. The four point spark above it is the gold
that falls when a guest says it. The left arm and the stem are heavy and the right arm is a hairline, the way
an engraved capital is cut, so the mark feels like stationery and not like an app icon.

The name never includes the event. "Only Yes" is the platform. The event name stays secret until a guest
unlocks their invite, so it must never appear in the logo, the favicon or anything shown before unlock.

## Files

| File | Use it for |
| --- | --- |
| `only-yes-logo-on-green.svg` | Primary horizontal logo on bottle green or any dark background |
| `only-yes-logo-on-cream.svg` | The same on cream, paper and light backgrounds |
| `only-yes-logo-name-only-on-*.svg` | Tight spaces where the line "By invitation only" would be too small to read |
| `only-yes-logo-stacked-on-*.svg` | Square or tall spaces: posters, the door sign, social avatars |
| `only-yes-mark.svg` | The seal alone, 48 pixels and up |
| `only-yes-mark-small.svg` | The seal alone below 48 pixels. Heavier strokes, no inner ring. |
| `only-yes-mark-flat.svg` | Two flat colours: stickers, embroidery, the favicon |
| `only-yes-mark-gold.svg`, `-green.svg`, `-cream.svg` | One colour with the Y cut out: gold foil, rubber stamps, single colour print |
| `only-yes-app-icon.svg` | Home screen icon. The site serves a 180 pixel PNG of it at `/apple-icon`. |

## Rules

- **Clear space:** keep at least half the seal's height empty around any logo.
- **Smallest size:** the horizontal logo needs a seal at least 28 pixels tall. Below that use the mark alone.
- **Colour:** wax red `#8E1B1B`, antique gold `#C8A24A`, bottle green `#0F2A22`, cream `#F3ECDF`, ink `#1C1A16`.
  In the app these are the tokens in `design/tokens.css`.
- **Type:** the name is Unbounded 600, tracked +0.04em. The line under it is Urbanist 700, tracked +0.34em.
  Both are outlines in these files, so they look right without the fonts installed.
- **Do not** stretch, rotate or recolour the seal, set the name in the script font, add an outline or drop
  shadow, or put the event name next to the logo on anything a guest sees before unlock.

## Changing it

The drawing lives in `lib/brand.ts` (paths) and `lib/brand-svg.ts` (the files). Edit there, then run:

```bash
npm run brand
```

That rewrites every file here and the favicon at `app/icon.svg`. The seals in the app, the guest page and
the link preview read the same paths, so they change with it.
