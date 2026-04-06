#!/usr/bin/env node

import fs from "fs/promises";

const REQUIRED_FILES = [
  "index.html",
  "deals.html",
  "catalog.html",
  "catalog-category.html",
  "product.html",
  "programmatic-seo.html",
  "404.html",

  "assets/js/supabase.js",
  "assets/js/trendpulse-data.js",
  "assets/js/trendpulse-ui.js",
  "assets/js/catalog-category.js",
  "assets/js/programmatic-seo.js",
  "assets/js/product-page.js",

  "generate-programmatic-pages.js",
  "generate-sitemap.js",
  "programmatic-pages.json",
  "vercel.json",
  "robots.txt"
];

// pages qui doivent charger les scripts data
const DATA_REQUIRED_PAGES = [
  "index.html",
  "deals.html",
  "catalog-category.html",
  "programmatic-seo.html"
];

async function fileExists(path) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function readFileSafe(path) {
  try {
    return await fs.readFile(path, "utf-8");
  } catch {
    return null;
  }
}

function checkScripts(html, fileName) {
  const issues = [];

  const requiresData = DATA_REQUIRED_PAGES.includes(fileName);

  if (requiresData) {
    if (!html.includes("/assets/js/supabase.js")) {
      issues.push(`${fileName}: missing supabase.js`);
    }

    if (!html.includes("/assets/js/trendpulse-data.js")) {
      issues.push(`${fileName}: missing trendpulse-data.js`);
    }

    const supabaseIndex = html.indexOf("/assets/js/supabase.js");
    const dataIndex = html.indexOf("/assets/js/trendpulse-data.js");

    if (supabaseIndex !== -1 && dataIndex !== -1 && supabaseIndex > dataIndex) {
      issues.push(`${fileName}: supabase.js must load before trendpulse-data.js`);
    }
  }

  return issues;
}

function checkAnalytics(html, fileName) {
  const issues = [];

  const analyticsIndex = html.indexOf("trendpulse-analytics.js");
  const bodyCloseIndex = html.lastIndexOf("</body>");

  if (analyticsIndex !== -1 && bodyCloseIndex !== -1) {
    const distance = bodyCloseIndex - analyticsIndex;

    if (distance > 300) {
      issues.push(`${fileName}: analytics should be at the end of <body>`);
    }
  }

  return issues;
}

function checkLegacyLinks(html, fileName) {
  const issues = [];

  const matches = html.match(/href="([^"]+)"/g) || [];

  for (const m of matches) {
    if (
      m.includes(".html") &&
      !m.includes("index.html") &&
      !m.includes("mailto:") &&
      !m.includes("http")
    ) {
      issues.push(`${fileName}: legacy link detected -> ${m}`);
    }
  }

  return issues;
}

function checkRequiredIds(html, fileName) {
  const issues = [];

  if (fileName === "programmatic-seo.html") {
    const ids = [
      "collection-title",
      "collection-description",
      "collection-count",
      "collection-grid",
      "collection-seo-text"
    ];

    for (const id of ids) {
      if (!html.includes(`id="${id}"`)) {
        issues.push(`${fileName}: missing id ${id}`);
      }
    }
  }

  if (fileName === "catalog-category.html") {
    const ids = ["category-title", "category-description", "products"];

    for (const id of ids) {
      if (!html.includes(`id="${id}"`)) {
        issues.push(`${fileName}: missing id ${id}`);
      }
    }
  }

  return issues;
}

async function checkProgrammaticPages(errors) {
  const content = await readFileSafe("programmatic-pages.json");

  if (!content) {
    errors.push("programmatic-pages.json missing");
    return;
  }

  try {
    const pages = JSON.parse(content);

    if (!Array.isArray(pages)) {
      errors.push("programmatic-pages.json is not an array");
    } else if (pages.length < 1000) {
      errors.push(`programmatic-pages.json has ${pages.length} pages (expected 1000+)`);
    }
  } catch {
    errors.push("programmatic-pages.json invalid JSON");
  }
}

async function main() {
  let errors = [];

  console.log("🔍 Checking required files...");

  for (const file of REQUIRED_FILES) {
    const exists = await fileExists(file);
    if (!exists) {
      errors.push(`Missing file: ${file}`);
    }
  }

  console.log("🔍 Checking HTML...");

  const htmlFiles = [
    "index.html",
    "deals.html",
    "catalog.html",
    "catalog-category.html",
    "programmatic-seo.html",
    "product.html"
  ];

  for (const file of htmlFiles) {
    const html = await readFileSafe(file);
    if (!html) continue;

    errors.push(...checkScripts(html, file));
    errors.push(...checkAnalytics(html, file));
    errors.push(...checkLegacyLinks(html, file));
    errors.push(...checkRequiredIds(html, file));
  }

  console.log("🔍 Checking programmatic pages...");
  await checkProgrammaticPages(errors);

  if (errors.length) {
    console.log("\n❌ ISSUES FOUND:\n");
    errors.forEach((e) => console.log(" - " + e));
    process.exit(1);
  }

  console.log("\n✅ Site check passed");
}

main();
