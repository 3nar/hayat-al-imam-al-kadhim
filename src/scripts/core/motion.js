// تفضيل تقليل الحركة، أو ?still في الرابط لعرض الحالة النهائية ثابتة (للمراجعة واللقطات)
export const reduceMotion =
  window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
  new URLSearchParams(window.location.search).has("still");
