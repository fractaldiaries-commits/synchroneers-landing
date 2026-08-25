/**
 * Turns raw simulator captures into the web assets the page ships.
 *
 *   node landing/tools/shots.mjs
 *
 * Reads every PNG in `tools/shots-raw` and writes a WebP of the same name to
 * `assets/app`. Raw captures are around 1200x2600 and 2 MB each; the page
 * shows them in a column a few hundred points wide, so shipping the originals
 * would put ten megabytes on a landing page to render detail no one can see.
 *
 * Width is 2x the largest slot the page gives a screenshot, so they stay sharp
 * on a retina display and nothing larger is paid for. The raw captures are
 * kept out of the deploy by `stage.mjs`, which copies named files rather than
 * whole directories.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'tools', 'shots-raw');
const out = join(root, 'assets', 'app');

/** 2x the widest slot the layout gives a single screenshot. */
const TARGET_WIDTH = 640;
const QUALITY = 82;

mkdirSync(out, { recursive: true });

const files = readdirSync(source).filter((name) => name.toLowerCase().endsWith('.png'));
if (files.length === 0) {
  console.error(`no PNGs in ${source}`);
  process.exit(1);
}

let before = 0;
let after = 0;

for (const file of files) {
  const from = join(source, file);
  const name = parse(file).name;
  const resized = join(out, `${name}.resized.png`);
  const to = join(out, `${name}.webp`);

  before += statSync(from).size;

  execFileSync('sips', ['--resampleWidth', String(TARGET_WIDTH), from, '--out', resized], {
    stdio: 'ignore',
  });
  execFileSync('cwebp', ['-quiet', '-q', String(QUALITY), resized, '-o', to]);
  rmSync(resized);

  const size = statSync(to).size;
  after += size;
  console.log(`${name.padEnd(28)} ${(size / 1024).toFixed(0)} KB`);
}

console.log(
  `\n${files.length} screenshots — ${(before / 1024 / 1024).toFixed(1)} MB in, ` +
    `${(after / 1024).toFixed(0)} KB out`,
);
