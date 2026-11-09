/**
 * The pattern constellation: recurring themes from a sample journal, as
 * glowing nodes joined by light threads you can explore.
 *
 * Two halves in one module.
 *
 *   initPatternsUI()   builds the interactive layer in the page: one real
 *                      <button> per theme, the detail card, and a plain SVG
 *                      constellation. This is all a visitor gets when WebGL is
 *                      off or motion is reduced, and it is fully usable: you
 *                      can hover, tap or tab to a theme and read its entries.
 *
 *   createPatterns()   the three.js half, loaded on demand by sky.js. It draws
 *                      the nodes and threads into the shared canvas behind the
 *                      page, in the stage's rectangle, and moves the buttons
 *                      to follow the projected nodes. The buttons stay the
 *                      interaction layer; three.js only draws.
 *
 * The data is a sample, written for illustration, and the page says so. It
 * follows the app's rule that a pattern needs at least two supporting entries
 * and links back to them: every theme here has three or more, and the card
 * lists two of them.
 *
 * Scroll timeline (progress p of the stage crossing the viewport, 0 as its top
 * enters, 1 as its bottom leaves): nodes appear one after another from
 * p = 0.12, threads draw themselves from p = 0.3, and by p = 0.65 the whole
 * constellation is drawn and rotating slowly. Hovering or focusing a theme
 * brightens it and the threads that touch it and dims the rest.
 */

/* ---------------- Sample data ---------------- */

/**
 * Positions are fractions of the stage (x and y from -0.5 to 0.5, z in
 * pixels), so the same layout works from a phone to a wide screen.
 */
export const THEMES = [
  {
    id: 'water',
    label: 'Water',
    count: 6,
    colour: [0.6, 0.55, 1.0],
    at: [-0.3, 0.02, 30],
    entries: [
      { meta: 'Dream · 4 Aug', text: 'The river ran the other way, slow and wide.' },
      { meta: 'Dream · 17 Aug', text: 'Standing ankle-deep in still water under the pier.' },
    ],
  },
  {
    id: 'keys',
    label: 'Keys',
    count: 4,
    colour: [0.95, 0.74, 0.42],
    at: [-0.14, 0.34, -50],
    entries: [
      { meta: 'Dream · 5 Aug', text: 'A ring of keys, and none of them fit the door.' },
      { meta: 'Dream · 22 Aug', text: 'Found one small brass key under the stairs.' },
    ],
  },
  {
    id: 'eleven',
    label: '11:11',
    count: 5,
    colour: [0.95, 0.74, 0.42],
    at: [-0.1, -0.3, 50],
    entries: [
      { meta: 'Synchronicity · 12 Aug', text: '11:11 on the oven clock just as the phone rang.' },
      { meta: 'Synchronicity · 20 Aug', text: 'The receipt came to 11.11, then the bus was the 11.' },
    ],
  },
  {
    id: 'flying',
    label: 'Flying',
    count: 4,
    colour: [0.49, 0.55, 0.94],
    at: [0.22, -0.26, -30],
    entries: [
      { meta: 'Dream · 9 Aug', text: 'I stepped off the roof and kept rising.' },
      { meta: 'Vision · 19 Aug', text: 'Lifted above the town, no fear, only quiet.' },
    ],
  },
  {
    id: 'person',
    label: 'A recurring person',
    count: 3,
    colour: [0.73, 0.64, 1.0],
    at: [0.34, 0.1, 40],
    entries: [
      { meta: 'Dream · 6 Aug', text: 'My old teacher at the station, waiting too.' },
      { meta: 'Dream · 18 Aug', text: 'The same teacher, handing me a ticket.' },
    ],
  },
  {
    id: 'owls',
    label: 'Owls',
    count: 3,
    colour: [0.6, 0.55, 1.0],
    at: [0.1, 0.28, -10],
    entries: [
      { meta: 'Dream · 8 Aug', text: 'An owl on the fence, watching the window.' },
      { meta: 'Synchronicity · 15 Aug', text: 'An owl on a shop sign, then one on a podcast cover.' },
    ],
  },
];

/** Themes that show up in the same entries, as pairs of ids. */
const EDGES = [
  ['water', 'eleven'],
  ['water', 'keys'],
  ['keys', 'owls'],
  ['owls', 'person'],
  ['person', 'flying'],
  ['flying', 'eleven'],
  ['eleven', 'person'],
  ['water', 'flying'],
];

const byId = Object.fromEntries(THEMES.map((theme) => [theme.id, theme]));

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/* ---------------- Interaction layer (always) ---------------- */

/** The panel is never empty: it opens on the theme that came up most. */
const DEFAULT_ID = THEMES.reduce((top, theme) => (theme.count > top.count ? theme : top)).id;

const shared = {
  active: DEFAULT_ID,
  listeners: new Set(),
};

function setActive(id) {
  if (!id || id === shared.active) return;
  shared.active = id;
  for (const listener of shared.listeners) listener(id);
}

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';
const svgNS = 'http://www.w3.org/2000/svg';

export function initPatternsUI() {
  const stage = document.getElementById('patternStage');
  const card = document.getElementById('patternCard');
  if (!stage || !card) return;

  /* ---------- Plain SVG constellation: the fallback drawing ---------- */

  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'patterns-fallback');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');

  const lines = EDGES.map(([a, b]) => {
    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('x1', String((byId[a].at[0] + 0.5) * 100));
    line.setAttribute('y1', String((byId[a].at[1] + 0.5) * 100));
    line.setAttribute('x2', String((byId[b].at[0] + 0.5) * 100));
    line.setAttribute('y2', String((byId[b].at[1] + 0.5) * 100));
    line.setAttribute('vector-effect', 'non-scaling-stroke');
    line.dataset.a = a;
    line.dataset.b = b;
    svg.append(line);
    return line;
  });
  stage.append(svg);

  /* ---------- One button per theme ---------- */

  const list = document.createElement('ul');
  list.className = 'patterns-nodes';
  const buttons = new Map();

  for (const theme of THEMES) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pattern-node';
    button.dataset.theme = theme.id;
    button.setAttribute('aria-controls', 'patternCard');
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', `${theme.label}, ${theme.count} entries`);
    // Fallback placement; the 3D layer overrides it with a transform.
    button.style.left = `${(theme.at[0] + 0.5) * 100}%`;
    button.style.top = `${(theme.at[1] + 0.5) * 100}%`;
    button.style.setProperty('--size', `${12 + theme.count * 2.2}px`);
    button.style.setProperty(
      '--tint',
      `rgb(${theme.colour.map((c) => Math.round(c * 255)).join(' ')})`,
    );

    const dot = document.createElement('span');
    dot.className = 'pattern-node__dot';
    dot.setAttribute('aria-hidden', 'true');

    // The name and the count are two things: the count is a quiet tag beside
    // the name, so "11:11" and "5" never read as one number.
    const label = document.createElement('span');
    label.className = 'pattern-node__label';
    label.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span');
    name.textContent = theme.label;
    const count = document.createElement('small');
    count.className = 'pattern-node__count';
    count.textContent = String(theme.count);
    label.append(name, count);

    button.append(dot, label);
    item.append(button);
    list.append(item);
    buttons.set(theme.id, button);

    // Hover previews on a mouse; a tap or a click pins. Focus previews too,
    // so keyboard users get the same card without a second key press. Leaving
    // the stage keeps the last theme: the card is never empty.
    button.addEventListener('pointerenter', (event) => {
      if (event.pointerType === 'mouse') setActive(theme.id);
    });
    button.addEventListener('focus', () => setActive(theme.id));
    button.addEventListener('click', () => setActive(theme.id));
  }
  stage.append(list);

  /* ---------- The card ---------- */

  const body = card.querySelector('[data-body]');
  const title = card.querySelector('[data-title]');
  const countOut = card.querySelector('[data-count]');
  const meta = card.querySelector('[data-meta]');
  const entries = card.querySelector('[data-entries]');
  const announce = card.querySelector('[data-announce]');

  let current = null;
  let heightAnimation = null;
  let fadeAnimation = null;
  let ghost = null;
  let countFrame = 0;
  let countShown = 0;

  function fill(theme) {
    title.textContent = theme.label;
    meta.textContent = 'entries in this sample journal';
    announce.textContent = `${theme.label}, ${theme.count} entries in this sample journal.`;
    entries.replaceChildren(
      ...theme.entries.map((entry) => {
        const li = document.createElement('li');
        const when = document.createElement('span');
        when.className = 'cite';
        when.textContent = entry.meta;
        const quote = document.createElement('p');
        quote.textContent = `“${entry.text}”`;
        li.append(when, quote);
        return li;
      }),
    );
  }

  /** Count to its new value from wherever it is now, so a second change mid-way carries on smoothly. */
  function tweenCount(to, instant) {
    window.cancelAnimationFrame(countFrame);
    if (instant) {
      countShown = to;
      countOut.textContent = String(to);
      return;
    }
    const from = countShown;
    const started = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - started) / 380);
      const eased = 1 - Math.pow(1 - t, 3);
      countShown = from + (to - from) * eased;
      countOut.textContent = String(Math.round(countShown));
      if (t < 1) countFrame = window.requestAnimationFrame(step);
    };
    countFrame = window.requestAnimationFrame(step);
  }

  function settleStates(id) {
    for (const [key, button] of buttons) {
      button.setAttribute('aria-pressed', String(key === id));
      button.dataset.state = key === id ? 'active' : 'dim';
    }
    for (const line of lines) {
      const touches = line.dataset.a === id || line.dataset.b === id;
      line.dataset.state = touches ? 'active' : 'dim';
    }
  }

  function show(id) {
    const theme = byId[id];
    if (!theme || id === current) return;
    const first = current === null;
    current = id;
    settleStates(id);

    if (first || reduceMotion.matches) {
      heightAnimation?.cancel();
      fadeAnimation?.cancel();
      ghost?.remove();
      ghost = null;
      fill(theme);
      tweenCount(theme.count, true);
      return;
    }

    // Read where everything is now, mid-animation or not, before cancelling:
    // a second change picks up from what is on screen, so nothing jumps.
    const cardBox = card.getBoundingClientRect();
    const bodyBox = body.getBoundingClientRect();
    const fromHeight = cardBox.height;
    const fromOpacity = Number.parseFloat(getComputedStyle(body).opacity);

    heightAnimation?.cancel();
    fadeAnimation?.cancel();
    ghost?.remove();

    // The old text stays behind as a copy, fading out over the new text
    // fading in, so the content changes in place instead of blinking.
    ghost = body.cloneNode(true);
    ghost.classList.add('pattern-card__ghost');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.removeAttribute('data-body');
    ghost.style.cssText = `position:absolute;pointer-events:none;margin:0;left:${
      bodyBox.left - cardBox.left - card.clientLeft
    }px;top:${bodyBox.top - cardBox.top - card.clientTop}px;width:${bodyBox.width}px`;
    card.append(ghost);
    const mine = ghost;
    mine
      .animate([{ opacity: fromOpacity }, { opacity: 0 }], { duration: 160, easing: 'linear', fill: 'forwards' })
      .finished.then(() => {
        mine.remove();
        if (ghost === mine) ghost = null;
      })
      .catch(() => {});
    window.setTimeout(() => {
      mine.remove();
      if (ghost === mine) ghost = null;
    }, 400);

    fill(theme);
    tweenCount(theme.count, false);

    const toHeight = card.getBoundingClientRect().height;
    card.classList.add('is-morphing');
    heightAnimation = card.animate(
      [{ height: `${fromHeight}px` }, { height: `${toHeight}px` }],
      { duration: 300, easing: EASE },
    );
    const done = () => card.classList.remove('is-morphing');
    heightAnimation.onfinish = done;
    heightAnimation.oncancel = done;

    fadeAnimation = body.animate(
      [
        { opacity: Math.min(fromOpacity, 0.2), transform: 'translateY(4px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 240, easing: EASE },
    );
  }

  shared.listeners.add(show);

  /* ---------- Connectors: a thin line from the star to its entries ---------- */

  const layout = card.closest('.patterns-layout');
  const overlay = document.createElementNS(svgNS, 'svg');
  overlay.setAttribute('class', 'patterns-links');
  overlay.setAttribute('aria-hidden', 'true');
  layout.append(overlay);

  const makeGroup = () => {
    const group = document.createElementNS(svgNS, 'g');
    const paths = [0, 1].map(() => {
      const path = document.createElementNS(svgNS, 'path');
      path.setAttribute('pathLength', '1');
      return path;
    });
    const dots = [0, 1].map(() => {
      const dot = document.createElementNS(svgNS, 'circle');
      dot.setAttribute('r', '2.5');
      return dot;
    });
    group.append(...paths, ...dots);
    overlay.append(group);
    return { group, paths, dots, id: null, animations: [] };
  };
  const groups = [makeGroup(), makeGroup()];
  let live = 0;

  /** Place one group's lines for its theme. Called every frame while on screen. */
  function place(entry) {
    if (!entry.id) return;
    const button = buttons.get(entry.id);
    const dotBox = button.querySelector('.pattern-node__dot').getBoundingClientRect();
    const base = layout.getBoundingClientRect();
    const cardBox = card.getBoundingClientRect();
    const sx = dotBox.left + dotBox.width / 2 - base.left;
    const sy = dotBox.top + dotBox.height / 2 - base.top;
    const rows = Array.from(entries.querySelectorAll('li'));
    const beside = cardBox.left > dotBox.right + 24;

    entry.paths.forEach((path, i) => {
      const row = rows[i];
      let ex;
      let ey;
      if (beside && row) {
        const box = row.querySelector('.cite').getBoundingClientRect();
        ex = cardBox.left - base.left;
        ey = box.top + box.height / 2 - base.top;
      } else {
        ex = cardBox.left - base.left + 28 + i * 36;
        ey = cardBox.top - base.top;
      }
      const dx = ex - sx;
      const dy = ey - sy;
      const d = beside
        ? `M${sx.toFixed(1)} ${sy.toFixed(1)}C${(sx + dx * 0.55).toFixed(1)} ${sy.toFixed(1)} ${(ex - dx * 0.35).toFixed(1)} ${ey.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`
        : `M${sx.toFixed(1)} ${sy.toFixed(1)}C${sx.toFixed(1)} ${(sy + dy * 0.5).toFixed(1)} ${ex.toFixed(1)} ${(ey - dy * 0.35).toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
      path.setAttribute('d', d);
      entry.dots[i].setAttribute('cx', ex.toFixed(1));
      entry.dots[i].setAttribute('cy', ey.toFixed(1));
    });
  }

  function connect(id, first) {
    const outgoing = groups[live];
    live = 1 - live;
    const incoming = groups[live];

    // The old lines let go: they fade where they are while the new ones draw.
    for (const animation of outgoing.animations) animation.cancel();
    outgoing.animations = [];
    if (outgoing.id && !reduceMotion.matches) {
      outgoing.animations.push(
        outgoing.group.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'linear', fill: 'forwards' }),
      );
    } else {
      outgoing.group.style.opacity = '0';
    }

    for (const animation of incoming.animations) animation.cancel();
    incoming.animations = [];
    incoming.id = id;
    incoming.group.style.opacity = '';
    place(incoming);

    if (reduceMotion.matches || first) {
      if (!reduceMotion.matches) {
        incoming.animations.push(
          incoming.group.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: EASE, delay: 200, fill: 'backwards' }),
        );
      }
      return;
    }
    incoming.paths.forEach((path, i) => {
      incoming.animations.push(
        path.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], {
          duration: 340,
          delay: 40 + i * 60,
          easing: EASE,
          fill: 'backwards',
        }),
      );
      incoming.animations.push(
        incoming.dots[i].animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 160,
          delay: 260 + i * 60,
          easing: 'linear',
          fill: 'backwards',
        }),
      );
    });
  }

  shared.listeners.add((id) => connect(id, false));

  // Keep the lines on the stars while they drift, and on the card while the
  // page scrolls or the card's height settles. One loop, only while visible.
  let visible = false;
  let frame = 0;
  const follow = () => {
    place(groups[live]);
    if (groups[1 - live].id) place(groups[1 - live]);
    frame = visible ? window.requestAnimationFrame(follow) : 0;
  };
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(
      (items) => {
        visible = items.some((item) => item.isIntersecting);
        if (visible && !frame) frame = window.requestAnimationFrame(follow);
      },
      { rootMargin: '80px 0px' },
    ).observe(layout);
  }
  window.addEventListener('resize', () => place(groups[live]));

  show(DEFAULT_ID);
  connect(DEFAULT_ID, true);
}

/* ---------------- Three.js layer (on demand) ---------------- */

export function createPatterns(THREE, { stage }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 10, 6000);
  const FOV_TAN = Math.tan((30 * Math.PI) / 360);

  const buttons = new Map(
    Array.from(stage.querySelectorAll('.pattern-node')).map((button) => [button.dataset.theme, button]),
  );

  let W = 1;
  let H = 1;
  let ratio = 1;
  let distance = 1;

  /* ---------- Nodes: soft glowing points ---------- */

  const COUNT = THEMES.length;
  const nodePositions = new Float32Array(COUNT * 3);
  const nodeColours = new Float32Array(COUNT * 3);
  const nodeSizes = new Float32Array(COUNT);
  const nodeAppear = new Float32Array(COUNT);
  const nodeHot = new Float32Array(COUNT);
  const hot = new Float32Array(COUNT);

  THEMES.forEach((theme, i) => {
    nodeColours.set(theme.colour, i * 3);
    nodeSizes[i] = 70 + theme.count * 9;
  });

  const nodeGeometry = new THREE.BufferGeometry();
  nodeGeometry.setAttribute('position', new THREE.BufferAttribute(nodePositions, 3));
  nodeGeometry.setAttribute('aColour', new THREE.BufferAttribute(nodeColours, 3));
  nodeGeometry.setAttribute('aSize', new THREE.BufferAttribute(nodeSizes, 1));
  nodeGeometry.setAttribute('aAppear', new THREE.BufferAttribute(nodeAppear, 1));
  nodeGeometry.setAttribute('aHot', new THREE.BufferAttribute(nodeHot, 1));

  const nodeUniforms = {
    uTime: { value: 0 },
    uRatio: { value: 1 },
    uDistance: { value: 1 },
  };

  const nodes = new THREE.Points(
    nodeGeometry,
    new THREE.ShaderMaterial({
      uniforms: nodeUniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec3 aColour;
        attribute float aSize;
        attribute float aAppear;
        attribute float aHot;
        uniform float uRatio;
        uniform float uDistance;
        varying vec3 vColour;
        varying float vAppear;
        varying float vHot;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vColour = aColour;
          vAppear = aAppear;
          vHot = aHot;
          // Hot nodes swell; appearing ones grow from nothing.
          float size = aSize * (0.55 + 0.45 * aAppear) * (1.0 + aHot * 0.22);
          gl_PointSize = size * uRatio * (uDistance / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uTime;
        varying vec3 vColour;
        varying float vAppear;
        varying float vHot;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = length(d) * 2.0;
          if (r > 1.0) discard;

          // A bright core, a wide halo, and a faint breathing ring.
          float core = pow(1.0 - r, 5.0);
          float halo = pow(1.0 - r, 2.0) * 0.32;
          float ring = exp(-pow((r - 0.62 - 0.04 * sin(uTime * 1.3)) * 12.0, 2.0)) * 0.22;

          float level = (core * 1.6 + halo * 1.5 + ring * 1.4) * vAppear * (0.85 + vHot * 0.9);
          vec3 colour = mix(vColour, vec3(1.0), core * 0.6);
          gl_FragColor = vec4(colour * level, level);
        }
      `,
    }),
  );
  nodes.frustumCulled = false;
  scene.add(nodes);

  /* ---------- Threads: ribbons built in the vertex shader ---------- */

  const SEGMENTS = 36;
  const ribbonPositions = new Float32Array((SEGMENTS + 1) * 2 * 3);
  const ribbonIndex = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const s = i / SEGMENTS;
    ribbonPositions.set([s, -1, 0, s, 1, 0], i * 6);
    if (i < SEGMENTS) {
      const a = i * 2;
      ribbonIndex.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const ribbonGeometry = new THREE.BufferGeometry();
  ribbonGeometry.setAttribute('position', new THREE.BufferAttribute(ribbonPositions, 3));
  ribbonGeometry.setIndex(ribbonIndex);

  const threadVertex = /* glsl */ `
    uniform vec3 uA;
    uniform vec3 uB;
    uniform float uBow;
    uniform float uWidth;
    varying float vS;
    varying float vSide;

    vec3 curve(float s) {
      vec3 mid = (uA + uB) * 0.5 + vec3(0.0, uBow, 0.0);
      float t = 1.0 - s;
      return t * t * uA + 2.0 * t * s * mid + s * s * uB;
    }

    void main() {
      float s = position.x;
      vec3 c = curve(s);
      vec3 tangent = normalize(curve(min(1.0, s + 0.02)) - curve(max(0.0, s - 0.02)));
      vec3 across = normalize(cross(tangent, vec3(0.0, 0.0, 1.0)));
      vec3 p = c + across * position.y * uWidth;
      vS = s;
      vSide = position.y;
      gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
    }
  `;

  const threadFragment = /* glsl */ `
    precision highp float;
    uniform float uTime;
    uniform float uDraw;
    uniform float uHot;
    uniform vec3 uColour;
    uniform float uPhase;
    varying float vS;
    varying float vSide;
    void main() {
      // Drawn from one end as uDraw goes from 0 to 1, with a bright head.
      float drawn = 1.0 - smoothstep(uDraw - 0.04, uDraw, vS);
      float head = exp(-pow((vS - uDraw) * 22.0, 2.0)) * step(uDraw, 0.999) * step(0.001, uDraw);

      float core = exp(-vSide * vSide * 6.0);
      float halo = exp(-vSide * vSide * 1.6) * 0.3;

      // Beads of light run along it, faster and brighter when it is lit.
      float bead = exp(-pow((fract(vS * 1.2 - uTime * (0.1 + uHot * 0.12) + uPhase) - 0.5) * 8.0, 2.0));

      float level = (core * (0.45 + 0.7 * bead) + halo * 0.7) * (0.55 + uHot * 0.9) * drawn + head * core;
      gl_FragColor = vec4(uColour * level, level);
    }
  `;

  const threads = EDGES.map(([a, b], index) => {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uA: { value: new THREE.Vector3() },
        uB: { value: new THREE.Vector3() },
        uBow: { value: (index % 2 === 0 ? 1 : -1) * 18 },
        uWidth: { value: 1.6 },
        uTime: nodeUniforms.uTime,
        uDraw: { value: 0 },
        uHot: { value: 0 },
        uColour: { value: new THREE.Color(0.72, 0.76, 1.0) },
        uPhase: { value: index * 0.17 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: threadVertex,
      fragmentShader: threadFragment,
    });
    const mesh = new THREE.Mesh(ribbonGeometry, material);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return { mesh, material, a: THEMES.findIndex((t) => t.id === a), b: THEMES.findIndex((t) => t.id === b), hot: 0 };
  });

  /* ---------- Selection ---------- */

  let active = shared.active;
  shared.listeners.add((id) => {
    active = id;
  });

  /* ---------- Layout ---------- */

  function resize(width, height, pixelRatio) {
    W = width;
    H = height;
    ratio = pixelRatio;
    distance = H / 2 / FOV_TAN;
    camera.aspect = W / H;
    camera.position.set(0, 0, distance);
    camera.far = distance * 6;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    nodeUniforms.uRatio.value = ratio;
    nodeUniforms.uDistance.value = distance;
  }

  const world = THEMES.map(() => new THREE.Vector3());
  const projected = new THREE.Vector3();
  const euler = new THREE.Euler();
  let lastVisible = false;

  function draw(director) {
    const box = stage.getBoundingClientRect();
    const visible = box.bottom > -40 && box.top < H + 40 && box.width > 0;

    if (visible !== lastVisible) {
      lastVisible = visible;
      stage.classList.toggle('is-offscreen', !visible);
    }
    if (!visible) return false;

    // How far the stage has crossed the viewport.
    const p = Math.min(1, Math.max(0, (H - box.top) / (H + box.height * 0.6)));
    const t = director.time;

    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    const spreadX = box.width;
    const spreadY = box.height;

    // The slow turn of the whole constellation, and the pointer's lean.
    euler.set(-director.pointer.y * 0.18, Math.sin(t * 0.16) * 0.28 + director.pointer.x * 0.35, 0);

    THEMES.forEach((theme, i) => {
      const v = world[i];
      v.set(theme.at[0] * spreadX, -theme.at[1] * spreadY, theme.at[2]);
      v.applyEuler(euler);
      // Slight bob, different for each node.
      v.y += Math.sin(t * 0.6 + i * 1.7) * 4;
      nodePositions[i * 3] = v.x + cx - W / 2;
      nodePositions[i * 3 + 1] = v.y - (cy - H / 2);
      nodePositions[i * 3 + 2] = v.z;

      const appear = smooth(0.1 + i * 0.045, 0.28 + i * 0.045, p);
      nodeAppear[i] = appear;

      // The selected star swells; the others sit back.
      const target = active === theme.id ? 1 : active ? -0.45 : 0;
      hot[i] += (target - hot[i]) * 0.12;
      nodeHot[i] = hot[i];
    });

    // World positions are re-based on the stage centre above, so the
    // threads take the same coordinates the nodes were just given.
    threads.forEach((thread, i) => {
      const a = thread.a;
      const b = thread.b;
      thread.material.uniforms.uA.value.set(nodePositions[a * 3], nodePositions[a * 3 + 1], nodePositions[a * 3 + 2]);
      thread.material.uniforms.uB.value.set(nodePositions[b * 3], nodePositions[b * 3 + 1], nodePositions[b * 3 + 2]);

      const start = 0.3 + i * 0.045;
      const drawn = smooth(start, start + 0.22, p) * Math.min(nodeAppear[a], nodeAppear[b]);
      thread.material.uniforms.uDraw.value = Math.min(1, drawn * 1.02);

      const touches = active && (THEMES[a].id === active || THEMES[b].id === active);
      const target = touches ? 1 : active ? -0.35 : 0.1;
      thread.hot += (target - thread.hot) * 0.12;
      thread.material.uniforms.uHot.value = Math.max(0, thread.hot);
      thread.material.uniforms.uWidth.value = 1.3 + Math.max(0, thread.hot) * 1.4;
    });

    nodeGeometry.attributes.position.needsUpdate = true;
    nodeGeometry.attributes.aAppear.needsUpdate = true;
    nodeGeometry.attributes.aHot.needsUpdate = true;
    nodeUniforms.uTime.value = t;

    // Carry the buttons to the nodes. World to screen, then relative to the
    // stage, so they scroll with it and sit exactly on the glow.
    THEMES.forEach((theme, i) => {
      projected.set(nodePositions[i * 3], nodePositions[i * 3 + 1], nodePositions[i * 3 + 2]).project(camera);
      const x = (projected.x * 0.5 + 0.5) * W - box.left;
      const y = (-projected.y * 0.5 + 0.5) * H - box.top;
      const button = buttons.get(theme.id);
      button.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      button.style.opacity = String(Math.max(0.0001, nodeAppear[i]));
    });

    return true;
  }

  // The transform carries the position now; drop the fallback's percentages.
  for (const button of buttons.values()) {
    button.style.left = '0';
    button.style.top = '0';
  }

  stage.classList.add('is-3d');
  stage.closest('.patterns')?.classList.add('patterns--3d');

  return {
    resize,
    render(renderer, director) {
      if (!draw(director)) return;
      renderer.clearDepth();
      renderer.render(scene, camera);
    },
  };
}
