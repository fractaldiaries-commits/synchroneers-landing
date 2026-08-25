/**
 * Produces `dist/index.html`: the same page as one self-contained file, with
 * the stylesheet, both scripts, three.js, and the logo inlined.
 *
 * The folder build is what you upload to normal hosting. This single file
 * exists for places that will only take one document, and for anywhere a
 * strict content policy blocks scripts loaded from other files.
 *
 *   node landing/build.mjs
 *
 * Google Fonts stays as a link. It is the one external request the page makes,
 * and the stack falls back to Georgia and the system sans if it is blocked.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, 'dist');
const temporary = join(dist, '.bundle.js');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

// sky.js pulls in three.js, so it has to be bundled rather than concatenated.
writeFileSync(temporary, "import './../sky.js';\nimport './../page.js';\n");
const bundle = execFileSync(
  'npx',
  ['--yes', 'esbuild', temporary, '--bundle', '--format=esm', '--minify', '--target=es2022'],
  { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
);
rmSync(temporary);

const styles = readFileSync(join(root, 'styles.css'), 'utf8');
const logo = readFileSync(join(root, 'assets', 'logo.png')).toString('base64');
const logoUri = `data:image/png;base64,${logo}`;

let html = readFileSync(join(root, 'index.html'), 'utf8');

// Replacer functions, not replacement strings: minified JS and a base64 data
// URI both contain `$` sequences, and `$\`` in a replacement string splices the
// rest of the document back in.
html = html
  .replace('<link rel="stylesheet" href="styles.css" />', () => `<style>\n${styles}\n</style>`)
  .replaceAll('assets/logo.png', () => logoUri)
  .replace(
    /<script type="module" src="sky\.js"><\/script>\s*<script type="module" src="page\.js"><\/script>/,
    () => `<script type="module">\n${bundle}\n</script>`,
  );

if (html.includes('src="sky.js"') || html.includes('href="styles.css"')) {
  throw new Error('inlining missed a reference; check index.html markup');
}

const out = join(dist, 'index.html');
writeFileSync(out, html);
console.log(`${out} — ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB`);

/* ---------------------------------------------------------------
   dist/artifact.html — the same page with the document scaffolding
   removed, for hosts that supply their own <html>/<head>/<body>.
   --------------------------------------------------------------- */

const head = html.slice(html.indexOf('<head>') + 6, html.indexOf('</head>'));
const body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'));

// Only the parts a host cannot supply for us: the title, the font link, and
// the inlined stylesheet. Charset, viewport, and theme-color belong to the host.
const keep = [
  ...head.matchAll(/<title>[\s\S]*?<\/title>/g),
  ...head.matchAll(/<link rel="preconnect"[^>]*>/g),
  ...head.matchAll(/<link rel="stylesheet"[^>]*>/g),
  ...head.matchAll(/<style>[\s\S]*?<\/style>/g),
].map((match) => match[0]);

const artifact = join(dist, 'artifact.html');
const artifactHtml = `${keep.join('\n')}\n${body}\n`;
writeFileSync(artifact, artifactHtml);
console.log(`${artifact} — ${(Buffer.byteLength(artifactHtml) / 1024).toFixed(0)} KB`);
