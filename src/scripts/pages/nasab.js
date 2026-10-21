import { initCommon, initReveals, gsap, reduceMotion } from "../core/common.js";

initCommon();
initReveals();

// الشجرة تُبنى جيلًا بعد جيل مع التمرير
const nodes = gsap.utils.toArray("[data-tree] .tree__node");
if (!reduceMotion && nodes.length) {
  gsap.set(nodes, { opacity: 0, y: 10, "--grow": 0 });
  const tl = gsap.timeline({
    defaults: { ease: "none" },
    scrollTrigger: { trigger: "[data-tree]", start: "top 72%", end: "bottom 72%", scrub: 0.8 },
  });
  nodes.forEach((node) => {
    tl.to(node, { opacity: 1, y: 0, duration: 0.6, ease: "power1.out" }).to(node, { "--grow": 1, duration: 0.5 });
  });
}
