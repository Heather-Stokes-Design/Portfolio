# heatherstokes.ca

Heather Stokes's portfolio site. It's built straight from the Claude Design files, so
the live site looks and moves exactly like the design.

## What's in this folder

| Folder / file | What it is | Do you edit it? |
|---|---|---|
| `design/` | The Claude Design export: page files, `img/`, `images/`, `support.js` | **Yes.** Replace it with each new export |
| `site.config.json` | Web address, page titles, Google descriptions, which file becomes which page | Sometimes |
| `site/` | The 404 page, the contact-form sender and a local copy of React | Rarely |
| `build.mjs` | The script that turns `design/` into the website | No |
| `netlify.toml` | Tells Netlify to run the build | No |
| `dist/` | The finished website (made by the build, not saved to GitHub) | No |

## Bringing in a new version from Claude Design

1. Export the handoff from Claude Design.
2. Delete everything inside this `design/` folder, then copy in everything from the
   export's `design/` folder.
3. Upload the changes to GitHub. Netlify rebuilds the site by itself in about a minute.

Or just bring the new export into Claude Code and say "update my portfolio site with this".

The page files can change names (for example `Homepage v3` becoming `Homepage v4`) and
they'll still be matched. If you **add a new page**, it needs a line in
`site.config.json` with its address, title and description. The build will tell you
when a design file isn't on the site yet.

## Preview on your own computer

```bash
node build.mjs
```

```bash
python3 -m http.server 8132 --directory dist
```

Then open http://localhost:8132. (The contact form only really sends on Netlify.)

## How people and search engines find it

- Every page has a real title, description, link-preview image and address in its
  page file, so Google, LinkedIn, iMessage and others can read it.
- Every page's words and image descriptions are in the page file itself, so tools that
  don't run JavaScript (some search and AI crawlers) can still read them.
- Structured data (schema.org) tells Google and AI answer engines who Heather is, where
  she works and what each project is.
- `sitemap.xml` lists every page, `robots.txt` lets every crawler in, and `llms.txt` is a
  plain-text summary written for AI answer engines.

## One-time setup

- **Netlify:** New site from GitHub, pick this repository. The settings come from
  `netlify.toml`, so leave the build boxes as they are.
- **Contact form emails:** in Netlify, go to Forms → contact → Form notifications, and
  add an email notification to hello@heatherstokes.ca.
- **Domain:** in Netlify, go to Domain management and add heatherstokes.ca. If the
  address ever changes, update `siteUrl` in `site.config.json`.
- **Fonts:** in Adobe Fonts, open web project `jys7gci` and add `heatherstokes.ca` and
  the Netlify address (`*.netlify.app`) to its domains, or the fonts won't show on the live site.
- **Google:** add the site in Google Search Console and submit
  `https://heatherstokes.ca/sitemap.xml`.
