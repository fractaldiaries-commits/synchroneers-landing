# Synchroneers landing page

A static page. No build step is needed to deploy it: upload the folder.

## What is here

```
landing/
  index.html      the page
  styles.css      colour tokens mirrored from src/constants/theme.ts,
                  plus the space, radius, and type scales
  sky.js          the three.js night sky
  sky-data.js     generated: 25,791 real stars and 88 constellations
  page.js         registry, capture tabs, line drawing
  vendor/         three.js r180 (two files: module + core)
  assets/         the brand mark and the link-preview image
  build.mjs       optional: bundles everything into one file
  tools/          data and image generators, not needed to deploy
```

## The sky is real

`sky-data.js` is generated, not hand-written. It holds 25,791 stars down to
magnitude 7.5 from the HYG database v41, placed by right ascension and
declination, sized by apparent magnitude and coloured from the B-V index, plus
the 695 figure segments of all 88 modern constellations from Stellarium. The
page opens on Orion.

The Milky Way is not a texture either. Its dust is drawn along the real galactic
plane, so the band crosses Sagittarius and Cygnus where it belongs.

To regenerate after a catalogue update:

```bash
curl -sLO https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv
curl -sLo modern.json https://raw.githubusercontent.com/Stellarium/stellarium/master/skycultures/modern/index.json
node landing/tools/build-sky.mjs hygdata_v41.csv modern.json
```

HYG is CC BY-SA 4.0. The Stellarium sky culture is GPL-2.0. Neither source file
is committed here; both are large and both are re-downloadable.

## Brand guidelines

The [brand guidelines document](https://docs.google.com/document/u/0/d/1HU0cassW5IEeLY1RXF691S_J8cx1-BKBlyxUan-GlJk/mobilebasic)
is the authority for type, colour, and case. Three rules from it constrain most
of `styles.css`, and each one is easy to break by accident:

- **Inter for headings and body.** One family, so hierarchy comes from size,
  weight, and letter-spacing rather than from a second voice. There is no
  separate face for data or labels; numeric columns use
  `font-variant-numeric: tabular-nums` instead.
- **Always sentence case.** The document names `RECORD YOUR DREAMS` as
  incorrect by example. There is no `text-transform: uppercase` anywhere in the
  stylesheet, and adding one is a regression. Wide letter-spacing went with it:
  tracking above about `0.02em` only ever suited capitals.
- **Deep indigo, midnight blue, dark violet, and nothing else.** Neon is ruled
  out. Gold appears once or twice for the "golden particles" motif, never as a
  second accent. The overlay over imagery stays in the 20-40% band, which is
  what `--veil` is set to.

The document does not carry hex values, so the tokens are derived: midnight blue
is the app's own `Palette.ink`, and the violets come from `Palette.violet` and
`Palette.violetSoft` in `src/constants/theme.ts`. Deep indigo (`#4a5bd7`) is new
and has no counterpart in the app yet.

To check the three rules hold, load the page and run:

```js
[...document.querySelectorAll('*')].filter(e => getComputedStyle(e).textTransform === 'uppercase').length
```

That must be `0`.

## The link preview image

`assets/og.jpg` is 1200 x 630 and is drawn from the same catalogue as the page,
so the share card shows the patch of sky the hero opens on.

To redraw it:

```bash
node landing/tools/write-og.mjs
```

Then open `http://localhost:4319/tools/og.html` and run this in its console:

```js
fetch('http://localhost:4320/og', { method: 'POST', body: window.__ogDataUrl })
```

**Before going live**, change the two `og:image` and `twitter:image` values in
`index.html` from `/assets/og.jpg` to the absolute URL on your domain, for
example `https://yourdomain.com/assets/og.jpg`, and add a matching
`<meta property="og:url">`. X and several messaging apps will not resolve a
relative path and will show no preview at all.

## Run it locally

Any static server works. The repository has a launch configuration for it:

```bash
npx http-server landing -p 4319 -c-1
```

Opening `index.html` from the file system will not work, because the scripts are ES modules.

## Deploy

The site is live on Cloudflare Pages, project `synchroneers`, under the
Cloudflare account `sebastian110420@gmail.com`
(`75440b2fea491108005baff4ccebf1d6`). The domain stays at GoDaddy and does DNS
only; GoDaddy hosting is not used.

Production URL: <https://synchroneers.pages.dev>

### Redeploy

Two commands. Staging first, because the source folder also holds the
generators and the single-file builds, none of which should be served, and
because the Open Graph URLs have to be made absolute:

```bash
node landing/tools/stage.mjs https://synchroneers.pages.dev
```

```bash
npx wrangler pages deploy landing/dist/site --project-name synchroneers --branch main
```

Once a custom domain is attached, pass that origin to `stage.mjs` instead so the
link previews point at the real domain rather than at `pages.dev`.

### Point the domain at it

In the Cloudflare dashboard: **Workers & Pages → synchroneers → Custom domains
→ Set up a custom domain**. Cloudflare will tell you which records it wants.

Then at GoDaddy: **My Products → Domains → the domain → DNS → Manage Zones**,
and add what Cloudflare asked for. Typically:

| Type | Name | Value |
| --- | --- | --- |
| `CNAME` | `www` | `synchroneers.pages.dev` |
| `CNAME` or `A` | `@` | whatever Cloudflare specifies for the apex |

Delete GoDaddy's parked `A` record for `@` first, or the two conflict and the
old placeholder keeps resolving.

If you would rather move the whole zone to Cloudflare, change the nameservers at
GoDaddy to the pair Cloudflare gives you when you add the site. That makes the
apex record work cleanly and is the simpler long-term arrangement, but it moves
DNS management out of GoDaddy entirely.

Cloudflare issues the TLS certificate itself. Propagation is usually well under
an hour and can take up to 48.

### What is deployed

`stage.mjs` writes `landing/dist/site`, which contains only `index.html`,
`styles.css`, `sky.js`, `sky-data.js`, `page.js`, `vendor/`, `assets/`, and a
`_headers` file. The `_headers` file caches `vendor/` and `assets/` for a year,
`sky-data.js` for a week, and revalidates the HTML every time, and sets
`X-Content-Type-Options`, `Referrer-Policy`, and `X-Frame-Options`.

### Hosting it somewhere else

The folder is plain static files, so any static host works: Netlify, Vercel,
GitHub Pages, or a cPanel `public_html` if you do add GoDaddy hosting later.
Upload the contents of `landing/dist/site`, not the folder itself, so
`index.html` sits at the web root.

### Optional: deploy the single-file build

`node landing/build.mjs` writes `landing/dist/index.html`, the whole page as one
self-contained file with the styles, scripts, three.js, and the logo inlined.
Upload just that one file when a host will only take a single document. Do not
mix the two: upload the folder or the single file, not both.

## After deploying, check

- The page loads over `https://`, not just `http://`.
- The sky renders. If it does not, the page still reads correctly against the
  CSS gradient fallback, but check the browser console for a `vendor/` 404.
- `vendor/three.module.min.js` **and** `vendor/three.core.min.js` are both
  present. The first imports the second, and missing the second gives a blank
  sky with a 404 in the console.
- `sky-data.js` uploaded. Without it the sky has no stars.
- `assets/og.jpg` uploaded, and the preview checked by pasting the URL into
  X's card validator or any chat app.

## Things to change before it goes live

- **The App Store link.** Every call to action points at
  `https://apps.apple.com/app/id6751279447`. Confirm that is the listing you
  want traffic sent to.
- **Android.** The page says iPhone. Update the kicker, the hero meta list, and
  the footer when Android ships.
- **The perspective registry.** `PERSPECTIVES` in `page.js` is a copy of
  `INTERPRETATION_PERSPECTIVES` in
  `src/features/interpretation/domain/perspective.ts`. Adding a perspective to
  the app means adding it here too.
- **The absolute preview URL.** See "The link preview image" above. This is the
  one edit that has to happen before the first share.
