import { initCommon, initReveals, gsap, ScrollTrigger, reduceMotion } from "../core/common.js";

initCommon();
initReveals();

// الصورة المثبّتة تتبدّل مع كل فصل
const stack = [...document.querySelectorAll("[data-story-stack] img")];
const caption = document.querySelector("[data-story-caption]");
let current = 0;

function show(index, text) {
  if (index !== current) {
    stack[current]?.classList.remove("is-active");
    stack[index]?.classList.add("is-active");
    current = index;
  }
  if (caption && caption.textContent !== text) caption.textContent = text;
}

for (const ep of document.querySelectorAll("[data-episode]")) {
  ScrollTrigger.create({
    trigger: ep,
    start: "top 55%",
    end: "bottom 55%",
    onToggle: (self) => self.isActive && show(Number(ep.dataset.image), ep.dataset.caption),
  });
}

// حلقات السلسلة تتدلّى واحدةً بعد الأخرى
const links = gsap.utils.toArray("[data-chain] .chain__link");
if (!reduceMotion && links.length) {
  gsap.set(links, { opacity: 0, y: -22 });
  gsap.set(links.map((l) => l.querySelector(".chain__ring")), { rotation: (i) => (i % 2 ? 9 : -9) });
  const tl = gsap.timeline({
    scrollTrigger: { trigger: "[data-chain]", start: "top 75%", once: true },
    defaults: { ease: "power3.out" },
  });
  tl.to(links, { opacity: 1, y: 0, duration: 0.8, stagger: 0.32 }).to(
    links.map((l) => l.querySelector(".chain__ring")),
    { rotation: 0, duration: 1.6, ease: "sine.out", stagger: 0.32 },
    0.1,
  );
}
