#!/usr/bin/env node

import fs from "fs/promises";

const CATEGORIES = [
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

const CATEGORY_META = {
  tech: { label: "Tech" },
  home: { label: "Home" },
  kitchen: { label: "Kitchen" },
  beauty: { label: "Beauty" },
  health: { label: "Health" },
  sports: { label: "Sports" },
  travel: { label: "Travel" },
  fashion: { label: "Fashion" },
  family: { label: "Family" },
  general: { label: "General" }
};

function buildCategoryPages(category) {
  const label = CATEGORY_META[category].label;

  return [
    {
      slug: `best-${category}-products`,
      title: `Best ${label} Products`,
      description: `Discover the best ${category} products frequently bought on Amazon.`,
      category,
      mode: "category",
      sort: "score",
      filter: null,
      seoText: `This page highlights the best ${category} products with strong ongoing demand on Amazon.`
    },
    {
      slug: `top-${category}-products`,
      title: `Top ${label} Products`,
      description: `Explore top ${category} products with strong Amazon buying frequency.`,
      category,
      mode: "category",
      sort: "reviews",
      filter: null,
      seoText: `This page focuses on top ${category} products that consistently attract buyers on Amazon.`
    },
    {
      slug: `popular-${category}-products`,
      title: `Popular ${label} Products`,
      description: `Browse popular ${category} products trending with Amazon buyers.`,
      category,
      mode: "category",
      sort: "rating",
      filter: null,
      seoText: `This page collects popular ${category} products with strong buyer signals.`
    },
    {
      slug: `cheap-${category}-products`,
      title: `Cheap ${label} Products`,
      description: `Find cheap ${category} products and affordable Amazon picks.`,
      category,
      mode: "category",
      sort: "price-low",
      filter: { maxPrice: 25 },
      seoText: `This page highlights affordable ${category} products with strong value.`
    },
    {
      slug: `best-${category}-products-under-25`,
      title: `Best ${label} Products Under $25`,
      description: `Discover the best ${category} products under $25 on Amazon.`,
      category,
      mode: "category",
      sort: "score",
      filter: { maxPrice: 25 },
      seoText: `This page highlights the best ${category} products under $25.`
    },
    {
      slug: `best-${category}-products-under-50`,
      title: `Best ${label} Products Under $50`,
      description: `Discover the best ${category} products under $50 on Amazon.`,
      category,
      mode: "category",
      sort: "score",
      filter: { maxPrice: 50 },
      seoText: `This page focuses on the best ${category} products under $50.`
    },
    {
      slug: `${category}-essentials`,
      title: `${label} Essentials`,
      description: `Browse essential ${category} products frequently bought on Amazon.`,
      category,
      mode: "category",
      sort: "score",
      filter: null,
      seoText: `This page focuses on essential ${category} products that people buy regularly on Amazon.`
    }
  ];
}

function buildAudiencePages() {
  return [
    {
      slug: "best-gifts-for-men",
      title: "Best Gifts for Men",
      description: "Discover popular Amazon gift ideas for men.",
      category: "fashion",
      mode: "keyword",
      sort: "score",
      filter: { query: "men" },
      seoText: "This page highlights gift ideas for men using popular Amazon products."
    },
    {
      slug: "best-gifts-for-women",
      title: "Best Gifts for Women",
      description: "Discover popular Amazon gift ideas for women.",
      category: "fashion",
      mode: "keyword",
      sort: "score",
      filter: { query: "women" },
      seoText: "This page highlights gift ideas for women using popular Amazon products."
    },
    {
      slug: "best-gifts-for-gamers",
      title: "Best Gifts for Gamers",
      description: "Discover popular Amazon gift ideas for gamers.",
      category: "tech",
      mode: "keyword",
      sort: "score",
      filter: { query: "gaming" },
      seoText: "This page highlights gift ideas for gamers using popular Amazon tech products."
    },
    {
      slug: "best-gifts-for-travelers",
      title: "Best Gifts for Travelers",
      description: "Discover popular Amazon gift ideas for travelers.",
      category: "travel",
      mode: "keyword",
      sort: "score",
      filter: { query: "travel" },
      seoText: "This page highlights gift ideas for travelers using useful Amazon travel products."
    },
    {
      slug: "best-gifts-for-home-lovers",
      title: "Best Gifts for Home Lovers",
      description: "Discover popular Amazon gift ideas for home lovers.",
      category: "home",
      mode: "keyword",
      sort: "score",
      filter: { query: "home" },
      seoText: "This page highlights gift ideas for home lovers using useful home products."
    }
  ];
}

function dedupePages(pages) {
  const seen = new Set();
  return pages.filter((page) => {
    if (!page?.slug) return false;
    if (seen.has(page.slug)) return false;
    seen.add(page.slug);
    return true;
  });
}

async function main() {
  const pages = dedupePages([
    ...CATEGORIES.flatMap(buildCategoryPages),
    ...buildAudiencePages()
  ]);

  await fs.writeFile("programmatic-pages.json", JSON.stringify(pages, null, 2), "utf-8");
  console.log(`[generate-programmatic-pages] wrote ${pages.length} pages to programmatic-pages.json`);
}

main().catch((error) => {
  console.error("[generate-programmatic-pages] FAILED", error);
  process.exit(1);
});
