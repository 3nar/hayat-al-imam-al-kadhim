import { resolve } from "node:path";
import { defineConfig } from "vite";
import { i18nPages } from "./scripts/i18n.js";

const project = import.meta.dirname;
const src = resolve(project, "src");

// مصدر الموقع كله في src. الصفحات تُولَّد من القوالب (src/pages) بكل لغة (src/locales):
// العربية في جذر الموقع، وبقية اللغات في en/ ru/ fa/ az/
export default defineConfig({
  root: src,
  publicDir: resolve(project, "public"),
  cacheDir: resolve(project, "node_modules/.vite"),
  base: "./",
  appType: "mpa", // صفحة غير موجودة تعطي 404 بدل الرئيسية
  plugins: [i18nPages({ srcDir: src })],
  build: {
    outDir: resolve(project, "dist"),
    emptyOutDir: true,
    target: "es2020",
    chunkSizeWarningLimit: 600, // Three.js وحدها قرابة 550kB، وتُحمَّل في ملف منفصل
  },
});
