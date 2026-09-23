/**
 * Page behaviour: the perspective registry, the capture tabs, and the few
 * animations that explain something rather than decorate it.
 *
 * The registry is built in script because it is one list of thirteen records
 * that has to stay in the same order as the app's own picker. Hand-writing it
 * into the markup is how the site and the app drift apart.
 */

import { sigilMarkup } from './sigils.js';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/* ---------------- Perspective registry ----------------
   Mirrors INTERPRETATION_PERSPECTIVES and PERSPECTIVE_CATEGORIES in
   src/features/interpretation/domain/perspective.ts, and the ids below key
   the sigils ported from perspective-sigil.tsx. Adding a perspective there
   means adding it in both places here. */

const PERSPECTIVE_CATEGORIES = [
  'Depth psychology',
  'Contemplative',
  'Story and text',
  'Evidence first',
  'The commons',
  'Symbolic tools',
];

const PERSPECTIVES = [
  {
    id: 'dream_analyst_von_franz',
    category: 'Depth psychology',
    title: 'Dream Analyst',
    attribution: 'Inspired by the Marie-Louise von Franz framework',
    description: 'Personal associations, compensation, and symbolic development.',
  },
  {
    id: 'jungian',
    category: 'Depth psychology',
    title: 'Jungian Analyst',
    attribution: "Inspired by Carl Jung's analytical psychology",
    description: 'Archetypes, shadow, individuation, and symbolic meaning.',
  },
  {
    id: 'psychoanalytic_freud',
    category: 'Depth psychology',
    title: 'Psychoanalytic Analyst',
    attribution: "Inspired by Sigmund Freud's psychoanalysis",
    description: 'Associations, conflict, wishes, and unconscious patterns.',
  },
  {
    id: 'gestalt_perls',
    category: 'Depth psychology',
    title: 'Gestalt Analyst',
    attribution: "Inspired by Fritz Perls's Gestalt therapy",
    description: 'Present experience, embodiment, and dialogue between inner parts.',
  },
  {
    id: 'buddhist_thich_nhat_hanh',
    category: 'Contemplative',
    title: 'Buddhist Perspective',
    attribution: 'Zen and mindfulness tradition',
    description: 'Mindfulness, compassion, interbeing, and non-attachment.',
  },
  {
    id: 'mystical_ram_dass',
    category: 'Contemplative',
    title: 'Mystical Perspective',
    attribution: 'Bhakti and non-dual tradition',
    description: 'Witnessing, compassion, spiritual meaning, and expanded awareness.',
  },
  {
    id: 'mythologist_campbell',
    category: 'Story and text',
    title: 'The Mythologist',
    attribution: "Inspired by Joseph Campbell's work on myth",
    description: 'Myth, archetype, transformation, and the stories shaping your experience.',
  },
  {
    id: 'biblical_scholar',
    category: 'Story and text',
    title: 'Biblical Scholar',
    attribution: 'Historical-literary framework',
    description: 'Scripture, symbolism, historical context, and spiritual interpretation.',
  },
  {
    id: 'skeptical_scientist',
    category: 'Evidence first',
    title: 'Skeptical Scientist',
    attribution: 'Evidence-first framework',
    description:
      'Explore psychological, statistical, and everyday explanations for your experiences.',
  },
  {
    id: 'synchroneers_pattern_researcher',
    category: 'Evidence first',
    title: 'Pattern Researcher',
    attribution: 'Your Synchroneers records only',
    description: 'Discover patterns, repetitions, and connections across your experiences.',
  },
  {
    id: 'collective_commons',
    category: 'The commons',
    title: 'Collective Reading',
    attribution: 'Insights from consenting shared experiences',
    description:
      'See the patterns and symbols others are noticing - and how they connect with yours.',
  },
  {
    id: 'meditation_vision',
    category: 'Symbolic tools',
    title: 'Meditation / Vision',
    attribution: 'Guided visualization framework',
    description: 'A quiet visual meditation for exploring imagery, intuition, and possibility.',
  },
  {
    id: 'tarot_reading',
    category: 'Symbolic tools',
    title: 'Tarot Reading',
    attribution: 'Tarot-inspired symbolic spread',
    description: 'A three-card reflection exploring themes, symbols, and possible meanings.',
  },
];

function buildRegistry() {
  const host = document.getElementById('registry');
  if (!host) return;

  const fragment = document.createDocumentFragment();

  for (const category of PERSPECTIVE_CATEGORIES) {
    const items = PERSPECTIVES.filter((entry) => entry.category === category);
    if (items.length === 0) continue;

    const group = document.createElement('div');
    group.className = 'registry-group reveal';

    const label = document.createElement('h3');
    label.className = 'registry-group__label';
    label.textContent = category;
    group.append(label);

    const list = document.createElement('ul');
    list.className = 'registry-items';

    for (const item of items) {
      const li = document.createElement('li');
      li.className = 'registry-item';

      // The markup is a static template from sigils.js, not anything a
      // reader can influence, so innerHTML is the readable way to place it.
      const sigil = document.createElement('span');
      sigil.className = 'registry-item__sigil';
      sigil.setAttribute('aria-hidden', 'true');
      sigil.innerHTML = sigilMarkup(item.id);

      const name = document.createElement('p');
      name.className = 'registry-item__name';
      name.append(document.createTextNode(item.title));

      const from = document.createElement('span');
      from.className = 'registry-item__from';
      from.textContent = item.attribution;
      name.append(from);

      const description = document.createElement('p');
      description.className = 'registry-item__desc';
      description.textContent = item.description;

      li.append(sigil, name, description);
      list.append(li);
    }

    group.append(list);
    fragment.append(group);
  }

  host.append(fragment);
}

/* ---------------- Capture tabs ----------------
   A tablist rather than four cards, because picking a kind of experience is
   exactly the choice the capture screen asks for. Switching is a high-frequency
   action inside the app, so the panel crossfades in one press-length step and
   nothing waits on it. */

function initTabs() {
  const tablist = document.getElementById('typeTabs');
  const panel = document.getElementById('capturePanel');
  if (!tablist || !panel) return;

  const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
  const promptTarget = panel.querySelector('[data-capture-prompt]');
  const nameTarget = panel.querySelector('[data-capture-name]');

  // Each kind carries its own accent from ENTRY_TYPE_PRESENTATION. Without
  // this every glyph and selected row rendered in the dream violet.
  for (const tab of tabs) tab.style.setProperty('--accent', tab.dataset.accent);

  function select(tab, { focus = false } = {}) {
    for (const other of tabs) {
      const selected = other === tab;
      other.setAttribute('aria-selected', String(selected));
      other.tabIndex = selected ? 0 : -1;
    }

    panel.style.setProperty('--accent', tab.dataset.accent);
    panel.setAttribute('aria-labelledby', tab.id);
    if (nameTarget) nameTarget.textContent = tab.dataset.name;
    if (promptTarget) promptTarget.textContent = tab.dataset.prompt;

    if (focus) tab.focus();
  }

  tablist.addEventListener('click', (event) => {
    const tab = event.target.closest('[role="tab"]');
    if (tab) select(tab);
  });

  tablist.addEventListener('keydown', (event) => {
    const current = tabs.indexOf(document.activeElement);
    if (current === -1) return;

    let next = -1;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (current + 1) % tabs.length;
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft')
      next = (current - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    if (next === -1) return;

    event.preventDefault();
    select(tabs[next], { focus: true });
  });

  select(tabs[0]);
}

/* ---------------- Reveal ----------------
   Section headers and the loop only. Content that carries the argument is on
   the page at load; this adds arrival, not availability. */

function initReveal() {
  const targets = document.querySelectorAll('.reveal');

  if (reduceMotion.matches || !('IntersectionObserver' in window)) {
    for (const target of targets) target.dataset.shown = 'true';
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.dataset.shown = 'true';
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.12 },
  );

  for (const target of targets) observer.observe(target);
}

/* ---------------- Line drawing ----------------
   Both of these draw a connection that did not exist a moment ago, which is
   the one idea the page most needs to land. They run once, on first sight.

   The drawn state is the CSS default and script only ever adds and removes a
   "pending" attribute, so nothing on the page is invisible while it waits for
   an animation, a throttled timeline, or a script that never ran. */

function whenSeen(element, run) {
  if (!element) return;

  if (reduceMotion.matches || !('IntersectionObserver' in window)) {
    run();
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.disconnect();
        run();
      }
    },
    { threshold: 0.3 },
  );
  observer.observe(element);
}

/** Hold `path` at zero length until `host` is on screen, then let it draw. */
function drawWhenSeen(host, path) {
  if (!host || !path) return;
  if (reduceMotion.matches) return;

  const length = path.getTotalLength();
  if (!Number.isFinite(length) || length === 0) return;

  host.style.setProperty('--len', String(length));
  host.dataset.draw = 'pending';

  whenSeen(host, () => {
    // One frame, so the browser registers the pending state before the
    // transition to the default state begins.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        delete host.dataset.draw;
      });
    });
  });
}

function initHeroConstellation() {
  const svg = document.querySelector('[data-constellation]');
  if (!svg) return;
  drawWhenSeen(svg, svg.querySelector('.constellation-line'));
}

function initLoop() {
  const loop = document.querySelector('.loop');
  const steps = Array.from(document.querySelectorAll('.loop-step'));
  if (!loop || steps.length === 0) return;

  const path = document.getElementById('loopPath');
  // The track is hidden below 1000px, where the steps stack and a horizontal
  // line would be describing a layout that is not on screen.
  if (path && path.getBoundingClientRect().width > 0) {
    drawWhenSeen(loop, path);
  }

  whenSeen(loop, () => {
    steps.forEach((step, index) => {
      if (reduceMotion.matches) {
        step.dataset.lit = 'true';
        return;
      }
      window.setTimeout(
        () => {
          step.dataset.lit = 'true';
        },
        180 + index * 190,
      );
    });
  });
}

/* ---------------- Masthead ---------------- */

function initMasthead() {
  const masthead = document.getElementById('masthead');
  if (!masthead) return;

  const sentinel = document.createElement('div');
  sentinel.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:1px;';
  document.body.prepend(sentinel);

  if (!('IntersectionObserver' in window)) return;

  const observer = new IntersectionObserver(
    ([entry]) => {
      masthead.dataset.stuck = String(!entry.isIntersecting);
    },
    { threshold: 0 },
  );
  observer.observe(sentinel);
}

/* ---------------- Boot ---------------- */

buildRegistry();
initTabs();
initMasthead();
initHeroConstellation();
initLoop();
// Reveal runs last so the registry groups it just built are included.
initReveal();
