#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const MAPPING_FILE = path.join(__dirname, "image-mapping.json");
const HTML_DIR = __dirname;

if (!fs.existsSync(MAPPING_FILE)) {
  console.error("image-mapping.json not found. Run scrape-images.js first.");
  process.exit(1);
}

const mapping = JSON.parse(fs.readFileSync(MAPPING_FILE, "utf-8"));

const successfulImages = Object.entries(mapping).filter(
  ([, v]) => v.status === "downloaded" || v.status === "exists"
);

if (successfulImages.length === 0) {
  console.error("No images were downloaded. Check scrape-images.js output.");
  process.exit(1);
}

console.log(`Found ${successfulImages.length} downloaded images.\n`);

const byPage = {};
for (const [url, info] of successfulImages) {
  for (const page of info.pages) {
    if (!byPage[page]) byPage[page] = [];
    byPage[page].push({ url, local: info.local });
  }
}

const imagesByRole = classifyImages(successfulImages);
console.log("\nClassified images:");
for (const [role, imgs] of Object.entries(imagesByRole)) {
  console.log(`  ${role}: ${imgs.length} image(s)`);
}

const pageFileMap = {
  home: "index.html",
  mops: "mops.html",
  lixeiras: "lixeiras.html",
  lavanderia: "lavanderia.html",
  "quem-somos": "sobre.html",
  sobre: "sobre.html",
  blog: "blog.html",
  contato: "contato.html",
};

const htmlFiles = fs
  .readdirSync(HTML_DIR)
  .filter((f) => f.endsWith(".html") && f !== "scrape-images.html");

for (const file of htmlFiles) {
  const filePath = path.join(HTML_DIR, file);
  let html = fs.readFileSync(filePath, "utf-8");
  let changes = 0;

  const pageName = Object.entries(pageFileMap).find(([, v]) => v === file)?.[0];
  const pageImages = pageName ? byPage[pageName] || [] : [];

  const logo = imagesByRole.logo?.[0];
  if (logo) {
    const logoRegex =
      /<a[^>]*class="[^"]*btn btn-ghost[^"]*"[^>]*>\s*<span class="text-pm-red">POWER<\/span><span class="text-pm-dark">MAID<\/span>\s*<\/a>/g;
    const replacement = `<a href="index.html" class="btn btn-ghost text-xl font-black tracking-tight"><img src="${logo.local}" alt="Powermaid" class="h-8"></a>`;
    const newHtml = html.replace(logoRegex, replacement);
    if (newHtml !== html) {
      changes++;
      html = newHtml;
    }
  }

  const heroImages = imagesByRole.hero || [];
  if (heroImages.length > 0 && file === "index.html") {
    const heroImg = heroImages[0];
    const svgHeroRegex =
      /<svg viewBox="0 0 500 400"[^>]*>[\s\S]*?<text[^>]*>Produtos de Limpeza<\/text>\s*<\/svg>/;
    if (svgHeroRegex.test(html)) {
      html = html.replace(
        svgHeroRegex,
        `<img src="${heroImg.local}" alt="Powermaid - Produtos de Limpeza" class="w-full max-w-lg mx-auto rounded-2xl shadow-2xl">`
      );
      changes++;
    }
  }

  for (const { url, local } of pageImages) {
    const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const urlRegex = new RegExp(escaped, "g");
    const newHtml = html.replace(urlRegex, local);
    if (newHtml !== html) {
      changes++;
      html = newHtml;
    }
  }

  if (changes > 0) {
    fs.writeFileSync(filePath, html);
    console.log(`Updated ${file} (${changes} change(s))`);
  }
}

generateImageReport(imagesByRole, byPage);

function classifyImages(images) {
  const result = { logo: [], hero: [], product: [], blog: [], about: [], other: [] };

  for (const [url, info] of images) {
    const lower = url.toLowerCase();
    const fname = info.local.toLowerCase();

    if (
      lower.includes("logo") ||
      lower.includes("brand") ||
      fname.includes("logo")
    ) {
      result.logo.push({ url, ...info });
    } else if (
      lower.includes("hero") ||
      lower.includes("banner") ||
      lower.includes("header") ||
      lower.includes("slide")
    ) {
      result.hero.push({ url, ...info });
    } else if (
      lower.includes("blog") ||
      lower.includes("post") ||
      lower.includes("artigo")
    ) {
      result.blog.push({ url, ...info });
    } else if (
      lower.includes("sobre") ||
      lower.includes("quem-somos") ||
      lower.includes("team") ||
      lower.includes("equipe")
    ) {
      result.about.push({ url, ...info });
    } else if (
      lower.includes("mop") ||
      lower.includes("lixeir") ||
      lower.includes("lavanderia") ||
      lower.includes("product") ||
      lower.includes("produto") ||
      lower.includes("esponj") ||
      lower.includes("pano")
    ) {
      result.product.push({ url, ...info });
    } else {
      result.other.push({ url, ...info });
    }
  }

  return result;
}

function generateImageReport(classified, byPage) {
  const lines = ["\n=== Image Replacement Report ===\n"];
  lines.push("To manually replace SVG placeholders with downloaded images:");
  lines.push("Edit the HTML files and replace <svg>...</svg> blocks with <img> tags.\n");
  lines.push("Available images by category:\n");

  for (const [cat, imgs] of Object.entries(classified)) {
    if (imgs.length === 0) continue;
    lines.push(`--- ${cat.toUpperCase()} ---`);
    for (const img of imgs) {
      lines.push(`  ${img.local}`);
      lines.push(`  Source: ${img.url}`);
      lines.push(`  Pages: ${img.pages?.join(", ") || "unknown"}\n`);
    }
  }

  lines.push(
    "\nTip: For product cards, replace the <figure> SVG content with:"
  );
  lines.push(
    '  <img src="images/FILENAME" alt="Product Name" class="h-full w-full object-contain p-4">'
  );

  const report = lines.join("\n");
  console.log(report);
  fs.writeFileSync(path.join(__dirname, "image-report.txt"), report);
  console.log("\nReport saved to image-report.txt");
}
