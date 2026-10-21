import { initCommon, initReveals, gsap, reduceMotion } from "../core/common.js";

initCommon();
initReveals();

// الخيط بين المجلس القديم والهيئة يُمدّ حين يصل إليه القارئ
const line = document.querySelector("[data-launch]");
if (line && !reduceMotion) {
  const steps = line.querySelectorAll(".launch__step");
  gsap.set(line, { "--grow": 0 });
  gsap.set(steps, { opacity: 0, y: 12 });
  gsap
    .timeline({ scrollTrigger: { trigger: line, start: "top 78%", once: true }, defaults: { ease: "power2.out" } })
    .to(steps[0], { opacity: 1, y: 0, duration: 0.8 })
    .to(line, { "--grow": 1, duration: 1.4, ease: "power1.inOut" }, "-=0.2")
    .to(steps[1], { opacity: 1, y: 0, duration: 0.8 }, "-=0.4");
}
