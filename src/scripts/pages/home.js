import { initCommon, initReveals, gsap, reduceMotion, renderStaticDrips, keepHeaderSolid } from "../core/common.js";
import { mountHero } from "../scene/hero.js";

initCommon();

const header = document.querySelector("[data-header]");
const canvas = document.querySelector("[data-hero-canvas]");
const photo = document.querySelector("[data-hero-photo]");
const title = document.querySelector("[data-hero-title]");
const lines = gsap.utils.toArray(".hero [data-hero-line]");

const mounted = mountHero({
  canvas,
  photo,
  title,
  lines,
  headerBand: () => header.getBoundingClientRect().height,
});

if (!mounted) {
  // بلا WebGL: ستارة ثابتة بقطرات SVG، والمحتوى يظهر مباشرة
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("hero__gl", "hero__gl--static");
  svg.setAttribute("aria-hidden", "true");
  canvas.replaceWith(svg);
  renderStaticDrips(svg, { spacing: 70, max: 160, seep: header.getBoundingClientRect().height + 10 });
  gsap.set([photo, ...lines], { opacity: 1 });
  title.style.setProperty("--ink", "0%");
  keepHeaderSolid();
}

initReveals();

if (reduceMotion) gsap.set(lines, { opacity: 1 });
