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
  tech: {
    label: "Tech",
    desc: "electronics, gadgets, accessories, desk setup upgrades, and high-demand devices"
  },
  home: {
    label: "Home",
    desc: "storage, decor, comfort items, and practical daily-use home products"
  },
  kitchen: {
    label: "Kitchen",
    desc: "cookware, tools, appliances, and frequently bought kitchen essentials"
  },
  beauty: {
    label: "Beauty",
    desc: "skincare, self-care, cosmetics, and high-demand beauty products"
  },
  health: {
    label: "Health",
    desc: "wellness products, daily-use health items, and practical support products"
  },
  sports: {
    label: "Sports",
    desc: "fitness gear, active products, and strong-demand sports essentials"
  },
  travel: {
    label: "Travel",
    desc: "travel gear, luggage, organizers, and practical accessories"
  },
  fashion: {
    label: "Fashion",
    desc: "men, women, jewelry, accessories, and practical style upgrades"
  },
  family: {
    label: "Family",
    desc: "baby, pet, and practical family-related everyday products"
  },
  general: {
    label: "General",
    desc: "mixed high-demand Amazon products across multiple evergreen categories"
  }
};

function buildCategoryPages(category) {
  const meta = CATEGORY_META[category];
  const label = meta.label;

  return [
    {
      slug: `best-${category}-products`,
      title: `Best ${label} Products`,
      description: `Discover the best ${category} products frequently bought on Amazon.`,
      category,
      mode: "category",
      sort: "score",
      filter: null,
      seoText: `This page highlights the best ${category} products with strong ongoing demand on Amazon, combining evergreen winners and high-interest products in one category-focused collection.`
    },
    {
      slug: `top-${category}-products`,
      title: `Top ${label} Products`,
      description: `Explore top ${category} products with strong Amazon buying frequency.`,
      category,
      mode: "category",
      sort: "reviews",
      filter: null,
      seoText: `This page focuses on top ${category} products that consistently attract buyers on Amazon, with emphasis on review volume and proven buying interest.`
    },
    {
      slug: `popular-${category}-products`,
      title: `Popular ${label} Products`,
      description: `Browse popular ${category} products trending with Amazon buyers.`,
      category,
      mode: "category",
      sort: "rating",
      filter: null,
      seoText: `This page collects popular ${category} products with strong buyer signals, useful for discovering items people repeatedly purchase in this category.`
    },
    {
      slug: `cheap-${category}-products`,
      title: `Cheap ${label} Products`,
      description: `Find cheap ${category} products and affordable Amazon picks.`,
      category,
      mode: "category",
      sort: "price-low",
      filter: { maxPrice: 25 },
      seoText: `This page highlights affordable ${category} products with strong value, focusing on low-price products that still show real demand on Amazon.`
    },
    {
      slug: `best-${category}-products-under-25`,
      title: `Best ${label} Products Under $25`,
      description: `Discover the best ${category} products under $25 on Amazon.`,
      category,
      mode: "category",
      sort: "score",
      filter: { maxPrice: 25 },
      seoText: `This page highlights the best ${category} products under $25, combining affordability with strong demand signals and buying frequency.`
    },
    {
      slug: `best-${category}-products-under-50`,
      title: `Best ${label} Products Under $50`,
      description: `Discover the best ${category} products under $50 on Amazon.`,
      category,
      mode: "category",
      sort: "score",
      filter: { maxPrice: 50 },
      seoText: `This page focuses on the best ${category} products under $50, helping users find stronger-value products without leaving the category.`
    },
    {
      slug: `${category}-essentials`,
      title: `${label} Essentials`,
      description: `Browse essential ${category} products frequently bought on Amazon.`,
      category,
      mode: "category",
      sort: "score",
      filter: null,
      seoText: `This page focuses on essential ${category} products that people buy regularly on Amazon, making it a strong evergreen collection for this category.`
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
      seoText: "This page highlights gift ideas for men using popular Amazon products with strong buying frequency and gift potential."
    },
    {
      slug: "best-gifts-for-women",
      title: "Best Gifts for Women",
      description: "Discover popular Amazon gift ideas for women.",
      category: "fashion",
      mode: "keyword",
      sort: "score",
      filter: { query: "women" },
      seoText: "This page highlights gift ideas for women using popular Amazon products with strong buying frequency and broad gift appeal."
    },
    {
      slug: "best-gifts-for-gamers",
      title: "Best Gifts for Gamers",
      description: "Discover popular Amazon gift ideas for gamers.",
      category: "tech",
      mode: "keyword",
      sort: "score",
      filter: { query: "gaming" },
      seoText: "This page highlights gift ideas for gamers using popular Amazon tech products with strong demand and clear category relevance."
    },
    {
      slug: "best-gifts-for-travelers",
      title: "Best Gifts for Travelers",
      description: "Discover popular Amazon gift ideas for travelers.",
      category: "travel",
      mode: "keyword",
      sort: "score",
      filter: { query: "travel" },
      seoText: "This page highlights gift ideas for travelers using useful Amazon travel products with strong long-term relevance."
    },
    {
      slug: "best-gifts-for-home-lovers",
      title: "Best Gifts for Home Lovers",
      description: "Discover popular Amazon gift ideas for home lovers.",
      category: "home",
      mode: "keyword",
      sort: "score",
      filter: { query: "home" },
      seoText: "This page highlights gift ideas for home lovers using useful home products that show steady Amazon demand."
    },
    {
      slug: "popular-products-for-men",
      title: "Popular Products for Men",
      description: "Discover popular Amazon products for men.",
      category: "fashion",
      mode: "keyword",
      sort: "reviews",
      filter: { query: "men" },
      seoText: "This page collects frequently bought Amazon products relevant to men across fashion and practical daily-use categories."
    },
    {
      slug: "popular-products-for-women",
      title: "Popular Products for Women",
      description: "Discover popular Amazon products for women.",
      category: "fashion",
      mode: "keyword",
      sort: "reviews",
      filter: { query: "women" },
      seoText: "This page collects frequently bought Amazon products relevant to women across fashion and practical daily-use categories."
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

  await fs.writeFile(
    "programmatic-pages.json",
    JSON.stringify(pages, null, 2),
    "utf-8"
  );

  console.log(
    `[generate-programmatic-pages] wrote ${pages.length} pages to programmatic-pages.json`
  );
}

main().catch((error) => {
  console.error("[generate-programmatic-pages] FAILED", error);
  process.exit(1);
});
