/**
 * The interpretation sigils, ported from the app.
 *
 * Source of truth is `src/components/interpretation/perspective-sigil.tsx`.
 * Every path, radius and opacity here is copied from it, so the fourteen
 * emblems on this page are the same fourteen the picker shows. They are arcs,
 * circles and lines rather than illustration assets, which is why they port at
 * all: there is nothing to export and nothing to keep in sync but geometry.
 *
 * One deliberate difference from the app, noted where it occurs: the accents
 * are remapped off the app's cyan, which the brand guidelines rule out. The
 * geometry is otherwise identical.
 */

/**
 * Per-lens accent. Indigo reads as evidence, violet as depth, gold as the
 * commons — the app's own three-way coding, with its cyan moved into the
 * indigo the brand guidelines allow.
 */
const ACCENTS = {
  general_interpretation: 'var(--indigo-light)',
  dream_analyst_von_franz: 'var(--violet-soft)',
  jungian: 'var(--violet)',
  psychoanalytic_freud: 'var(--violet-soft)',
  gestalt_perls: 'var(--violet)',
  buddhist_thich_nhat_hanh: 'var(--indigo-light)',
  mystical_ram_dass: 'var(--violet-soft)',
  mythologist_campbell: 'var(--amber)',
  biblical_scholar: 'var(--amber)',
  skeptical_scientist: 'var(--indigo-light)',
  synchroneers_pattern_researcher: 'var(--indigo-light)',
  collective_commons: 'var(--amber)',
  meditation_vision: 'var(--indigo-light)',
  tarot_reading: 'var(--amber)',
};

/**
 * A crescent as the intersection of two circles: the lit disc minus an offset
 * shadow disc. `offset` moves the shadow, so the same path draws any phase.
 */
function crescent(cx, cy, r, offset) {
  const sweep = offset > 0 ? 1 : 0;
  return [
    `M ${cx} ${cy - r}`,
    `A ${r} ${r} 0 1 ${sweep === 1 ? 1 : 0} ${cx} ${cy + r}`,
    `A ${Math.abs(offset)} ${r} 0 1 ${sweep} ${cx} ${cy - r}`,
    'Z',
  ].join(' ');
}

/** Evenly spaced points on a circle, for the ray and ring glyphs. */
function around(degrees, radius, cx = 20, cy = 20) {
  const radians = (degrees * Math.PI) / 180;
  return [cx + Math.cos(radians) * radius, cy + Math.sin(radians) * radius];
}

const STROKE = 'fill="none" stroke="currentColor" stroke-width="1.6"';

const GLYPHS = {
  // The general reading has no school behind it, so its mark is the plain
  // circle the other glyphs are all variations on.
  general_interpretation: () => `<circle cx="20" cy="20" r="11" ${STROKE} />`,

  // Personal association and symbolic development: a crescent held inside the
  // whole circle — the part that is lit, and the part that is not.
  dream_analyst_von_franz: () => `
    <circle cx="20" cy="20" r="11" ${STROKE} opacity="0.45" />
    <path d="${crescent(20, 20, 8, 5)}" fill="currentColor" opacity="0.9" />`,

  // Shadow and individuation: one circle, halved into light and dark.
  jungian: () => `
    <circle cx="20" cy="20" r="11" ${STROKE} />
    <path d="M 20 9 A 11 11 0 0 1 20 31 Z" fill="currentColor" opacity="0.85" />`,

  // What is above the waterline and what is beneath it.
  psychoanalytic_freud: () => `
    <path d="M 20 8 L 31 27 L 9 27 Z" ${STROKE} />
    <line x1="7" x2="33" y1="22" y2="22" stroke="currentColor" stroke-width="1.6" opacity="0.8" />
    <path d="M 20 8 L 26.3 19 L 13.7 19 Z" fill="currentColor" opacity="0.55" />`,

  // Two parts of a self in dialogue: interlocking arcs, neither closed.
  gestalt_perls: () => `
    <path d="M 24 11 A 9 9 0 1 0 24 29" ${STROKE} />
    <path d="M 16 11 A 9 9 0 1 1 16 29" ${STROKE} opacity="0.6" />`,

  // An open ring: attention that does not close around a conclusion.
  buddhist_thich_nhat_hanh: () => `
    <path d="M 28 12 A 11 11 0 1 0 30 21" ${STROKE} stroke-linecap="round" />
    <circle cx="20" cy="20" r="2.4" fill="currentColor" opacity="0.85" />`,

  // Witnessing: a centre with light arriving from every direction.
  mystical_ram_dass: () => `
    <circle cx="20" cy="20" r="3.4" fill="currentColor" />
    ${[0, 45, 90, 135, 180, 225, 270, 315]
      .map((deg) => {
        const [x1, y1] = around(deg, 7);
        const [x2, y2] = around(deg, 12);
        return `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}"
          stroke="currentColor" stroke-width="1.6" stroke-linecap="round"
          opacity="${deg % 90 === 0 ? 0.95 : 0.5}" />`;
      })
      .join('')}`,

  // The journey out and back: a spiral that returns changed.
  mythologist_campbell: () => `
    <path d="M 20 20 m 0 -2 a 2 2 0 1 1 -2 2 a 4.5 4.5 0 1 0 4.5 -4.5 a 7.5 7.5 0 1 0 7.5 7.5 a 10.5 10.5 0 1 1 -10.5 -10.5"
      ${STROKE} stroke-linecap="round" />`,

  // Text and tradition: a scroll, read rather than revealed.
  biblical_scholar: () => `
    <path d="M 12 12 L 28 12 A 3 3 0 0 1 28 18 L 14 18" ${STROKE} />
    <path d="M 12 12 A 3 3 0 0 0 12 18 L 12 28 A 3 3 0 0 0 15 31 L 29 31" ${STROKE} />
    <line x1="17" x2="26" y1="23" y2="23" stroke="currentColor" stroke-width="1.4" opacity="0.55" />
    <line x1="17" x2="23" y1="27" y2="27" stroke="currentColor" stroke-width="1.4" opacity="0.35" />`,

  // Weighing: two pans, and the willingness to let either fall.
  skeptical_scientist: () => `
    <line x1="20" x2="20" y1="10" y2="30" stroke="currentColor" stroke-width="1.6" />
    <line x1="10" x2="30" y1="15" y2="15" stroke="currentColor" stroke-width="1.6" />
    <path d="M 10 15 L 6.5 22 A 4 4 0 0 0 13.5 22 Z" fill="none" stroke="currentColor" stroke-width="1.4" />
    <path d="M 30 15 L 26.5 22 A 4 4 0 0 0 33.5 22 Z" fill="none" stroke="currentColor" stroke-width="1.4" />
    <line x1="15" x2="25" y1="30" y2="30" stroke="currentColor" stroke-width="1.6" opacity="0.7" />`,

  // Your own records, joined: a small constellation of entries.
  synchroneers_pattern_researcher: () => `
    <line x1="12" x2="19" y1="26" y2="14" stroke="currentColor" stroke-width="1.3" opacity="0.5" />
    <line x1="19" x2="28" y1="14" y2="20" stroke="currentColor" stroke-width="1.3" opacity="0.5" />
    <line x1="28" x2="22" y1="20" y2="29" stroke="currentColor" stroke-width="1.3" opacity="0.5" />
    <circle cx="12" cy="26" r="2.2" fill="currentColor" />
    <circle cx="19" cy="14" r="2.8" fill="currentColor" />
    <circle cx="28" cy="20" r="2.2" fill="currentColor" />
    <circle cx="22" cy="29" r="1.9" fill="currentColor" />`,

  // Many readers, one shared sky: a ring of others around a centre that is you.
  collective_commons: () => `
    <circle cx="20" cy="20" r="11" fill="none" stroke="currentColor" stroke-width="1.3" opacity="0.4" />
    ${[0, 60, 120, 180, 240, 300]
      .map((deg) => {
        const [x, y] = around(deg, 11);
        return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2.2" fill="currentColor" opacity="0.85" />`;
      })
      .join('')}
    <circle cx="20" cy="20" r="3.2" fill="var(--indigo-light)" />`,

  meditation_vision: () => `
    <circle cx="20" cy="20" r="10" ${STROKE} opacity="0.7" />
    <path d="M 12 20 Q 16 14 20 20 T 28 20" ${STROKE} stroke-linecap="round" />
    <circle cx="20" cy="20" r="2.4" fill="currentColor" />`,

  tarot_reading: () => `
    <path d="M 11 10 L 22 8 L 25 27 L 14 29 Z" ${STROKE} />
    <path d="M 19 13 L 29 15 L 26 31 L 17 29 Z" ${STROKE} opacity="0.65" />
    <circle cx="18" cy="18" r="2" fill="currentColor" />`,
};

/**
 * Markup for one sigil: the app's dark disc, accent ring and glow, with the
 * glyph inside. `currentColor` carries the accent, so hover and focus states
 * are one colour change on the wrapper rather than fourteen.
 */
export function sigilMarkup(id) {
  const glyph = GLYPHS[id];
  if (!glyph) return '';

  return `<svg class="sigil" viewBox="0 0 40 40" role="img" aria-hidden="true" style="color: ${ACCENTS[id]}">
    <defs>
      <radialGradient id="sigil-glow-${id}" cx="50%" cy="50%" r="50%">
        <stop offset="0" stop-color="currentColor" stop-opacity="0.14" />
        <stop offset="1" stop-color="currentColor" stop-opacity="0" />
      </radialGradient>
    </defs>
    <circle cx="20" cy="20" r="19.2" class="sigil__disc" />
    <circle cx="20" cy="20" r="19.2" fill="url(#sigil-glow-${id})" />
    <circle cx="20" cy="20" r="19.2" fill="none" stroke="currentColor" stroke-opacity="0.3" stroke-width="1" />
    ${glyph()}
  </svg>`;
}
