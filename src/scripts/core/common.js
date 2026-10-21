// ما تشترك فيه كل الصفحات: القائمة، الستارة الدامية أعلى الصفحة وفي التذييل،
// وظهور المحتوى عند التمرير.
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { reduceMotion } from "./motion.js";

gsap.registerPlugin(ScrollTrigger);

export { reduceMotion };

/* ---------- القائمة (موبايل) ---------- */
function initMenu() {
  const menu = document.querySelector("[data-menu]");
  const openBtn = document.querySelector("[data-menu-open]");
  const closeBtn = document.querySelector("[data-menu-close]");
  if (!menu || !openBtn) return;

  const focusables = () => [...menu.querySelectorAll("a, button")];

  function open() {
    menu.classList.add("is-open");
    openBtn.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
    closeBtn.focus();
  }
  function close() {
    menu.classList.remove("is-open");
    openBtn.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
    openBtn.focus();
  }

  openBtn.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  menu.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
    if (e.key === "Tab") {
      const els = focusables();
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
}

/* ---------- قطرات ثابتة: مسار SVG لخيط دم ينتهي بقطرة ---------- */
function dripPath(x, len, top, neck, r) {
  const yc = len - r * 0.9;
  return [
    `M${x - top} 0`,
    `C${x - top} ${len * 0.3} ${x - neck} ${len * 0.42} ${x - neck} ${yc}`,
    `A${r} ${r} 0 1 0 ${x + neck} ${yc}`,
    `C${x + neck} ${len * 0.42} ${x + top} ${len * 0.3} ${x + top} 0Z`,
  ].join(" ");
}

let gradientId = 0;
export function renderStaticDrips(svg, { spacing = 120, min = 6, max = 46, seep = 5 } = {}) {
  const width = Math.round(svg.getBoundingClientRect().width) || 1200;
  const height = max + 14;
  const id = `blood-${++gradientId}`;
  let seed = 7;
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const parts = [];
  const shines = [];
  const count = Math.max(4, Math.round(width / spacing));
  for (let i = 0; i < count; i++) {
    const x = (i + 0.5 + (rnd() - 0.5) * 0.6) * (width / count);
    const long = rnd() > 0.45;
    const len = long ? max * (0.55 + rnd() * 0.45) : min + rnd() * 10;
    const r = long ? 3.2 + rnd() * 1.8 : 2.4 + rnd();
    parts.push(`<path d="${dripPath(x, len + seep, r * 1.5, r * 0.45, r)}"/>`);
    if (long) shines.push(`<circle cx="${(x - r * 0.35).toFixed(1)}" cy="${(len + seep - r * 1.2).toFixed(1)}" r="${(r * 0.28).toFixed(1)}"/>`);
  }
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("height", height);
  svg.innerHTML = `
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2e0407"/>
        <stop offset="0.5" stop-color="#5c0a10"/>
        <stop offset="1" stop-color="#8e1119"/>
      </linearGradient>
    </defs>
    <rect x="0" y="-1" width="${width}" height="${seep + 1}" fill="#2e0407"/>
    <g fill="url(#${id})">${parts.join("")}</g>
    <g fill="#f0c9b8" opacity="0.35">${shines.join("")}</g>`;
}

/* ---------- حالة الترويسة: شفافة فوق القماش المرسوم، وصلبة بعد أن يغادر الشاشة ---------- */
function initHeaderState() {
  const header = document.querySelector("[data-header]");
  if (!header) return;
  const hero = document.querySelector(".hero");
  // في الرئيسية القماش جزء من البطل، وفي بقية الصفحات هو أعلى الستارة الدامية
  const limit = () => (hero ? hero.offsetHeight : header.offsetHeight * 2) - header.offsetHeight;
  const update = () => {
    const solid = header.dataset.solid === "always" || window.scrollY > limit();
    header.classList.toggle("is-solid", solid);
  };
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  update();
}

/** بلا WebGL لا قماش مرسوم، فتبقى الترويسة صلبة */
export function keepHeaderSolid() {
  const header = document.querySelector("[data-header]");
  if (!header) return;
  header.dataset.solid = "always";
  header.classList.add("is-solid");
}

/* ---------- الستارة الدامية أعلى الصفحات الداخلية ---------- */
function initTopCurtain() {
  const canvas = document.querySelector("[data-top-curtain]");
  if (!canvas) return;
  const header = document.querySelector("[data-header]");
  const small = window.matchMedia("(max-width: 47.99em)").matches;
  import("../scene/curtain.js")
    .then(({ mountStandaloneCurtain }) => {
      const mounted = mountStandaloneCurtain(canvas, {
        band: header ? header.offsetHeight : 84,
        seep: small ? 10 : 14,
        density: small ? 46 : 62,
        maxLen: small ? [50, 170] : [70, 250],
        shortRatio: 0.35,
      });
      if (!mounted) {
        canvas.remove();
        keepHeaderSolid();
        return;
      }
      if (reduceMotion) {
        canvas.style.transition = "none";
        canvas.classList.add("is-ready");
      } else {
        requestAnimationFrame(() => canvas.classList.add("is-ready"));
      }
    })
    .catch(() => {
      canvas.remove();
      keepHeaderSolid();
    });
}

/* ---------- ستارة التذييل: تُحمَّل Three.js حين يقترب التذييل فقط ---------- */
function initFooter() {
  const canvas = document.querySelector("[data-footer-curtain]");
  if (!canvas) return;
  const small = window.matchMedia("(max-width: 47.99em)").matches;

  function fallback() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("footer-curtain", "footer-curtain--static");
    svg.setAttribute("aria-hidden", "true");
    canvas.replaceWith(svg);
    renderStaticDrips(svg, { spacing: 90, max: 120, seep: 18 });
  }

  async function mount() {
    try {
      const { mountStandaloneCurtain } = await import("../scene/curtain.js");
      const mounted = mountStandaloneCurtain(canvas, {
        band: 22,
        seep: 9,
        density: small ? 44 : 70,
        maxLen: small ? [40, 120] : [50, 170],
        shortRatio: 0.3,
      });
      if (!mounted) fallback();
    } catch {
      fallback();
    }
  }

  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        mount();
      }
    },
    { rootMargin: "600px 0px" },
  );
  io.observe(canvas);
}

/* ---------- ظهور هادئ للمحتوى ---------- */
export function initReveals(root = document) {
  const els = gsap.utils.toArray(root.querySelectorAll("[data-reveal]"));
  if (!els.length) return;
  if (reduceMotion) {
    gsap.set(els, { opacity: 1 });
    return;
  }
  gsap.set(els, { opacity: 0, y: 14 });
  ScrollTrigger.batch(els, {
    start: "top 88%",
    once: true,
    onEnter: (batch) =>
      gsap.to(batch, { opacity: 1, y: 0, duration: 0.9, ease: "power2.out", stagger: 0.12, overwrite: true }),
  });
}

/* ---------- مبدّل اللغة: يُغلق بالنقر خارجه أو بزر Escape ---------- */
function initLanguageMenu() {
  const details = document.querySelector("[data-lang]");
  if (!details) return;
  document.addEventListener("click", (e) => {
    if (details.open && !details.contains(e.target)) details.open = false;
  });
  details.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && details.open) {
      details.open = false;
      details.querySelector("summary").focus();
    }
  });
}

export function initCommon() {
  initHeaderState();
  initMenu();
  initLanguageMenu();
  initTopCurtain();
  initFooter();
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
}

export { gsap, ScrollTrigger };
