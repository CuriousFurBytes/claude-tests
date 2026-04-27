/**
 * Powermaid Dynamic Image Loader
 * Fetches the corresponding page from powermaid.com.br and replaces
 * SVG placeholders with actual product images.
 */
(function () {
  const PAGE_MAP = {
    "index.html": "https://powermaid.com.br/",
    "mops.html": "https://powermaid.com.br/mops/",
    "lixeiras.html": "https://powermaid.com.br/lixeiras/",
    "lavanderia.html": "https://powermaid.com.br/lavanderia/",
    "sobre.html": "https://powermaid.com.br/quem-somos/",
    "blog.html": "https://powermaid.com.br/blog/",
    "contato.html": "https://powermaid.com.br/contato-2/",
  };

  const PROXY_URLS = [
    (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  ];

  const currentPage =
    location.pathname.split("/").pop() || "index.html";
  const sourceUrl = PAGE_MAP[currentPage];
  if (!sourceUrl) return;

  async function fetchHTML(url) {
    for (const makeProxy of PROXY_URLS) {
      try {
        const res = await fetch(makeProxy(url));
        if (res.ok) {
          const text = await res.text();
          if (text.length > 500) return text;
        }
      } catch {}
    }
    try {
      const res = await fetch(url, { mode: "cors" });
      if (res.ok) return await res.text();
    } catch {}
    return null;
  }

  function extractImages(html, baseUrl) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const images = [];

    doc.querySelectorAll("img").forEach((img) => {
      const src =
        img.getAttribute("data-src") ||
        img.getAttribute("data-lazy-src") ||
        img.getAttribute("src");
      if (!src || src.startsWith("data:")) return;

      let fullUrl;
      try {
        fullUrl = new URL(src, baseUrl).href;
      } catch {
        return;
      }

      const alt = img.getAttribute("alt") || "";
      const width = img.naturalWidth || img.width || 0;
      const cls = img.className || "";
      const parent = img.parentElement;
      const parentCls = parent ? parent.className || "" : "";

      images.push({ url: fullUrl, alt, width, cls, parentCls });
    });

    // Also extract background images
    doc
      .querySelectorAll('[style*="background"]')
      .forEach((el) => {
        const m = el.style.backgroundImage?.match(
          /url\(["']?([^"')]+)/
        );
        if (m) {
          try {
            images.push({
              url: new URL(m[1], baseUrl).href,
              alt: "background",
              width: 0,
              cls: "bg",
              parentCls: "",
            });
          } catch {}
        }
      });

    return images;
  }

  function classifyImage(img) {
    const u = img.url.toLowerCase();
    const a = img.alt.toLowerCase();
    const c = (img.cls + " " + img.parentCls).toLowerCase();

    if (u.includes("logo") || a.includes("logo") || c.includes("logo"))
      return "logo";
    if (
      u.includes("hero") ||
      u.includes("banner") ||
      u.includes("slide") ||
      c.includes("hero") ||
      c.includes("swiper")
    )
      return "hero";
    if (u.includes("blog") || u.includes("post") || a.includes("blog"))
      return "blog";
    return "product";
  }

  function replaceSVGPlaceholders(images) {
    const figures = document.querySelectorAll("figure");
    const productImages = images.filter(
      (img) => classifyImage(img) === "product"
    );
    const heroImages = images.filter(
      (img) => classifyImage(img) === "hero"
    );
    const logoImages = images.filter(
      (img) => classifyImage(img) === "logo"
    );

    // Replace logo
    if (logoImages.length > 0) {
      document
        .querySelectorAll(".navbar .btn-ghost")
        .forEach((el) => {
          if (el.textContent.includes("POWER")) {
            el.innerHTML = `<img src="${logoImages[0].url}" alt="Powermaid" class="h-8" crossorigin="anonymous">`;
          }
        });
    }

    // Replace hero SVG
    if (heroImages.length > 0) {
      const heroSection = document.querySelector(".hero svg, .hero-gradient svg");
      if (heroSection && heroSection.closest(".hero-content, .hero")) {
        const img = document.createElement("img");
        img.src = heroImages[0].url;
        img.alt = "Powermaid";
        img.className = "w-full max-w-lg mx-auto rounded-2xl shadow-2xl";
        img.crossOrigin = "anonymous";
        heroSection.replaceWith(img);
      }
    }

    // Replace product card SVGs
    let pIdx = 0;
    figures.forEach((figure) => {
      const svg = figure.querySelector("svg");
      if (!svg) return;
      if (pIdx >= productImages.length) return;

      const pImg = productImages[pIdx];
      const img = document.createElement("img");
      img.src = pImg.url;
      img.alt = pImg.alt || "Produto Powermaid";
      img.className = "h-full w-full object-contain p-4";
      img.crossOrigin = "anonymous";
      img.loading = "lazy";
      img.onerror = function () {
        this.replaceWith(svg);
      };
      svg.replaceWith(img);
      pIdx++;
    });

    // Replace blog card images
    const blogImages = images.filter(
      (img) => classifyImage(img) === "blog"
    );
    if (blogImages.length > 0) {
      document
        .querySelectorAll(".blog-card figure svg")
        .forEach((svg, i) => {
          if (i >= blogImages.length) return;
          const img = document.createElement("img");
          img.src = blogImages[i].url;
          img.alt = blogImages[i].alt || "Blog Powermaid";
          img.className = "h-full w-full object-cover";
          img.crossOrigin = "anonymous";
          img.loading = "lazy";
          img.onerror = function () {
            this.replaceWith(svg);
          };
          svg.replaceWith(img);
        });
    }
  }

  async function init() {
    const html = await fetchHTML(sourceUrl);
    if (!html) return;
    const images = extractImages(html, sourceUrl);
    if (images.length > 0) {
      replaceSVGPlaceholders(images);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
