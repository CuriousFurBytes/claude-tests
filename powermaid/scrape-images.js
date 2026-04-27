#!/usr/bin/env node

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const BASE = "https://powermaid.com.br";
const IMAGES_DIR = path.join(__dirname, "images");
const MAPPING_FILE = path.join(__dirname, "image-mapping.json");

const PAGES = [
  { url: "/", name: "home" },
  { url: "/mops/", name: "mops" },
  { url: "/lixeiras/", name: "lixeiras" },
  { url: "/lavanderia/", name: "lavanderia" },
  { url: "/quem-somos/", name: "quem-somos" },
  { url: "/sobre/", name: "sobre" },
  { url: "/blog/", name: "blog" },
  { url: "/contato-2/", name: "contato" },
  { url: "/esponjas/", name: "esponjas" },
  { url: "/panos/", name: "panos" },
];

function fetch(url, redirects = 0) {
  if (redirects > 5) return Promise.reject(new Error("Too many redirects"));
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        },
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          const loc = res.headers.location;
          const next = loc.startsWith("http")
            ? loc
            : new URL(loc, url).toString();
          return resolve(fetch(next, redirects + 1));
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ body: Buffer.concat(chunks), status: res.statusCode }));
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error("Timeout"));
    });
  });
}

function extractImageUrls(html, pageUrl) {
  const urls = new Set();
  const patterns = [
    /(?:src|data-src|data-lazy-src|data-bg|data-background-image|srcset)\s*=\s*["']([^"']+\.(?:jpg|jpeg|png|gif|webp|svg|avif)[^"']*)/gi,
    /url\(\s*['"]?([^'")]+\.(?:jpg|jpeg|png|gif|webp|svg|avif)[^'")]*)/gi,
    /content\s*:\s*["']([^"']+\.(?:jpg|jpeg|png|gif|webp|svg|avif))/gi,
    /<meta[^>]+content=["']([^"']+\.(?:jpg|jpeg|png|gif|webp|svg|avif)[^"']*)/gi,
  ];

  for (const pat of patterns) {
    let m;
    while ((m = pat.exec(html)) !== null) {
      let u = m[1].split(",")[0].trim().split(" ")[0];
      if (u.startsWith("//")) u = "https:" + u;
      else if (u.startsWith("/")) u = BASE + u;
      else if (!u.startsWith("http")) u = new URL(u, pageUrl).toString();
      if (u.includes("powermaid.com.br") || u.includes("wp-content")) {
        urls.add(u);
      }
    }
  }
  return [...urls];
}

function sanitizeFilename(url) {
  const parsed = new URL(url);
  let name = parsed.pathname.replace(/^\//, "").replace(/\//g, "_");
  const qs = parsed.search.replace(/[?&=]/g, "_");
  if (qs) name += qs;
  name = name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
  if (name.length > 120) {
    const ext = path.extname(name) || ".jpg";
    name = name.substring(0, 116) + ext;
  }
  return name;
}

async function downloadImage(url, filename) {
  const dest = path.join(IMAGES_DIR, filename);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    return { url, filename, status: "exists" };
  }
  try {
    const { body, status } = await fetch(url);
    if (status !== 200 || body.length < 100) {
      return { url, filename, status: `failed (${status})` };
    }
    fs.writeFileSync(dest, body);
    return { url, filename, status: "downloaded", size: body.length };
  } catch (err) {
    return { url, filename, status: `error: ${err.message}` };
  }
}

async function main() {
  if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

  console.log("=== Powermaid Image Scraper ===\n");
  const allImages = new Map();

  for (const page of PAGES) {
    const url = BASE + page.url;
    console.log(`Fetching: ${url}`);
    try {
      const { body, status } = await fetch(url);
      if (status !== 200) {
        console.log(`  ✗ Status ${status}\n`);
        continue;
      }
      const html = body.toString("utf-8");
      const images = extractImageUrls(html, url);
      console.log(`  ✓ Found ${images.length} images`);
      for (const img of images) {
        if (!allImages.has(img)) {
          allImages.set(img, { pages: [page.name], filename: sanitizeFilename(img) });
        } else {
          allImages.get(img).pages.push(page.name);
        }
      }
    } catch (err) {
      console.log(`  ✗ ${err.message}\n`);
    }
  }

  console.log(`\nTotal unique images found: ${allImages.size}`);
  console.log("\nDownloading images...\n");

  const mapping = {};
  let downloaded = 0;
  let failed = 0;

  for (const [url, info] of allImages) {
    const result = await downloadImage(url, info.filename);
    mapping[url] = {
      local: `images/${info.filename}`,
      pages: info.pages,
      status: result.status,
      size: result.size,
    };
    if (result.status === "downloaded" || result.status === "exists") {
      console.log(`  ✓ ${info.filename} (${result.size || "cached"})`);
      downloaded++;
    } else {
      console.log(`  ✗ ${info.filename} - ${result.status}`);
      failed++;
    }
  }

  fs.writeFileSync(MAPPING_FILE, JSON.stringify(mapping, null, 2));
  console.log(`\n=== Summary ===`);
  console.log(`Downloaded: ${downloaded}`);
  console.log(`Failed: ${failed}`);
  console.log(`Mapping saved to: ${MAPPING_FILE}`);
  console.log(`\nRun "node update-html.js" next to update HTML files with local images.`);
}

main().catch(console.error);
