#!/usr/bin/env node

import fs from "fs/promises";
import { createClient } from "@supabase/supabase-js";

const SITE_URL = "https://www.trend-pulse.shop";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const staticUrls = [
  { loc: "/", changefreq: "daily", priority: "1.0" },
  { loc: "/deals", changefreq: "hourly", priority: "0.9" },
  { loc: "/catalog", changefreq: "daily", priority: "0.9" }
];

const categories = [
  "tech",
  "home",
  "kitchen",
  "beauty",
  "health",
  "sports",
  "travel",
  "fashion",
  "family",
  "general"
];

function xmlEscape(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildUrlNode({ loc, changefreq, priority, lastmod }) {
  return `  <url>
    <loc>${xmlEscape(loc)}</loc>
    ${lastmod ? `<lastmod>${xmlEscape(lastmod)}</lastmod>` : ""}
    <changefreq>${xmlEscape(changefreq)}</changefreq>
    <priority>${xmlEscape(priority)}</priority>
  </url>`;
}

function toAbsoluteUrl(pathname) {
  return `${SITE_URL}${pathname}`;
}

function isValidSlug(value = "") {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(String(value).trim());
}

function isValidAsin(value = "") {
  return /^[A-Z0-9]{10}$/i.test(String(value).trim());
}

function normalizeCategory(value = "") {
  const v = String(value || "").trim().toLowerCase();

  if (["men", "women", "jewelry", "jewellery", "shoes", "watches"].includes(v)) {
    return "fashion";
  }

  if (["baby", "kids", "pets", "toys"].includes(v)) {
    return "family";
  }

  if (categories.includes(v)) {
    return v;
  }

  return "general";
}

function dedupeByLoc(items) {
  const seen = new Set();
  const out = [];

  for (const item of items) {
    if (!item?.loc) continue;
    if (seen.has(item.loc)) continue;
    seen.add(item.loc);
    out.push(item);
  }

  return out;
}

async function fetchProducts() {
  const pageSize = 1000;
  let from = 0;
  const all = [];

  while (true) {
    const to = from + pageSize - 1;

    const { data, error } = await supabase
      .from("products")
      .select("asin, slug, updated_at, is_active, category")
      .range(from, to);

    if (error) {
      throw new Error(`Failed to fetch products: ${error.message}`);
    }

    if (!data || data.length === 0) break;

    all.push(...data);

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

async function fetchCatalogSourceAsins() {
  const pageSize = 1000;
  let from = 0;
  const all = [];

  while (true) {
    const to = from + pageSize - 1;

    const { data, error } = await supabase
      .from("product_sources")
      .select("asin, category, is_active")
      .eq("source_kind", "catalog")
      .eq("is_active", true)
      .range(from, to);

    if (error) {
      throw new Error(`Failed to fetch catalog sources: ${error.message}`);
    }

    if (!data || data.length === 0) break;

    all.push(...data);

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

async function fetchProgrammaticPages() {
  try {
    const raw = await fs.readFile("programmatic-pages.json", "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildCategoryUrls() {
  return categories.map((category) => ({
    loc: toAbsoluteUrl(`/catalog/${encodeURIComponent(category)}`),
    changefreq: "daily",
    priority: "0.8"
  }));
}

function buildProgrammaticUrls(programmaticPages) {
  return (programmaticPages || [])
    .filter((page) => page?.slug)
    .map((page) => ({
      loc: toAbsoluteUrl(`/collections/${encodeURIComponent(page.slug)}`),
      changefreq: "daily",
      priority: "0.7"
    }));
}

function buildProductUrls(products, catalogSources) {
  const catalogAsinSet = new Set(
    (catalogSources || [])
      .map((row) => String(row.asin || "").trim().toUpperCase())
      .filter(Boolean)
  );

  const byAsinCategory = new Map();

  for (const row of catalogSources || []) {
    const asin = String(row.asin || "").trim().toUpperCase();
    if (!asin) continue;
    byAsinCategory.set(asin, normalizeCategory(row.category));
  }

  const urls = [];

  for (const product of products || []) {
    const asin = String(product?.asin || "").trim().toUpperCase();
    const slug = String(product?.slug || "").trim();

    if (!asin || !catalogAsinSet.has(asin)) continue;
    if (product?.is_active === false) continue;

    let productPath = null;

    if (slug && isValidSlug(slug)) {
      productPath = `/product/${encodeURIComponent(slug)}`;
    } else if (isValidAsin(asin)) {
      productPath = `/product/${encodeURIComponent(asin)}`;
    }

    if (!productPath) continue;

    urls.push({
      loc: toAbsoluteUrl(productPath),
      changefreq: "weekly",
      priority: "0.6",
      lastmod: product.updated_at
        ? new Date(product.updated_at).toISOString()
        : undefined
    });

    const category = byAsinCategory.get(asin) || normalizeCategory(product.category);
    urls.push({
      loc: toAbsoluteUrl(`/catalog/${encodeURIComponent(category)}`),
      changefreq: "daily",
      priority: "0.8"
    });
  }

  return urls;
}

async function main() {
  console.log("[generate-sitemap] starting...");

  const [products, catalogSources, programmaticPages] = await Promise.all([
    fetchProducts(),
    fetchCatalogSourceAsins(),
    fetchProgrammaticPages()
  ]);

  console.log(`[generate-sitemap] fetched ${products.length} products`);
  console.log(`[generate-sitemap] fetched ${catalogSources.length} catalog sources`);
  console.log(`[generate-sitemap] loaded ${programmaticPages.length} programmatic pages`);

  const categoryUrls = buildCategoryUrls();
  const programmaticUrls = buildProgrammaticUrls(programmaticPages);
  const productUrls = buildProductUrls(products, catalogSources);

  const allUrls = dedupeByLoc([
    ...staticUrls.map((item) => ({
      ...item,
      loc: toAbsoluteUrl(item.loc)
    })),
    ...categoryUrls,
    ...programmaticUrls,
    ...productUrls
  ]);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls.map(buildUrlNode).join("\n")}
</urlset>
`;

  await fs.writeFile("sitemap.xml", xml, "utf-8");

  console.log(`[generate-sitemap] wrote ${allUrls.length} URLs to sitemap.xml`);
}

main().catch((error) => {
  console.error("[generate-sitemap] FAILED", error);
  process.exit(1);
});
