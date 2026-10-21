import { initCommon, initReveals, gsap, ScrollTrigger, reduceMotion } from "../core/common.js";

initCommon();
initReveals();

const inner = document.querySelector(".branches__inner");
const spine = document.querySelector("[data-spine]");
const tip = document.querySelector("[data-spine-tip]");
const branches = gsap.utils.toArray("[data-branch]");
const railLinks = gsap.utils.toArray("[data-rail-link]");
const nodeY = () => parseFloat(getComputedStyle(inner.closest(".branches")).getPropertyValue("--node-y")) * 16;

function setRail(id) {
  for (const a of railLinks) a.classList.toggle("is-current", a.getAttribute("href") === `#${id}`);
}

// الشريط الجانبي يتبع القسم الحالي في الحالتين
for (const b of branches) {
  ScrollTrigger.create({
    trigger: b,
    start: "top 55%",
    end: "bottom 55%",
    onToggle: (self) => self.isActive && setRail(b.id),
  });
}

if (reduceMotion) {
  spine.style.setProperty("--p", "1");
  tip.style.display = "none";
  branches.forEach((b) => b.classList.add("is-lit"));
} else {
  // الخيط ينزل مع التمرير، وفي رأسه قطرة دم
  gsap.set(spine, { "--p": 0 });
  ScrollTrigger.create({
    trigger: inner,
    start: "top 62%",
    end: "bottom 62%",
    scrub: 0.6,
    onUpdate: (self) => {
      const p = self.progress;
      spine.style.setProperty("--p", p.toFixed(4));
      gsap.set(tip, { y: p * spine.offsetHeight });
    },
  });

  // عند وصول الخيط إلى العقدة: تشتعل النجمة، يمتد الفرع، ويظهر الباب
  for (const b of branches) {
    const arm = b.querySelector(".branch__arm");
    const card = b.querySelector(".branch__card");
    const even = branches.indexOf(b) % 2 === 1;
    // البطاقة تنزلق من جهة الخط؛ والجهة تنقلب في اللغات من اليسار لليمين
    const side = document.documentElement.dir === "rtl" ? 1 : -1;
    const fromX = (window.matchMedia("(max-width: 63.99em)").matches ? 16 : even ? 24 : -24) * side;
    gsap.set(arm, { scaleX: 0 });
    gsap.set(card, { opacity: 0, x: fromX });
    const tl = gsap.timeline({ paused: true, defaults: { ease: "power2.out" } });
    tl.to(arm, { scaleX: 1, duration: 0.5 }).to(card, { opacity: 1, x: 0, duration: 0.9 }, "-=0.15");
    ScrollTrigger.create({
      trigger: b,
      start: () => `top+=${nodeY()} 62%`,
      onEnter: () => {
        b.classList.add("is-lit");
        tl.play();
      },
      onLeaveBack: () => {
        b.classList.remove("is-lit");
        tl.reverse();
      },
    });
  }
}
