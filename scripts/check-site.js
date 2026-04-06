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

const PAGE_SCRIPT_RULES = {
  "index.html": [
    "/assets
