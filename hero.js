/**
 * The hero: an astral projection, drawn entirely in light.
 *
 * There is no mesh anywhere in this file. Everything is additive points, so it
 * can only ever read as glow on the dark, never as a solid object.
 *
 *   1. The body. About a thousand dim, warm points sampled from a human
 *      silhouette, lying on its back, breathing very slightly. It is what you
 *      are leaving.
 *   2. The double. A few thousand violet points sampled from the same
 *      silhouette. It starts lying over the body and rises upright over the
 *      first seconds of the page (director.lift). Each point shimmers and
 *      wanders on a curl of noise, strongest at the edge of the figure, and
 *      the points near the edge are the ones that come loose: they stream
 *      upward as stardust and fade. A few carry the cyan accent.
 *   3. The silver cord. A thin stream of small points running from the double
 *      back to the body, flowing away from the figure, with beads of light
 *      travelling along it. Not a tube: a column of dust.
 *
 * Sampling. The silhouette is a union of capsules and circles in a unit space
 * (head, neck, torso, arms, legs). Points are drawn at random inside it, thinned
 * towards the middle so the body is a soft glow and the outline is a denser
 * shimmer, with a little spill past the edge. Each point stores how close it
 * is to the edge (aSeed.w), which drives how freely it drifts and whether it
 * streams away.
 *
 * Layout, in CSS pixels, then converted to view units. The figure is placed so
 * that it never sits under the headline:
 *   - wide screens: the right-hand column, double high and body low, the cord
 *     running on down the column;
 *   - narrow screens: a band above the headline (the stylesheet reserves it),
 *     the cord kept short so it ends beside the body, not behind the copy.
 *
 * Scrolling continues the story: the body falls away and fades, the double
 * drifts up and dissolves as the hero leaves.
 *
 * Everything is drawn with a camera that never turns, after the mist and
 * before the motes, so the motes stream past in front of the figure.
 */

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

/* ---------------- Silhouette ---------------- */

/** Signed distance to a capsule from (ax, ay) to (bx, by), radius r. */
function capsule(px, py, ax, ay, bx, by, r) {
  const pax = px - ax;
  const pay = py - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const h = Math.min(1, Math.max(0, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
  return Math.hypot(pax - bax * h, pay - bay * h) - r;
}

/**
 * Distance to the human silhouette, upright, 1.8 units tall and centred on the
 * origin. Negative inside. Mirrored about x = 0 so one half is written out.
 */
function silhouette(x, y) {
  const mx = Math.abs(x);
  let d = Math.hypot(x, y - 0.72) - 0.125; // head
  d = Math.min(d, capsule(mx, y, 0, 0.6, 0, 0.53, 0.05)); // neck
  d = Math.min(d, capsule(mx, y, 0.0, 0.4, 0.0, 0.0, 0.18)); // torso
  d = Math.min(d, capsule(mx, y, 0.2, 0.42, 0.3, -0.12, 0.052)); // upper arm
  d = Math.min(d, capsule(mx, y, 0.3, -0.12, 0.34, -0.42, 0.042)); // forearm
  d = Math.min(d, capsule(mx, y, 0.075, -0.1, 0.09, -0.86, 0.078)); // leg
  return d;
}

/**
 * Sample `count` points from the silhouette. Returns interleaved attributes:
 * positions (x, y, z) and seeds (random, random, random, edge).
 */
function sampleFigure(count) {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 4);

  let n = 0;
  let guard = 0;
  while (n < count && guard++ < count * 80) {
    const x = (Math.random() * 2 - 1) * 0.5;
    const y = (Math.random() * 2 - 1) * 0.98;
    const d = silhouette(x, y);

    // A little spill past the edge, then thinning towards the middle so the
    // outline is the densest part and the body is a soft fill.
    if (d > 0.025) continue;
    const edge = d > 0 ? 1 : Math.exp(d / 0.07);
    if (Math.random() > 0.22 + 0.78 * edge) continue;

    positions[n * 3] = x;
    positions[n * 3 + 1] = y;
    positions[n * 3 + 2] = (Math.random() + Math.random() + Math.random() - 1.5) * 0.09;
    seeds[n * 4] = Math.random();
    seeds[n * 4 + 1] = Math.random();
    seeds[n * 4 + 2] = Math.random();
    seeds[n * 4 + 3] = edge;
    n++;
  }
  return { positions, seeds, count: n };
}

/* ---------------- Shaders ---------------- */

const figureVertex = /* glsl */ `
  attribute vec4 aSeed;
  uniform float uTime;
  uniform float uRatio;
  uniform float uSize;
  uniform float uDrift;
  uniform float uStream;
  uniform float uStreamLength;
  uniform float uBreath;
  varying float vAlpha;
  varying float vMix;
  varying float vCyan;

  // A cheap stand-in for curl noise: three phase-shifted sines per axis, each
  // axis depending on the other two, so neighbouring points move together and
  // the whole figure swirls instead of fizzing.
  vec3 curl(vec3 p, float t, float s) {
    return vec3(
      sin(p.y * 5.0 + t * 0.7 + s * 6.2831) + cos(p.z * 4.0 - t * 0.5),
      sin(p.z * 5.0 + t * 0.6) + cos(p.x * 4.0 + t * 0.4 + s * 6.2831),
      sin(p.x * 5.0 - t * 0.5) + cos(p.y * 4.0 + t * 0.8)
    );
  }

  void main() {
    float edge = aSeed.w;
    vec3 p = position;

    // The chest rises and falls: only the body asks for it.
    p.y *= 1.0 + uBreath * 0.018 * sin(uTime * 1.1);

    // Everything wanders a little; the edge wanders a lot.
    p += curl(p, uTime, aSeed.x) * (0.004 + 0.03 * edge * uDrift);

    // Stardust. A subset of the edge points come loose and rise, each on its
    // own phase, fading as they go. Done in view space below so "up" is up
    // on the screen even while the figure is lying down.
    float phase = fract(uTime * (0.07 + aSeed.z * 0.1) + aSeed.x);
    float loose = step(0.5, edge) * step(aSeed.y, uStream);
    float rise = phase * loose;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    mv.y += rise * uStreamLength;
    mv.x += sin(phase * 7.0 + aSeed.z * 30.0) * 0.04 * rise * uStreamLength;
    gl_Position = projectionMatrix * mv;

    // Shimmer: each point has its own slow flicker.
    float twinkle = 0.65 + 0.35 * sin(uTime * (1.2 + aSeed.z * 2.4) + aSeed.x * 40.0);

    // Soft fill, bright outline. The feet fade out; loose points fade as they climb.
    float feet = smoothstep(-0.95, -0.35, p.y);
    vAlpha = mix(0.3, 0.95, edge) * twinkle * feet * (1.0 - rise * 0.95);

    // Colour runs violet to soft violet up the figure, with cyan accents.
    vMix = smoothstep(-0.6, 0.8, p.y) * 0.8 + aSeed.z * 0.2;
    vCyan = step(0.89, aSeed.z);

    gl_PointSize = (1.3 + aSeed.z * 2.4 + edge * 0.8) * uRatio * uSize * (1.0 - rise * 0.4);
  }
`;

const figureFragment = /* glsl */ `
  precision highp float;
  uniform vec3 uColourA;
  uniform vec3 uColourB;
  uniform vec3 uAccent;
  uniform float uOpacity;
  varying float vAlpha;
  varying float vMix;
  varying float vCyan;

  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    if (r > 1.0) discard;
    // A bright pinprick inside a soft halo: light, not a dot.
    float shape = pow(1.0 - r, 2.0) * 0.8 + pow(1.0 - r, 6.0) * 0.8;
    float level = shape * vAlpha * uOpacity;
    if (level < 0.004) discard;

    vec3 colour = mix(uColourA, uColourB, vMix);
    colour = mix(colour, uAccent, vCyan * 0.85);
    gl_FragColor = vec4(colour, level);
  }
`;

const cordVertex = /* glsl */ `
  attribute vec3 aSeed;
  uniform float uTime;
  uniform float uRatio;
  uniform float uSize;
  uniform vec3 uTop;
  uniform vec3 uBottom;
  uniform float uWidth;
  varying float vAlpha;
  varying float vBead;

  vec3 curve(float s) {
    vec3 c = mix(uTop, uBottom, s);
    // A slow S-curve that grows along the cord, and a push into depth so the
    // far end recedes below the camera.
    float arc = sin(s * 3.14159265);
    c.x += sin(s * 5.0 + uTime * 0.8) * uWidth * 5.0 * arc + arc * uWidth * 4.0;
    c.z -= s * s * 2.0;
    return c;
  }

  void main() {
    // Each point travels from the figure towards the body and wraps.
    float s = fract(aSeed.x + uTime * (0.05 + aSeed.y * 0.05));
    vec3 c = curve(s);
    vec3 tangent = normalize(curve(min(1.0, s + 0.02)) - curve(max(0.0, s - 0.02)));
    vec3 across = normalize(cross(tangent, vec3(0.0, 0.0, 1.0)));

    // A column of dust: a narrow scatter that thins towards the far end.
    float scatter = (aSeed.y - 0.5) * 2.0;
    vec3 p = c + across * scatter * uWidth * (1.0 - 0.55 * s);
    p.z += (aSeed.z - 0.5) * uWidth * 2.0;

    vec4 mv = viewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;

    float ends = smoothstep(0.0, 0.07, s) * (1.0 - smoothstep(0.65, 1.0, s));
    // Beads of light riding along the stream.
    vBead = exp(-pow((fract(s * 1.3 - uTime * 0.14) - 0.5) * 6.0, 2.0));
    float twinkle = 0.6 + 0.4 * sin(uTime * 2.0 + aSeed.z * 50.0);
    vAlpha = ends * twinkle * (1.0 - abs(scatter) * 0.5);

    gl_PointSize = (1.1 + aSeed.z * 1.6) * uRatio * uSize;
  }
`;

const cordFragment = /* glsl */ `
  precision highp float;
  uniform float uOpacity;
  varying float vAlpha;
  varying float vBead;

  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    if (r > 1.0) discard;
    float shape = pow(1.0 - r, 2.2);
    float level = shape * vAlpha * (0.4 + 0.9 * vBead) * uOpacity;
    if (level < 0.004) discard;
    vec3 colour = mix(vec3(0.72, 0.64, 1.0), vec3(0.9, 0.96, 1.0), vBead);
    gl_FragColor = vec4(colour, level);
  }
`;

/* ---------------- Hero ---------------- */

export function createHero(THREE, { small }) {
  const scene = new THREE.Scene();

  const VIOLET = new THREE.Color('#9A7CFF');
  const VIOLET_SOFT = new THREE.Color('#B9A4FF');
  const CYAN = new THREE.Color('#66E3D5');
  const WARM_A = new THREE.Color('#B8734A');
  const WARM_B = new THREE.Color('#E0A878');

  function figurePoints(count, { colourA, colourB, drift, stream, breath }) {
    const sample = sampleFigure(count);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(sample.positions, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(sample.seeds, 4));
    geometry.setDrawRange(0, sample.count);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uRatio: { value: 1 },
        uSize: { value: 1 },
        uDrift: { value: drift },
        uStream: { value: stream },
        uStreamLength: { value: 1 },
        uBreath: { value: breath },
        uColourA: { value: colourA },
        uColourB: { value: colourB },
        uAccent: { value: CYAN },
        uOpacity: { value: 0 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: figureVertex,
      fragmentShader: figureFragment,
    });

    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    scene.add(points);
    return { points, material };
  }

  // Fewer points on phones: the figure is a hundred and fifty pixels tall
  // there, and more points would only be overdraw.
  const sleeper = figurePoints(small ? 700 : 1400, {
    colourA: WARM_A,
    colourB: WARM_B,
    drift: 0.35,
    stream: 0,
    breath: 1,
  });
  const double = figurePoints(small ? 1800 : 3600, {
    colourA: VIOLET,
    colourB: VIOLET_SOFT,
    drift: 1,
    stream: 0.22,
    breath: 0,
  });

  /* ---------- The cord ---------- */

  const CORD_POINTS = small ? 380 : 760;
  const cordSeeds = new Float32Array(CORD_POINTS * 3);
  for (let i = 0; i < cordSeeds.length; i++) cordSeeds[i] = Math.random();
  const cordGeometry = new THREE.BufferGeometry();
  // three.js needs a position attribute to size the draw call; the shader
  // computes the real position from the seeds.
  cordGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(CORD_POINTS * 3), 3));
  cordGeometry.setAttribute('aSeed', new THREE.BufferAttribute(cordSeeds, 3));

  const cordUniforms = {
    uTime: { value: 0 },
    uRatio: { value: 1 },
    uSize: { value: 1 },
    uTop: { value: new THREE.Vector3() },
    uBottom: { value: new THREE.Vector3() },
    uWidth: { value: 0.03 },
    uOpacity: { value: 0 },
  };
  const cord = new THREE.Points(
    cordGeometry,
    new THREE.ShaderMaterial({
      uniforms: cordUniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: cordVertex,
      fragmentShader: cordFragment,
    }),
  );
  cord.frustumCulled = false;
  scene.add(cord);

  /* ---------- Per frame ---------- */

  let W = 1;
  let H = 1;
  let ratio = 1;
  const DEPTH = 4.4;

  return {
    resize(width, height, pixelRatio = 1) {
      W = width;
      H = height;
      ratio = pixelRatio;
    },

    /**
     * Pose the figure for this frame. `camera` supplies the lens, so view
     * units can be converted from CSS pixels at the figure's depth at any
     * field of view.
     */
    update(director, camera) {
      const t = director.time;
      const lift = director.lift;
      const h = window.scrollY / Math.max(1, window.innerHeight);

      const halfH = Math.tan((camera.fov * Math.PI) / 360) * DEPTH;
      const unit = (2 * halfH) / H; // view units per CSS pixel
      const toX = (px) => (px - W / 2) * unit;
      const toY = (py) => (H / 2 - py) * unit;

      const wide = W >= 1100 && W / H > 1.15;

      // Figure heights in CSS pixels and the centres of the double and body.
      let figure;
      let doubleX;
      let doubleY;
      let bodyX;
      let bodyY;
      if (wide) {
        figure = Math.min(H * 0.5, 430);
        doubleX = Math.min(W - figure * 0.55, W * 0.8);
        doubleY = H * 0.44;
        bodyX = doubleX;
        bodyY = H * 0.84;
      } else {
        // A band above the headline: the stylesheet reserves it.
        figure = Math.min(205, W * 0.5);
        doubleX = W / 2;
        doubleY = 88 + figure * 0.5;
        bodyX = W / 2;
        bodyY = doubleY + figure * 0.5 + 6;
      }

      const s = (figure * unit) / 1.8;
      const bodyScale = s * (wide ? 0.62 : 0.55);

      // The body falls away as the camera keeps rising.
      const fall = h * H * 0.5 * unit;
      sleeper.points.position.set(toX(bodyX), toY(bodyY) - fall, -DEPTH);
      sleeper.points.rotation.set(0, 0, Math.PI / 2);
      sleeper.points.scale.setScalar(bodyScale);

      // The double leaves it: lying over the body at lift 0, upright at 1.
      const rise = lift * lift * (3 - 2 * lift);
      const hover = Math.sin(t * 0.9) * 0.03 * s * 1.8;
      const px = director.pointer.x;
      const py = director.pointer.y;

      double.points.position.set(
        lerp(toX(bodyX), toX(doubleX), rise) + px * 0.1 * s,
        lerp(toY(bodyY) + 0.02, toY(doubleY), rise) + hover + h * 0.5 * H * unit * 0.6 + py * 0.05 * s,
        -DEPTH + 0.1,
      );
      double.points.rotation.set(0, px * 0.3, lerp(Math.PI / 2, 0, smooth(0, 0.85, lift)));
      double.points.scale.setScalar(lerp(bodyScale, s, rise));

      // Light up as it separates, and leave with the hero.
      const leaving = 1 - smooth(0.3, 1.1, h);
      const present = smooth(0.02, 0.3, lift) * leaving;
      const bodyPresent = (1 - lift * 0.6) * (1 - smooth(0, 0.7, h));

      // Sizes in px scale with the figure, so a phone's is finer.
      const size = wide ? 1.45 : 1.25;
      for (const part of [sleeper, double]) {
        part.material.uniforms.uTime.value = t;
        part.material.uniforms.uRatio.value = ratio;
        part.material.uniforms.uSize.value = size;
      }
      double.material.uniforms.uOpacity.value = present * 1.7;
      double.material.uniforms.uStream.value = Math.min(1, 0.22 + director.stream * 0.5);
      double.material.uniforms.uStreamLength.value = s * 0.8;
      sleeper.material.uniforms.uOpacity.value = bodyPresent * 1.4;

      // The cord leaves the double's lower back and runs to the body. On wide
      // screens it carries on down the empty column; on narrow ones it stops
      // beside the body so it never passes behind the copy.
      cordUniforms.uTop.value.set(double.points.position.x, double.points.position.y - 0.3 * s * 1.8, -DEPTH);
      const reach = wide ? H * 0.3 * unit : 0.05 * s;
      cordUniforms.uBottom.value.set(
        sleeper.points.position.x,
        sleeper.points.position.y - reach,
        -DEPTH,
      );
      cordUniforms.uTime.value = t;
      cordUniforms.uRatio.value = ratio;
      cordUniforms.uSize.value = size;
      cordUniforms.uWidth.value = Math.max(0.012, s * 0.05);
      cordUniforms.uOpacity.value =
        smooth(0.15, 0.5, lift) * (1 - smooth(0, 0.9, h)) * (wide ? 1.6 : 1.4);
    },

    render(renderer, camera) {
      renderer.render(scene, camera);
    },
  };
}
