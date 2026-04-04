import fs from "fs/promises";

const categories = [
  { slug: "tech", label: "Tech" },
  { slug: "home", label: "Home" },
  { slug: "kitchen", label: "Kitchen" },
  { slug: "beauty", label: "Beauty" },
  { slug: "sports", label: "Sports" },
  { slug: "health", label: "Health" },
  { slug: "travel", label: "Travel" },
  { slug: "women", label: "Women" },
  { slug: "men", label: "Men" },
  { slug: "jewelry", label: "Jewelry" },
  { slug: "baby", label: "Baby" },
  { slug: "pets", label: "Pets" },
  { slug: "general", label: "General" }
];

const audiences = [
  { slug: "men", label: "Men" },
  { slug: "women", label: "Women" },
  { slug: "travelers", label: "Travelers" },
  { slug: "gamers", label: "Gamers" },
  { slug: "home-lovers", label: "Home Lovers" }
];

function titleCase(value = "") {
  return String(value)
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function pushUnique(map, item) {
  if (!map.has(item.slug)) {
    map.set(item.slug, item);
  }
}

async function main() {
  const pages = new Map();

  for (const category of categories) {
    pushUnique(pages, {
      slug: `best-${category.slug}-products`,
      title: `Best ${category.label} Products`,
      description: `Discover the best ${category.label.toLowerCase()} products frequently bought on Amazon.`,
      category: category.slug,
      mode: "category",
      sort: "score",
      filter: null,
      seoText: `This page highlights the best ${category.label.toLowerCase()} products with strong ongoing demand on Amazon.`
    });

    pushUnique(pages, {
      slug: `top-${category.slug}-products`,
      title: `Top ${category.label} Products`,
      description: `Explore top ${category.label.toLowerCase()} products with strong Amazon buying frequency.`,
      category: category.slug,
      mode: "category",
      sort: "reviews",
      filter: null,
      seoText: `This page focuses on top ${category.label.toLowerCase()} products that consistently attract buyers on Amazon.`
    });

    pushUnique(pages, {
      slug: `popular-${category.slug}-products`,
      title: `Popular ${category.label} Products`,
      description: `Browse popular ${category.label.toLowerCase()} products trending with Amazon buyers.`,
      category: category.slug,
      mode: "category",
      sort: "rating",
      filter: null,
      seoText: `This page collects popular ${category.label.toLowerCase()} products with long-term Amazon demand.`
    });

    pushUnique(pages, {
      slug: `cheap-${category.slug}-products`,
      title: `Cheap ${category.label} Products`,
      description: `Find cheap ${category.label.toLowerCase()} products and affordable Amazon picks.`,
      category: category.slug,
      mode: "category",
      sort: "price-low",
      filter: { maxPrice: 25 },
      seoText: `This page highlights affordable ${category.label.toLowerCase()} products with strong value on Amazon.`
    });

    pushUnique(pages, {
      slug: `best-${category.slug}-products-under-25`,
      title: `Best ${category.label} Products Under $25`,
      description: `Discover the best ${category.label.toLowerCase()} products under $25 on Amazon.`,
      category: category.slug,
      mode: "category",
      sort: "score",
      filter: { maxPrice: 25 },
      seoText: `This page highlights the best ${category.label.toLowerCase()} products under $25 with strong demand on Amazon.`
    });

    pushUnique(pages, {
      slug: `best-${category.slug}-products-under-50`,
      title: `Best ${category.label} Products Under $50`,
      description: `Discover the best ${category.label.toLowerCase()} products under $50 on Amazon.`,
      category: category.slug,
      mode: "category",
      sort: "score",
      filter: { maxPrice: 50 },
      seoText: `This page highlights the best ${category.label.toLowerCase()} products under $50 with strong long-term demand on Amazon.`
    });

    pushUnique(pages, {
      slug: `${category.slug}-essentials`,
      title: `${category.label} Essentials`,
      description: `Browse essential ${category.label.toLowerCase()} products frequently bought on Amazon.`,
      category: category.slug,
      mode: "category",
      sort: "score",
      filter: null,
      seoText: `This page focuses on essential ${category.label.toLowerCase()} products that people buy regularly on Amazon.`
    });
  }

  for (const audience of audiences) {
    pushUnique(pages, {
      slug: `best-gifts-for-${audience.slug}`,
      title: `Best Gifts for ${audience.label}`,
      description: `Explore popular Amazon gift ideas for ${audience.label.toLowerCase()}.`,
      category: "general",
      mode: "keyword",
      sort: "score",
      filter: { query: audience.label.toLowerCase() },
      seoText: `This page highlights gift ideas for ${audience.label.toLowerCase()} using popular Amazon products with strong buying frequency.`
    });

    pushUnique(pages, {
      slug: `popular-products-for-${audience.slug}`,
      title: `Popular Products for ${audience.label}`,
      description: `Discover popular Amazon products for ${audience.label.toLowerCase()}.`,
      category: "general",
      mode: "keyword",
      sort: "reviews",
      filter: { query: audience.label.toLowerCase() },
      seoText: `This page collects popular Amazon products relevant to ${audience.label.toLowerCase()}.`
    });
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
