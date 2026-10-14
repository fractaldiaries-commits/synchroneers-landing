/**
 * The two films: the astral loop behind the hero and the lake behind the close.
 *
 * Neither blocks the first paint. The poster is plain markup, preloaded, and
 * shows at once. The video is attached afterwards, so the browser has already
 * painted when it starts fetching, and it fades in over the poster only once
 * it is actually playing. Where it cannot play (autoplay refused, data saver,
 * reduced motion, a failed fetch) the poster simply stays.
 *
 * Exactly one hero source is ever requested: the portrait cut below 768px,
 * the wide cut above it. The lake is only fetched when the closing section is
 * within a screen of the viewport, and it pauses when it leaves.
 *
 * While the hero film is up, scrolling pushes it in slowly (1.0 to 1.12) and
 * lifts it a little slower than the page, then fades it out, so leaving the
 * hero reads as drifting up into the sky. The sky canvas reads the same
 * fade from the director (see `filmAt`) so its layers stay in step.
 */

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const narrow = window.matchMedia('(max-width: 767px)');

const SOURCES = {
  wide: { video: 'assets/hero/astral-1080.mp4', poster: 'assets/hero/astral-1080.webp' },
  narrow: { video: 'assets/hero/astral-portrait.mp4', poster: 'assets/hero/astral-portrait.webp' },
};

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** How much of the hero film is showing at scroll offset `y`: 1 at the top, 0 once the hero is gone. */
export function filmAt(y, viewportHeight) {
  return 1 - smooth(0.18 * viewportHeight, 0.98 * viewportHeight, y);
}

/** Saves data, or is on a connection too slow to spend megabytes on a backdrop. */
function holdsBack() {
  const connection = navigator.connection;
  if (!connection) return false;
  return connection.saveData === true || /(^|-)2g$/.test(connection.effectiveType || '');
}

/**
 * Run `fn` once the poster has painted. Not on window load: that waits for the
 * web font and everything else, and a slow font should not hold the film back.
 * A timer covers a poster that never settles.
 */
function afterPoster(image, fn) {
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    // Two frames, so the poster is on screen before the video request starts.
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(fn, 60)));
  };
  if (image && !image.complete) {
    image.addEventListener('load', go, { once: true });
    image.addEventListener('error', go, { once: true });
  } else {
    go();
  }
  setTimeout(go, 2500);
}

/** Attach a source and play. Resolves quietly whatever happens. */
function attach(video, src, poster) {
  if (poster) video.poster = poster;
  video.addEventListener('playing', () => video.classList.add('is-playing'), { once: true });
  video.addEventListener('error', () => video.classList.remove('is-playing'), { once: true });
  video.src = src;
  const started = video.play();
  if (started && started.catch) started.catch(() => {});
}

/* ---------------- Hero ---------------- */

function initHero() {
  const root = document.getElementById('film');
  if (!root) return;

  const stage = root.querySelector('.film__stage');
  const media = root.querySelector('.film__media');
  const video = root.querySelector('.film__video');
  if (!stage || !media || !video) return;

  // Reduced motion: the poster only. No video, no scroll effects.
  if (reduceMotion.matches) return;

  let wanted = true;

  function start() {
    if (holdsBack()) return;
    const source = narrow.matches ? SOURCES.narrow : SOURCES.wide;
    attach(video, source.video, source.poster);
  }

  afterPoster(root.querySelector('.film__poster img'), start);

  // A rotation or resize across the breakpoint swaps the cut. Rare, and the
  // one case where a second file is requested.
  narrow.addEventListener('change', () => {
    if (!video.getAttribute('src')) return;
    video.classList.remove('is-playing');
    video.pause();
    start();
  });

  /* Scroll: push in, lift, fade. One write per frame, transform and opacity only. */
  let queued = false;

  function apply() {
    queued = false;
    const y = window.scrollY;
    const vh = Math.max(1, window.innerHeight);
    const visible = filmAt(y, vh);
    const travel = Math.min(1, y / vh);

    stage.style.opacity = String(visible);
    media.style.transform = `translate3d(0, ${(-y * 0.07).toFixed(1)}px, 0) scale(${(1 + 0.12 * travel).toFixed(4)})`;

    const shouldPlay = visible > 0.001 && !document.hidden;
    if (shouldPlay !== wanted) {
      wanted = shouldPlay;
      if (wanted) {
        const resumed = video.play();
        if (resumed && resumed.catch) resumed.catch(() => {});
      } else {
        video.pause();
      }
      stage.style.visibility = visible > 0.001 ? '' : 'hidden';
    }
  }

  function queue() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(apply);
  }

  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue, { passive: true });
  document.addEventListener('visibilitychange', queue);
  apply();
}

/* ---------------- Closing lake ---------------- */

function initLake() {
  const host = document.querySelector('.closing-film');
  const video = host && host.querySelector('video');
  if (!video || reduceMotion.matches || !('IntersectionObserver' in window)) return;

  let attached = false;

  const watcher = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          if (!attached) {
            if (holdsBack()) {
              watcher.disconnect();
              return;
            }
            attached = true;
            attach(video, video.dataset.src, null);
          } else {
            const resumed = video.play();
            if (resumed && resumed.catch) resumed.catch(() => {});
          }
        } else if (attached) {
          video.pause();
        }
      }
    },
    { rootMargin: '100% 0px 100% 0px' },
  );
  watcher.observe(host);
}

initHero();
initLake();
