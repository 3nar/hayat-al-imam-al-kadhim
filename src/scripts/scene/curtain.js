// الستارة السوداء التي يقطر منها الدم.
// طبقة شيدر بملء الشاشة: قماش أسود بحاشية ذهبية، ودم ينزّ من طرفه السفلي
// على شكل خيوط تنتهي بقطرة. الشكل دالة مسافة (SDF)، ويُظلَّل كسائل لامع
// ثلاثي الأبعاد عبر حقل ارتفاع يُشتق منه الاتجاه العمودي (normal).
//
// للأداء: كل بكسل يفحص أقرب ثلاث قطرات فقط (القطرات مرتّبة بفواصل متقاربة)،
// وكل ما يتغير مع الزمن لكل قطرة يُحسب في جافاسكربت لا في الشيدر.
import * as THREE from "three";
import { reduceMotion } from "../core/motion.js";

const MAX_DRIPS = 32;
const MAX_FREE = 12;

const vertexShader = /* glsl */ `
  void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  #define MAX_DRIPS ${MAX_DRIPS}
  #define MAX_FREE ${MAX_FREE}

  uniform vec2 uRes;
  uniform float uDpr;
  uniform float uTime;
  uniform float uBand;      // حافة القماش بوحدات CSS (بعد احتساب الافتتاحية)
  uniform float uSeep;      // عرض الدم المتشرب أسفل القماش
  uniform float uStep;      // المسافة بين القطرات
  uniform vec4 uDrips[MAX_DRIPS]; // x, yBottom, radius, bulb
  uniform int uDripCount;
  uniform vec4 uFree[MAX_FREE];   // x, y, radius, alpha
  uniform int uFreeCount;
  uniform vec4 uFreeBox;    // حدود الدموع الساقطة: minX, minY, maxX, maxY
  uniform vec2 uLight;

  float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
  }
  float noise1(float x) {
    float i = floor(x), f = fract(x);
    return mix(hash11(i), hash11(i + 1.0), f * f * (3.0 - 2.0 * f));
  }

  float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
  }

  float clothEdge(float x) {
    return uBand + sin(x * 0.011 + uTime * 0.18) * 2.5 + (noise1(x * 0.035) - 0.5) * 6.0;
  }

  float seepEdge(float x, float cloth) {
    return cloth + uSeep * (0.55 + 0.9 * noise1(x * 0.021 + 7.0));
  }

  float dripSDF(vec2 p, vec4 d) {
    vec2 a = vec2(d.x, uBand - 8.0);
    vec2 b = vec2(d.x, d.y);
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
    float r = mix(d.z * 1.35, d.z * 0.5, smoothstep(0.0, 0.85, h));
    float thread = length(pa - ba * h) - r;
    vec2 q = p - b;
    q.y *= q.y < 0.0 ? 0.72 : 1.0;
    float bulb = length(q) - d.z * d.w;
    return smin(thread, bulb, d.z * 1.6);
  }

  // i0: فهرس القطرة الأقرب
  float liquidSDF(vec2 p, int i0) {
    float d = p.y - seepEdge(p.x, clothEdge(p.x));
    for (int k = -1; k <= 1; k++) {
      int i = i0 + k;
      if (i < 0 || i >= uDripCount) continue;
      d = smin(d, dripSDF(p, uDrips[i]), 9.0);
    }
    return d;
  }

  float freeSDF(vec2 p, out float alpha) {
    float d = 1e5;
    alpha = 0.0;
    for (int i = 0; i < MAX_FREE; i++) {
      if (i >= uFreeCount) break;
      vec4 f = uFree[i];
      vec2 q = p - f.xy;
      q.y *= q.y < 0.0 ? 0.5 : 1.0; // ذيل الدمعة إلى الأعلى
      float di = length(q) - f.z;
      if (di < d) { d = di; alpha = f.w; }
    }
    return d;
  }

  vec3 lightLiquid(vec3 n, float thick) {
    vec3 L = normalize(vec3(uLight, 0.9));
    vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
    float diff = max(dot(n, L), 0.0);
    float spec = pow(max(dot(n, H), 0.0), 90.0);
    float spec2 = pow(max(dot(n, normalize(vec3(-0.4, 0.8, 1.6))), 0.0), 30.0);
    float fres = pow(1.0 - max(n.z, 0.0), 2.0);
    vec3 col = mix(vec3(0.42, 0.02, 0.04), vec3(0.13, 0.004, 0.012), thick * 0.8);
    col *= 0.55 + 0.6 * diff;
    col = mix(col, vec3(0.05, 0.0, 0.004), fres * 0.65);
    col += vec3(1.0, 0.78, 0.7) * spec * 0.95;
    col += vec3(0.75, 0.12, 0.1) * spec2 * 0.18;
    return col;
  }

  // ارتفاع مقطع أسطواني من المسافة الداخلية، ومنه الاتجاه العمودي
  vec3 normalFrom(vec2 grad, float d, float R, out float thick) {
    vec2 g = normalize(grad + 1e-5);
    float s = clamp(-d, 0.0, R);
    float z = sqrt(max(R * R - (R - s) * (R - s), 0.0));
    thick = z / R;
    vec3 n = normalize(vec3(g * (R - s) / max(z, 0.35), 1.0));
    n.y = -n.y;
    return n;
  }

  vec3 shadeCloth(vec2 p, float edge) {
    float fold = sin(p.x * 0.045 + noise1(p.x * 0.01) * 6.0) * 0.5 + 0.5;
    float weave = hash11(floor(p.x * 0.5) * 17.0 + floor(p.y * 0.5));
    vec3 c = vec3(0.012, 0.007, 0.008) + vec3(0.022, 0.014, 0.014) * fold;
    c *= 0.92 + 0.1 * weave;
    // حاشية ذهبية مطرّزة قرب الطرف
    float trimY = edge - 9.0;
    float trim = smoothstep(1.2, 0.0, abs(p.y - trimY));
    float stitch = step(0.5, fract(p.x / 7.0 + floor((p.y - trimY + 2.0) / 3.0) * 0.5));
    vec3 gold = vec3(0.78, 0.6, 0.27) * (0.65 + 0.35 * sin(p.x * 0.02 + uTime * 0.7));
    c = mix(c, gold * (0.55 + 0.45 * stitch), trim * 0.85);
    float trim2 = smoothstep(0.9, 0.0, abs(p.y - (trimY - 4.0)));
    c = mix(c, gold * 0.55, trim2 * 0.6);
    return c;
  }

  void main() {
    vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;

    // أقرب القطرات، وأبعد نقطة تصلها محليًا
    int i0 = int(floor(p.x / uStep));
    float reach = uBand + uSeep * 1.6 + 4.0;
    for (int k = -1; k <= 1; k++) {
      int i = i0 + k;
      if (i < 0 || i >= uDripCount) continue;
      vec4 dr = uDrips[i];
      reach = max(reach, dr.y + dr.z * dr.w + 4.0);
    }

    bool inFree = uFreeCount > 0
      && p.x > uFreeBox.x && p.y > uFreeBox.y && p.x < uFreeBox.z && p.y < uFreeBox.w;

    if (p.y > reach && !inFree) discard;

    vec4 outc = vec4(0.0);

    if (p.y <= reach) {
      float d = liquidSDF(p, i0);
      if (d < 1.0) {
        float dx = liquidSDF(p + vec2(1.0, 0.0), i0) - d;
        float dy = liquidSDF(p + vec2(0.0, 1.0), i0) - d;
        float thick;
        vec3 n = normalFrom(vec2(dx, dy), d, 8.0, thick);
        outc = vec4(lightLiquid(n, thick), smoothstep(1.0, -1.0, d));
      }
      float ce = clothEdge(p.x);
      float clothA = smoothstep(1.0, -1.0, p.y - ce);
      if (clothA > 0.0) {
        outc.rgb = mix(outc.rgb, shadeCloth(p, ce), clothA);
        outc.a = max(outc.a, clothA);
      }
    }

    if (inFree) {
      float fa;
      float df = freeSDF(p, fa);
      if (df < 1.0) {
        float t;
        float dx = freeSDF(p + vec2(1.0, 0.0), t) - df;
        float dy = freeSDF(p + vec2(0.0, 1.0), t) - df;
        float thick;
        vec3 n = normalFrom(vec2(dx, dy), df, 5.0, thick);
        float a = smoothstep(1.0, -1.0, df) * fa;
        outc.rgb = mix(outc.rgb, lightLiquid(n, thick), a);
        outc.a = max(outc.a, a);
      }
    }

    if (outc.a <= 0.002) discard;
    // الألوان مكتوبة بفضاء العرض مباشرة (sRGB) فلا تحويل هنا
    gl_FragColor = outc;
  }
`;

const rand = (a, b) => a + Math.random() * (b - a);

/**
 * طبقة الستارة: تُرسم بعد المشهد ثلاثي الأبعاد في نفس الـ renderer.
 * onDetach(xCss, yCss, radiusCss) يُستدعى حين تنفصل قطرة عن خيطها.
 */
export function createCurtainLayer({
  band = 84,
  seep = 14,
  density = 64,
  maxLen = [70, 320],
  shortRatio = 0.35,
  freeDrops = false,
  onDetach = null,
} = {}) {
  const drips = [];
  const free = [];
  let width = 0;
  let height = 1;
  let step = density;
  let intro = 1;
  let time = 0;

  const dripUniform = Array.from({ length: MAX_DRIPS }, () => new THREE.Vector4());
  const freeUniform = Array.from({ length: MAX_FREE }, () => new THREE.Vector4());

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uRes: { value: new THREE.Vector2(1, 1) },
      uDpr: { value: 1 },
      uTime: { value: 0 },
      uBand: { value: band },
      uSeep: { value: seep },
      uStep: { value: density },
      uDrips: { value: dripUniform },
      uDripCount: { value: 0 },
      uFree: { value: freeUniform },
      uFreeCount: { value: 0 },
      uFreeBox: { value: new THREE.Vector4() },
      uLight: { value: new THREE.Vector2(0.55, 0.65) },
    },
  });

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  function makeDrip(x, initial) {
    const isShort = Math.random() < shortRatio;
    const max = isShort ? rand(14, 46) : rand(maxLen[0], maxLen[1]);
    return {
      x,
      sway: Math.random() * 6,
      max,
      len: initial ? rand(0.15, 0.85) * max : rand(0, 8),
      speed: isShort ? rand(1.5, 4) : rand(5, 16),
      r: isShort ? rand(2.6, 4.2) : rand(3.2, 6.2),
      detaches: !isShort,
      recoil: 0,
      recoilTo: 0,
    };
  }

  function layout(w) {
    width = w;
    const count = Math.max(6, Math.min(MAX_DRIPS, Math.round(w / density)));
    step = w / count;
    drips.length = 0;
    for (let i = 0; i < count; i++) {
      // انحراف محدود حتى تبقى كل قطرة في خانتها فيكفي الشيدر فحص الجيران
      drips.push(makeDrip((i + 0.5 + rand(-0.28, 0.28)) * step, true));
    }
    material.uniforms.uStep.value = step;
  }

  function setSize(w, h, dpr) {
    material.uniforms.uRes.value.set(Math.round(w * dpr), Math.round(h * dpr));
    material.uniforms.uDpr.value = dpr;
    if (Math.abs(w - width) > 40 || drips.length === 0) layout(w);
    height = h;
  }

  function bandNow() {
    return band * intro;
  }

  function update(dt, t) {
    time = t;
    const top = bandNow() + seep * intro * 0.9;
    for (const d of drips) {
      if (d.recoil > 0) {
        // ارتداد الخيط بعد انفصال القطرة
        d.recoil = Math.max(0, d.recoil - dt);
        d.len += (d.recoilTo - d.len) * Math.min(1, dt * 9);
        continue;
      }
      const k = d.len / d.max;
      d.len += d.speed * dt * (0.6 + k * k * 2.2); // يتسارع كلما ثقلت القطرة
      if (d.len >= d.max) {
        if (d.detaches) {
          const y = top + d.len;
          onDetach?.(d.x, y, d.r * 1.25);
          if (freeDrops) spawnFree(d.x, y + 2, d.r * 1.05);
          d.recoil = 0.35;
          d.recoilTo = d.len * 0.42;
          d.max = rand(maxLen[0], maxLen[1]);
          d.speed = rand(5, 16);
        } else {
          d.len = d.max;
        }
      }
    }
    for (let i = free.length - 1; i >= 0; i--) {
      const f = free[i];
      f.vy = Math.min(f.vy + 1100 * dt, 900);
      f.y += f.vy * dt;
      f.r = f.r0 * (1 + Math.min(f.vy / 900, 1) * 0.08);
      if (f.y > height + 20) free.splice(i, 1);
      else if (f.y > height * 0.82) f.a = Math.max(0, f.a - dt * 2.4);
    }
    write();
  }

  function spawnFree(x, y, r) {
    if (free.length >= MAX_FREE) free.shift();
    free.push({ x, y, r0: r, r, vy: 40, a: 1 });
  }

  function write() {
    const u = material.uniforms;
    u.uTime.value = time;
    u.uBand.value = bandNow();
    u.uSeep.value = seep * intro;
    const top = bandNow() + seep * intro * 0.9;
    const n = Math.min(drips.length, MAX_DRIPS);
    for (let i = 0; i < n; i++) {
      const d = drips[i];
      const bulb = d.detaches ? 1.05 + (d.len / d.max) * 0.75 : 1.1;
      const x = d.x + Math.sin(time * 0.6 + d.sway) * 0.6;
      dripUniform[i].set(x, top + Math.max(d.len, 0) * intro, d.r, bulb);
    }
    u.uDripCount.value = n;

    const m = Math.min(free.length, MAX_FREE);
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (let i = 0; i < m; i++) {
      const f = free[i];
      freeUniform[i].set(f.x, f.y, f.r, f.a);
      minX = Math.min(minX, f.x - f.r * 2);
      maxX = Math.max(maxX, f.x + f.r * 2);
      minY = Math.min(minY, f.y - f.r * 3);
      maxY = Math.max(maxY, f.y + f.r * 2);
    }
    u.uFreeCount.value = m;
    u.uFreeBox.value.set(minX, minY, maxX, maxY);
  }

  function setIntro(v) {
    intro = v;
  }

  function setLight(x, y) {
    material.uniforms.uLight.value.set(x, y);
  }

  function dispose() {
    quad.geometry.dispose();
    material.dispose();
  }

  return { scene, camera, setSize, update, setIntro, setLight, dispose, write };
}

/** ستارة مستقلة لكانفاس خاص (التذييل). تتوقف حين تخرج من الشاشة. */
export function mountStandaloneCurtain(canvas, options = {}) {
  const reduce = reduceMotion;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: "low-power" });
  } catch {
    return null;
  }
  renderer.setClearColor(0x000000, 0);
  const layer = createCurtainLayer({ freeDrops: !reduce, ...options });
  const timer = new THREE.Timer();
  timer.connect(document);

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    layer.setSize(w, h, dpr);
    if (reduce) {
      layer.update(0, 0);
      renderer.render(layer.scene, layer.camera);
    }
  }

  function frame() {
    timer.update();
    const dt = Math.min(timer.getDelta(), 1 / 20);
    layer.update(dt, timer.getElapsed());
    renderer.render(layer.scene, layer.camera);
  }

  resize();
  new ResizeObserver(resize).observe(canvas);
  if (reduce) return { renderer, layer };

  const io = new IntersectionObserver(([entry]) => {
    renderer.setAnimationLoop(entry.isIntersecting ? frame : null);
  });
  io.observe(canvas);
  return { renderer, layer };
}
