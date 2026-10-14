/**
 * The interactive phone.
 *
 * Turns a plain `<figure class="shot" data-phone="capture">` into a phone whose
 * screen plays a short recording of the app, with a strip of tabs underneath
 * that switches which recording is showing. The markup stays what it was: an
 * <img> with real alt text inside the frame. Everything here is added on top,
 * so with this script absent, or a video missing, the visitor still sees the
 * still screenshot, exactly as before.
 *
 * Where the files come from
 *   assets/app/video/{name}.mp4   the recording (portrait, H.264, muted)
 *   assets/app/video/{name}.webp  its poster frame
 * and while those do not exist, each clip falls back to the existing still in
 * assets/app (see CLIPS). A missing video or poster is never an error: the
 * video element removes itself and the still stays.
 *
 * Behaviour
 *   - Nothing is requested until the phone is on screen. The video gets its
 *     `src` the first time it is at least a third visible, then plays while
 *     visible and pauses when it leaves, so six phones never decode at once.
 *   - Switching tabs fades the screen out (a touch of blur and scale), swaps
 *     the clip, and fades back in.
 *   - A pulsing ring marks where the first tap of each clip lands, for the
 *     first moments of every loop. Positions are in CLIPS as percentages of
 *     the screen, so they are easy to retune against the real recordings.
 *   - Pointer tilt: on a fine pointer, moving over a phone leans it towards
 *     the cursor. page.js reads `hoverX` / `hoverY` from the element.
 *   - Reduced motion: the poster (or still) is shown, nothing autoplays, no
 *     tap ring pulses, and the tabs still switch clips.
 */

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

/**
 * The five clips. `still` is the fallback screenshot, `alt` describes it (it is
 * the existing alt text for that screenshot), and `tap` is where the first tap
 * lands, as [x%, y%] of the screen.
 */
const CLIPS = {
  capture: {
    label: 'Capture',
    still: 'assets/app/04-journal.webp',
    alt: "The journal: ten entries on a timeline, each tagged by kind, with the time it happened and the time it was logged.",
    tap: [50, 91],
  },
  reading: {
    label: 'Reading',
    still: 'assets/app/07-deepdive.webp',
    alt: 'A reading through one chosen framework, marked tentative, with the question it leaves you holding.',
    tap: [50, 34],
  },
  tarot: {
    label: 'Tarot',
    // The lead's dedicated tarot capture, if it has been dropped in.
    prefer: 'assets/app/08-tarot.webp',
    still: 'assets/app/05-perspectives.webp',
    alt: 'The perspective picker: thirteen named frameworks, each credited to the school or teacher it draws on.',
    tap: [50, 62],
  },
  patterns: {
    label: 'Patterns',
    still: 'assets/app/03-insights-timeline.webp',
    alt: "The Insights screen: ten entries counted by kind, and a timeline placing each one against the moon's phase.",
    tap: [74, 88],
  },
  collectives: {
    label: 'Collectives',
    still: 'assets/app/02-follow-filled-heart.webp',
    alt: 'The Social screen: people you can follow in the shared sky, each row a name and a follow control.',
    tap: [88, 30],
  },
};

const ORDER = ['capture', 'reading', 'tarot', 'patterns', 'collectives'];
const VIDEO_BASE = 'assets/app/video/';

/** Resolve once an image URL has loaded, or reject. Used to prefer a poster. */
function probe(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(url);
    image.onerror = reject;
    image.src = url;
  });
}

function buildPhone(shot) {
  const image = shot.querySelector('img');
  if (!image) return;

  const start = CLIPS[shot.dataset.phone] ? shot.dataset.phone : 'capture';

  /* ---------- Structure ---------- */

  const wrapper = document.createElement('div');
  wrapper.className = 'phone';
  shot.replaceWith(wrapper);
  wrapper.append(shot);

  // The screen holds the still, the video and the tap ring, in that order.
  const screen = document.createElement('div');
  screen.className = 'phone-screen';
  image.replaceWith(screen);
  screen.append(image);

  const tap = document.createElement('span');
  tap.className = 'phone-tap';
  tap.setAttribute('aria-hidden', 'true');
  screen.append(tap);

  const tabs = document.createElement('div');
  tabs.className = 'phone-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Screens to explore');
  const panelId = `phone-screen-${Math.random().toString(36).slice(2, 8)}`;
  screen.id = panelId;
  screen.setAttribute('role', 'tabpanel');

  const buttons = ORDER.map((name) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'phone-tab';
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', panelId);
    button.dataset.clip = name;
    button.textContent = CLIPS[name].label;
    tabs.append(button);
    return button;
  });
  wrapper.append(tabs);

  /* ---------- State ---------- */

  let current = null;
  let video = null;
  let visible = false;
  let tapTimer = 0;
  let lastTime = 0;
  let token = 0;

  /** Pulse the tap ring for the first moments of a clip. */
  function pulse() {
    const [x, y] = CLIPS[current].tap;
    tap.style.left = `${x}%`;
    tap.style.top = `${y}%`;
    tap.classList.remove('is-on');
    // Reflow so the animation restarts when the class returns.
    void tap.offsetWidth;
    if (reduceMotion.matches) return;
    tap.classList.add('is-on');
    window.clearTimeout(tapTimer);
    tapTimer = window.setTimeout(() => tap.classList.remove('is-on'), 1900);
  }

  function dropVideo() {
    if (!video) return;
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.remove();
    video = null;
  }

  /** Attach a video for the current clip. Quietly gives up if it is missing. */
  function attachVideo(name, mine) {
    dropVideo();
    if (reduceMotion.matches) return;

    const element = document.createElement('video');
    element.className = 'phone-video';
    element.muted = true;
    element.loop = true;
    element.playsInline = true;
    element.preload = 'metadata';
    element.setAttribute('aria-hidden', 'true');
    element.tabIndex = -1;

    element.addEventListener('error', () => {
      if (video === element) dropVideo();
    });
    element.addEventListener('playing', () => {
      if (mine !== token) return;
      element.classList.add('is-ready');
      pulse();
    });
    // A loop does not fire "ended", so a jump back in time is the restart.
    element.addEventListener('timeupdate', () => {
      if (element.currentTime < lastTime - 0.5) pulse();
      lastTime = element.currentTime;
    });

    element.src = `${VIDEO_BASE}${name}.mp4`;
    screen.insertBefore(element, tap);
    video = element;

    if (visible) element.play().catch(() => {});
  }

  /** Make `name` the clip on screen. */
  async function select(name, { animate = true } = {}) {
    if (name === current) return;
    const mine = ++token;
    const clip = CLIPS[name];

    for (const button of buttons) {
      const selected = button.dataset.clip === name;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
    screen.setAttribute('aria-labelledby', buttons.find((b) => b.dataset.clip === name).id || '');

    if (animate && current) {
      screen.classList.add('is-switching');
      await new Promise((resolve) => window.setTimeout(resolve, reduceMotion.matches ? 0 : 200));
      if (mine !== token) return;
    }

    current = name;
    lastTime = 0;
    dropVideo();
    image.alt = clip.alt;

    // Prefer the real poster, then a dedicated capture; keep the existing
    // still if neither is there yet.
    image.src = clip.still;
    const candidates = [`${VIDEO_BASE}${name}.webp`, clip.prefer].filter(Boolean);
    candidates
      .reduce((chain, url) => chain.catch(() => probe(url)), Promise.reject())
      .then((url) => {
        if (mine === token) image.src = url;
      })
      .catch(() => {});

    attachVideo(name, mine);
    screen.classList.remove('is-switching');
    if (reduceMotion.matches || !visible) {
      tap.classList.remove('is-on');
    } else {
      pulse();
    }
  }

  buttons.forEach((button, index) => {
    button.id = `${panelId}-tab-${index}`;
    button.addEventListener('click', () => select(button.dataset.clip));
  });

  tabs.addEventListener('keydown', (event) => {
    const index = buttons.indexOf(document.activeElement);
    if (index === -1) return;
    let next = -1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % buttons.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      next = (index - 1 + buttons.length) % buttons.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = buttons.length - 1;
    if (next === -1) return;
    event.preventDefault();
    buttons[next].focus();
    select(buttons[next].dataset.clip);
  });

  /* ---------- Visibility: play only what is on screen ---------- */

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(
      (entries) => {
        visible = entries.some((entry) => entry.isIntersecting);
        if (!video) return;
        if (visible && !reduceMotion.matches) video.play().catch(() => {});
        else video.pause();
        if (visible && !reduceMotion.matches && !video.classList.contains('is-ready')) pulse();
      },
      { threshold: 0.35 },
    ).observe(shot);
  }

  /* ---------- Pointer tilt ---------- */

  shot.hoverX = 0;
  shot.hoverY = 0;
  shot.hoverTargetX = 0;
  shot.hoverTargetY = 0;

  if (finePointer.matches) {
    wrapper.addEventListener('pointermove', (event) => {
      const box = shot.getBoundingClientRect();
      shot.hoverTargetX = Math.max(-1, Math.min(1, ((event.clientX - box.left) / box.width) * 2 - 1));
      shot.hoverTargetY = Math.max(-1, Math.min(1, ((event.clientY - box.top) / box.height) * 2 - 1));
    });
    wrapper.addEventListener('pointerleave', () => {
      shot.hoverTargetX = 0;
      shot.hoverTargetY = 0;
    });
  }

  select(start, { animate: false });
}

/** Enhance every phone on the page that asks for it with data-phone. */
export function initPhones() {
  for (const shot of document.querySelectorAll('.shot[data-phone]')) buildPhone(shot);
}
