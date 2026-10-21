// بطل الصفحة الرئيسية: صورة السجن، وفوقها مشهد ثلاثي الأبعاد:
// دخان أحمر خافت، غبار في ضوء النافذة، قطرات دم تسقط في العمق،
// وفي الأعلى الستارة السوداء التي يقطر منها الدم (curtain.js).
import * as THREE from "three";
import { reduceMotion } from "../core/motion.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { gsap } from "gsap";
import { createCurtainLayer } from "./curtain.js";

// الدخان: نسيج ضوضاء محسوب مرة واحدة، يُقرأ مرتين بسرعتين مختلفتين
const smokeFragment = /* glsl */ `
  precision highp float;
  uniform vec2 uRes;
  uniform float uTime;
  uniform float uIntro;
  uniform sampler2D uNoise;
  void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    if (uv.y > 0.66) discard;
    float aspect = uRes.x / uRes.y;
    float t = uTime;
    float n1 = texture2D(uNoise, uv * vec2(aspect * 0.55, 0.9) + vec2(t * 0.012, -t * 0.004)).r;
    float n2 = texture2D(uNoise, uv * vec2(aspect * 1.2, 1.9) + vec2(-t * 0.02, t * 0.006) + n1 * 0.18).r;
    float n = n1 * 0.62 + n2 * 0.38;
    float low = smoothstep(0.64, 0.0, uv.y);
    float a = smoothstep(0.42, 0.8, n) * low * 0.55 * uIntro;
    vec3 c = mix(vec3(0.07, 0.008, 0.012), vec3(0.32, 0.03, 0.05), n);
    gl_FragColor = vec4(c, a);
  }
`;

function noiseTexture(size = 128) {
  // ضوضاء قيمية متكررة الحواف (fbm بأربع طبقات)
  const lattice = (period) => {
    const g = new Float32Array(period * period);
    for (let i = 0; i < g.length; i++) g[i] = Math.random();
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y);
      const fx = x - xi, fy = y - yi;
      const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
      const at = (i, j) => g[((j % period) + period) % period * period + (((i % period) + period) % period)];
      const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
      return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
    };
  };
  const octaves = [4, 8, 16, 32].map((p) => ({ p, f: lattice(p) }));
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0, amp = 0.5, norm = 0;
      for (const o of octaves) {
        v += amp * o.f((x / size) * o.p, (y / size) * o.p);
        norm += amp;
        amp *= 0.5;
      }
      const k = (y * size + x) * 4;
      data[k] = data[k + 1] = data[k + 2] = Math.round((v / norm) * 255);
      data[k + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function teardropGeometry() {
  // قطرة: قاع مستدير ورأس مدبّب، من دوران منحنى حول المحور
  const pts = [];
  const steps = 28;
  for (let i = steps; i >= 0; i--) {
    const t = (i / steps) * Math.PI;
    const x = Math.sin(t) * Math.pow(Math.sin(t / 2), 1.15);
    const y = Math.cos(t) * 1.25;
    pts.push(new THREE.Vector2(Math.max(x, 0.0001), y));
  }
  const g = new THREE.LatheGeometry(pts, 24);
  g.computeVertexNormals();
  return g;
}

function dotTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,230,210,1)");
  g.addColorStop(0.35, "rgba(255,190,150,0.45)");
  g.addColorStop(1, "rgba(255,160,120,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function mountHero({ canvas, photo, title, lines, headerBand }) {
  const reduce = reduceMotion;
  const small = window.matchMedia("(max-width: 47.99em)").matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  // ---------- المشهد ثلاثي الأبعاد ----------
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 60);
  camera.position.set(0, 0, 8);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();

  const windowLight = new THREE.DirectionalLight(0xffd2c2, 2.6);
  windowLight.position.set(3, 5, 4);
  scene.add(windowLight);
  const rim = new THREE.DirectionalLight(0xff3b2a, 1.4);
  rim.position.set(-4, -1, -3);
  scene.add(rim);

  const MAX_DROPS = small ? 60 : 120;
  const dropMat = new THREE.MeshPhysicalMaterial({
    color: 0x5a0309,
    emissive: 0x140002,
    roughness: 0.08,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    ior: 1.38,
    specularIntensity: 1,
  });
  const drops = new THREE.InstancedMesh(teardropGeometry(), dropMat, MAX_DROPS);
  drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  drops.count = 0;
  drops.frustumCulled = false;
  scene.add(drops);

  const active = [];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();

  // غبار في ضوء النافذة
  const DUST = small ? 110 : 240;
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(DUST * 3);
  const dustSeed = new Float32Array(DUST);
  for (let i = 0; i < DUST; i++) {
    dustPos[i * 3] = THREE.MathUtils.randFloat(-1, 3.6);
    dustPos[i * 3 + 1] = THREE.MathUtils.randFloat(-2.2, 2.6);
    dustPos[i * 3 + 2] = THREE.MathUtils.randFloat(-3, 2.5);
    dustSeed[i] = Math.random() * 100;
  }
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({
    size: 0.045,
    map: dotTexture(),
    color: 0xe3a585,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  scene.add(dust);

  // ---------- الدخان ----------
  const smokeMat = new THREE.ShaderMaterial({
    vertexShader: "void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: smokeFragment,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uRes: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uIntro: { value: reduce ? 1 : 0 },
      uNoise: { value: noiseTexture() },
    },
  });
  const smokeScene = new THREE.Scene();
  const smokeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), smokeMat);
  smokeQuad.frustumCulled = false;
  smokeScene.add(smokeQuad);
  const flatCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // ---------- الستارة ----------
  const band = headerBand();
  let size = { w: 1, h: 1 };
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hit = new THREE.Vector3();

  function screenToWorld(x, y, z) {
    ndc.set((x / size.w) * 2 - 1, -(y / size.h) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    plane.constant = -z;
    return ray.ray.intersectPlane(plane, hit) ? hit.clone() : null;
  }

  function halfHeightAt(z) {
    return Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * (camera.position.z - z);
  }

  function spawn({ x, y, z, r, vy = 0, vz = 0 }) {
    if (active.length >= MAX_DROPS) active.shift();
    active.push({
      p: new THREE.Vector3(x, y, z),
      v: new THREE.Vector3(THREE.MathUtils.randFloatSpread(0.04), vy, vz),
      r,
      spin: THREE.MathUtils.randFloatSpread(0.6),
      wob: Math.random() * 6,
    });
  }

  const curtain = createCurtainLayer({
    band,
    seep: small ? 10 : 14,
    density: small ? 46 : 62,
    maxLen: small ? [50, 190] : [70, 300],
    onDetach(x, y, r) {
      if (reduce) return;
      const z = THREE.MathUtils.randFloat(0.6, 2.2);
      const w = screenToWorld(x, y, z);
      if (!w) return;
      const unitsPerPx = (halfHeightAt(z) * 2) / size.h;
      spawn({ x: w.x, y: w.y, z, r: r * unitsPerPx * 0.95, vy: -0.25, vz: THREE.MathUtils.randFloat(0, 0.25) });
    },
  });

  // الجودة تتكيّف: تبدأ بدقة الشاشة (بحد أقصى) وتنزل إذا تباطأ الجهاز
  let maxDpr = Math.min(window.devicePixelRatio || 1, small ? 1.25 : 1.5);
  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    size = { w, h };
    const dpr = maxDpr;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    smokeMat.uniforms.uRes.value.set(w * dpr, h * dpr);
    curtain.setSize(w, h, dpr);
  }
  resize();
  new ResizeObserver(resize).observe(canvas);

  // ---------- التفاعل: عمق يتبع المؤشر ----------
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  if (!reduce) {
    window.addEventListener(
      "pointermove",
      (ev) => {
        pointer.tx = (ev.clientX / window.innerWidth) * 2 - 1;
        pointer.ty = (ev.clientY / window.innerHeight) * 2 - 1;
      },
      { passive: true },
    );
  }
  const photoX = photo ? gsap.quickTo(photo, "x", { duration: 1.2, ease: "power2.out" }) : null;
  const photoY = photo ? gsap.quickTo(photo, "y", { duration: 1.2, ease: "power2.out" }) : null;

  // ---------- الحلقة ----------
  const timer = new THREE.Timer();
  timer.connect(document);
  let ambientClock = 0;

  function step(dt, t) {
    pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 2.5);
    pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 2.5);
    camera.position.x = pointer.x * 0.45;
    camera.position.y = -pointer.y * 0.25;
    camera.lookAt(0, 0, 0);
    curtain.setLight(0.55 - pointer.x * 0.35, 0.65 + pointer.y * 0.2);

    // قطرات بعيدة في عتمة الزنزانة
    ambientClock -= dt;
    if (ambientClock <= 0) {
      ambientClock = THREE.MathUtils.randFloat(0.35, 0.9) * (small ? 1.6 : 1);
      const z = THREE.MathUtils.randFloat(-7, -1);
      const hh = halfHeightAt(z);
      const hw = hh * camera.aspect;
      spawn({ x: THREE.MathUtils.randFloatSpread(hw * 1.9), y: hh + 0.4, z, r: THREE.MathUtils.randFloat(0.035, 0.06), vy: -0.6 });
    }

    const g = 5.2;
    let n = 0;
    for (let i = active.length - 1; i >= 0; i--) {
      const d = active[i];
      d.v.y = Math.max(d.v.y - g * dt, -7.5);
      d.p.addScaledVector(d.v, dt);
      if (d.p.y < -halfHeightAt(d.p.z) - 0.6) {
        active.splice(i, 1);
      }
    }
    for (const d of active) {
      const stretch = 1 + Math.min(-d.v.y, 7.5) * 0.06;
      e.set(Math.sin(t * 3 + d.wob) * 0.06, d.spin * t, Math.sin(t * 2.3 + d.wob) * 0.05);
      q.setFromEuler(e);
      pos.copy(d.p);
      scl.set(d.r, d.r * stretch, d.r);
      m4.compose(pos, q, scl);
      drops.setMatrixAt(n++, m4);
    }
    drops.count = n;
    drops.instanceMatrix.needsUpdate = true;

    // الغبار يطفو ببطء
    const arr = dustGeo.attributes.position.array;
    for (let i = 0; i < DUST; i++) {
      const s = dustSeed[i];
      arr[i * 3] += Math.sin(t * 0.3 + s) * 0.0009;
      arr[i * 3 + 1] += 0.0016 + Math.cos(t * 0.21 + s) * 0.0007;
      if (arr[i * 3 + 1] > 2.8) arr[i * 3 + 1] = -2.3;
    }
    dustGeo.attributes.position.needsUpdate = true;

    smokeMat.uniforms.uTime.value = t;
    curtain.update(dt, t);
    if (photoX) {
      photoX(pointer.x * -10);
      photoY(pointer.y * -6);
    }
  }

  function render() {
    renderer.clear();
    renderer.render(smokeScene, flatCam);
    renderer.render(scene, camera);
    renderer.render(curtain.scene, curtain.camera);
  }

  const perf = { frames: 0, time: 0, checks: 0, warm: 90 };
  function adapt(rawDt) {
    if (perf.checks >= 3) return;
    if (perf.warm > 0) {
      perf.warm--; // تجاهل إطارات تجميع الشيدر الأولى
      return;
    }
    perf.frames++;
    perf.time += rawDt;
    if (perf.frames < 45) return;
    const fps = perf.frames / perf.time;
    perf.frames = 0;
    perf.time = 0;
    perf.checks++;
    if (fps < 42 && maxDpr > 0.75) {
      maxDpr = Math.max(0.75, maxDpr - 0.25);
      resize();
    }
  }

  function frame() {
    timer.update();
    const raw = timer.getDelta();
    adapt(raw);
    const dt = Math.min(raw, 1 / 20);
    step(dt, timer.getElapsed());
    render();
  }

  // ---------- الافتتاحية: ستارة تنزل، الصورة تخرج من العتمة، ثم يُكتب الاسم ----------
  const intro = { curtain: reduce ? 1 : 0, dust: reduce ? 0.55 : 0 };
  curtain.setIntro(intro.curtain);

  if (reduce) {
    // إطار واحد ثابت: قطرات معلّقة في منتصف سقوطها
    for (let i = 0; i < (small ? 8 : 16); i++) {
      const z = THREE.MathUtils.randFloat(-6, 2);
      const hh = halfHeightAt(z);
      spawn({
        x: THREE.MathUtils.randFloatSpread(hh * camera.aspect * 1.8),
        y: THREE.MathUtils.randFloat(-hh * 0.8, hh * 0.6),
        z,
        r: THREE.MathUtils.randFloat(0.04, 0.07),
        vy: -THREE.MathUtils.randFloat(1, 5),
      });
    }
    step(0.0001, 0);
    curtain.update(0, 0);
    dustMat.opacity = 0.5;
    render();
    new ResizeObserver(() => {
      curtain.update(0, 0);
      render();
    }).observe(canvas);
    gsap.set([photo, title, ...lines], { opacity: 1, clearProps: "transform" });
    title?.style.setProperty("--ink", "0%");
    return { renderer };
  }

  const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
  tl.to(intro, {
    curtain: 1,
    duration: 1.2,
    ease: "power3.inOut",
    onUpdate: () => curtain.setIntro(intro.curtain),
  })
    .to(smokeMat.uniforms.uIntro, { value: 1, duration: 2.4 }, 0.3)
    .fromTo(photo, { opacity: 0, scale: 1.05 }, { opacity: 1, scale: 1, duration: 2, ease: "power2.out" }, 0.25)
    .to(dustMat, { opacity: 0.55, duration: 2 }, 0.9)
    .fromTo(title, { "--ink": "100%", opacity: 1 }, { "--ink": "0%", duration: 1.7, ease: "power1.inOut" }, 0.8)
    .fromTo(lines, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.9, stagger: 0.2 }, 1.7);

  // الافتتاحية الكاملة مرة واحدة في الجلسة، وعند العودة للرئيسية نسخة سريعة
  try {
    if (sessionStorage.getItem("kadhim-intro-seen")) tl.timeScale(2.6);
    sessionStorage.setItem("kadhim-intro-seen", "1");
  } catch {
    /* التخزين غير متاح: تبقى الافتتاحية الكاملة */
  }

  const io = new IntersectionObserver(([entry]) => {
    renderer.setAnimationLoop(entry.isIntersecting ? frame : null);
  });
  io.observe(canvas);

  return { renderer, timeline: tl };
}
