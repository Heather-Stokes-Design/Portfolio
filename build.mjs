// build.mjs — turns the Claude Design export in ./design into the live website in ./dist.
//
// Run it with:  node build.mjs
// Netlify runs it automatically on every push (see netlify.toml). No installs needed.
//
// What it does, page by page (pages are listed in site.config.json):
//   - gives each page a clean address (/work/osler/ instead of "Project - Osler.dc.html")
//   - rewrites links and image paths to match
//   - writes the real <head>: title, description, canonical link, share previews,
//     favicons and structured data (JSON-LD) for Google and answer engines
//   - keeps the design's markup and behaviour exactly as exported, and serves the
//     design runtime + React from this site instead of a third-party CDN
// Then it adds sitemap.xml, robots.txt, llms.txt and a 404 page.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const DESIGN = path.join(ROOT, "design");
const SITE = path.join(ROOT, "site");
const OUT = path.join(ROOT, "dist");
const config = JSON.parse(fs.readFileSync(path.join(ROOT, "site.config.json"), "utf8"));
const SITE_URL = config.siteUrl.replace(/\/$/, "");
const RT = "/_dc"; // where the design runtime, React and shared components are served

const REACT_URL = "https://unpkg.com/react@18.3.1/umd/react.production.min.js";
const REACT_DOM_URL = "https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js";

const warnings = [];
const warn = (m) => { warnings.push(m); console.warn("  ! " + m); };

// ---------- helpers ----------
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const abs = (p) => SITE_URL + p;
const globToRegex = (glob, flags) =>
  new RegExp(glob.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^\"'/<>]*?"), flags);
const copyDir = (from, to) => { if (fs.existsSync(from)) fs.cpSync(from, to, { recursive: true, filter: (p) => !p.endsWith(".DS_Store") }); };

const designFiles = fs.readdirSync(DESIGN).filter((f) => f.endsWith(".dc.html"));

function findFile(glob) {
  const re = new RegExp("^" + globToRegex(glob).source + "$");
  const hits = designFiles.filter((f) => re.test(f));
  if (hits.length > 1) throw new Error(`"${glob}" matches more than one design file: ${hits.join(", ")}. Remove the old one from /design.`);
  return hits[0];
}

// Every link to a page ("Project - Osler.dc.html", "Homepage v3.dc.html#work") becomes its clean address.
const linkRules = config.pages.map((p) => ({ re: globToRegex(p.file, "g"), route: p.route }));
function rewrite(src) {
  for (const { re, route } of linkRules) src = src.replace(re, route);
  src = src.replace(/(["'(])(img|images)\//g, "$1/$2/"); // image paths work from any page depth
  src = src.replace(/(["'])([\w-]+\.json)\1/g, "$1/$2$1"); // data files (e.g. about-sketches.json) too
  const leftover = src.match(/[^"'/<>]*\.dc\.html/g)?.filter((m) => !/^Footer|^\.\//.test(m));
  return { src, leftover: leftover || [] };
}

// Split a .dc.html file into the parts we need.
function parseDc(text) {
  const open = /<x-dc(?:\s[^>]*)?>/.exec(text);
  const close = text.lastIndexOf("</x-dc>");
  if (!open || close < 0) return null;
  let template = text.slice(open.index + open[0].length, close);
  const helmetM = /<helmet>([\s\S]*?)<\/helmet>/.exec(template);
  const helmet = helmetM ? helmetM[1] : "";
  template = template.replace(/<helmet>[\s\S]*?<\/helmet>\s*/, "");
  const scriptM = /<script type="text\/x-dc"[\s\S]*?<\/script>/.exec(text.slice(close));
  return { template, helmet, script: scriptM ? scriptM[0] : "" };
}

// Images below the first one load only as the visitor scrolls to them — but only when
// their box has a fixed shape (aspect-ratio or fill), so the layout never shifts.
// Images sized by the picture itself (height:auto) always load straight away.
function lazyImages(template) {
  let n = 0;
  return template.replace(/<img\b(?![^>]*\bloading=)[^>]*>/g, (tag) => {
    const style = (tag.match(/style="([^"]*)"/) || [])[1] || "";
    const fixedShape = /aspect-ratio|inset:\s*0|height:\s*100%/.test(style);
    return n++ === 0 || !fixedShape ? tag : tag.replace(/^<img/, '<img loading="lazy" decoding="async"');
  });
}

// Readable text of a page (for llms.txt).
function pageText(template) {
  return template
    .replace(/<(script|style|svg)[\s\S]*?<\/\1>/g, " ")
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<\/(p|h1|h2|h3|div|li|section)>/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&#39;|&rsquo;/g, "'")
    .replace(/[ \t]+/g, " ")
    .split("\n").map((l) => l.trim()).filter((l) => l && !/^[*.|→←]$/.test(l))
    .filter((l, i, a) => a.indexOf(l) === i)
    .join("\n");
}

// ---------- structured data ----------
const P = config.person;
const personId = SITE_URL + "/#person";
const person = {
  "@type": "Person", "@id": personId, name: P.name, url: SITE_URL + "/", jobTitle: P.jobTitle,
  description: P.description, email: "mailto:" + P.email, image: abs(config.shareImage.path),
  address: { "@type": "PostalAddress", addressLocality: P.city, addressRegion: P.region, addressCountry: P.country },
  sameAs: P.sameAs, knowsAbout: P.knowsAbout, alumniOf: P.alumniOf,
};
const website = { "@type": "WebSite", "@id": SITE_URL + "/#website", url: SITE_URL + "/", name: config.siteName, publisher: { "@id": personId }, inLanguage: "en-CA" };

function jsonLd(page) {
  const url = abs(page.route);
  const graph = [website, person];
  if (page.type === "home") {
    graph.push({ "@type": ["WebPage", "ProfilePage"], "@id": url, url, name: page.title, description: page.description, about: { "@id": personId }, mainEntity: { "@id": personId }, isPartOf: { "@id": website["@id"] } });
  } else if (page.type === "project") {
    graph.push({
      "@type": "CreativeWork", "@id": url + "#work", url, name: page.headline || page.client, headline: page.headline,
      description: page.description, image: page.image ? abs(page.image) : undefined,
      creator: { "@id": personId }, author: { "@id": personId },
      about: page.client ? { "@type": "Organization", name: page.client } : undefined,
      genre: "Graphic design", inLanguage: "en-CA", isPartOf: { "@id": website["@id"] },
    });
    graph.push({ "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Work", item: SITE_URL + "/#work" },
      { "@type": "ListItem", position: 2, name: page.client || page.title, item: url },
    ] });
  } else if (page.type === "about") {
    graph.push({ "@type": ["WebPage", "AboutPage"], "@id": url, url, name: page.title, description: page.description, about: { "@id": personId }, mainEntity: { "@id": personId }, isPartOf: { "@id": website["@id"] } });
  } else if (page.type === "contact") {
    graph.push({ "@type": "ContactPage", "@id": url, url, name: page.title, description: page.description, about: { "@id": personId }, isPartOf: { "@id": website["@id"] } });
  }
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replace(/</g, "\\u003c");
}

// ---------- page ----------
function headFor(page, helmet) {
  const url = abs(page.route);
  const img = page.image || config.shareImage.path;
  const shareImg = config.shareImage;
  // Keep the design's own page styles (the <style> in its <helmet>).
  const styles = (helmet.match(/<style>[\s\S]*?<\/style>/g) || []).join("\n") +
    `\n<style>\n${fs.readFileSync(path.join(SITE, "overrides.css"), "utf8")}</style>`;
  const resources = {
    [REACT_URL]: RT + "/react.production.min.js",
    [REACT_DOM_URL]: RT + "/react-dom.production.min.js",
    "./Footer.dc.html": RT + "/Footer.dc.txt",
  };
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page.title)}</title>
<meta name="description" content="${esc(page.description)}">
<link rel="canonical" href="${url}">
<meta name="robots" content="${page.noindex ? "noindex" : "index, follow, max-image-preview:large"}">
<meta name="author" content="${esc(P.name)}">
<meta name="theme-color" content="#FA3420">
<meta property="og:type" content="${page.type === "project" ? "article" : "website"}">
<meta property="og:site_name" content="${esc(config.siteName)}">
<meta property="og:locale" content="en_CA">
<meta property="og:title" content="${esc(page.title)}">
<meta property="og:description" content="${esc(page.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${abs(shareImg.path)}">
<meta property="og:image:width" content="${shareImg.width}">
<meta property="og:image:height" content="${shareImg.height}">
<meta property="og:image:alt" content="${esc(shareImg.alt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(page.title)}">
<meta name="twitter:description" content="${esc(page.description)}">
<meta name="twitter:image" content="${abs(shareImg.path)}">
<link rel="icon" type="image/png" sizes="32x32" href="/images/favicon-32.png">
<link rel="icon" type="image/png" sizes="100x100" href="/images/favicon.png">
<link rel="apple-touch-icon" href="/images/apple-touch-icon.png">
${page.type === "project" && img ? `<link rel="preload" as="image" href="${img}">\n` : ""}<link rel="preconnect" href="https://use.typekit.net" crossorigin>
<link rel="stylesheet" href="https://use.typekit.net/jys7gci.css">
<link rel="preload" as="script" href="${RT}/react.production.min.js">
<link rel="preload" as="script" href="${RT}/react-dom.production.min.js">
${styles}
<script>window.__resources=${JSON.stringify(resources)};</script>
<script src="${RT}/support.js"></script>
${page.noindex ? "" : `<script type="application/ld+json">${jsonLd(page)}</script>`}`;
}

const NETLIFY_FORM = `<form name="contact" data-netlify="true" netlify-honeypot="bot-field" hidden>
<input type="hidden" name="form-name" value="contact"><input name="bot-field">
<input name="first"><input name="last"><input type="email" name="email"><textarea name="message"></textarea>
</form>
<script src="${RT}/form.js"></script>`;

function buildPage(page, file, dir) {
  const parsed = parseDc(fs.readFileSync(path.join(dir, file), "utf8"));
  if (!parsed) throw new Error(`${file} has no <x-dc> block — is it a Claude Design file?`);
  const t = rewrite(lazyImages(parsed.template));
  const s = rewrite(parsed.script);
  for (const l of new Set([...t.leftover, ...s.leftover])) warn(`${file} links to "${l}", which isn't in site.config.json`);
  const html = `<!DOCTYPE html>
<html lang="en-CA">
<head>
${headFor(page, parsed.helmet)}
</head>
<body>
<x-dc>
${t.src.trim()}
</x-dc>
${s.src}
<script src="${RT}/accordion.js"></script>
${page.form ? NETLIFY_FORM + "\n" : ""}</body>
</html>
`;
  const outFile = page.route.endsWith("/") ? path.join(OUT, page.route, "index.html") : path.join(OUT, page.route);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, html);
  return { text: pageText(parsed.template) };
}

// ---------- run ----------
console.log("Building site from /design ...");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, RT.slice(1)), { recursive: true });

// Assets: everything in the design export except the page files themselves.
for (const entry of fs.readdirSync(DESIGN, { withFileTypes: true })) {
  if (entry.isDirectory()) copyDir(path.join(DESIGN, entry.name), path.join(OUT, entry.name));
  else if (entry.name.endsWith(".json")) fs.copyFileSync(path.join(DESIGN, entry.name), path.join(OUT, entry.name));
}
fs.copyFileSync(path.join(DESIGN, "support.js"), path.join(OUT, RT, "support.js"));
for (const f of fs.readdirSync(path.join(SITE, "vendor"))) fs.copyFileSync(path.join(SITE, "vendor", f), path.join(OUT, RT, f));
fs.copyFileSync(path.join(SITE, "form.js"), path.join(OUT, RT, "form.js"));
fs.copyFileSync(path.join(SITE, "accordion.js"), path.join(OUT, RT, "accordion.js"));

// Shared components pulled in with <dc-import> (e.g. the footer).
const footer = findFile("Footer*.dc.html");
if (!footer) throw new Error("No Footer.dc.html in /design");
fs.writeFileSync(path.join(OUT, RT, "Footer.dc.txt"), rewrite(fs.readFileSync(path.join(DESIGN, footer), "utf8")).src);

// Pages.
const used = new Set([footer]);
const built = [];
for (const page of config.pages) {
  const file = findFile(page.file);
  if (!file) { warn(`No design file matches "${page.file}" — ${page.route} was skipped`); continue; }
  used.add(file);
  const { text } = buildPage(page, file, DESIGN);
  built.push({ ...page, text });
  console.log(`  ${file}  ->  ${page.route}`);
}
for (const g of config.ignore || []) { const f = findFile(g); if (f) used.add(f); }
for (const f of designFiles) if (!used.has(f)) warn(`New design file "${f}" isn't on the site yet — add it to site.config.json`);

// 404 page.
buildPage({ route: "/404.html", type: "404", noindex: true, title: "Page not found - Heather Stokes", description: "This page doesn't exist." }, "404.dc.html", SITE);

// sitemap.xml
const today = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(OUT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${built.map((p) => `  <url><loc>${abs(p.route)}</loc><lastmod>${today}</lastmod>${p.image ? `<image:image><image:loc>${abs(p.image)}</image:loc></image:image>` : ""}</url>`).join("\n")}
</urlset>
`);

// robots.txt — open to search engines and AI answer engines.
fs.writeFileSync(path.join(OUT, "robots.txt"), `User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`);

// llms.txt — a plain-text summary that AI answer engines can read easily.
fs.writeFileSync(path.join(OUT, "llms.txt"), `# ${P.name}

> ${P.description}

- Based in ${P.city}, ${P.region}, Canada
- Email: ${P.email}
- LinkedIn: ${P.sameAs[0]}
- Services: ${P.knowsAbout.join(", ")}

## Pages

${built.map((p) => `- [${p.title}](${abs(p.route)}): ${p.description}`).join("\n")}

${built.map((p) => `## ${p.title}\n\nURL: ${abs(p.route)}\n\n${p.text}`).join("\n\n")}
`);

console.log(`\nDone. ${built.length} pages built into /dist.`);
if (warnings.length) console.log(`${warnings.length} note(s) above need a look.`);
