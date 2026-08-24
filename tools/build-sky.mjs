/**
 * Turns the real star catalogue into the compact module the sky loads.
 *
 *   node landing/tools/build-sky.mjs <hygdata_v41.csv> <stellarium-modern.json>
 *
 * Sources, both re-downloadable and neither committed here because of size:
 *   HYG v41         https://github.com/astronexus/HYG-Database  (CC BY-SA 4.0)
 *   Stellarium      https://github.com/Stellarium/stellarium    (GPL-2.0, data
 *                   under skycultures/modern; figures are the IAU/Stellarium
 *                   modern sky culture)
 *
 * Output is `landing/sky-data.js`: two base64 blobs and a small label table.
 * Base64 rather than a fetched binary so the single-file build in build.mjs
 * keeps working without a second network request.
 *
 * Star record, six bytes, little-endian:
 *   u16 right ascension   0..65535 over 0..360 degrees
 *   i16 declination     -32767..32767 over -90..90 degrees
 *   u8  magnitude        (mag + 2) * 20, so -2..10.75 fits
 *   u8  colour index     (ci + 0.5) * 50, so -0.5..4.6 fits
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAG_LIMIT = 7.5;

const [, , hygPath, stellariumPath] = process.argv;
if (!hygPath || !stellariumPath) {
  console.error('usage: node landing/tools/build-sky.mjs <hyg.csv> <stellarium-modern.json>');
  process.exit(1);
}

/* ---------------- Stars ---------------- */

const csv = readFileSync(resolve(hygPath), 'utf8');
const lines = csv.split('\n');
const header = lines[0].split(',').map((name) => name.replaceAll('"', ''));
const column = Object.fromEntries(header.map((name, index) => [name, index]));

/** The catalogue is plain enough that a full CSV parser is not worth pulling in. */
function fields(line) {
  const out = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const character = line[i];
    if (character === '"') quoted = !quoted;
    else if (character === ',' && !quoted) {
      out.push(value);
      value = '';
    } else value += character;
  }
  out.push(value);
  return out;
}

const stars = [];
for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line) continue;
  const row = fields(line);

  const magnitude = Number.parseFloat(row[column.mag]);
  if (!Number.isFinite(magnitude) || magnitude > MAG_LIMIT) continue;

  // The Sun is row zero of the catalogue and is not part of the night sky.
  const id = Number.parseInt(row[column.id], 10);
  if (id === 0) continue;

  const raHours = Number.parseFloat(row[column.ra]);
  const declination = Number.parseFloat(row[column.dec]);
  if (!Number.isFinite(raHours) || !Number.isFinite(declination)) continue;

  const colourIndex = Number.parseFloat(row[column.ci]);
  const hip = Number.parseInt(row[column.hip], 10);

  stars.push({
    hip: Number.isFinite(hip) ? hip : 0,
    ra: raHours * 15,
    dec: declination,
    mag: magnitude,
    ci: Number.isFinite(colourIndex) ? colourIndex : 0.65,
  });
}

// Brightest first, so the figure stars cluster at the front of the buffer and
// any future "first N" slice is the naked-eye sky rather than a random cut.
stars.sort((a, b) => a.mag - b.mag);

const byHip = new Map();
stars.forEach((star, index) => {
  if (star.hip) byHip.set(star.hip, index);
});

const starBuffer = Buffer.alloc(stars.length * 6);
stars.forEach((star, index) => {
  const offset = index * 6;
  const ra = ((star.ra % 360) + 360) % 360;
  starBuffer.writeUInt16LE(Math.round((ra / 360) * 65535), offset);
  starBuffer.writeInt16LE(Math.round((star.dec / 90) * 32767), offset + 2);
  starBuffer.writeUInt8(clampByte((star.mag + 2) * 20), offset + 4);
  starBuffer.writeUInt8(clampByte((star.ci + 0.5) * 50), offset + 5);
});

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/* ---------------- Constellation figures ---------------- */

const culture = JSON.parse(readFileSync(resolve(stellariumPath), 'utf8'));
const segments = [];
const constellations = [];
let missing = 0;

for (const constellation of culture.constellations) {
  const members = new Set();
  let used = 0;

  for (const polyline of constellation.lines ?? []) {
    for (let i = 0; i < polyline.length - 1; i++) {
      const from = byHip.get(polyline[i]);
      const to = byHip.get(polyline[i + 1]);
      if (from === undefined || to === undefined) {
        missing++;
        continue;
      }
      segments.push(from, to);
      members.add(from);
      members.add(to);
      used++;
    }
  }

  if (used === 0) continue;

  // Label position is the mean direction of the figure's own stars, not the
  // mean of the angles: averaging right ascension breaks across the 0/360 seam.
  let x = 0;
  let y = 0;
  let z = 0;
  for (const index of members) {
    const star = stars[index];
    const ra = (star.ra * Math.PI) / 180;
    const dec = (star.dec * Math.PI) / 180;
    x += Math.cos(dec) * Math.cos(ra);
    y += Math.cos(dec) * Math.sin(ra);
    z += Math.sin(dec);
  }
  const length = Math.hypot(x, y, z) || 1;
  x /= length;
  y /= length;
  z /= length;

  constellations.push({
    id: constellation.id.replace('CON modern ', ''),
    name: constellation.common_name?.english ?? constellation.id,
    latin: constellation.common_name?.native ?? '',
    ra: Number((((Math.atan2(y, x) * 180) / Math.PI + 360) % 360).toFixed(3)),
    dec: Number(((Math.asin(z) * 180) / Math.PI).toFixed(3)),
    stars: members.size,
  });
}

const segmentBuffer = Buffer.alloc(segments.length * 2);
segments.forEach((index, i) => segmentBuffer.writeUInt16LE(index, i * 2));

/* ---------------- Emit ---------------- */

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'sky-data.js');
const module = `/**
 * Generated by tools/build-sky.mjs. Do not edit by hand.
 *
 * ${stars.length} stars to magnitude ${MAG_LIMIT.toFixed(1)} from the HYG database v41
 * (CC BY-SA 4.0), and ${segments.length / 2} figure segments across
 * ${constellations.length} constellations from Stellarium's modern sky culture.
 *
 * The Milky Way in this sky is not a texture. It is where these stars actually
 * are: at this magnitude limit the galactic plane shows up as density.
 */

export const STAR_COUNT = ${stars.length};
export const MAG_LIMIT = ${MAG_LIMIT};
export const SEGMENT_COUNT = ${segments.length / 2};

/** Six bytes per star: u16 RA, i16 dec, u8 magnitude, u8 colour index. */
export const STARS_B64 =
  '${starBuffer.toString('base64')}';

/** Pairs of star indices, u16 each. */
export const SEGMENTS_B64 =
  '${segmentBuffer.toString('base64')}';

export const CONSTELLATIONS = ${JSON.stringify(constellations)};
`;

writeFileSync(out, module);

console.log(`stars           ${stars.length} (mag <= ${MAG_LIMIT})`);
console.log(`figure segments ${segments.length / 2} across ${constellations.length} constellations`);
console.log(`unmatched HIPs  ${missing}`);
console.log(`wrote           ${out} — ${(module.length / 1024).toFixed(0)} KB`);
