import fs from "fs/promises";

const categories = [
  { slug: "tech", label: "Tech" },
  { slug: "home", label: "Home" },
  { slug: "kitchen", label: "Kitchen" },
  { slug: "beauty", label: "Beauty" },
  { slug: "health", label: "Health" },
  { slug: "sports", label: "Sports" },
  { slug: "travel", label: "Travel" },
  { slug: "fashion", label: "Fashion" },
  { slug: "family", label: "Family" },
  { slug: "general", label: "General" }
];

const audiencePages = [
  {
    slug: "best-gifts-for-men",
    title: "Best Gifts for Men",
    description: "Discover popular Amazon gift ideas for men.",
    category: "fashion",
    mode: "keyword",
    sort: "score",
    filter: { query: "men" },
    seoText:
      "This page highlights gift ideas for men using popular Amazon products with strong buying frequency."
  },
  {
    slug: "best-gifts-for-women",
    title: "Best Gifts for Women",
    description: "Discover popular Amazon gift ideas for women.",
    category: "fashion",
    mode: "keyword",
    sort: "score",
    filter: { query: "women" },
    seoText:
      "This page highlights gift ideas for women using popular Amazon products with strong buying frequency."
  },
  {
    slug: "best-gifts-for-travelers",
    title: "Best Gifts for Travelers",
    description: "Discover popular Amazon gift ideas for travelers.",
    category: "travel",
    mode: "keyword",
    sort: "score",
    filter: { query: "travel" },
    seoText:
      "This page highlights gift ideas for travelers using popular Amazon products with strong buying frequency."
  },
  {
    slug: "best-gifts-for-gamers",
    title: "Best Gifts for Gamers",
    description: "Discover popular Amazon gift ideas for gamers.",
    category: "tech",
    mode: "keyword",
    sort: "score",
    filter: { query: "gaming" },
    seoText:
      "This page highlights gift ideas for gamers using popular Amazon products with strong demand."
  },
  {
    slug: "best-gifts-for-home-lovers",
    title: "Best Gifts for Home Lovers",
    description: "Discover popular Amazon gift ideas for home lovers.",
    category: "home",
    mode: "keyword",
    sort: "score",
    filter: { query: "home" },
    seoText:
      "This page highlights gift ideas for home lovers using popular Amazon products with strong long-term demand."
  },
  {
    slug: "popular-products-for-men",
    title: "Popular Products for Men",
    description: "Discover popular Amazon products for men.",
    category: "fashion",
    mode: "keyword",
    sort: "reviews",
    filter: { query: "men" },
    seoText:
      "This page collects frequently bought Amazon products relevant to men across fashion and daily-use categories."
  },
  {
    slug: "popular-products-for-women",
    title: "Popular Products for Women",
    description: "Discover popular Amazon products for women.",
    category: "fashion",
    mode: "keyword",
    sort: "reviews",
    filter: { query: "women" },
    seoText:
      "This page collects frequently bought Amazon products relevant to women across fashion and daily-use categories."
  },
  {
    slug: "popular-family-products",
    title: "Popular Family Products",
    description: "Discover popular family products on Amazon.",
    category: "family",
    mode: "category",
    sort: "reviews",
    filter: null,
    seoText:
      "This page highlights family-related Amazon products with strong ongoing demand, combining a denser baby and pet-oriented category."
  }
];

function pushUnique(map, item) {
  if (!map.has(item.slug)) {
    map.set(item.slug, item);
  }
}

function buildCategoryPage(category, type) {
  if (type === "best") {
    return {
      slug: `best-${category.slug}-products`,
      title: `Best ${category.label} Products`,
      description: `Discover the best ${category.label.toLowerCase()} products frequently bought on Amazon.`,
      category: category.slug,
      mode: "category",
      sort: "score",
      filter: null,
      seoText: `This page highlights the best ${category.label.toLowerCase()} products with strong ongoing demand on Amazon.`
    };
  }

  if (type === "top") {
    return {
      slug: `top-${category.slug}-products`,
      title: `Top ${category.label} Products`,
      description: `Explore top ${category.label.toLowerCase()} products with strong Amazon buying frequency.`,
      category: category.slug,
      mode: "category",
      sort: "reviews",
      filter: null,
      seoText: `This page focuses on top ${category.label.toLowerCase()} products that consistently attract buyers on Amazon.`
    };
  }

  if (type === "popular") {
    return {
      slug: `popular-${category.slug}-products`,
      title: `Popular ${category.label} Products`,
      description: `Browse popular ${category.label.toLowerCase()} products trending with Amazon buyers.`,
      category: category.slug,
      mode: "category",
      sort: "rating",
      filter: null,
      seoText: `This page collects popular ${category.label.toLowerCase()} products with long-term Amazon demand.`
    };
  }

  if (type === "cheap") {
    return {
      slug: `cheap-${category.slug}-products`,
      title: `Cheap ${category.label} Products`,
      description: `Find cheap ${category.label.toLowerCase()} products and affordable Amazon picks.`,
      category: category.slug,
      mode: "category",
      sort: "price-low",
      filter: { maxPrice: 25 },
      seoText: `This page highlights affordable ${category.label.toLowerCase()} products with strong value on Amazon.`
    };
  }

  if (type === "under25") {
    return {
      slug: `best-${category.slug}-products-under-25`,
      title: `Best ${category.label} Products Under $25`,
      description: `Discover the best ${category.label.toLowerCase()} products under $25 on Amazon.`,
      category: category.slug,
      mode: "category",
      sort: "score",
      filter: { maxPrice: 25 },
      seoText: `This page highlights the best ${category.label.toLowerCase()} products under $25 with strong demand on Amazon.`
    };
  }

  if (type === "under50") {
    return {
      slug: `best-${category.slug}-products-under-50`,
      title: `Best ${category.label} Products Under $50`,
      description: `Discover the best ${category.label.toLowerCase()} products under $50 on Amazon.`,
      category: category.slug,
      mode: "category",
      sort: "score",
      filter: { maxPrice: 50 },
      seoText: `This page highlights the best ${category.label.toLowerCase()} products under $50 with strong long-term demand on Amazon.`
    };
  }

  if (type === "essentials") {
    return {
      slug: `${category.slug}-essentials`,
      title: `${category.label} Essentials`,
      description: `Browse essential ${category.label.toLowerCase()} products frequently bought on Amazon.`,
      category: category.slug,
      mode: "category",
      sort: "score",
      filter: null,
      seoText: `This page focuses on essential ${category.label.toLowerCase()} products that people buy regularly on Amazon.`
    };
  }

  return null;
}

async function main() {
  const pages = new Map();

  const variants = ["best", "top", "popular", "cheap", "under25", "under50", "essentials"];

  for (const category of categories) {
    for (const variant of variants) {
      const page = buildCategoryPage(category, variant);
      if (page) pushUnique(pages, page);
    }
  }

  for (const page of audiencePages) {
    pushUnique(pages, page);
  }

  const output = [...pages.values()];

  await fs.writeFile(
    "programmatic-pages.json",
    JSON.stringify(output, null, 2),
    "utf-8"
  );

  console.log(`[generate-programmatic-pages] wrote ${output.length} pages`);
}

main().catch((error) => {
  console.error("[generate-programmatic-pages] FAILED", error);
  process.exit(1);
});
