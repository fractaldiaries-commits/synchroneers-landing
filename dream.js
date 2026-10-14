/**
 * Dream layers: the foreground the camera drifts through.
 *
 * The real star sky stays the deep backdrop. This adds the two things that sit
 * between the reader and it, both drawn into the same WebGL canvas as the sky
 * so the page still holds exactly one context.
 *
 * 1. Mist. Three layers of domain-warped noise, evaluated in one fullscreen
 *    fragment pass rather than as three planes. Each layer is on its own
 *    cycle: it starts small and faint far away, grows as if the camera were
 *    flying into it, and fades out as it arrives. Scrolling advances all three
 *    cycles, which is the dolly: you do not see a texture scroll, you see
 *    cloud approach and pass. The pass renders at a fraction of the screen
 *    into a render target and is upsampled additively. Mist is soft by nature,
 *    so the lost resolution is invisible and the saving is four to nine times
 *    the fill cost.
 *
 * 2. Motes. A few hundred luminous particles in a long volume in front of the
 *    camera, drawn as instanced quads expanded in the vertex shader. They do
 *    the depth-of-field and bloom work cheaply: a mote's size and softness
 *    come from how far it is from the focal plane, so near ones swell into
 *    dim bokeh discs and far ones stay bright pinpricks, with the energy
 *    conserved so blur does not also mean brighter. Scroll velocity stretches
 *    them vertically into streaks, which is what sells speed without any
 *    camera shake.
 *
 * 3. The journey. A third small pass, the veil, carries the astral-projection
 *    story: it opens the page "in the body" (warm dark haze, a pane of
 *    moonlight, tight vignette), lifts the view out of it as the reader
 *    scrolls (a faint silver cord receding below the camera, cloud thickening
 *    the mist as the camera rises through it), and brings the warmth back
 *    at the very end so the closing call to action reads as waking. It also
 *    owns the speed effects: light streaks and a vignette that breathes.
 *    The chromatic shimmer on fast scroll lives in the mist composite.
 *
 * Colour comes from the scroll director, so the mist and the motes shift
 * hue from section to section without this file knowing what a section is.
 *
 * Quality is a number, not a feature flag. The sky's frame governor lowers it
 * when frames run long: fewer motes, a smaller mist target, one fewer octave.
 */

import { createHero } from './hero.js';

export const QUALITY = {
  // [mote count, mist target scale, fbm octaves]
  0: [220, 0.32, 3],
  1: [480, 0.42, 3],
  2: [900, 0.5, 4],
};

const MAX_MOTES = QUALITY[2][0];

// Journey colours, as 0..1 RGB: lamp-lit room, and cloud lit by the moon.
const WARM = [0.82, 0.5, 0.34];
const CLOUD = [0.7, 0.76, 0.94];
const scratchA = [0, 0, 0];
const scratchB = [0, 0, 0];

export function createDream(THREE, { quality }) {
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const hero = createHero(THREE, { small: quality < 2 });

  /* ---------------- Mist ---------------- */

  const mistUniforms = {
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uDepth: { value: 0 },
    uSpeed: { value: 0 },
    uOctaves: { value: 4 },
    uTintA: { value: new THREE.Vector3() },
    uTintB: { value: new THREE.Vector3() },
    uPointer: { value: new THREE.Vector2() },
    uGain: { value: 1 },
  };

  const fullscreenVertex = /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `;

  const mistMaterial = new THREE.ShaderMaterial({
    uniforms: mistUniforms,
    depthTest: false,
    depthWrite: false,
    vertexShader: fullscreenVertex,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec2 vUv;
      uniform float uTime;
      uniform float uAspect;
      uniform float uDepth;
      uniform float uSpeed;
      uniform int uOctaves;
      uniform vec3 uTintA;
      uniform vec3 uTintB;
      uniform vec2 uPointer;
      uniform float uGain;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float valueNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float fbm(vec2 p) {
        float sum = 0.0;
        float amp = 0.5;
        for (int i = 0; i < 4; i++) {
          if (i >= uOctaves) break;
          sum += valueNoise(p) * amp;
          p = p * 2.03 + vec2(11.3, 7.7);
          amp *= 0.5;
        }
        return sum;
      }

      void main() {
        vec2 p = vec2((vUv.x - 0.5) * uAspect, vUv.y - 0.5);
        vec3 color = vec3(0.0);

        for (int layer = 0; layer < 3; layer++) {
          float index = float(layer);

          // Where this layer is in its approach: 0 far away, 1 arriving.
          float cycle = fract(uDepth + index / 3.0);

          // Noise scale falls as the layer nears, so its features grow
          // outward from the centre of the view. This is the dolly.
          float scale = mix(3.1, 0.55, cycle);

          // Born faint, full in the middle of the approach, gone on arrival.
          float life = sin(cycle * 3.14159265);
          life *= life;

          // Nearer layers slide further with the pointer: parallax.
          vec2 q = p * scale
                 + uPointer * (0.04 + 0.14 * cycle)
                 + vec2(index * 7.1, index * 3.3)
                 + vec2(uTime * 0.011, -uTime * 0.007) * (1.0 + index * 0.6);

          float warp = fbm(q * 0.7 + uTime * 0.016);
          float n = fbm(q * 1.4 + warp * 1.5);

          // fbm averages near 0.47, so the window sits around that.
          float body = smoothstep(0.4, 0.8, n);
          float hue = smoothstep(0.3, 0.75, warp);

          color += mix(uTintA, uTintB, hue) * body * life * 0.27 * uGain;
        }

        // A faint, wide glow at the centre of the view, tinted by the
        // section. It reads as bloom around whatever the eye is resting on.
        float glow = exp(-dot(p, p) * 1.6);
        color += mix(uTintA, uTintB, 0.5) * glow * 0.07;

        // Speed lifts the whole layer a little: flying through cloud is
        // brighter than standing in it.
        color *= 1.0 + min(abs(uSpeed), 1.5) * 0.3;

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });

  const mistScene = new THREE.Scene();
  const mistQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mistMaterial);
  mistQuad.frustumCulled = false;
  mistScene.add(mistQuad);

  const mistTarget = new THREE.WebGLRenderTarget(2, 2, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
  });

  const compositeScene = new THREE.Scene();
  const compositeQuad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: { uTex: { value: mistTarget.texture }, uShimmer: { value: 0 } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: fullscreenVertex,
      fragmentShader: /* glsl */ `
        precision mediump float;
        varying vec2 vUv;
        uniform sampler2D uTex;
        uniform float uShimmer;
        void main() {
          // Chromatic shimmer: on a fast scroll the red and blue channels
          // part along the scroll axis by a few pixels. At rest the three
          // taps coincide and it is a plain copy.
          vec2 split = vec2(0.0, uShimmer);
          float r = texture2D(uTex, vUv + split).r;
          float g = texture2D(uTex, vUv).g;
          float b = texture2D(uTex, vUv - split).b;
          gl_FragColor = vec4(r, g, b, 1.0);
        }
      `,
    }),
  );
  compositeQuad.frustumCulled = false;
  compositeScene.add(compositeQuad);

  /* ---------------- Veil: body, cord, speed ---------------- */

  const veilUniforms = {
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uBody: { value: 1 },
    uCord: { value: 0 },
    uWake: { value: 0 },
    uSpeed: { value: 0 },
  };

  const veilScene = new THREE.Scene();
  const veil = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: veilUniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      // Premultiplied: the shader outputs colour that already carries its
      // own alpha, so it can darken (vignette, room) and add light (glow,
      // cord, streaks) in the same pass.
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      vertexShader: fullscreenVertex,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform float uTime;
        uniform float uAspect;
        uniform float uBody;
        uniform float uCord;
        uniform float uWake;
        uniform float uSpeed;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        float boxDistance(vec2 q, vec2 extent) {
          vec2 d = abs(q) - extent;
          return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
        }

        void main() {
          vec2 p = vec2((vUv.x - 0.5) * uAspect, vUv.y - 0.5);
          float speed = min(abs(uSpeed), 1.5);

          // Vignette. It breathes slowly, and swells with scroll speed, so a
          // fast scroll feels like a held breath rather than a camera move.
          float pulse = 0.5 + 0.5 * sin(uTime * 0.9);
          float vig = smoothstep(0.3, 1.0, length(p * vec2(0.9, 1.0)));
          float va = vig * (0.3 + 0.1 * pulse + speed * 0.12 + uBody * 0.22);

          vec3 rgb = vec3(0.02, 0.02, 0.07) * va;
          float a = va;

          // In the body: the whole view sits under a warm, dim cover.
          float ba = uBody * 0.42;
          rgb = rgb * (1.0 - ba) + vec3(0.09, 0.05, 0.05) * ba;
          a = a + ba * (1.0 - a);

          // A pane of moonlight on the wall, with a cross of glazing bars:
          // the one piece of room the eye needs to read "bedroom".
          vec2 q = p - vec2(uAspect * 0.27, 0.13);
          float pane = smoothstep(0.03, -0.03, boxDistance(q, vec2(0.085, 0.16)));
          float bars = smoothstep(0.004, 0.012, abs(q.x)) * smoothstep(0.004, 0.012, abs(q.y - 0.01));
          rgb += vec3(0.55, 0.62, 0.9) * pane * bars * 0.2 * uBody;

          // Warm lamp haze welling up from the bottom of the view. It returns
          // at the very end of the page, which is the waking.
          float lamp = exp(-pow((vUv.y) * 2.1, 2.0));
          float warmth = uBody * 0.55 + uWake * 0.5;
          rgb += vec3(0.62, 0.34, 0.2) * lamp * warmth * 0.4;

          // The silver cord: a thread from the sleeper below, receding as the
          // view lifts. It wanders, and a bead of light travels along it.
          float sway = sin(vUv.y * 6.0 + uTime * 0.7) * 0.02 * (1.0 - vUv.y);
          float lean = (1.0 - vUv.y) * 0.04;
          float dist = abs((vUv.x - 0.5) * uAspect - sway - lean);
          float thread = exp(-dist * dist * 9000.0) * smoothstep(0.78, 0.0, vUv.y);
          float bead = exp(-pow((fract(vUv.y * 0.7 - uTime * 0.12) - 0.5) * 6.0, 2.0));
          rgb += vec3(0.74, 0.8, 1.0) * thread * (0.35 + 0.65 * bead) * uCord * 0.9;

          // Light streaks: thin vertical lines that appear only with speed.
          float column = floor(vUv.x * 90.0);
          float cell = floor(vUv.y * 5.0 - uTime * 3.0 * sign(uSpeed));
          float lit = step(0.968, hash(vec2(column, cell)));
          float line = 1.0 - abs(fract(vUv.x * 90.0) - 0.5) * 2.0;
          rgb += vec3(0.62, 0.68, 1.0) * lit * pow(line, 6.0) * speed * 0.16;

          gl_FragColor = vec4(rgb, a);
        }
      `,
    }),
  );
  veil.frustumCulled = false;
  veilScene.add(veil);

  /* ---------------- Motes ---------------- */

  const moteUniforms = {
    uTime: { value: 0 },
    uTravel: { value: 0 },
    uSpeed: { value: 0 },
    uAspect: { value: 1 },
    uTanHalf: { value: 0.6 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uPixelRatio: { value: 1 },
    uTintA: mistUniforms.uTintA,
    uTintB: mistUniforms.uTintB,
    uPointer: mistUniforms.uPointer,
    uGain: { value: 1 },
  };

  const corners = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
  const moteGeometry = new THREE.InstancedBufferGeometry();
  moteGeometry.setAttribute('position', new THREE.BufferAttribute(corners, 3));
  moteGeometry.setIndex([0, 1, 2, 0, 2, 3]);

  const seeds = new Float32Array(MAX_MOTES * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
  moteGeometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  moteGeometry.instanceCount = QUALITY[quality][0];

  const motes = new THREE.Mesh(
    moteGeometry,
    new THREE.ShaderMaterial({
      uniforms: moteUniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uTime;
        uniform float uTravel;
        uniform float uSpeed;
        uniform float uAspect;
        uniform float uTanHalf;
        uniform vec2 uResolution;
        uniform float uPixelRatio;
        uniform vec2 uPointer;
        uniform vec3 uTintA;
        uniform vec3 uTintB;
        uniform float uGain;
        varying vec2 vCorner;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vBlur;

        const float NEAR = 3.0;
        const float FAR = 34.0;
        const float FOCUS = 13.0;

        void main() {
          vec2 corner = position.xy;

          // Depth cycles with scroll, so motes stream past the camera as the
          // page is read and recycle at the far end without popping.
          float z = fract(aSeed.z - uTravel * 0.3 + uTime * 0.0035 * (0.4 + aSeed.w));
          float depth = mix(NEAR, FAR, z);

          float spreadX = depth * uTanHalf * uAspect * 1.2;
          float spreadY = depth * uTanHalf * 1.2;
          vec3 view = vec3(
            (aSeed.x * 2.0 - 1.0) * spreadX,
            (aSeed.y * 2.0 - 1.0) * spreadY,
            -depth
          );

          // Each mote wanders on its own slow loop, and nearer ones shift
          // more with the pointer.
          float wander = uTime * (0.12 + aSeed.w * 0.2) + aSeed.x * 40.0;
          view.x += sin(wander) * 0.35 + uPointer.x * depth * 0.012;
          view.y += cos(wander * 0.83) * 0.3 + uPointer.y * depth * 0.008;

          vec4 clip = projectionMatrix * vec4(view, 1.0);

          // Circle of confusion: zero on the focal plane, growing either side.
          float blur = clamp(abs(depth - FOCUS) / FOCUS, 0.0, 1.0);
          float size = (1.5 + aSeed.w * 2.4) * (1.0 + blur * 2.6);
          size *= clamp(14.0 / depth, 0.45, 1.3);

          // Speed stretches a mote along the scroll axis into a streak.
          float stretch = 1.0 + min(abs(uSpeed), 2.5) * 2.4 * (0.4 + 0.6 * (1.0 - blur));

          vec2 pixels = corner * vec2(size, size * stretch) * uPixelRatio;
          clip.xy += pixels / uResolution * 2.0 * clip.w;
          gl_Position = clip;

          vCorner = corner;
          vBlur = blur;

          float fade = smoothstep(0.0, 0.1, z) * (1.0 - smoothstep(0.82, 1.0, z));
          float twinkle = 0.75 + 0.25 * sin(uTime * (0.8 + aSeed.w * 1.6) + aSeed.y * 30.0);

          // Energy is conserved: a defocused mote is bigger and dimmer.
          vAlpha = uGain * fade * twinkle * 0.55 / (1.0 + blur * blur * 9.0);

          // Mostly the section's colours, lifted towards white, with the odd
          // gold mote: the "golden particles" the brand calls for.
          vec3 tint = mix(uTintA, uTintB, aSeed.w);
          tint = mix(tint, vec3(1.0), 0.35);
          vColor = aSeed.w > 0.9 ? vec3(0.96, 0.74, 0.42) : tint;
        }
      `,
      fragmentShader: /* glsl */ `
        precision mediump float;
        varying vec2 vCorner;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vBlur;

        void main() {
          // Elongated quads stay circular in corner space, which is what
          // makes a streak a streak rather than a squashed dot.
          float r = length(vCorner);
          if (r > 1.0) discard;

          float core = pow(1.0 - r, 2.2);

          // Out of focus, the highlight turns into a disc with a bright rim,
          // the way a lens renders a point of light it cannot resolve.
          float disc = smoothstep(1.0, 0.82, r) * (0.55 + 0.45 * smoothstep(0.3, 0.95, r));

          float shape = mix(core, disc, smoothstep(0.15, 0.7, vBlur));
          float alpha = shape * vAlpha;
          if (alpha < 0.004) discard;

          gl_FragColor = vec4(vColor, alpha);
        }
      `,
    }),
  );
  motes.frustumCulled = false;

  const moteScene = new THREE.Scene();
  moteScene.add(motes);

  // The motes live in camera space, so they get a camera that never turns.
  // Only its lens follows the sky camera.
  const moteCamera = new THREE.PerspectiveCamera(62, 1, 0.1, 100);

  /* ---------------- API ---------------- */

  let level = quality;
  let width = 1;
  let height = 1;
  let pixelRatio = 1;

  function applyQuality() {
    const [count, scale, octaves] = QUALITY[level];
    moteGeometry.instanceCount = count;
    mistUniforms.uOctaves.value = octaves;
    mistTarget.setSize(
      Math.max(2, Math.round(width * pixelRatio * scale)),
      Math.max(2, Math.round(height * pixelRatio * scale)),
    );
  }

  return {
    get quality() {
      return level;
    },

    setQuality(next) {
      level = next;
      applyQuality();
    },

    /** Drawing-buffer geometry. `w` and `h` are CSS pixels. */
    resize(w, h, ratio) {
      width = w;
      height = h;
      pixelRatio = ratio;
      mistUniforms.uAspect.value = w / h;
      veilUniforms.uAspect.value = w / h;
      moteUniforms.uAspect.value = w / h;
      moteUniforms.uResolution.value.set(w * ratio, h * ratio);
      moteUniforms.uPixelRatio.value = ratio;
      hero.resize(w, h);
      moteCamera.aspect = w / h;
      moteCamera.updateProjectionMatrix();
      applyQuality();
    },

    /**
     * Draw both layers. `camera` is the sky camera, read only for its lens so
     * a widening field of view during a fast scroll opens the motes up too.
     */
    render(renderer, camera, director) {
      const { tintA, tintB, pointer } = director;

      // About eleven section-lengths of travel across the whole page is
      // enough that the mist visibly changes between any two headings
      // without a single scroll flick cycling it twice.
      const depth = director.progress * 11;

      mistUniforms.uTime.value = director.time;
      mistUniforms.uDepth.value = depth;
      mistUniforms.uSpeed.value = director.velocity;
      // The journey recolours the section palette: warm while in the body and
      // again while waking, pale and cloudlike while the view rises.
      const warm = Math.min(1, director.body * 0.7 + director.wake * 0.5);
      const cloud = director.cloud * 0.55;
      const mixTint = (source, out) => {
        for (let i = 0; i < 3; i++) {
          let v = source[i];
          v += (WARM[i] - v) * warm;
          v += (CLOUD[i] - v) * cloud;
          out[i] = v;
        }
      };
      mixTint(tintA, scratchA);
      mixTint(tintB, scratchB);
      mistUniforms.uTintA.value.set(scratchA[0], scratchA[1], scratchA[2]);
      mistUniforms.uTintB.value.set(scratchB[0], scratchB[1], scratchB[2]);
      // Cloud is denser mist; the body is dim, dream-thick air.
      mistUniforms.uGain.value = 1 + director.cloud * 0.9 + director.body * 0.2;
      moteUniforms.uGain.value = 1 - director.body * 0.7;

      veilUniforms.uTime.value = director.time;
      veilUniforms.uBody.value = director.body;
      veilUniforms.uCord.value = director.cord * 0.35;
      veilUniforms.uWake.value = director.wake;
      veilUniforms.uSpeed.value = director.velocity;
      compositeQuad.material.uniforms.uShimmer.value =
        Math.min(Math.abs(director.velocity), 2) * 0.0022 * Math.sign(director.velocity);
      mistUniforms.uPointer.value.set(pointer.x, pointer.y);

      moteUniforms.uTime.value = director.time;
      moteUniforms.uTravel.value = depth;
      // The opening swell of speed streams the motes past while the double rises.
      moteUniforms.uSpeed.value = director.velocity + director.stream * 1.3;

      if (moteCamera.fov !== camera.fov) {
        moteCamera.fov = camera.fov;
        moteCamera.updateProjectionMatrix();
      }
      moteUniforms.uTanHalf.value = Math.tan((moteCamera.fov * Math.PI) / 360);

      renderer.setRenderTarget(mistTarget);
      renderer.render(mistScene, ortho);
      renderer.setRenderTarget(null);

      renderer.render(veilScene, ortho);
      renderer.render(compositeScene, ortho);
      hero.update(director, moteCamera);
      hero.render(renderer, moteCamera);
      renderer.render(moteScene, moteCamera);
    },
  };
}
