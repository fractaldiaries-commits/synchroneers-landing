/**
 * The hero: an astral projection, in three parts.
 *
 *   1. The body. A dim, warm, horizontal figure at the bottom of the view,
 *      drawn as a plain lit shape: it is what you are leaving.
 *   2. The double. The same silhouette in light: a translucent, rim-lit
 *      figure that starts out lying over the body, then rises and turns
 *      upright over the first seconds of the page (director.lift). Its edge
 *      glows, its feet dissolve, and a faint scan shimmer runs up it.
 *   3. The silver cord. A ribbon of light from the double back down to the
 *      body, swaying, with a bead of light travelling along it. It recedes
 *      into depth as it falls, so the camera feels lifted away from it. The
 *      ribbon is built entirely in the vertex shader from two end points, so
 *      moving it costs a handful of uniforms and no geometry updates.
 *
 * Scrolling continues the story: the body and cord fall away below the frame
 * as if the camera were still rising, and the double drifts up and fades as
 * the hero leaves.
 *
 * Layout is mobile-first. The figure is sized from the narrower of the view's
 * width and height, so on a 375px phone it is a centred, smaller figure low in
 * the frame, behind the buttons rather than behind the headline; on a wide
 * screen it stands to the right of the headline. The geometry is the same;
 * only the placement and a lower segment count change.
 *
 * Everything is in view space, drawn with a camera that never turns, after the
 * mist and before the motes, so the motes stream past in front of the figure.
 */

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

/** Half-profile of the figure, bottom to top: [radius, height]. A robed
 *  silhouette: wisps at the foot, hips, shoulders, neck, head. */
const PROFILE = [
  [0.0, -0.9],
  [0.04, -0.84],
  [0.12, -0.62],
  [0.19, -0.3],
  [0.2, -0.05],
  [0.17, 0.12],
  [0.27, 0.32],
  [0.24, 0.4],
  [0.085, 0.47],
  [0.075, 0.54],
  [0.13, 0.62],
  [0.145, 0.72],
  [0.11, 0.84],
  [0.0, 0.89],
];

export function createHero(THREE, { small }) {
  const scene = new THREE.Scene();
  const group = new THREE.Group();
  scene.add(group);

  /* ---------------- The figure ---------------- */

  // Smoothed through a spline, or the silhouette reads as a faceted toy.
  const profile = new THREE.SplineCurve(PROFILE.map(([r, y]) => new THREE.Vector2(r, y))).getPoints(
    small ? 40 : 64,
  );
  for (const point of profile) point.x = Math.max(0, point.x);
  const figureGeometry = new THREE.LatheGeometry(profile, small ? 24 : 40);

  function figureMaterial({ color, rim, wisp }) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(color) },
        uRim: { value: rim },
        uWisp: { value: wisp },
        uOpacity: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uWisp;
        varying vec3 vNormal;
        varying vec3 vView;
        varying float vHeight;

        void main() {
          vec3 p = position;

          // The lower body streams like smoke: sideways ripples that grow
          // towards the foot, so the figure is a presence, not a statue.
          float lower = smoothstep(0.1, -0.9, p.y);
          p.x += sin(p.y * 7.0 + uTime * 1.5) * 0.05 * lower * uWisp;
          p.z += cos(p.y * 6.0 + uTime * 1.2) * 0.05 * lower * uWisp;

          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vView = normalize(-mv.xyz);
          vHeight = p.y;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uRim;
        uniform float uOpacity;
        varying vec3 vNormal;
        varying vec3 vView;
        varying float vHeight;

        void main() {
          float facing = abs(dot(normalize(vNormal), normalize(vView)));
          float fresnel = pow(1.0 - facing, 2.2);

          // Rim light plus a faint filled body, so it reads as a translucent
          // form and not as an outline.
          float body = 0.16 + fresnel * uRim;

          // The feet dissolve, and a slow shimmer climbs the figure.
          float fade = smoothstep(-0.85, -0.15, vHeight);
          float scan = 0.88 + 0.12 * sin(vHeight * 46.0 - uTime * 2.6);

          // The head carries a little more light.
          float crown = smoothstep(0.55, 0.85, vHeight) * 0.25;

          float alpha = (body + crown) * fade * scan * uOpacity;
          vec3 colour = mix(uColor, vec3(0.86, 0.9, 1.0), fresnel * 0.6);
          gl_FragColor = vec4(colour, alpha);
        }
      `,
    });
  }

  const bodyMaterial = figureMaterial({ color: '#c98a5c', rim: 0.55, wisp: 0.0 });
  const doubleMaterial = figureMaterial({ color: '#a99bff', rim: 1.5, wisp: 1.0 });

  const sleeper = new THREE.Mesh(figureGeometry, bodyMaterial);
  const double = new THREE.Mesh(figureGeometry, doubleMaterial);
  sleeper.frustumCulled = false;
  double.frustumCulled = false;
  // The body is drawn first, so the double's light lies over it.
  sleeper.renderOrder = 1;
  double.renderOrder = 3;
  group.add(sleeper, double);

  /* ---------------- The silver cord ---------------- */

  const SEGMENTS = small ? 40 : 72;
  const ribbonPositions = new Float32Array((SEGMENTS + 1) * 2 * 3);
  const ribbonIndex = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const s = i / SEGMENTS;
    // x carries the parameter along the cord, y the side of the ribbon.
    ribbonPositions.set([s, -1, 0, s, 1, 0], i * 6);
    if (i < SEGMENTS) {
      const a = i * 2;
      ribbonIndex.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const ribbonGeometry = new THREE.BufferGeometry();
  ribbonGeometry.setAttribute('position', new THREE.BufferAttribute(ribbonPositions, 3));
  ribbonGeometry.setIndex(ribbonIndex);

  const cordUniforms = {
    uTime: { value: 0 },
    uTop: { value: new THREE.Vector3() },
    uBottom: { value: new THREE.Vector3() },
    uWidth: { value: 0.05 },
    uOpacity: { value: 0 },
  };

  const cord = new THREE.Mesh(
    ribbonGeometry,
    new THREE.ShaderMaterial({
      uniforms: cordUniforms,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uTop;
        uniform vec3 uBottom;
        uniform float uWidth;
        varying float vS;
        varying float vSide;

        vec3 curve(float s) {
          vec3 c = mix(uTop, uBottom, s);
          // A slow S-curve that grows along the cord, and a push into depth
          // so the far end recedes below the camera.
          float arc = sin(s * 3.14159265);
          c.x += sin(s * 5.0 + uTime * 0.8) * 0.22 * arc + arc * 0.25;
          c.z -= s * s * 2.4;
          return c;
        }

        void main() {
          float s = position.x;
          vec3 c = curve(s);
          vec3 next = curve(min(1.0, s + 0.01));
          vec3 previous = curve(max(0.0, s - 0.01));
          vec3 tangent = normalize(next - previous);

          // Widen perpendicular to the cord as seen from the camera.
          vec3 across = normalize(cross(tangent, vec3(0.0, 0.0, 1.0)));
          float width = uWidth * (1.0 - 0.65 * s);
          vec3 p = c + across * position.y * width;

          vS = s;
          vSide = position.y;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uTime;
        uniform float uOpacity;
        varying float vS;
        varying float vSide;

        void main() {
          float core = exp(-vSide * vSide * 10.0);
          float halo = exp(-vSide * vSide * 2.2) * 0.35;

          // A bead of light travelling away from the figure.
          float bead = exp(-pow((fract(vS * 1.1 - uTime * 0.16) - 0.5) * 7.0, 2.0));

          float ends = smoothstep(0.0, 0.06, vS) * (1.0 - smoothstep(0.7, 1.0, vS));
          float alpha = (core * (0.45 + 0.9 * bead) + halo) * ends * uOpacity;
          vec3 colour = mix(vec3(0.7, 0.78, 1.0), vec3(1.0), core * bead);
          gl_FragColor = vec4(colour, alpha);
        }
      `,
    }),
  );
  cord.frustumCulled = false;
  cord.renderOrder = 2;
  group.add(cord);

  /* ---------------- Per-frame ---------------- */

  let aspect = 1;
  const DEPTH = 4.4;

  return {
    resize(width, height) {
      aspect = width / height;
    },

    /**
     * Pose the figure for this frame. `camera` supplies the lens so placement
     * follows the visible area at the figure's depth at any field of view.
     */
    update(director, camera) {
      const t = director.time;
      const lift = director.lift;
      const h = window.scrollY / Math.max(1, window.innerHeight);

      const halfH = Math.tan((camera.fov * Math.PI) / 360) * DEPTH;
      const halfW = halfH * aspect;
      const wide = aspect > 1.15;

      // Size from the narrower dimension, so a phone gets a smaller figure
      // rather than one cropped by the sides.
      const scale = Math.min(halfH * (wide ? 0.62 : 0.34), halfW * 0.78);
      const homeX = wide ? halfW * 0.5 : 0;
      const homeY = wide ? halfH * 0.05 : -halfH * 0.46;
      const sleepY = -halfH * (wide ? 0.78 : 0.86);

      // The body lies low and, as the page scrolls, drops out of the frame.
      const fall = h * halfH * 1.3;
      sleeper.position.set(homeX * 0.55, sleepY - fall, -DEPTH);
      sleeper.rotation.set(0, 0.35, Math.PI / 2);
      sleeper.scale.setScalar(scale * 0.72);

      // The double leaves it: lying over the body at lift 0, upright at 1.
      const rise = lift * lift * (3 - 2 * lift);
      const hover = Math.sin(t * 0.9) * 0.05 * scale;
      const px = director.pointer.x;
      const py = director.pointer.y;

      double.position.set(
        lerp(sleeper.position.x, homeX, rise) + px * 0.12 * scale,
        lerp(sleepY + 0.05, homeY, rise) + hover + h * halfH * 0.5 + py * 0.06 * scale,
        -DEPTH + 0.2,
      );
      double.rotation.set(0, px * 0.35, lerp(Math.PI / 2, 0, smooth(0.0, 0.85, lift)));
      double.scale.setScalar(lerp(scale * 0.72, scale, rise));

      // Light up as it separates, and leave with the hero.
      const leaving = 1 - smooth(0.35, 1.25, h);
      const present = smooth(0.02, 0.3, lift) * leaving;
      doubleMaterial.uniforms.uOpacity.value = present * (wide ? 0.95 : 0.6);
      bodyMaterial.uniforms.uOpacity.value =
        (1 - lift * 0.55) * (1 - smooth(0.0, 1.3, h)) * (wide ? 0.75 : 0.6);
      bodyMaterial.uniforms.uTime.value = t;
      doubleMaterial.uniforms.uTime.value = t;

      // The cord runs from just under the double to the body, and on past it.
      const top = double.position;
      cordUniforms.uTop.value.set(top.x, top.y - 0.35 * double.scale.x, top.z);
      cordUniforms.uBottom.value.set(
        sleeper.position.x,
        sleeper.position.y - halfH * 1.1,
        sleeper.position.z,
      );
      cordUniforms.uTime.value = t;
      cordUniforms.uWidth.value = Math.max(0.035, scale * 0.05);
      cordUniforms.uOpacity.value =
        smooth(0.15, 0.5, lift) * (1 - smooth(1.2, 3.2, h)) * (wide ? 1 : 0.85);
    },

    render(renderer, camera) {
      renderer.render(scene, camera);
    },
  };
}
