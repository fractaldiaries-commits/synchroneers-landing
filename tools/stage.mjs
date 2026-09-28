/**
 * Assembles dist/site: exactly the files that should be served, and
 * nothing else. The source folder also holds the generators, the single-file
 * builds, and this script, none of which belong on a public origin.
 *
 *   node tools/stage.mjs https://synchroneers.pages.dev
 *
 * The origin argument is not decoration. Open Graph and Twitter image URLs
 * must be absolute: X and most messaging apps will not resolve a relative
 * path and show no preview at all. Passing the origin rewrites them, and
 * stamps a matching og:url, so re-staging against a custom domain later is
 * one command rather than a hunt through the markup.
 */

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist', 'site');

const origin = (process.argv[2] ?? '').replace(/\/+$/, '');
if (!origin) {
  console.error(
    'usage: node tools/stage.mjs <origin>   e.g. https://synchroneers.pages.dev',
  );
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const file of [
  'styles.css',
  'sky.js',
  'sky-data.js',
  'page.js',
  'sigils.js',
  'privacy.html',
  'terms.html',
]) {
  cpSync(join(root, file), join(out, file));
}
cpSync(join(root, 'vendor'), join(out, 'vendor'), { recursive: true });
cpSync(join(root, 'assets'), join(out, 'assets'), { recursive: true });

let html = readFileSync(join(root, 'index.html'), 'utf8');

html = html.replaceAll('content="/assets/og.jpg"', () => `content="${origin}/assets/og.jpg"`);
html = html.replace(
  '<meta property="og:type" content="website" />',
  () =>
    `<meta property="og:type" content="website" />\n<meta property="og:url" content="${origin}/" />`,
);

if (html.includes('content="/assets/og.jpg"')) {
  throw new Error('a relative preview image survived the rewrite');
}

writeFileSync(join(out, 'index.html'), html);

/**
 * Hashed filenames would be better, but this page is edited by hand and a
 * stale sky-data.js is a blank sky. Everything immutable-by-nature gets a
 * year; the two files that change get revalidated.
 */
writeFileSync(
  join(out, '_headers'),
  `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: SAMEORIGIN

/vendor/*
  Cache-Control: public, max-age=31536000, immutable

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/sky-data.js
  Cache-Control: public, max-age=604800

/index.html
  Cache-Control: public, max-age=0, must-revalidate
`,
);

console.log(`staged ${out} against ${origin}`);
