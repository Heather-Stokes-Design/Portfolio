// Safety check for the built site in /dist. Runs automatically at the end of `node build.mjs`.
// If anything is broken (a link to a page that doesn't exist, a missing image or video,
// a video browsers can't play), the build fails — and Netlify then refuses to publish,
// so the live site stays exactly as it was.
//
// Run on its own with `node check.mjs`; add `--external` to also test links to other websites
// (those only ever warn, since other sites can be slow or block automated checks).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

export async function runChecks(out = path.join(ROOT, "dist"), { external = false } = {}) {
  const errors = [], warnings = [], externals = new Map();
  const rel = (f) => "/" + path.relative(out, f).split(path.sep).join("/");
  const pageName = (f) => rel(f).replace(/index\.html$/, "") || "/";

  // Every built page, plus the shared footer that gets pulled into each one.
  const files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".html")) files.push(p);
    }
  })(out);
  const footer = path.join(out, "_dc", "Footer.dc.txt");
  if (fs.existsSync(footer)) files.push(footer);

  const htmlFor = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
  const resolvePage = (p) => {
    const clean = decodeURI(p);
    const direct = path.join(out, clean);
    if (clean.endsWith("/")) return fs.existsSync(path.join(direct, "index.html")) ? path.join(direct, "index.html") : null;
    if (fs.existsSync(direct) && fs.statSync(direct).isFile()) return direct;
    if (fs.existsSync(path.join(direct, "index.html"))) return path.join(direct, "index.html");
    return null;
  };
  const hasAnchor = (html, id) => new RegExp(`id=["']${id}["']|["']${id}["']`).test(html);

  const media = new Set();
  for (const [file, html] of htmlFor) {
    const where = file === footer ? "the footer" : `the ${pageName(file)} page`;

    // Links still pointing at design files (e.g. "Project - X.dc.html") mean a page isn't wired up.
    for (const m of html.matchAll(/(?:href=|href:\s*)["']([^"']*\.dc\.html[^"']*)["']/g))
      errors.push(`${where} links to "${m[1]}", which isn't a page on the site (add it to site.config.json)`);

    // Every site-relative address: links, images, videos, data files.
    const refs = [
      ...[...html.matchAll(/["'`(](\/(?!\/)[^"'`()\s<>{}$\\]*)/g)].map((m) => m[1]),
      ...[...html.matchAll(/(?<!\[)(?:href|xlink:href)=["'](#[^"']+)["']|href:\s*["'](#[^"']+)["']/g)].map((m) => m[1] || m[2]),
    ];
    for (const ref of refs) {
      if (ref === "#" || ref === "/") continue;
      const [p, hash] = ref.split("#");
      const target = p ? resolvePage(p.split("?")[0]) : (file === footer ? null : file);
      if (p && !target) { errors.push(`${where} points to "${ref}", which doesn't exist`); continue; }
      if (p && /\.(jpe?g|png|gif|webp|svg|avif|mp4|webm|mov|json)$/i.test(p)) media.add(target);
      if (hash && target && target.endsWith(".html") && !hasAnchor(htmlFor.get(target) || fs.readFileSync(target, "utf8"), hash))
        errors.push(`${where} links to "${ref}", but that page has no "${hash}" section`);
    }
    for (const m of html.matchAll(/href=["'](https?:\/\/[^"']+)["']/g)) {
      if (/use\.typekit\.net|heatherstokes\.ca/.test(m[1])) continue;
      if (!externals.has(m[1])) externals.set(m[1], where);
    }
  }

  // Images and videos: present, not empty, and in a format browsers can show.
  for (const f of media) {
    const name = rel(f), buf = fs.readFileSync(f), size = buf.length;
    if (!size) { errors.push(`${name} is an empty file`); continue; }
    const ext = path.extname(f).toLowerCase();
    if (ext === ".json") { try { JSON.parse(buf); } catch { errors.push(`${name} is damaged (not valid data)`); } continue; }
    if ([".mp4", ".mov", ".webm"].includes(ext)) {
      const v = videoInfo(buf);
      if (ext !== ".webm" && !v.ok) errors.push(`${name} is damaged or incomplete — it won't play`);
      else if (v.codecs.some((c) => c === "hvc1" || c === "hev1")) warnings.push(`${name} uses HEVC, which won't play in Firefox or some Chrome/Windows setups — export it as H.264`);
      else if (ext !== ".webm" && !v.codecs.some((c) => c === "avc1" || c === "avc3")) errors.push(`${name} isn't H.264 (${v.codecs.join(", ") || "unknown format"}) — most browsers won't play it`);
      if (size > 10 * 1048576) warnings.push(`${name} is ${(size / 1048576).toFixed(1)} MB — big for a web video, slow on phones`);
      continue;
    }
    if (!imageOk(buf, ext)) errors.push(`${name} isn't a real ${ext.slice(1).toUpperCase()} image — it will show as broken`);
    else if (size > 2 * 1048576) warnings.push(`${name} is ${(size / 1048576).toFixed(1)} MB — big for a web image, slow on phones`);
  }

  if (external) {
    for (const [url, where] of externals) {
      if (/linkedin\.com/.test(url)) continue; // LinkedIn refuses all automated checks
      try {
        const r = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(15000), headers: { "user-agent": "Mozilla/5.0" } });
        if (r.status >= 400) warnings.push(`${where} links to ${url}, which answered "${r.status}" — check it opens`);
      } catch { warnings.push(`${where} links to ${url}, which didn't respond — check it opens`); }
    }
  }

  console.log(`\nSafety check: ${files.length} pages, ${media.size} images/videos/data files${external ? `, ${externals.size} outside links` : ""}.`);
  for (const w of warnings) console.log("  ! " + w);
  for (const e of errors) console.log("  ✗ " + e);
  if (errors.length) console.log(`\n✗ ${errors.length} problem(s) found. NOT safe to publish — Netlify will refuse this build and keep the current live site.`);
  else console.log("✓ No broken links, images or videos.");
  return errors.length === 0;
}

// MP4/MOV: must have the parts a player needs (ftyp + moov), and we read which video/audio formats it uses.
function videoInfo(buf) {
  const has = (s) => buf.indexOf(s) !== -1;
  const codecs = [];
  for (let i = buf.indexOf("stsd"); i !== -1; i = buf.indexOf("stsd", i + 4)) {
    const fourcc = buf.toString("latin1", i + 16, i + 20);
    if (/^[\w ]{4}$/.test(fourcc)) codecs.push(fourcc.trim());
  }
  return { ok: has("ftyp") && has("moov") && has("mdat"), codecs };
}

function imageOk(buf, ext) {
  const hex = buf.subarray(0, 12).toString("hex"), head = buf.subarray(0, 512).toString("latin1");
  if (ext === ".jpg" || ext === ".jpeg") return hex.startsWith("ffd8");
  if (ext === ".png") return hex.startsWith("89504e47");
  if (ext === ".gif") return head.startsWith("GIF8");
  if (ext === ".webp") return head.startsWith("RIFF") && head.slice(8, 12) === "WEBP";
  if (ext === ".avif") return head.slice(4, 12).startsWith("ftyp");
  if (ext === ".svg") return /<svg[\s>]/i.test(buf.toString("utf8"));
  return true;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ok = await runChecks(undefined, { external: process.argv.includes("--external") });
  process.exit(ok ? 0 : 1);
}
