/**
 * The three-card spread, in 3D.
 *
 * Real card geometry, not a flipped image: each card is a rounded slab with a
 * front face, a back face and a foil edge, so it has a thickness you can see as
 * it turns. The fronts are the app's own original artwork. The back is drawn
 * here in a canvas and matches the brand: midnight ground, a violet ring and
 * ray motif around the Synchroneers mark, gold hairlines.
 *
 * It renders into the sky's canvas, after the sky and the dream layers and
 * after a depth clear, so there is still one WebGL context on the page. The
 * cards are positioned in screen pixels: the camera is set so one world unit
 * is one CSS pixel at z = 0, which lets the three face-up resting positions be
 * read straight off the layout. The page's CSS decides where the slots are at
 * every screen size, and the 3D cards land exactly on them.
 *
 * Scroll timeline, as progress p through the pinned section (0 at the moment
 * its stage sticks, 1 as it lets go):
 *
 *   0.00 - 0.12   a face-down deck of six hangs in the air, drifting
 *   0.12 - 0.45   three cards fan out to the slots; the other three drift
 *                 away into the background and dim
 *   0.50 - 0.98   the cards turn over one after another, each taking about a
 *                 fifth of the scroll, rising towards the viewer mid-turn
 *
 * Before the pin catches, the deck simply rides in with the section; after it
 * lets go, the spread leaves with it. Opacity follows the section's position,
 * so the cards fade in and out rather than being cut by the viewport edge.
 *
 * Pointer tilt (fine pointers only) leans every card towards the cursor once
 * the spread is open, and the foil highlight slides with it.
 *
 * Reduced motion and no WebGL never reach this file: the page's own DOM
 * images are the fallback, and they are the same three cards laid face-up.
 */

const CARD_ASPECT = 0.62; // width / height, applied by cover-cropping the art
const THICKNESS = 0.014; // in card widths
const RADIUS = 0.055; // in card widths
const MAIN = 3;

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

/** A tiny seeded generator, so the back's star field is the same every load. */
function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/* ---------------- Card back ---------------- */

/**
 * The back of the card, drawn at 512 x 826. Everything is stroked geometry
 * plus the logo, so it reads as the same family as the perspective sigils.
 */
function drawBack(ctx, w, h, logo) {
  const cx = w / 2;
  const cy = h / 2;

  const ground = ctx.createRadialGradient(cx, cy, 20, cx, cy, h * 0.62);
  ground.addColorStop(0, '#1b2352');
  ground.addColorStop(0.55, '#0f1636');
  ground.addColorStop(1, '#070b1d');
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, w, h);

  // A faint star field, so the card is made of the same thing as the sky.
  const random = seeded(7);
  for (let i = 0; i < 110; i++) {
    const x = random() * w;
    const y = random() * h;
    const r = 0.5 + random() * 1.3;
    ctx.fillStyle = `rgba(214, 220, 255, ${0.15 + random() * 0.5})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Rays: sixteen, alternating long and short, the sigils' vocabulary.
  ctx.save();
  ctx.translate(cx, cy);
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2;
    const inner = 118;
    const outer = i % 2 === 0 ? 236 : 178;
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(185, 164, 255, 0.55)' : 'rgba(125, 140, 240, 0.4)';
    ctx.lineWidth = i % 2 === 0 ? 2 : 1.4;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
    ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
    ctx.stroke();
  }

  // Rings: one solid, one dashed, one gold hairline.
  ctx.strokeStyle = 'rgba(154, 124, 255, 0.75)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 112, 0, Math.PI * 2);
  ctx.stroke();

  ctx.setLineDash([3, 9]);
  ctx.strokeStyle = 'rgba(185, 164, 255, 0.5)';
  ctx.beginPath();
  ctx.arc(0, 0, 252, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = 'rgba(242, 185, 103, 0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, 96, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // The mark itself, glowing, or a plain star if the logo has not arrived.
  if (logo) {
    ctx.save();
    ctx.shadowColor = 'rgba(154, 124, 255, 0.9)';
    ctx.shadowBlur = 34;
    ctx.drawImage(logo, cx - 70, cy - 70, 140, 140);
    ctx.restore();
  } else {
    ctx.fillStyle = 'rgba(185, 164, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.fill();
  }

  // A crescent at the head and the foot: the lit disc minus an offset disc.
  // Cutting the shadow disc out would erase the ground too, so each crescent
  // is drawn on a scratch canvas and stamped on.
  for (const [x, y, flip] of [
    [cx, 96, false],
    [cx, h - 96, true],
  ]) {
    const scratch = document.createElement('canvas');
    scratch.width = 90;
    scratch.height = 90;
    const sctx = scratch.getContext('2d');
    sctx.translate(45, 45);
    sctx.fillStyle = 'rgba(242, 185, 103, 0.9)';
    sctx.beginPath();
    sctx.arc(0, 0, 22, 0, Math.PI * 2);
    sctx.fill();
    sctx.globalCompositeOperation = 'destination-out';
    sctx.beginPath();
    sctx.arc(9, -4, 19, 0, Math.PI * 2);
    sctx.fill();
    ctx.save();
    ctx.translate(x, y);
    if (flip) ctx.rotate(Math.PI);
    ctx.drawImage(scratch, -45, -45);
    ctx.restore();
  }

  // Corner stars.
  const star = (x, y, r) => {
    ctx.fillStyle = 'rgba(242, 185, 103, 0.85)';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const rr = i % 2 === 0 ? r : r * 0.3;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  };
  for (const [x, y] of [
    [58, 58],
    [w - 58, 58],
    [58, h - 58],
    [w - 58, h - 58],
  ]) {
    star(x, y, 9);
  }

  // Double frame: violet outside, gold inside.
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(154, 124, 255, 0.8)';
  ctx.strokeRect(20, 20, w - 40, h - 40);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(242, 185, 103, 0.7)';
  ctx.strokeRect(30, 30, w - 60, h - 60);
}

/* ---------------- Spread ---------------- */

/**
 * @param THREE    the vendored module
 * @param renderer the sky's renderer (shared, never created here)
 * @param options  section: the tall pinned <section>
 *                 slots: the three <img> elements, in spread order
 *                 extras: image URLs for the cards that drift in the background
 *                 captions: the three caption elements, shown as cards turn
 */
export function createTarot(THREE, renderer, { section, slots, extras, captions }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 10, 6000);
  const FOV_TAN = Math.tan((30 * Math.PI) / 360);

  const anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());

  /* ---------- Textures ---------- */

  const backCanvas = document.createElement('canvas');
  backCanvas.width = 512;
  backCanvas.height = 826;
  const backContext = backCanvas.getContext('2d');
  drawBack(backContext, 512, 826, null);

  const backTexture = new THREE.CanvasTexture(backCanvas);
  backTexture.anisotropy = anisotropy;

  // The logo arrives later; redraw the back around it when it does.
  const logo = new Image();
  logo.onload = () => {
    drawBack(backContext, 512, 826, logo);
    backTexture.needsUpdate = true;
  };
  logo.src = 'assets/logo.png';

  /** Wrap an <img> or Image in a texture once it has decoded. */
  function textureFrom(image, onReady) {
    const texture = new THREE.Texture(image);
    texture.anisotropy = anisotropy;
    const ready = () => {
      texture.needsUpdate = true;
      onReady(texture, image.naturalWidth / image.naturalHeight);
    };
    if (image.complete && image.naturalWidth > 0) ready();
    else image.addEventListener('load', ready, { once: true });
    return texture;
  }

  /* ---------- Geometry ---------- */

  const height = 1 / CARD_ASPECT;

  function roundedShape() {
    const shape = new THREE.Shape();
    const x = -0.5;
    const y = -height / 2;
    const r = RADIUS;
    shape.moveTo(x + r, y);
    shape.lineTo(x + 1 - r, y);
    shape.absarc(x + 1 - r, y + r, r, -Math.PI / 2, 0, false);
    shape.lineTo(x + 1, y + height - r);
    shape.absarc(x + 1 - r, y + height - r, r, 0, Math.PI / 2, false);
    shape.lineTo(x + r, y + height);
    shape.absarc(x + r, y + height - r, r, Math.PI / 2, Math.PI, false);
    shape.lineTo(x, y + r);
    shape.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
    return shape;
  }

  const shape = roundedShape();

  // One face, with UVs remapped from shape space to 0..1.
  const faceGeometry = new THREE.ShapeGeometry(shape, 8);
  {
    const uv = faceGeometry.attributes.uv;
    const pos = faceGeometry.attributes.position;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, pos.getX(i) + 0.5, pos.getY(i) / height + 0.5);
    }
  }

  const bodyGeometry = new THREE.ExtrudeGeometry(shape, {
    depth: THICKNESS,
    bevelEnabled: false,
    curveSegments: 8,
  });
  bodyGeometry.translate(0, 0, -THICKNESS / 2);

  /* ---------- Materials ---------- */

  const faceVertex = /* glsl */ `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vWorld;
    void main() {
      vUv = uv;
      vNormal = normalize(mat3(modelMatrix) * normal);
      vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
    }
  `;

  // Shared by the iridescent foil on faces and edges.
  const foilChunk = /* glsl */ `
    vec3 foil(float phase) {
      return 0.5 + 0.5 * cos(6.2831853 * (phase + vec3(0.0, 0.33, 0.67)));
    }
  `;

  function faceMaterial({ map, aspect, hasMap }) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: map },
        uTexAspect: { value: aspect },
        uHasMap: { value: hasMap ? 1 : 0 },
        uOpacity: { value: 1 },
        uGlint: { value: 0 },
        uFoil: { value: 0.28 },
      },
      transparent: true,
      vertexShader: faceVertex,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vWorld;
        uniform sampler2D uMap;
        uniform float uTexAspect;
        uniform float uHasMap;
        uniform float uOpacity;
        uniform float uGlint;
        uniform float uFoil;
        ${foilChunk}

        void main() {
          // Cover-fit: the art is cropped to the card rather than squeezed.
          vec2 uv = vUv;
          float cardAspect = ${CARD_ASPECT.toFixed(3)};
          if (uTexAspect > cardAspect) uv.x = (uv.x - 0.5) * (cardAspect / uTexAspect) + 0.5;
          else uv.y = (uv.y - 0.5) * (uTexAspect / cardAspect) + 0.5;

          vec3 color = mix(vec3(0.05, 0.07, 0.16), texture2D(uMap, uv).rgb, uHasMap);

          // A gold hairline just inside the edge, and a soft darkening
          // towards the rim so the art sits in the card rather than on it.
          float edge = min(min(vUv.x, 1.0 - vUv.x) * cardAspect, min(vUv.y, 1.0 - vUv.y));
          color *= 0.72 + 0.28 * smoothstep(0.0, 0.07, edge);
          color = mix(color, vec3(0.95, 0.74, 0.42), 0.55 * (1.0 - smoothstep(0.0, 0.0035, abs(edge - 0.024))));

          // Foil. Fresnel-weighted iridescence that strengthens at grazing
          // angles, plus a diagonal highlight band that slides with tilt.
          vec3 viewDir = normalize(cameraPosition - vWorld);
          float facing = abs(dot(normalize(vNormal), viewDir));
          vec3 rainbow = foil(facing * 1.3 + vUv.x * 0.25 + uGlint * 0.3);
          color += rainbow * pow(1.0 - facing, 2.0) * uFoil;

          float band = exp(-pow((vUv.x * 0.8 + vUv.y * 0.6 - uGlint) * 9.0, 2.0));
          color += rainbow * band * 0.2 + vec3(1.0) * band * 0.05;

          gl_FragColor = vec4(color, uOpacity);
        }
      `,
    });
  }

  function edgeMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 1 }, uGlint: { value: 0 } },
      transparent: true,
      vertexShader: faceVertex,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec3 vNormal;
        varying vec3 vWorld;
        uniform float uOpacity;
        uniform float uGlint;
        ${foilChunk}
        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorld);
          float facing = abs(dot(normalize(vNormal), viewDir));
          // The edge is the brightest, most colourful part of the card: it
          // is the one place the foil has nothing to compete with.
          vec3 color = foil(facing * 0.9 + vWorld.y * 0.004 + uGlint * 0.4) * 0.85 + 0.15;
          gl_FragColor = vec4(color, uOpacity);
        }
      `,
    });
  }

  const capMaterial = new THREE.MeshBasicMaterial({ color: 0x0b1030 });

  /* ---------- Cards ---------- */

  const cards = [];

  function makeCard(frontImage, { main }) {
    const group = new THREE.Group();

    const front = faceMaterial({ map: null, aspect: 0.62, hasMap: false });
    const back = faceMaterial({ map: backTexture, aspect: CARD_ASPECT, hasMap: true });
    back.uniforms.uFoil.value = 0.18;
    const edge = edgeMaterial();

    textureFrom(frontImage, (texture, aspect) => {
      front.uniforms.uMap.value = texture;
      front.uniforms.uTexAspect.value = aspect;
      front.uniforms.uHasMap.value = 1;
    });

    const body = new THREE.Mesh(bodyGeometry, [capMaterial, edge]);
    const frontFace = new THREE.Mesh(faceGeometry, front);
    frontFace.position.z = THICKNESS / 2 + 0.0004;
    const backFace = new THREE.Mesh(faceGeometry, back);
    backFace.rotation.y = Math.PI;
    backFace.position.z = -THICKNESS / 2 - 0.0004;

    for (const mesh of [body, frontFace, backFace]) mesh.frustumCulled = false;
    group.add(body, frontFace, backFace);
    scene.add(group);

    const card = { group, front, back, edge, main, shown: false };
    cards.push(card);
    return card;
  }

  const mainCards = slots.map((image) => makeCard(image, { main: true }));
  for (const url of extras) {
    const image = new Image();
    image.src = url;
    makeCard(image, { main: false });
  }

  /* ---------- Layout ---------- */

  let W = 1;
  let H = 1;
  let cameraDistance = 1;

  function resize(width, height) {
    W = width;
    H = height;
    cameraDistance = H / 2 / FOV_TAN;
    camera.aspect = W / H;
    camera.position.set(0, 0, cameraDistance);
    camera.far = cameraDistance * 6;
    camera.updateProjectionMatrix();
  }

  // Where the extras settle, as fractions of the stage, and how deep.
  const EXTRA_HOMES = [
    { x: -0.62, y: -0.5, z: -420, spin: 0.35 },
    { x: 0.66, y: -0.46, z: -520, spin: -0.3 },
    { x: 0.5, y: 0.66, z: -380, spin: 0.25 },
  ];

  const rect = { x: 0, y: 0, w: 1, h: 1 };

  /**
   * Draw one frame. Returns without drawing when the section is off screen, so
   * a page that is mostly not about tarot pays nothing for it.
   */
  function draw(director) {
    const bounds = section.getBoundingClientRect();
    if (bounds.bottom < -80 || bounds.top > H + 80) {
      return false;
    }

    // Progress through the pin. The section is taller than the screen by
    // exactly the scroll the pin consumes.
    const travel = Math.max(1, bounds.height - H);
    const p = Math.min(1, Math.max(0, -bounds.top / travel));

    // Fade with the section's position, so the deck arrives and the spread
    // leaves rather than being cut by the viewport edge.
    const visible =
      smooth(H, H * 0.45, bounds.top) * smooth(0, H * 0.5, bounds.bottom);

    const t = director.time;
    const slotRects = slots.map((image) => image.getBoundingClientRect());

    // The stage is the box around the three slots.
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const r of slotRects) {
      minX = Math.min(minX, r.left);
      maxX = Math.max(maxX, r.right);
      minY = Math.min(minY, r.top);
      maxY = Math.max(maxY, r.bottom);
    }
    rect.x = (minX + maxX) / 2;
    rect.y = (minY + maxY) / 2;
    rect.w = maxX - minX;
    rect.h = maxY - minY;

    const slotWidth = slotRects[0].width;
    const fan = smooth(0.12, 0.45, p);
    const px = director.pointer.x;
    const py = director.pointer.y;

    const toWorldX = (x) => x - W / 2;
    const toWorldY = (y) => H / 2 - y;

    mainCards.forEach((card, i) => {
      const slot = slotRects[i];
      const slotX = slot.left + slot.width / 2;
      const slotY = slot.top + slot.height / 2;

      // Flip: each card owns a fifth of the scroll, staggered.
      const start = 0.5 + i * 0.16;
      const flip = smooth(start, start + 0.2, p);
      const lift = Math.sin(flip * Math.PI);

      // The deck: stacked at the centre, bobbing on its own phase.
      const bob = Math.sin(t * 0.7 + i * 2.1);
      const deckX = rect.x + (i - 1) * 7;
      const deckY = rect.y + bob * 9 - i * 3;
      const deckScale = slotWidth * 0.95;

      // The spread: on the slots, fanned a little like a hand.
      const spreadY = slotY + (i === 1 ? 0 : 14) - lift * 18;

      const x = lerp(deckX, slotX, fan);
      const y = lerp(deckY, spreadY, fan);
      const z = lerp(-i * 5, 0, fan) + lift * 130;
      const scale = lerp(deckScale, slotWidth, fan) * (1 + lift * 0.07);

      // The deck turns slowly in the air, and settles as it opens.
      const sway = 1 - fan * 0.85;
      const rotZ = lerp((i - 1) * 0.05 + Math.sin(t * 0.5 + i) * 0.04, (1 - i) * 0.07, fan);
      const rotY =
        lerp(Math.PI, 0, flip < 0.5 ? 2 * flip * flip : 1 - 2 * (1 - flip) * (1 - flip)) +
        Math.sin(t * 0.4 + i * 1.7) * 0.16 * sway +
        px * 0.3 * fan * (1 - lift * 0.5);
      const rotX = Math.cos(t * 0.35 + i) * 0.07 * sway - py * 0.2 * fan;

      card.group.position.set(toWorldX(x), toWorldY(y), z);
      card.group.rotation.set(rotX, rotY, rotZ, 'XYZ');
      card.group.scale.setScalar(scale);

      const glint = 0.15 + ((Math.sin(t * 0.45 + i * 1.3) + 1) / 2) * 1.2 + px * 0.5 + flip * 0.4;
      card.front.uniforms.uGlint.value = glint;
      card.back.uniforms.uGlint.value = glint;
      card.edge.uniforms.uGlint.value = glint;

      for (const material of [card.front, card.back, card.edge]) {
        material.uniforms.uOpacity.value = visible;
      }

      // The caption appears as its card finishes turning.
      const shown = flip > 0.7;
      if (shown !== card.shown) {
        card.shown = shown;
        if (captions[i]) captions[i].dataset.shown = String(shown);
      }
    });

    cards.forEach((card, index) => {
      if (card.main) return;
      const home = EXTRA_HOMES[index - MAIN];

      // The extras start inside the deck and drift out to their places.
      const out = smooth(0.1, 0.55, p);
      const drift = Math.sin(t * 0.3 + index * 1.9);
      const x = lerp(rect.x, rect.x + home.x * rect.w * 1.05, out) + drift * 14;
      const y = lerp(rect.y, rect.y + home.y * rect.h, out) + Math.cos(t * 0.27 + index) * 16;
      const z = lerp(-14, home.z, out);

      // Perspective shrinks things that are far away; counter it a little so
      // the extras stay a readable size.
      const perspective = (cameraDistance - z) / cameraDistance;

      card.group.position.set(toWorldX(x), toWorldY(y), z);
      card.group.rotation.set(
        Math.sin(t * 0.2 + index) * 0.2,
        Math.PI + Math.sin(t * 0.18 + index * 2) * 0.5,
        home.spin * out + Math.sin(t * 0.15 + index) * 0.1,
        'XYZ',
      );
      card.group.scale.setScalar(slotWidth * 0.8 * lerp(1, perspective * 0.82, out));

      const glint = ((Math.sin(t * 0.4 + index) + 1) / 2) * 1.6;
      card.front.uniforms.uGlint.value = glint;
      card.back.uniforms.uGlint.value = glint;
      card.edge.uniforms.uGlint.value = glint;

      // Faint: they are scenery, and they dim again as the section ends.
      const opacity = visible * out * 0.55;
      for (const material of [card.front, card.back, card.edge]) {
        material.uniforms.uOpacity.value = opacity;
      }
      card.group.visible = opacity > 0.01;
    });

    return true;
  }

  return {
    resize,

    render(director) {
      if (!draw(director)) return;
      // The cards sit in front of everything, including the motes, and need
      // their own depth ordering.
      renderer.clearDepth();
      renderer.render(scene, camera);
    },
  };
}
