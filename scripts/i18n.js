// الترجمة وقت البناء: كل قالب في src/pages × كل لغة في src/locales = صفحة ثابتة.
//
// العربية (اللغة الافتراضية) في جذر الموقع، وبقية اللغات في مجلدات: en/ ru/ fa/ az/
//
// صيغ القوالب:
//   <!--include:header-->   يُستبدل بمحتوى src/partials/header.html
//   {{t:home.city}}         نص مترجم من ملف اللغة (يقبل HTML)
//   {{v:root}}              متغيرات الصفحة: root, lang, dir, page, langMenu, langLinks, alternates, fontPreloads
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

export const LOCALES = ["ar", "en", "ru", "fa", "az"];
export const DEFAULT_LOCALE = LOCALES[0];
export const PAGES = ["index", "imam", "sira", "nasab", "hayaa"];

const MARK = "<!-- مولّد تلقائيًا من src/pages وsrc/locales؛ عدّل القالب لا هذا الملف -->";

// الخطوط التي تحتاجها كل لغة أولًا (تُحمَّل مسبقًا)
const FONT_PRELOADS = {
  arabic: ["amiri-400", "ruqaa-700", "amiri-700"],
  latin: ["garamond-400-latin", "cormorant-700-latin", "garamond-700-latin"],
  "latin-ext": ["garamond-400-latin", "garamond-400-latin-ext", "cormorant-700-latin", "garamond-700-latin"],
  cyrillic: ["garamond-400-cyrillic", "cormorant-700-cyrillic", "garamond-700-cyrillic"],
};

const localeDir = (code) => (code === DEFAULT_LOCALE ? "" : `${code}/`);
const rootPrefix = (code) => (code === DEFAULT_LOCALE ? "./" : "../");
const pageHref = (from, to, page) => `${rootPrefix(from)}${localeDir(to)}${page}.html`;

// الكلمات الموصولة بشرطة (al-Kadhim، аль-Казим) لا تنقسم بين سطرين.
// يُطبَّق على نصوص <body> فقط، لا على الوسوم وخصائصها ولا السكربت والـSVG.
function protectHyphenatedWords(html) {
  const start = html.indexOf("<body");
  if (start < 0) return html;
  let skip = false;
  const body = html
    .slice(start)
    .split(/(<[^>]+>)/)
    .map((part) => {
      if (part.startsWith("<")) {
        if (/^<(script|style|svg)\b/i.test(part)) skip = true;
        else if (/^<\/(script|style|svg)>/i.test(part)) skip = false;
        return part;
      }
      if (skip) return part;
      return part.replace(/[\p{L}\p{M}'’]+(?:-[\p{L}\p{M}'’]+)+/gu, (word) => `<span class="nowrap">${word}</span>`);
    })
    .join("");
  return html.slice(0, start) + body;
}

function lookup(dict, key) {
  return key.split(".").reduce((node, part) => (node == null ? undefined : node[part]), dict);
}

export function createRenderer(srcDir) {
  const dirs = {
    pages: resolve(srcDir, "pages"),
    partials: resolve(srcDir, "partials"),
    locales: resolve(srcDir, "locales"),
  };
  const read = (file) => readFileSync(file, "utf8");
  const loadLocale = (code) => JSON.parse(read(resolve(dirs.locales, `${code}.json`)));

  function render(page, code, warn = console.warn) {
    const dict = loadLocale(code);
    const fallback = code === DEFAULT_LOCALE ? dict : loadLocale(DEFAULT_LOCALE);
    const meta = dict.meta;

    let html = read(resolve(dirs.pages, `${page}.html`));
    html = html.replace(/<!--include:([\w-]+)-->/g, (_, name) => read(resolve(dirs.partials, `${name}.html`)));

    const vars = {
      root: rootPrefix(code),
      lang: meta.lang,
      dir: meta.dir,
      page,
      fontPreloads: FONT_PRELOADS[meta.script]
        .map((f) => `<link rel="preload" href="${rootPrefix(code)}fonts/${f}.woff2" as="font" type="font/woff2" crossorigin />`)
        .join("\n    "),
      alternates: [
        // vite-ignore: روابط إلى صفحات، لا أصول يُعاد نسخها
        ...LOCALES.map((to) => `<link rel="alternate" hreflang="${to}" href="${pageHref(code, to, page)}" vite-ignore />`),
        `<link rel="alternate" hreflang="x-default" href="${pageHref(code, DEFAULT_LOCALE, page)}" vite-ignore />`,
      ].join("\n    "),
      langMenu: LOCALES.map((to) => {
        const m = loadLocale(to).meta;
        const current = to === code ? ' aria-current="true"' : "";
        return `<li><a href="${pageHref(code, to, page)}" hreflang="${to}" lang="${to}" dir="${m.dir}"${current}>${m.name}</a></li>`;
      }).join(""),
    };
    vars.langLinks = vars.langMenu;

    html = html.replace(/\{\{v:(\w+)\}\}/g, (_, name) => {
      if (!(name in vars)) throw new Error(`متغير غير معروف {{v:${name}}} في ${page}.html`);
      return vars[name];
    });

    html = html.replace(/\{\{t:([\w.]+)\}\}/g, (_, key) => {
      let value = lookup(dict, key);
      if (typeof value !== "string") {
        value = lookup(fallback, key);
        if (typeof value !== "string") throw new Error(`مفتاح ترجمة غير موجود: ${key} (${page}.html)`);
        warn(`[i18n] ${code}: المفتاح ${key} غير مترجم، استُعمل النص العربي`);
      }
      return value;
    });

    html = html.replaceAll(`data-page="${page}"`, `data-page="${page}" aria-current="page"`);
    html = protectHyphenatedWords(html);
    return html.replace(/<!doctype html>/i, `<!doctype html>\n${MARK}`);
  }

  return { dirs, render };
}

/** إضافة Vite: تخدم الصفحات المترجمة في التطوير، وتكتبها مؤقتًا للبناء */
export function i18nPages({ srcDir }) {
  const { dirs, render } = createRenderer(srcDir);
  const read = (file) => readFileSync(file, "utf8");
  const outputs = [];
  for (const code of LOCALES) {
    for (const page of PAGES) {
      outputs.push({ code, page, file: resolve(srcDir, `${localeDir(code)}${page}.html`) });
    }
  }

  function removeGenerated() {
    for (const { file } of outputs) {
      if (existsSync(file) && read(file).includes(MARK)) rmSync(file);
    }
    for (const code of LOCALES.slice(1)) {
      const dir = resolve(srcDir, code);
      if (existsSync(dir) && readdirSync(dir).length === 0) rmdirSync(dir);
    }
  }

  return {
    name: "i18n-pages",

    config(_, { command }) {
      if (command !== "build") return;
      return {
        build: {
          rollupOptions: {
            input: Object.fromEntries(outputs.map(({ code, page, file }) => [`${code}-${page}`, file])),
          },
        },
      };
    },

    buildStart() {
      removeGenerated();
      for (const { code, page, file } of outputs) {
        if (existsSync(file)) throw new Error(`الملف ${relative(srcDir, file)} موجود وليس مولّدًا؛ لن يُكتب فوقه`);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, render(page, code, (msg) => this.warn(msg)));
      }
    },

    closeBundle() {
      removeGenerated();
    },

    configureServer(server) {
      const route = /^\/(?:(en|ru|fa|az)\/)?(?:([a-z]+)\.html)?$/;
      server.middlewares.use(async (req, res, next) => {
        const path = decodeURIComponent((req.url || "/").split("?")[0]);
        const match = path.match(route);
        if (!match) return next();
        const code = match[1] || DEFAULT_LOCALE;
        const page = match[2] || "index";
        if (!PAGES.includes(page)) return next();
        try {
          const html = await server.transformIndexHtml(path, render(page, code), req.originalUrl);
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(html);
        } catch (error) {
          next(error);
        }
      });

      // أي تعديل في القوالب أو الترجمات يعيد تحميل الصفحة
      server.watcher.add([dirs.pages, dirs.partials, dirs.locales]);
      server.watcher.on("change", (file) => {
        if ([dirs.pages, dirs.partials, dirs.locales].some((d) => resolve(file).startsWith(d))) {
          server.ws.send({ type: "full-reload" });
        }
      });
    },
  };
}
