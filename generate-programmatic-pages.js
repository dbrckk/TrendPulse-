import fs from "fs/promises";

const collectionSlugs = [
  "best-tech-products",
  "best-home-products",
  "best-kitchen-products",
  "best-beauty-products",
  "best-sports-products",
  "best-health-products",
  "best-travel-products",
  "best-products-for-men",
  "best-products-for-women",
  "best-jewelry-products"
];

async function main() {
  const sitemapPath = "programmatic-collections.json";
  await fs.writeFile(sitemapPath, JSON.stringify(collectionSlugs, null, 2), "utf-8");
  console.log(`[generate-programmatic-pages] wrote ${collectionSlugs.length} slugs`);
}

main().catch((error) => {
  console.error("[generate-programmatic-pages] FAILED", error);
  process.exit(1);
});
