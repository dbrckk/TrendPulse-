import fs from "fs/promises";
import { createClient } from "@supabase/supabase-js";

const SITE_URL = "https://www.trend-pulse.shop";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const staticUrls = [
  { loc: "/", changefreq: "daily", priority: "1.0" },
  { loc: "/deals.html", changefreq: "hourly", priority: "0.9" },
  { loc: "/catalog.html", changefreq: "daily", priority: "0.9" },
  { loc: "/best-sellers.html", changefreq: "daily", priority: "0.7" },
  { loc: "/best-gifts.html", changefreq: "daily", priority: "0.7" },
  { loc: "/cheap-tech.html", changefreq: "daily", priority: "0.7" }
];

const categories = [
  "tech",
  "home",
  "kitchen",
  "beauty",
  "sports",
  "health",
  "travel",
  "women",
  "men",
  "jewelry",
  "baby",
  "pets",
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

async function fetchProducts() {
  const { data, error } = await supabase
    .from("products")
    .select("asin, slug, updated_at")
    .limit(5000);

  if (error) {
    throw error;
  }

  return data || [];
}

async function main() {
  const productRows = await fetchProducts();

  const categoryUrls = categories.map((category) => ({
    loc: `${SITE_URL}/catalog-category.html?category=${encodeURIComponent(category)}`,
    changefreq: "daily",
    priority: "0.8"
  }));

  const productUrls = productRows.map((product) => ({
    loc: product.slug
      ? `${SITE_URL}/product.html?slug=${encodeURIComponent(product.slug)}`
      : `${SITE_URL}/product.html?asin=${encodeURIComponent(product.asin || "")}`,
    changefreq: "weekly",
    priority: "0.6",
    lastmod: product.updated_at
      ? new Date(product.updated_at).toISOString()
      : undefined
  }));

  const allUrls = [
    ...staticUrls.map((item) => ({
      ...item,
      loc: `${SITE_URL}${item.loc}`
    })),
    ...categoryUrls,
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
