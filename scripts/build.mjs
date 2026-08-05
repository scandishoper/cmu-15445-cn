import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT = path.join(ROOT, "content", "fall2025");
const OUTPUT = path.join(ROOT, "_site");
const SOURCE = path.join(ROOT, "src");
const COURSE_ORIGIN = "https://15445.courses.cs.cmu.edu/fall2025";

const pageGroups = [
  {
    label: "Course",
    pages: [
      ["index.html", "Home"],
      ["schedule.html", "Schedule"],
      ["syllabus.html", "Syllabus"],
      ["assignments.html", "Assignments"],
      ["faq.html", "FAQ"],
    ],
  },
  {
    label: "Projects",
    pages: [
      ["project0/index.html", "Project 0 · C++ Primer"],
      ["project1/index.html", "Project 1 · Buffer Pool"],
      ["project2/index.html", "Project 2 · B+Tree"],
      ["project3/index.html", "Project 3 · Query Execution"],
      ["project4/index.html", "Project 4 · Concurrency"],
    ],
  },
  {
    label: "Homework",
    pages: [["homework1/index.html", "Homework 1 · SQL"]],
  },
  {
    label: "Tools",
    pages: [
      ["bustub/index.html", "BusTub SQL Shell"],
      ["bpt-printer/index.html", "B+Tree Printer"],
    ],
  },
];

const readingPages = pageGroups
  .flatMap((group) => group.pages)
  .filter(([pagePath]) => !pagePath.startsWith("bustub/") && !pagePath.startsWith("bpt-printer/"));

const toolPages = ["bustub/index.html", "bpt-printer/index.html"];

function toPosix(value) {
  return value.split(path.sep).join(path.posix.sep);
}

function relativeUrl(fromPage, target) {
  const result = path.posix.relative(path.posix.dirname(fromPage), target);
  return result || path.posix.basename(target);
}

function rootPrefix(pagePath) {
  const value = path.posix.relative(path.posix.dirname(pagePath), ".");
  return value ? `${value}/` : "./";
}

function targetExists(targetPath) {
  const cleanPath = decodeURIComponent(targetPath.split(/[?#]/, 1)[0]).replace(/^\/+/, "");
  if (!cleanPath) return true;
  const candidate = path.join(CONTENT, cleanPath);
  return existsSync(candidate);
}

function rewriteCourseUrl(rawUrl, pagePath) {
  if (!rawUrl || rawUrl.startsWith("#") || rawUrl.startsWith("data:") || rawUrl.startsWith("mailto:")) {
    return rawUrl;
  }

  let suffix = null;
  if (rawUrl === COURSE_ORIGIN || rawUrl === `${COURSE_ORIGIN}/`) {
    suffix = "";
  } else if (rawUrl.startsWith(`${COURSE_ORIGIN}/`)) {
    suffix = rawUrl.slice(COURSE_ORIGIN.length + 1);
  } else if (rawUrl === "/fall2025" || rawUrl === "/fall2025/") {
    suffix = "";
  } else if (rawUrl.startsWith("/fall2025/")) {
    suffix = rawUrl.slice("/fall2025/".length);
  } else {
    return rawUrl;
  }

  const match = suffix.match(/^([^?#]*)([?#].*)?$/);
  const targetPath = match?.[1] ?? "";
  const trailer = match?.[2] ?? "";
  if (!targetExists(targetPath)) return rawUrl;

  const normalizedTarget = targetPath || "index.html";
  let rewritten = path.posix.relative(path.posix.dirname(pagePath), normalizedTarget);
  if (!rewritten) rewritten = path.posix.basename(normalizedTarget);
  if (targetPath.endsWith("/") && !rewritten.endsWith("/")) rewritten += "/";
  return `${rewritten}${trailer}`;
}

function rewritePageUrl(rawUrl, pagePath) {
  const courseUrl = rewriteCourseUrl(rawUrl, pagePath);
  if (courseUrl !== rawUrl) return courseUrl;
  if (!rawUrl || rawUrl.startsWith("#") || rawUrl.startsWith("data:") || rawUrl.startsWith("mailto:")) {
    return rawUrl;
  }
  if (rawUrl.startsWith("/")) return `https://15445.courses.cs.cmu.edu${rawUrl}`;
  if (/^[a-z][a-z\d+.-]*:/i.test(rawUrl) || rawUrl.startsWith("//")) return rawUrl;

  const match = rawUrl.match(/^([^?#]*)([?#].*)?$/);
  const localPart = match?.[1] ?? "";
  if (!localPart) return rawUrl;
  const resolvedTarget = path.posix.normalize(path.posix.join(path.posix.dirname(pagePath), localPart));
  if (targetExists(resolvedTarget)) return rawUrl;

  // The supplied archive records a small number of failed downloads. Keep those
  // references useful by falling back to their original course-site URL.
  return `${COURSE_ORIGIN}/${resolvedTarget}${match?.[2] ?? ""}`;
}

function rewriteElementUrls($, pagePath) {
  const attributes = ["href", "src", "poster"];
  $("*").each((_, element) => {
    const item = $(element);
    item.removeAttr("onclick");
    for (const attribute of attributes) {
      const value = item.attr(attribute);
      if (value) item.attr(attribute, rewritePageUrl(value, pagePath));
    }
  });
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-") || "section";
}

function ensureHeadingIds($) {
  const seen = new Map();
  $("h1, h2, h3").each((_, heading) => {
    const item = $(heading);
    if (item.attr("id")) return;
    const base = slugify(item.text());
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    item.attr("id", count ? `${base}-${count + 1}` : base);
  });
}

function textFromHtml(html) {
  const $ = cheerio.load(`<div id="content-root">${html}</div>`);
  $("script, style").remove();
  return $("#content-root").text().replace(/\s+/g, " ").trim();
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderNavigation(pagePath) {
  return pageGroups
    .map(
      (group) => `
        <section class="nav-group">
          <h2>${group.label}</h2>
          <ul>
            ${group.pages
              .map(([target, label]) => {
                const active = target === pagePath ? ' aria-current="page" class="active"' : "";
                return `<li><a href="${relativeUrl(pagePath, target)}"${active}>${label}</a></li>`;
              })
              .join("\n")}
          </ul>
        </section>`,
    )
    .join("\n");
}

function renderShell({ pagePath, title, content }) {
  const prefix = rootPrefix(pagePath);
  const isHome = pagePath === "index.html";
  const homeHero = isHome
    ? `<section class="course-hero" aria-labelledby="course-title">
        <p>CMU 15-445/645</p>
        <h1 id="course-title">Database Systems</h1>
        <span>Fall 2025</span>
      </section>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="CMU 15-445/645 Intro to Database Systems, Fall 2025 course archive">
  <meta name="theme-color" content="#9f1d2e">
  <title>${escapeHtml(title)}</title>
  <link rel="icon" type="image/gif" sizes="32x32" href="${relativeUrl(pagePath, "images/icons/favicon-32x32.gif")}">
  <script>document.documentElement.dataset.theme=localStorage.getItem("cmu15445-theme")||((matchMedia("(prefers-color-scheme: dark)").matches)?"dark":"light");</script>
  <link rel="stylesheet" href="${relativeUrl(pagePath, "assets/bootstrap.min.css")}">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.12.0-1/css/all.min.css" integrity="sha512-ZYg+hQvLlM0W9C3P6vTpes5LmJ66G2EsroxDNzwD6qiulckldb29eD9I672HL2X+LH5nRhY1sQqZLJGB+aUUPg==" crossorigin="anonymous" referrerpolicy="no-referrer">
  <link rel="stylesheet" href="${relativeUrl(pagePath, "assets/site.css")}">
</head>
<body data-root="${prefix}" data-page="${pagePath}">
  <div class="reading-progress" aria-hidden="true"><span></span></div>
  <header class="topbar">
    <button class="icon-button menu-button" type="button" aria-label="Open course navigation" aria-expanded="false" aria-controls="course-navigation">
      <span></span><span></span><span></span>
    </button>
    <a class="brand" href="${relativeUrl(pagePath, "index.html")}">
      <img src="${relativeUrl(pagePath, "images/cmudb-icon-white.svg")}" alt="">
      <span>CMU 15-445/645</span>
      <small>Fall 2025</small>
    </a>
    <div class="topbar-actions">
      <button class="search-button" type="button" aria-label="Search course content"><kbd>/</kbd><span>Search</span></button>
      <button class="icon-button theme-button" type="button" aria-label="Toggle color theme"><span aria-hidden="true">◐</span></button>
    </div>
  </header>

  <div class="site-frame">
    <aside class="course-navigation" id="course-navigation" aria-label="Course navigation">
      <div class="nav-scroll">
        ${renderNavigation(pagePath)}
        <p class="source-link"><a href="https://15445.courses.cs.cmu.edu/fall2025/">Official course archive ↗</a></p>
      </div>
    </aside>

    <main class="content-column" id="main-content">
      ${homeHero}
      <div class="archive-notice" role="note">
        <strong>NOTICE:</strong> This is an archived version of the course.
        <a href="https://15445.courses.cs.cmu.edu/">Click here to view the latest offering.</a>
      </div>
      <article class="article-card">
        <div class="article-body">${content}</div>
      </article>
      <footer class="page-footer">
        <span>CMU 15-445/645 · Intro to Database Systems · Fall 2025</span>
        <a href="https://db.cs.cmu.edu/">Carnegie Mellon Database Group ↗</a>
      </footer>
    </main>

    <aside class="page-outline" aria-label="On this page">
      <h2>On this page</h2>
      <nav id="page-toc"></nav>
    </aside>
  </div>

  <div class="drawer-backdrop" hidden></div>
  <dialog class="search-dialog" aria-labelledby="search-title">
    <form method="dialog" class="search-panel">
      <div class="search-head">
        <label id="search-title" for="site-search">Search course content</label>
        <button type="submit" class="icon-button" aria-label="Close search">×</button>
      </div>
      <input id="site-search" type="search" autocomplete="off" placeholder="Try buffer pool, B+Tree, MVCC…">
      <div id="search-results" class="search-results" aria-live="polite"></div>
    </form>
  </dialog>

  <script src="${relativeUrl(pagePath, "assets/site.js")}" defer></script>
</body>
</html>`;
}

function copyStaticFiles(directory, relative = "") {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const sourcePath = path.join(directory, entry.name);
    const relativePath = path.join(relative, entry.name);
    const outputPath = path.join(OUTPUT, relativePath);
    if (entry.isDirectory()) {
      mkdirSync(outputPath, { recursive: true });
      copyStaticFiles(sourcePath, relativePath);
    } else if (!entry.name.endsWith(".html")) {
      mkdirSync(path.dirname(outputPath), { recursive: true });
      cpSync(sourcePath, outputPath);
    }
  }
}

function patchToolPage(pagePath) {
  const sourcePath = path.join(CONTENT, pagePath);
  let html = readFileSync(sourcePath, "utf8");
  html = html.replace(/\b(href|src)=(['"])(.*?)\2/g, (full, attribute, quote, value) => {
    return `${attribute}=${quote}${rewritePageUrl(value, pagePath)}${quote}`;
  });
  const backLink = `<a class="course-back-link" href="${relativeUrl(pagePath, "index.html")}" aria-label="Back to the course site">← CMU 15-445/645</a>`;
  const toolStyle = `<style>
    .course-back-link{position:fixed;top:12px;left:12px;z-index:10000;padding:8px 12px;border-radius:999px;background:#9f1d2e;color:#fff!important;text-decoration:none;font:600 14px/1.2 system-ui,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.22)}
    .course-back-link:focus-visible{outline:3px solid #f2b8c0;outline-offset:3px}
  </style>`;
  html = html.replace("</head>", `${toolStyle}</head>`).replace(/<body([^>]*)>/, `<body$1>${backLink}`);
  const outputPath = path.join(OUTPUT, pagePath);
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, html);
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function listFiles(directory, relative = "") {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relativePath = path.join(relative, entry.name);
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(absolutePath, relativePath));
    else files.push(relativePath);
  }
  return files;
}

function verifyStaticAssets() {
  const assets = listFiles(CONTENT).filter((file) => !file.endsWith(".html"));
  for (const asset of assets) {
    const outputAsset = path.join(OUTPUT, asset);
    if (!existsSync(outputAsset)) throw new Error(`Missing copied asset: ${asset}`);
    if (sha256(path.join(CONTENT, asset)) !== sha256(outputAsset)) {
      throw new Error(`Asset changed during build: ${asset}`);
    }
  }
  return assets.length;
}

function verifyLocalReferences() {
  const missing = [];
  for (const [pagePath] of readingPages) {
    const html = readFileSync(path.join(OUTPUT, pagePath), "utf8");
    const $ = cheerio.load(html);
    $("[href], [src]").each((_, element) => {
      const value = $(element).attr("href") ?? $(element).attr("src");
      if (!value || /^(?:[a-z]+:|#|\/\/)/i.test(value)) return;
      const clean = value.split(/[?#]/, 1)[0];
      if (!clean) return;
      const resolved = path.resolve(path.dirname(path.join(OUTPUT, pagePath)), decodeURIComponent(clean));
      const candidate = existsSync(resolved) && statSync(resolved).isDirectory() ? path.join(resolved, "index.html") : resolved;
      if (!existsSync(candidate)) missing.push(`${pagePath} -> ${value}`);
    });
  }
  if (missing.length) throw new Error(`Broken local references:\n${missing.join("\n")}`);
}

rmSync(OUTPUT, { recursive: true, force: true });
mkdirSync(path.join(OUTPUT, "assets"), { recursive: true });
copyStaticFiles(CONTENT);
cpSync(path.join(ROOT, "node_modules", "bootstrap", "dist", "css", "bootstrap.min.css"), path.join(OUTPUT, "assets", "bootstrap.min.css"));
cpSync(path.join(SOURCE, "site.css"), path.join(OUTPUT, "assets", "site.css"));
cpSync(path.join(SOURCE, "site.js"), path.join(OUTPUT, "assets", "site.js"));
writeFileSync(path.join(OUTPUT, ".nojekyll"), "");

const searchIndex = [];
for (const [pagePath, label] of readingPages) {
  const sourceHtml = readFileSync(path.join(CONTENT, pagePath), "utf8");
  const sourceDocument = cheerio.load(sourceHtml, { decodeEntities: false });
  const sourceMain = sourceDocument(".main-content").first();
  if (!sourceMain.length) throw new Error(`Could not find .main-content in ${pagePath}`);

  const originalText = textFromHtml(sourceMain.html() ?? "");
  rewriteElementUrls(sourceDocument, pagePath);
  ensureHeadingIds(sourceDocument);
  const content = sourceDocument(".main-content").first().html() ?? "";
  const processedText = textFromHtml(content);
  if (processedText !== originalText) throw new Error(`Course text changed while processing ${pagePath}`);

  const title = sourceDocument("title").text().replace(/\s+/g, " ").trim();
  const outputHtml = renderShell({ pagePath, title, content });
  const outputPath = path.join(OUTPUT, pagePath);
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, outputHtml);

  const headingText = sourceDocument(".main-content h1, .main-content h2, .main-content h3")
    .map((_, heading) => sourceDocument(heading).text().replace(/\s+/g, " ").trim())
    .get()
    .join(" · ");
  searchIndex.push({ path: pagePath, label, title, headings: headingText, text: processedText });
}

for (const pagePath of toolPages) patchToolPage(pagePath);
writeFileSync(path.join(OUTPUT, "search-index.json"), `${JSON.stringify(searchIndex)}\n`);

const copiedAssetCount = verifyStaticAssets();
verifyLocalReferences();

console.log(`Built ${readingPages.length + toolPages.length} pages with ${copiedAssetCount} verified archive assets.`);
