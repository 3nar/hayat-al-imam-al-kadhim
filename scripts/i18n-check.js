// يتحقق من ملفات الترجمة مقابل العربية والقوالب:
//   - كل مفتاح في القوالب موجود في العربية
//   - كل لغة فيها مفاتيح العربية نفسها، بلا نقص ولا زيادة
//   - وسوم HTML داخل كل نص مغلقة سليمة (وتنبيه إن اختلف موضعها عن العربية لاختلاف ترتيب الجملة)
// التشغيل: npm run i18n:check
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_LOCALE, LOCALES, PAGES } from "./i18n.js";

const src = resolve(import.meta.dirname, "..", "src");
const load = (code) => JSON.parse(readFileSync(resolve(src, "locales", `${code}.json`), "utf8"));

function flatten(node, prefix = "", out = {}) {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object") flatten(value, path, out);
    else out[path] = value;
  }
  return out;
}

const tags = (text) => (String(text).match(/<\/?[a-z][^>]*>/gi) || []).map((t) => t.replace(/\s.*?(\/?)>$/, "$1>").toLowerCase());

function unbalanced(text) {
  const stack = [];
  for (const tag of tags(text)) {
    const name = tag.replace(/[<>/]/g, "").split(/\s/)[0];
    if (tag.startsWith("</")) {
      if (stack.pop() !== name) return true;
    } else if (!tag.endsWith("/>")) {
      stack.push(name);
    }
  }
  return stack.length > 0;
}

const errors = [];
const notes = [];
const base = flatten(load(DEFAULT_LOCALE));

// المفاتيح المستعملة في القوالب
const templateFiles = [
  ...PAGES.map((p) => resolve(src, "pages", `${p}.html`)),
  ...readdirSync(resolve(src, "partials")).map((f) => resolve(src, "partials", f)),
];
const used = new Set();
for (const file of templateFiles) {
  for (const [, key] of readFileSync(file, "utf8").matchAll(/\{\{t:([\w.]+)\}\}/g)) used.add(key);
}
for (const key of used) if (!(key in base)) errors.push(`${DEFAULT_LOCALE}: المفتاح ${key} مستعمل في القوالب وغير موجود`);
for (const key of Object.keys(base)) {
  if (!key.startsWith("meta.") && !used.has(key)) errors.push(`${DEFAULT_LOCALE}: المفتاح ${key} غير مستعمل في أي قالب`);
}

for (const code of LOCALES.filter((c) => c !== DEFAULT_LOCALE)) {
  let dict;
  try {
    dict = flatten(load(code));
  } catch (error) {
    errors.push(`${code}: لا يمكن قراءة الملف (${error.message})`);
    continue;
  }
  for (const key of Object.keys(base)) {
    if (!(key in dict)) {
      errors.push(`${code}: ينقصه ${key}`);
      continue;
    }
    const expectEmpty = base[key] === "" && !key.endsWith("Original");
    if (!expectEmpty && key.endsWith("Original") === false && dict[key] === "" && base[key] !== "") {
      errors.push(`${code}: ${key} فارغ`);
    }
    if (unbalanced(dict[key])) errors.push(`${code}: وسوم HTML غير مغلقة في ${key}`);
    else if (tags(base[key]).join() !== tags(dict[key]).join()) notes.push(`${code}: ${key} وسومه بترتيب مختلف عن العربية`);
  }
  for (const key of Object.keys(dict)) if (!(key in base)) errors.push(`${code}: مفتاح زائد ${key}`);
}

if (notes.length) console.log(`ملاحظات:\n- ${notes.join("\n- ")}`);
if (errors.length) {
  console.error(`✗ ${errors.length} مشكلة في الترجمة:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log(`✓ الترجمة سليمة: ${LOCALES.length} لغات، ${Object.keys(base).length} نصًا، ${PAGES.length} صفحات`);
