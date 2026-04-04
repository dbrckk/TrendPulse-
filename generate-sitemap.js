import fs from "fs/promises";
import { createClient } from "@supabase/supabase-js";

const SITE_URL = "https://www.trend-pulse.shop";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const staticUrls = [
  { loc: "/", changefreq: "daily", priority: "1.0" },
  { loc: "/deals", changefreq: "hourly", priority: "0.9" },
  { loc: "/catalog", changefreq: "daily", priority: "0.9" },
  { loc: "/best-sellers.html", changefreq: "daily", priority: "0.7" },
  { loc: "/best-gifts.html", changefreq: "daily", priority: "0.7" },
  { loc: "/cheap-tech.html", changefreq: "daily", priority: "0.7" }
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

async function fetchProducts() {
  const { data, error } = await supabase
    .from("products")
    .select("asin, slug, updated_at")
    .limit(5000);

  if (error) throw error;
  return data || [];
}

async function fetchCatalogSourceAsins() {
  const { data, error } = await supabase
    .from("product_sources")
    .select("asin")
    .eq("source_kind", "catalog")
    .eq("is_active", true)
    .limit(10000);

  if (error) throw error;
  return new Set((data || []).map((row) => row.asin));
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

async function main() {
  const [productRows, catalogAsins, programmaticPages] = await Promise.all([
    fetchProducts(),
    fetchCatalogSourceAsins(),
    fetchProgrammaticPages()
  ]);

  const categoryUrls = categories.map((category) => ({
    loc: toAbsoluteUrl(`/catalog/${encodeURIComponent(category)}`),
    changefreq: "daily",
    priority: "0.8"
  }));

  const programmaticUrls = programmaticPages
    .filter((page) => page?.slug)
    .map((page) => ({
      loc: toAbsoluteUrl(`/collections/${encodeURIComponent(page.slug)}`),
      changefreq: "daily",
      priority: "0.7"
    }));

  const dedupe = new Set();

  const productUrls = productRows
    .filter((product) => product?.asin && catalogAsins.has(product.asin))
    .map((product) => {
      const cleanSlug = String(product.slug || "").trim();
      const cleanAsin = String(product.asin || "").trim().toUpperCase();

      const productPath =
        cleanSlug && isValidSlug(cleanSlug)
          ? `/product/${encodeURIComponent(cleanSlug)}`
          : isValidAsin(cleanAsin)
            ? `/product/${encodeURIComponent(cleanAsin)}`
            : null;

      if (!productPath) return null;

      const loc = toAbsoluteUrl(productPath);
      if (dedupe.has(loc)) return null;
      dedupe.add(loc);

      return {
        loc,
        changefreq: "weekly",
        priority: "0.6",
        lastmod: product.updated_at
          ? new Date(product.updated_at).toISOString()
          : undefined
      };
    })
    .filter(Boolean);

  const allUrls = [
    ...staticUrls.map((item) => ({
      ...item,
      loc: toAbsoluteUrl(item.loc)
    })),
    ...categoryUrls,
    ...programmaticUrls,
    ...productUrls
  ];

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
