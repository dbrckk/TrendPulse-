#!/usr/bin/env node

import fs from "fs/promises";

const BASE_URL = "https://www.trend-pulse.shop";

function url(path) {
  return `${BASE_URL}${path}`;
}

async function loadJSON(path) {
  const raw = await fs.readFile(path, "utf-8");
  return JSON.parse(raw);
}

function buildUrlEntry(loc, priority = "0.7", changefreq = "daily") {
  return `
  <url>
    <loc>${loc}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

function buildSitemapXML(urls) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;
}

async function generate() {
  const pages = await loadJSON("programmatic-pages.json");

  const urls = [];

  // Homepage
  urls.push(buildUrlEntry(url("/"), "1.0", "daily"));

  // Core pages
  urls.push(buildUrlEntry(url("/deals"), "0.9"));
  urls.push(buildUrlEntry(url("/catalog"), "0.9"));

  // Category pages
  const categories = [
    "tech",
    "home",
    "kitchen",
    "beauty",
    "health",
    "sports",
    "travel",
    "fashion",
    "family"
  ];

  for (const cat of categories) {
    urls.push(buildUrlEntry(url(`/catalog/${cat}`), "0.8"));
  }

  // Programmatic pages (1000+)
  for (const page of pages) {
    urls.push(buildUrlEntry(url(`/collections/${page.slug}`), "0.7"));
  }

  const xml = buildSitemapXML(urls);

  await fs.writeFile("public/sitemap.xml", xml, "utf-8");

  console.log(`[sitemap] generated ${urls.length} urls`);
}

generate().catch((e) => {
  console.error("[sitemap] error", e);
  process.exit(1);
});
