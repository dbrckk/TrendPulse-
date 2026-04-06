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
    keywordSeeds: [
      "gadgets",
      "electronics",
      "gaming accessories",
      "desk setup",
      "phone accessories",
      "smart home tech",
      "computer accessories",
      "portable tech",
      "tech gifts",
      "budget tech"
    ]
  },
  home: {
    label: "Home",
    keywordSeeds: [
      "home decor",
      "storage",
      "organization",
      "apartment essentials",
      "cleaning tools",
      "comfort items",
      "smart home",
      "bedroom essentials",
      "living room items",
      "small space products"
    ]
  },
  kitchen: {
    label: "Kitchen",
    keywordSeeds: [
      "cookware",
      "air fryer accessories",
      "coffee gear",
      "meal prep",
      "kitchen tools",
      "small appliances",
      "kitchen organization",
      "baking tools",
      "water bottles",
      "cheap kitchen gadgets"
    ]
  },
  beauty: {
    label: "Beauty",
    keywordSeeds: [
      "skincare",
      "hair care",
      "self care",
      "beauty tools",
      "makeup accessories",
      "beauty gifts",
      "face care",
      "body care",
      "beauty under 25",
      "trending beauty"
    ]
  },
  health: {
    label: "Health",
    keywordSeeds: [
      "wellness",
      "recovery tools",
      "sleep support",
      "health accessories",
      "fitness recovery",
      "daily wellness",
      "massagers",
      "posture support",
      "health under 50",
      "walking essentials"
    ]
  },
  sports: {
    label: "Sports",
    keywordSeeds: [
      "fitness gear",
      "home gym",
      "running accessories",
      "outdoor gear",
      "workout equipment",
      "yoga accessories",
      "sports gifts",
      "camping gear",
      "hiking gear",
      "budget fitness"
    ]
  },
  travel: {
    label: "Travel",
    keywordSeeds: [
      "travel essentials",
      "carry on accessories",
      "packing cubes",
      "road trip gear",
      "travel gadgets",
      "travel organization",
      "luggage accessories",
      "cheap travel gear",
      "flight essentials",
      "travel gifts"
    ]
  },
  fashion: {
    label: "Fashion",
    keywordSeeds: [
      "men accessories",
      "women accessories",
      "fashion gifts",
      "wallets",
      "watches",
      "bags",
      "jewelry",
      "cheap fashion",
      "minimalist fashion",
      "travel fashion"
    ]
  },
  family: {
    label: "Family",
    keywordSeeds: [
      "baby essentials",
      "pet accessories",
      "family travel gear",
      "kids products",
      "pet gifts",
      "parent essentials",
      "daily family items",
      "home pet gear",
      "family under 25",
      "useful family products"
    ]
  },
  general: {
    label: "General",
    keywordSeeds: [
      "amazon finds",
      "viral products",
      "cheap finds",
      "best sellers",
      "gift ideas",
      "popular products",
      "everyday essentials",
      "trending amazon finds",
      "useful products",
      "budget products"
    ]
  }
};

const SORT_VARIANTS = [
  { key: "score", label: "Best", intro: "best" },
  { key: "reviews", label: "Top", intro: "top" },
  { key: "rating", label: "Popular", intro: "popular" },
  { key: "price-low", label: "Cheap", intro: "cheap" }
];

const PRICE_VARIANTS = [
  { maxPrice: 15, slug: "under-15", text: "Under $15" },
  { maxPrice: 25, slug: "under-25", text: "Under $25" },
  { maxPrice: 50, slug: "under-50", text: "Under $50" },
  { maxPrice: 100, slug: "under-100", text: "Under $100" }
];

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleCase(value) {
  return String(value || "")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function buildCategoryCorePages(category) {
  const meta = CATEGORY_META[category];
  const label = meta.label;

  return [
    {
      slug: `best-${category}-products`,
      title: `Best ${label} Products`,
      description: `Discover the best ${category} products frequently bought on Amazon.`,
      category,
      sort: "score",
      filter: null,
      seoText: `This page highlights the best ${category} products with strong ongoing demand on Amazon.`,
      pageType: "core"
    },
    {
      slug: `top-${category}-products`,
      title: `Top ${label} Products`,
      description: `Explore top ${category} products with strong Amazon buying frequency.`,
      category,
      sort: "reviews",
      filter: null,
      seoText: `This page focuses on top ${category} products that consistently attract buyers on Amazon.`,
      pageType: "core"
    },
    {
      slug: `popular-${category}-products`,
      title: `Popular ${label} Products`,
      description: `Browse popular ${category} products trending with Amazon buyers.`,
      category,
      sort: "rating",
      filter: null,
      seoText: `This page collects popular ${category} products with strong buyer signals.`,
      pageType: "core"
    },
    {
      slug: `${category}-essentials`,
      title: `${label} Essentials`,
      description: `Browse essential ${category} products frequently bought on Amazon.`,
      category,
      sort: "score",
      filter: null,
      seoText: `This page focuses on essential ${category} products that people buy regularly on Amazon.`,
      pageType: "core"
    }
  ];
}

function buildKeywordPagesForCategory(category) {
  const meta = CATEGORY_META[category];
  const label = meta.label;
  const pages = [];

  for (const keyword of meta.keywordSeeds) {
    const keywordSlug = slugify(keyword);
    const keywordTitle = titleCase(keyword);

    for (const sortVariant of SORT_VARIANTS) {
      pages.push({
        slug: `${sortVariant.intro}-${category}-${keywordSlug}`,
        title: `${sortVariant.label} ${label} ${keywordTitle}`,
        description: `Browse ${sortVariant.intro} ${category} ${keyword} on Amazon.`,
        category,
        sort: sortVariant.key,
        filter: { query: keyword },
        seoText: `This page focuses on ${sortVariant.intro} ${category} ${keyword} with strong Amazon demand and product relevance.`,
        pageType: "keyword"
      });
    }

    for (const priceVariant of PRICE_VARIANTS) {
      pages.push({
        slug: `best-${category}-${keywordSlug}-${priceVariant.slug}`,
        title: `Best ${label} ${keywordTitle} ${priceVariant.text}`,
        description: `Discover ${category} ${keyword} ${priceVariant.text.toLowerCase()} on Amazon.`,
        category,
        sort: "score",
        filter: { query: keyword, maxPrice: priceVariant.maxPrice },
        seoText: `This page highlights ${category} ${keyword} ${priceVariant.text.toLowerCase()} with strong value and demand.`,
        pageType: "keyword_price"
      });
    }
  }

  return pages;
}

function buildAudiencePages() {
  return [
    {
      slug: "best-gifts-for-men",
      title: "Best Gifts for Men",
      description: "Discover popular Amazon gift ideas for men.",
      category: "fashion",
      sort: "score",
      filter: { query: "men gift" },
      seoText: "This page highlights gift ideas for men using popular Amazon products.",
      pageType: "audience"
    },
    {
      slug: "best-gifts-for-women",
      title: "Best Gifts for Women",
      description: "Discover popular Amazon gift ideas for women.",
      category: "fashion",
      sort: "score",
      filter: { query: "women gift" },
      seoText: "This page highlights gift ideas for women using popular Amazon products.",
      pageType: "audience"
    },
    {
      slug: "best-gifts-for-gamers",
      title: "Best Gifts for Gamers",
      description: "Discover popular Amazon gift ideas for gamers.",
      category: "tech",
      sort: "score",
      filter: { query: "gaming" },
      seoText: "This page highlights gift ideas for gamers using popular Amazon tech products.",
      pageType: "audience"
    },
    {
      slug: "best-gifts-for-travelers",
      title: "Best Gifts for Travelers",
      description: "Discover popular Amazon gift ideas for travelers.",
      category: "travel",
      sort: "score",
      filter: { query: "travel gift" },
      seoText: "This page highlights gift ideas for travelers using useful Amazon travel products.",
      pageType: "audience"
    },
    {
      slug: "best-gifts-for-home-lovers",
      title: "Best Gifts for Home Lovers",
      description: "Discover popular Amazon gift ideas for home lovers.",
      category: "home",
      sort: "score",
      filter: { query: "home gift" },
      seoText: "This page highlights gift ideas for home lovers using useful home products.",
      pageType: "audience"
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

function buildAllPages() {
  const pages = [];

  for (const category of CATEGORIES) {
    pages.push(...buildCategoryCorePages(category));
    pages.push(...buildKeywordPagesForCategory(category));
  }

  pages.push(...buildAudiencePages());

  return dedupePages(pages);
}

async function main() {
  const pages = buildAllPages();

  if (pages.length < 1000) {
    throw new Error(`Expected at least 1000 pages, got ${pages.length}`);
  }

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
