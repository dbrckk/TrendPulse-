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

const EXPECTED_SCRIPT_ORDER = [
  "/assets/js/supabase.js",
  "/assets/js/trendpulse-data.js"
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

function checkScriptOrder(html, fileName) {
  const issues = [];

  for (const script of EXPECTED_SCRIPT_ORDER) {
    if (!html.includes(script)) {
      issues.push(`${fileName}: missing ${script}`);
    }
  }

  const supabaseIndex = html.indexOf("/assets/js/supabase.js");
  const dataIndex = html.indexOf("/assets/js/trendpulse-data.js");

  if (supabaseIndex !== -1 && dataIndex !== -1 && supabaseIndex > dataIndex) {
    issues.push(`${fileName}: supabase.js must be loaded before trendpulse-data.js`);
  }

  return issues;
}

function checkAnalyticsPlacement(html, fileName) {
  const issues = [];

  const analyticsIndex = html.indexOf("trendpulse-analytics.js");
  const bodyCloseIndex = html.lastIndexOf("</body>");

  if (analyticsIndex !== -1 && analyticsIndex < bodyCloseIndex - 200) {
    issues.push(`${fileName}: analytics should be at the end of <body>`);
  }

  return issues;
}

function checkLegacyLinks(html, fileName) {
  const issues = [];
  const forbidden = [".html"];

  for (const bad of forbidden) {
    if (html.includes(bad) && !fileName.endsWith(".html")) continue;

    const matches = html.match(/href="([^"]+)"/g) || [];
    for (const m of matches) {
      if (m.includes(".html") && !m.includes("index.html")) {
        issues.push(`${fileName}: contains legacy link ${m}`);
      }
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

async function main() {
  let errors = [];

  console.log("🔍 Checking required files...");

  for (const file of REQUIRED_FILES) {
    const exists = await fileExists(file);
    if (!exists) {
      errors.push(`Missing file: ${file}`);
    }
  }

  console.log("🔍 Checking HTML structure...");

  const htmlFiles = [
    "index.html",
    "deals.html",
    "catalog.html",
    "catalog-category.html",
    "programmatic-seo.html",
    "product.html"
  ];

  for (const file of htmlFiles) {
    const content = await readFileSafe(file);
    if (!content) continue;

    errors.push(...checkScriptOrder(content, file));
    errors.push(...checkAnalyticsPlacement(content, file));
    errors.push(...checkLegacyLinks(content, file));
    errors.push(...checkRequiredIds(content, file));
  }

  console.log("🔍 Checking programmatic pages...");

  const pagesContent = await readFileSafe("programmatic-pages.json");
  if (pagesContent) {
    try {
      const pages = JSON.parse(pagesContent);
      if (!Array.isArray(pages)) {
        errors.push("programmatic-pages.json is not an array");
      } else if (pages.length < 1000) {
        errors.push(`programmatic-pages.json has only ${pages.length} pages (expected 1000+)`);
      }
    } catch {
      errors.push("programmatic-pages.json is invalid JSON");
    }
  }

  if (errors.length) {
    console.log("\n❌ ISSUES FOUND:\n");
    errors.forEach((e) => console.log(" - " + e));
    process.exit(1);
  }

  console.log("\n✅ Site check passed");
}

main();
