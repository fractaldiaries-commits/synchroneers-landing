/**
 * The real night sky, behind the whole page.
 *
 * Not a decorative particle field. Every star is a catalogue entry: 25,791 of
 * them down to magnitude 7.5 from HYG v41, placed by right ascension and
 * declination, sized by apparent magnitude and coloured from the B-V index, and
 * joined by the 695 figure segments of all 88 modern constellations. The Milky
 * Way is not a texture either. The dust band is drawn along the real galactic
 * plane, so it sits where it sits in the sky rather than where it looks good.
 *
 * The sky turns about the celestial pole, which is the one motion a night sky
 * actually has. Scrolling walks the view east along the ecliptic plane, so the
 * constellations passing behind the copy change as the page is read.
 *
 * Reduced motion renders one frame: the sky is still there, it stops moving.
 * Nothing on the page depends on it having rendered at all.
 */

import * as THREE from './vendor/three.module.min.js';
import { CONSTELLATIONS, SEGMENTS_B64, STARS_B64, STAR_COUNT } from './sky-data.js';

const canvas = document.getElementById('sky');
if (canvas) boot(canvas);

/* ---------------- Catalogue decoding ---------------- */

function decodeBase64(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * B-V colour index to RGB, by way of an effective temperature. Ballesteros'
 * relation for the temperature, then a blackbody approximation for the colour.
 * Real stars are mostly white to the eye; the point is that Betelgeuse is
 * visibly warm and Rigel visibly cold, not that the sky turns into a rainbow.
 */
function colourFromIndex(bv) {
  const clamped = Math.max(-0.4, Math.min(2.0, bv));
  const temperature =
    4600 * (1 / (0.92 * clamped + 1.7) + 1 / (0.92 * clamped + 0.62));
  const t = temperature / 100;

  let r;
  let g;
  let b;

  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  }

  if (t >= 66) b = 255;
  else if (t <= 19) b = 0;
  else b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;

  const desaturate = (channel) => {
    const value = Math.max(0, Math.min(255, channel)) / 255;
    // Pulled towards white, because the eye sees far less colour at night than
    // a blackbody curve suggests.
    return (value * 0.62 + 0.38) ** 1.0;
  };

  return [desaturate(r), desaturate(g), desaturate(b)];
}

/** Equatorial coordinates in degrees to a unit vector, celestial pole on +Y. */
function toVector(raDegrees, decDegrees, radius, target) {
  const ra = (raDegrees * Math.PI) / 180;
  const dec = (decDegrees * Math.PI) / 180;
  const cosDec = Math.cos(dec);
  target.set(
    radius * cosDec * Math.cos(ra),
    radius * Math.sin(dec),
    -radius * cosDec * Math.sin(ra)
  );
  return target;
}

/* ---------------- Scene ---------------- */

function boot(canvas) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
  } catch {
    // No WebGL. The CSS gradient painted on the canvas stays, which is a
    // perfectly reasonable night sky.
    return;
  }

  renderer.setClearColor(0x070b1d, 1);
  renderer.autoClear = false;

  const SPHERE = 100;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 400);

  // Everything celestial hangs off this. Rotating it about Y is the sky
  // turning about the pole, which is the only motion a real sky has.
  const sky = new THREE.Group();
  scene.add(sky);

  const bgScene = new THREE.Scene();
  const bgCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  /* ---------------- Airglow backdrop ---------------- */

  const backdropUniforms = {
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uOctaves: { value: 4 },
  };

  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: backdropUniforms,
      depthTest: false,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform float uTime;
        uniform float uAspect;
        uniform int uOctaves;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        float valueNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
        }

        float fbm(vec2 p) {
          float sum = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 5; i++) {
            if (i >= uOctaves) break;
            sum += valueNoise(p) * amp;
            p = p * 2.03 + vec2(11.3, 7.7);
            amp *= 0.5;
          }
          return sum;
        }

        void main() {
          vec2 uv = vUv;
          vec2 p = vec2((uv.x - 0.5) * uAspect, uv.y - 0.5);

          float t = uTime * 0.010;
          float cloudA = fbm(p * 2.4 + vec2(t, -t * 0.6));
          float cloudB = fbm(p * 1.3 - vec2(t * 0.7, t * 0.35) + cloudA * 0.6);

          // Midnight blue ground, dark violet and deep indigo washes: the
          // three brand colours and nothing else.
          vec3 deep = vec3(0.027, 0.043, 0.114);
          vec3 violet = vec3(0.271, 0.180, 0.522);
          vec3 indigo = vec3(0.129, 0.161, 0.451);

          // fbm averages near 0.47, so the window has to sit around that or
          // nothing clears the threshold and the wash never appears.
          float violetMask = smoothstep(0.30, 0.72, cloudB) *
                             smoothstep(-0.75, 0.55, p.x + p.y * 0.9);
          float indigoMask = smoothstep(0.34, 0.74, cloudA) *
                           smoothstep(0.7, -0.5, p.x + p.y * 1.1);

          // Kept dim on purpose. The guidelines ask for dark overall
          // exposure and for the background never to compete with the
          // subject, and a brighter wash simply erases the fainter stars.
          vec3 color = deep;
          color += violet * violetMask * 0.3;
          color += indigo * indigoMask * 0.2;

          float vignette = smoothstep(1.25, 0.1, length(p * vec2(0.85, 1.0)));
          color *= 0.42 + 0.58 * vignette;

          gl_FragColor = vec4(color, 1.0);
        }
      `,
    })
  );
  backdrop.frustumCulled = false;
  bgScene.add(backdrop);

  /* ---------------- Stars ---------------- */

  const raw = decodeBase64(STARS_B64);
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);

  const positions = new Float32Array(STAR_COUNT * 3);
  const colors = new Float32Array(STAR_COUNT * 3);
  const sizes = new Float32Array(STAR_COUNT);
  const brightness = new Float32Array(STAR_COUNT);
  const phases = new Float32Array(STAR_COUNT);

  const scratch = new THREE.Vector3();

  for (let i = 0; i < STAR_COUNT; i++) {
    const offset = i * 6;
    const ra = (view.getUint16(offset, true) / 65535) * 360;
    const dec = (view.getInt16(offset + 2, true) / 32767) * 90;
    const magnitude = view.getUint8(offset + 4) / 20 - 2;
    const colourIndex = view.getUint8(offset + 5) / 50 - 0.5;

    toVector(ra, dec, SPHERE, scratch);
    positions[i * 3] = scratch.x;
    positions[i * 3 + 1] = scratch.y;
    positions[i * 3 + 2] = scratch.z;

    const [r, g, b] = colourFromIndex(colourIndex);
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;

    // Magnitude is logarithmic and backwards: smaller is brighter. Compressed
    // rather than mapped literally, or Sirius would be the size of a coin and
    // everything at the limit would vanish.
    const rank = Math.max(0, Math.min(1, (7.5 - magnitude) / 9));
    sizes[i] = 0.9 + 3.6 * Math.pow(rank, 2.2);
    brightness[i] = 0.34 + 0.66 * Math.pow(rank, 1.1);
    phases[i] = Math.random();
  }

  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  starGeometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  starGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  starGeometry.setAttribute('aBright', new THREE.BufferAttribute(brightness, 1));
  starGeometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

  const starMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uScale: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aBright;
      attribute float aPhase;
      attribute vec3 aColor;
      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uScale;
      varying float vBright;
      varying vec3 vColor;

      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);

        // Faint stars scintillate more than bright ones, which is both true of
        // the real sky and the reason the field reads as alive rather than as a
        // texture.
        float twinkle = 1.0 + (1.0 - aBright) * 0.3 *
                        sin(uTime * 1.7 + aPhase * 6.2831853);

        vBright = aBright * twinkle;
        vColor = aColor;

        gl_PointSize = aSize * uPixelRatio * uScale * (0.85 + 0.3 * twinkle);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      precision mediump float;
      varying float vBright;
      varying vec3 vColor;

      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = length(d);
        float core = smoothstep(0.5, 0.0, r);

        // Tight core plus a wide halo, so first-magnitude stars bloom the way
        // they do to the naked eye and sixth-magnitude ones stay pinpricks.
        // The core falloff stays gentle because a faint star is two pixels
        // across, and a cubed falloff erases it before it is ever drawn.
        float alpha = pow(core, 1.7) * vBright + pow(core, 0.7) * 0.22 * vBright * vBright;
        if (alpha < 0.006) discard;

        gl_FragColor = vec4(vColor, alpha);
      }
    `,
  });

  const stars = new THREE.Points(starGeometry, starMaterial);
  stars.frustumCulled = false;
  sky.add(stars);

  /* ---------------- Milky Way ----------------
     Placed by galactic coordinates and converted to equatorial, so the band
     crosses Sagittarius and Cygnus where it belongs instead of wherever the
     camera happens to point. */

  const NGP_RA = 192.85948;
  const NGP_DEC = 27.12825;
  const NCP_L = 122.93192;

  function galacticToEquatorial(l, b) {
    const toRad = Math.PI / 180;
    const bRad = b * toRad;
    const dLon = (NCP_L - l) * toRad;
    const decP = NGP_DEC * toRad;

    const sinDec =
      Math.sin(bRad) * Math.sin(decP) +
      Math.cos(bRad) * Math.cos(decP) * Math.cos(dLon);
    const dec = Math.asin(Math.max(-1, Math.min(1, sinDec)));

    const y = Math.cos(bRad) * Math.sin(dLon);
    const x =
      Math.sin(bRad) * Math.cos(decP) -
      Math.cos(bRad) * Math.sin(decP) * Math.cos(dLon);

    const ra = NGP_RA + (Math.atan2(y, x) * 180) / Math.PI;
    return [((ra % 360) + 360) % 360, (dec * 180) / Math.PI];
  }

  const DUST_COUNT = 3200;
  const dustPositions = new Float32Array(DUST_COUNT * 3);
  const dustSizes = new Float32Array(DUST_COUNT);
  const dustAlphas = new Float32Array(DUST_COUNT);

  for (let i = 0; i < DUST_COUNT; i++) {
    const longitude = Math.random() * 360;

    // Gaussian about the galactic equator, via Box-Muller. The band is a
    // distribution, not a stripe.
    const u = Math.max(1e-6, Math.random());
    const v = Math.random();
    const gaussian = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    const latitude = gaussian * 5.5;

    const [ra, dec] = galacticToEquatorial(longitude, latitude);
    toVector(ra, dec, SPHERE * 0.985, scratch);
    dustPositions[i * 3] = scratch.x;
    dustPositions[i * 3 + 1] = scratch.y;
    dustPositions[i * 3 + 2] = scratch.z;

    // Brightest towards the galactic centre at l = 0, as it is from Earth.
    const towardsCentre = Math.cos((longitude * Math.PI) / 180) * 0.5 + 0.5;
    const height = Math.exp(-((latitude / 7) ** 2));
    dustSizes[i] = 30 + Math.random() * 54;
    dustAlphas[i] = (0.03 + 0.075 * towardsCentre) * height;
  }

  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  dustGeometry.setAttribute('aSize', new THREE.BufferAttribute(dustSizes, 1));
  dustGeometry.setAttribute('aAlpha', new THREE.BufferAttribute(dustAlphas, 1));

  const dust = new THREE.Points(
    dustGeometry,
    new THREE.ShaderMaterial({
      uniforms: {
        uPixelRatio: { value: 1 },
        uScale: { value: 1 },
        uColor: { value: new THREE.Color('#8f9ad6') },
      },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aAlpha;
        uniform float uPixelRatio;
        uniform float uScale;
        varying float vAlpha;
        void main() {
          vAlpha = aAlpha;
          gl_PointSize = aSize * uPixelRatio * uScale;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision mediump float;
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          float r = length(gl_PointCoord - 0.5);
          float falloff = pow(smoothstep(0.5, 0.0, r), 2.0);
          float alpha = falloff * vAlpha;
          if (alpha < 0.0008) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
    })
  );
  dust.frustumCulled = false;
  sky.add(dust);

  /* ---------------- Constellation figures ----------------
     Drawn only near the middle of the view. Every figure at once is a diagram;
     a few at a time is a sky you are looking at. */

  const segmentBytes = decodeBase64(SEGMENTS_B64);
  const segmentIndices = new Uint16Array(
    segmentBytes.buffer,
    segmentBytes.byteOffset,
    segmentBytes.byteLength / 2
  );
  const SEGMENTS = segmentIndices.length / 2;

  const figurePositions = new Float32Array(SEGMENTS * 2 * 3);
  for (let i = 0; i < SEGMENTS * 2; i++) {
    const star = segmentIndices[i];
    figurePositions[i * 3] = positions[star * 3];
    figurePositions[i * 3 + 1] = positions[star * 3 + 1];
    figurePositions[i * 3 + 2] = positions[star * 3 + 2];
  }

  const figureGeometry = new THREE.BufferGeometry();
  figureGeometry.setAttribute('position', new THREE.BufferAttribute(figurePositions, 3));

  const figures = new THREE.LineSegments(
    figureGeometry,
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uColor: { value: new THREE.Color('#9a7cff') },
        uForward: { value: new THREE.Vector3(0, 0, -1) },
        uOpacity: { value: 0 },
      },
      vertexShader: /* glsl */ `
        uniform vec3 uForward;
        varying float vFade;
        void main() {
          vec3 direction = normalize((modelMatrix * vec4(position, 1.0)).xyz);
          // 1 at the centre of the view, 0 by about forty degrees out.
          vFade = smoothstep(0.72, 0.97, dot(direction, uForward));
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision mediump float;
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vFade;
        void main() {
          float alpha = vFade * uOpacity;
          if (alpha < 0.004) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
    })
  );
  figures.frustumCulled = false;
  sky.add(figures);

  /* ---------------- Constellation labels ----------------
     A DOM overlay rather than sprites: it is three spans, it inherits the
     page's type, and a screen reader can be told to ignore it in one line. */

  const labelLayer = document.createElement('div');
  labelLayer.className = 'sky-labels';
  labelLayer.setAttribute('aria-hidden', 'true');
  canvas.insertAdjacentElement('afterend', labelLayer);

  const LABEL_SLOTS = 3;
  const labelNodes = [];
  for (let i = 0; i < LABEL_SLOTS; i++) {
    const node = document.createElement('span');
    node.className = 'sky-label';
    labelLayer.append(node);
    labelNodes.push(node);
  }

  const labelData = CONSTELLATIONS.map((constellation) => ({
    name: constellation.latin || constellation.name,
    direction: toVector(constellation.ra, constellation.dec, 1, new THREE.Vector3()),
    world: new THREE.Vector3(),
    projected: new THREE.Vector3(),
  }));

  const forward = new THREE.Vector3();
  const candidates = [];

  function updateLabels(width, height) {
    camera.getWorldDirection(forward);
    candidates.length = 0;

    for (const label of labelData) {
      label.world.copy(label.direction).applyQuaternion(sky.quaternion);
      const alignment = label.world.dot(forward);
      if (alignment < 0.9) continue;
      candidates.push({ label, alignment });
    }

    candidates.sort((a, b) => b.alignment - a.alignment);

    for (let slot = 0; slot < LABEL_SLOTS; slot++) {
      const node = labelNodes[slot];
      const entry = candidates[slot];

      if (!entry) {
        node.style.opacity = '0';
        continue;
      }

      entry.label.projected
        .copy(entry.label.world)
        .multiplyScalar(SPHERE)
        .project(camera);

      const x = (entry.label.projected.x * 0.5 + 0.5) * width;
      const y = (-entry.label.projected.y * 0.5 + 0.5) * height;

      if (entry.label.projected.z > 1 || x < 40 || x > width - 40) {
        node.style.opacity = '0';
        continue;
      }

      node.textContent = entry.label.name;
      node.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
      node.style.opacity = String(
        Math.min(0.5, (entry.alignment - 0.9) * 6) * figureOpacity
      );
    }
  }

  /* ---------------- Shooting star ---------------- */

  const shootingStar = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uProgress: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision mediump float;
        varying vec2 vUv;
        uniform float uProgress;
        void main() {
          float tail = pow(vUv.x, 3.5);
          float band = exp(-pow((vUv.y - 0.5) * 9.0, 2.0));
          float life = smoothstep(0.0, 0.1, uProgress) * (1.0 - smoothstep(0.68, 1.0, uProgress));
          float alpha = tail * band * life;
          if (alpha < 0.004) discard;
          vec3 color = mix(vec3(0.72, 0.79, 1.0), vec3(1.0), tail);
          gl_FragColor = vec4(color, alpha);
        }
      `,
    })
  );
  shootingStar.visible = false;
  shootingStar.frustumCulled = false;
  scene.add(shootingStar);

  let shootTimer = 4 + Math.random() * 5;
  let shootProgress = 0;

  function launchShootingStar() {
    const fromLeft = Math.random() > 0.45;
    const startX = fromLeft ? -22 - Math.random() * 5 : 22 + Math.random() * 5;
    const startY = 5 + Math.random() * 7;
    const angle = fromLeft ? -0.42 - Math.random() * 0.2 : Math.PI + 0.42 + Math.random() * 0.2;
    const length = 7 + Math.random() * 5;

    shootingStar.userData = { startX, startY, angle, travel: 26 + Math.random() * 12 };
    shootingStar.scale.set(length, 0.5 + Math.random() * 0.35, 1);
    shootingStar.rotation.z = angle;
    shootingStar.position.set(startX, startY, -16);
    shootingStar.visible = true;
    shootProgress = 0;
  }

  function updateShootingStar(dt) {
    if (!shootingStar.visible) {
      shootTimer -= dt;
      if (shootTimer <= 0) {
        launchShootingStar();
        shootTimer = 9 + Math.random() * 8;
      }
      return;
    }

    shootProgress += dt * 0.62;
    shootingStar.material.uniforms.uProgress.value = shootProgress;

    const { startX, startY, angle, travel } = shootingStar.userData;
    shootingStar.position.x = startX + Math.cos(angle) * travel * shootProgress;
    shootingStar.position.y = startY + Math.sin(angle) * travel * shootProgress;

    if (shootProgress >= 1) shootingStar.visible = false;
  }

  /* ---------------- View ----------------
     Opens on Orion: the most recognisable figure in either hemisphere, with
     Taurus, Canis Major and the winter Milky Way in the same field. */

  const VIEW_RA = 84;
  const VIEW_DEC = 4;
  const SCROLL_SWEEP = 46;

  const pointerTarget = { x: 0, y: 0 };
  const pointerSmooth = { x: 0, y: 0 };
  let scrollTarget = 0;
  let scrollSmooth = 0;
  let figureOpacity = 0;
  let raf = 0;

  const lookAt = new THREE.Vector3();

  function aim(time) {
    // Diurnal rotation, slowed to roughly one turn an hour so it reads as
    // ambient rather than as something moving.
    sky.rotation.y = time * 0.0018;

    const ra = VIEW_RA + scrollSmooth * SCROLL_SWEEP + pointerSmooth.x * 5.5;
    const dec = Math.max(-72, Math.min(72, VIEW_DEC - scrollSmooth * 16 + pointerSmooth.y * 4.5));

    toVector(ra, dec, SPHERE, lookAt);
    camera.lookAt(lookAt);
  }

  function onPointerMove(event) {
    pointerTarget.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointerTarget.y = -((event.clientY / window.innerHeight) * 2 - 1);
  }

  function onScroll() {
    const total = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    scrollTarget = Math.min(1, window.scrollY / total);
  }

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    // Capped so a 3x phone does not shade nine times the pixels it needs to.
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);

    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    backdropUniforms.uAspect.value = camera.aspect;
    // Narrow viewports are phones. Drop an octave rather than a frame.
    backdropUniforms.uOctaves.value = width < 760 ? 3 : 4;

    // Point sizes are in device pixels, so without this the sky is a dense
    // field on a phone and a sparse one on a desktop.
    const scale = Math.max(0.9, Math.min(1.5, height / 900));
    starMaterial.uniforms.uPixelRatio.value = pixelRatio;
    starMaterial.uniforms.uScale.value = scale;
    dust.material.uniforms.uPixelRatio.value = pixelRatio;
    dust.material.uniforms.uScale.value = scale;

    if (reduceMotion.matches && raf === 0) drawFrame(0);
  }

  /* ---------------- Frame ---------------- */

  function drawFrame(time) {
    aim(time);

    camera.getWorldDirection(forward);
    figures.material.uniforms.uForward.value.copy(forward);
    figures.material.uniforms.uOpacity.value = figureOpacity;

    renderer.clear();
    renderer.render(bgScene, bgCamera);
    renderer.render(scene, camera);

    updateLabels(window.innerWidth, window.innerHeight);
  }

  let previous = performance.now();

  function frame(now) {
    raf = requestAnimationFrame(frame);

    // Clamped so returning to a backgrounded tab does not jump the sky forward
    // by however long the reader was away.
    const dt = Math.min((now - previous) / 1000, 0.05);
    previous = now;

    const time = now / 1000;
    backdropUniforms.uTime.value = time;
    starMaterial.uniforms.uTime.value = time;

    pointerSmooth.x += (pointerTarget.x - pointerSmooth.x) * Math.min(1, dt * 2.2);
    pointerSmooth.y += (pointerTarget.y - pointerSmooth.y) * Math.min(1, dt * 2.2);
    scrollSmooth += (scrollTarget - scrollSmooth) * Math.min(1, dt * 2.6);

    // The figures fade up a couple of seconds in, so the first thing a reader
    // sees is a sky, and the diagram over it arrives afterwards.
    figureOpacity = Math.min(1, Math.max(0, (time - 1.6) / 2.4)) * 0.62;

    updateShootingStar(dt);
    drawFrame(time);
  }

  function start() {
    if (raf) return;
    previous = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    if (!raf) return;
    cancelAnimationFrame(raf);
    raf = 0;
  }

  function applyMotionPreference() {
    stop();

    if (reduceMotion.matches) {
      // One frame. The figures are already up, because there is no fade to
      // watch and the sky should not look unfinished.
      backdropUniforms.uTime.value = 0;
      starMaterial.uniforms.uTime.value = 1.2;
      figureOpacity = 0.62;
      drawFrame(0);
      return;
    }

    start();
  }

  resize();
  onScroll();

  window.addEventListener('resize', resize);
  window.addEventListener('scroll', onScroll, { passive: true });

  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', () => {
      pointerTarget.x = 0;
      pointerTarget.y = 0;
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (!reduceMotion.matches) start();
  });

  reduceMotion.addEventListener('change', applyMotionPreference);
  applyMotionPreference();
}
