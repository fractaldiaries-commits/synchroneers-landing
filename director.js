/**
 * The scroll director: one place that knows where the reader is in the page.
 *
 * The dream layers, the tarot spread and the floating phones all move because
 * of scroll, and they must agree about what "scrolled" means. If each one read
 * window.scrollY and smoothed it on its own, the mist would lag the phones and
 * the page would feel like three things that happen to share a scrollbar. So
 * the page has one smoothed scroll, one velocity, and one notion of which
 * section the reader is in, and everything else reads them from here.
 *
 * What it publishes (all on the single `state` object, mutated in place):
 *
 *   progress   0..1 through the whole page, smoothed
 *   velocity   signed scroll speed, smoothed and normalised: about 1 is a
 *              brisk wheel flick, and it settles to 0 when the reader stops
 *   section    fractional index into SECTION_PALETTES, so 2.5 is halfway
 *              from the third section to the fourth
 *   tintA/B    the two mist colours for that position, already blended
 *   pointer    -1..1 on both axes, smoothed (desktop only)
 *   time       seconds, for anything that drifts
 *
 * Timeline, from the top of the page to the bottom (see SECTION_PALETTES for
 * the colours): the hero is violet with a gold edge, the loop and capture
 * sections cool towards indigo, perspectives and the tarot spread warm back to
 * violet and gold, evidence and the collective return to indigo, and the
 * closing section ends on gold. Colours blend across the second half of each
 * section, so a heading is never sitting on a hard change.
 *
 * Reduced motion: the director does not run a loop at all. State stays at its
 * rest values and every consumer renders its static frame.
 */

import { filmAt } from './film.js';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/**
 * One entry per <section> in main, in document order. Values are linear
 * 0..1 RGB. Only brand colours appear (indigo, violet, midnight) with the
 * gold particle accent used where the content is about readings and endings.
 */
const SECTION_PALETTES = [
  // hero
  { a: [0.44, 0.3, 0.86], b: [0.2, 0.26, 0.62] },
  // loop
  { a: [0.3, 0.36, 0.82], b: [0.4, 0.28, 0.78] },
  // capture
  { a: [0.46, 0.32, 0.84], b: [0.22, 0.3, 0.7] },
  // what
  { a: [0.36, 0.4, 0.86], b: [0.5, 0.34, 0.84] },
  // kinds
  { a: [0.5, 0.34, 0.86], b: [0.28, 0.3, 0.72] },
  // perspectives
  { a: [0.42, 0.3, 0.8], b: [0.64, 0.46, 0.38] },
  // tarot
  { a: [0.6, 0.42, 0.52], b: [0.78, 0.56, 0.3] },
  // evidence
  { a: [0.26, 0.36, 0.84], b: [0.38, 0.3, 0.74] },
  // collectives
  { a: [0.4, 0.32, 0.84], b: [0.24, 0.34, 0.76] },
  // closing
  { a: [0.62, 0.44, 0.7], b: [0.8, 0.58, 0.32] },
];

export const state = {
  progress: 0,
  velocity: 0,
  section: 0,
  tintA: [...SECTION_PALETTES[0].a],
  tintB: [...SECTION_PALETTES[0].b],
  pointer: { x: 0, y: 0 },
  time: 0,
  /**
   * The astral-projection story, each 0..1 and derived from scroll position
   * in viewport heights (h = scrollY / innerHeight) so it plays out over the
   * same number of screens on every device:
   *   body   in the body: 1 at the top, gone by about one screen down
   *   cord   the silver cord: fades in after the first half screen, gone by
   *          about four screens
   *   cloud  rising through cloud: from one screen down to about four
   *   wake   returning to the body: the last seven percent of the page
   */
  body: 1,
  cord: 0,
  cloud: 0,
  wake: 0,
  /** How much of the hero film is showing: 1 at the top, 0 once it has faded out. */
  film: 0,
  /**
   * The opening, which runs on the clock rather than on scroll: the reader
   * arrives in the body and the double separates over the first few seconds.
   *   lift    0 in the body, 1 fully risen (eased, from about 1.2s to 5s)
   *   stream  a swell of speed through the motes while the lift happens
   * Under reduced motion both are at their settled values (1 and 0).
   */
  lift: 1,
  stream: 0,
  /** True while the director is animating. False under reduced motion. */
  live: false,
};

const subscribers = new Set();

/** Register a function called once per frame as `fn(state, dt)`. */
export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

/* ---------------- Measurements ---------------- */

let sections = [];
let tops = [];
let scrollTarget = 0;
let scrollSmooth = 0;
let lastRawY = window.scrollY;
let rawVelocity = 0;
const pointerTarget = { x: 0, y: 0 };

function measure() {
  sections = Array.from(document.querySelectorAll('main > section'));
  tops = sections.map((el) => el.getBoundingClientRect().top + window.scrollY);
}

function onScroll() {
  const total = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  scrollTarget = Math.min(1, window.scrollY / total);
}

/** The fractional section index for a scroll offset, measured at mid-screen. */
function sectionAt(y) {
  if (tops.length === 0) return 0;
  const probe = y + window.innerHeight * 0.5;

  let index = 0;
  for (let i = 0; i < tops.length; i++) if (tops[i] <= probe) index = i;

  const end = index + 1 < tops.length ? tops[index + 1] : document.documentElement.scrollHeight;
  const span = Math.max(1, end - tops[index]);
  const within = Math.min(1, Math.max(0, (probe - tops[index]) / span));

  // Hold the current section's colours for its first half, then blend across
  // the second half into the next one's.
  const blend = Math.min(1, Math.max(0, (within - 0.5) * 2));
  return index + blend * blend * (3 - 2 * blend);
}

function palette(position, key) {
  const last = SECTION_PALETTES.length - 1;
  const from = Math.min(last, Math.floor(position));
  const to = Math.min(last, from + 1);
  const t = position - from;
  const a = SECTION_PALETTES[from][key];
  const b = SECTION_PALETTES[to][key];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function applyPalette(position) {
  state.section = position;
  const a = palette(position, 'a');
  const b = palette(position, 'b');
  for (let i = 0; i < 3; i++) {
    state.tintA[i] = a[i];
    state.tintB[i] = b[i];
  }
}

/* ---------------- Journey ---------------- */

const hasFilm = Boolean(document.getElementById('film'));

const ease = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function updateJourney(y, progress) {
  const h = y / Math.max(1, window.innerHeight);

  // The opening plays once, from the first frame. A visitor who lands
  // part-way down the page (a shared anchor, a reload) has no body to leave.
  const t = state.live ? Math.max(0, state.time - 0.3) : 99;
  state.lift = ease(1.2, 5.2, t);
  state.stream = ease(1.6, 3.0, t) * (1 - ease(3.6, 6.4, t));

  // Warm cover lifts with the double: the room is left behind.
  state.body = (1 - ease(0.1, 1.1, h)) * (1 - 0.8 * state.lift);
  state.cord = ease(0.15, 0.7, h) * (1 - ease(2.2, 4.4, h));
  state.cloud = ease(0.5, 1.4, h) * (1 - ease(2.6, 4.6, h));
  state.wake = ease(0.93, 1, progress);
  // The poster-only case under reduced motion has no film layer to blend with.
  state.film = reduceMotion.matches || !hasFilm ? 0 : filmAt(y, window.innerHeight);
}

/* ---------------- Frame ---------------- */

let lastTick = -1;
let previous = performance.now();
let raf = 0;

/**
 * Advance the director to `now` (milliseconds). Safe to call from several
 * places in one frame: a second call with the same timestamp does nothing, so
 * the sky's render loop can drive it without the director's own loop doing the
 * work twice.
 */
export function tick(now) {
  if (now === lastTick) return;
  lastTick = now;

  // Clamped so a tab brought back from the background does not integrate a
  // minute of scrolling into one enormous velocity.
  const dt = Math.min((now - previous) / 1000, 0.05);
  previous = now;
  if (dt <= 0) return;

  state.time = now / 1000;
  autoDrift(state.time);
  scrollSmooth += (scrollTarget - scrollSmooth) * Math.min(1, dt * 2.6);
  state.progress = scrollSmooth;

  // Velocity from the raw offset, in viewports per second, then eased so a
  // single wheel notch gives a swell rather than a spike.
  const y = window.scrollY;
  const instantaneous = (y - lastRawY) / dt / Math.max(1, window.innerHeight);
  lastRawY = y;
  rawVelocity += (instantaneous - rawVelocity) * Math.min(1, dt * 7);
  state.velocity = Math.max(-3, Math.min(3, rawVelocity));

  state.pointer.x += (pointerTarget.x - state.pointer.x) * Math.min(1, dt * 2.4);
  state.pointer.y += (pointerTarget.y - state.pointer.y) * Math.min(1, dt * 2.4);

  applyPalette(sectionAt(y));
  updateJourney(y, state.progress);

  for (const fn of subscribers) fn(state, dt);
}

function loop(now) {
  raf = requestAnimationFrame(loop);
  tick(now);
}

function start() {
  if (raf || reduceMotion.matches) return;
  previous = performance.now();
  state.live = true;
  raf = requestAnimationFrame(loop);
}

function stop() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  state.live = false;
}

function applyMotionPreference() {
  stop();
  if (reduceMotion.matches) {
    state.velocity = 0;
    state.lift = 1;
    state.stream = 0;
    state.pointer.x = 0;
    state.pointer.y = 0;
    applyPalette(0);
    updateJourney(window.scrollY, scrollTarget);
    for (const fn of subscribers) fn(state, 0);
    return;
  }
  start();
}

/* ---------------- Boot ---------------- */

measure();
onScroll();
scrollSmooth = scrollTarget;

window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', () => {
  measure();
  onScroll();
});
window.addEventListener('load', measure);

// Sections change height as images and fonts arrive, which moves every
// boundary the palette is keyed to.
if ('ResizeObserver' in window) new ResizeObserver(measure).observe(document.body);

if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
  window.addEventListener(
    'pointermove',
    (event) => {
      pointerTarget.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointerTarget.y = -((event.clientY / window.innerHeight) * 2 - 1);
    },
    { passive: true },
  );
  document.addEventListener('pointerleave', () => {
    pointerTarget.x = 0;
    pointerTarget.y = 0;
  });
}

/* ---------------- Tilt: gyro, or a slow drift ----------------
   Touch screens have no cursor, so the parallax comes from the device's own
   tilt where it is offered, and from a slow automatic drift where it is not.
   iOS only gives orientation data after a permission prompt that has to come
   from a tap, so the first tap on the hero asks once; anywhere else the
   events simply start arriving. A denied or missing permission leaves the
   drift in charge, which is a fine fallback and not a degraded one. */

const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
let gyroActive = false;

function onOrientation(event) {
  if (event.gamma == null || event.beta == null) return;
  gyroActive = true;
  pointerTarget.x = Math.max(-1, Math.min(1, event.gamma / 28));
  // Held upright is about 60 degrees of beta; centre on that.
  pointerTarget.y = Math.max(-1, Math.min(1, -(event.beta - 55) / 28));
}

if (!finePointer && 'DeviceOrientationEvent' in window) {
  const needsPermission = typeof DeviceOrientationEvent.requestPermission === 'function';

  if (!needsPermission) {
    window.addEventListener('deviceorientation', onOrientation, { passive: true });
  } else {
    const hero = document.getElementById('top');
    const ask = (event) => {
      if (event.target.closest('a, button')) return;
      hero.removeEventListener('pointerup', ask);
      DeviceOrientationEvent.requestPermission()
        .then((answer) => {
          if (answer === 'granted') {
            window.addEventListener('deviceorientation', onOrientation, { passive: true });
          }
        })
        .catch(() => {});
    };
    if (hero) hero.addEventListener('pointerup', ask);
  }
}

/** Without a cursor or a gyro, the view wanders gently on its own. */
function autoDrift(time) {
  if (finePointer || gyroActive) return;
  pointerTarget.x = Math.sin(time * 0.21) * 0.55;
  pointerTarget.y = Math.sin(time * 0.17 + 1.3) * 0.4;
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stop();
  else start();
});

reduceMotion.addEventListener('change', applyMotionPreference);
applyMotionPreference();
