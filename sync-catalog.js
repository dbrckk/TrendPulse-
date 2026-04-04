import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CATEGORY_MINIMUMS = {
  tech: 72,
  home: 72,
  kitchen: 72,
  beauty: 72,
  health: 60,
  sports: 60,
  travel: 48,
  fashion: 72,
  family: 48,
  general: 48
};

const CATEGORY_PRIORITY_ORDER = [
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

const CATEGORY_SUPPORT_POOLS = {
  tech: ["general", "travel", "fashion"],
  home: ["kitchen", "general", "family"],
  kitchen: ["home", "health", "general"],
  beauty: ["fashion", "health", "general"],
  health: ["beauty", "sports", "general"],
  sports: ["health", "fashion", "general"],
  travel: ["tech", "fashion", "general"],
  fashion: ["beauty", "general", "travel"],
  family: ["home", "general", "health"],
  general: ["tech", "home", "beauty"]
};

function log(...args) {
  console.log("[sync-catalog]", ...args);
}

function nowIso() {
  return new Date().toISOString();
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function slugify(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function normalizeUrl(url = "") {
  const raw = String(url).trim();
  if (!raw) return "";
  try {
    return new URL(raw).toString();
  } catch {
    return "";
  }
}

function isUsableImage(url = "") {
  const raw = String(url).trim().toLowerCase();
  if (!raw) return false;
  if (!raw.startsWith("http")) return false;
  if (raw.includes("your-image-url.com")) return false;
  if (raw.includes("placeholder")) return false;
  return true;
}

function buildAffiliateLink(amazonUrl = "") {
  const tag = process.env.AMAZON_AFFILIATE_TAG || "Drackk-20";
  const url = normalizeUrl(amazonUrl);
  if (!url) return "";

  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("amazon.com")) {
      parsed.searchParams.set("tag", tag);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function normalizeCatalogCategory(raw = "") {
  const value = String(raw).trim().toLowerCase();

  if (["women", "men", "jewelry"].includes(value)) return "fashion";
  if (["baby", "pets"].includes(value)) return "family";

  if (
    [
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
    ].includes(value)
  ) {
    return value;
  }

  return "general";
}

async function loadSeed() {
  const seedPath = path.join(__dirname, "catalog-seed.json");
  const raw = await fs.readFile(seedPath, "utf-8");
  return JSON.parse(raw);
}

async function fetchExistingProducts(asins) {
  if (!asins.length) return new Map();

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .in("asin", asins);

  if (error) {
    log("existing products fetch error:", error);
    return new Map();
  }

  return new Map((data || []).map((row) => [row.asin, row]));
}

function mergeProduct(existing, incoming) {
  return {
    asin: incoming.asin,
    slug: existing?.slug || incoming.slug,
    name: incoming.name || existing?.name || "Amazon Product",
    brand: incoming.brand || existing?.brand || null,
    description: incoming.description || existing?.description || null,
    short_description: incoming.short_description || existing?.short_description || null,
    image_url: isUsableImage(incoming.image_url)
      ? incoming.image_url
      : existing?.image_url || null,
    gallery_urls: Array.isArray(existing?.gallery_urls) ? existing.gallery_urls : [],
    price: incoming.price > 0 ? incoming.price : existing?.price ?? null,
    original_price:
      incoming.original_price > 0 ? incoming.original_price : existing?.original_price ?? null,
    discount_percentage:
      incoming.discount_percentage > 0
        ? incoming.discount_percentage
        : existing?.discount_percentage ?? 0,
    currency: incoming.currency || existing?.currency || "USD",
    amazon_rating:
      incoming.amazon_rating > 0 ? incoming.amazon_rating : existing?.amazon_rating ?? 0,
    amazon_review_count:
      incoming.amazon_review_count > 0
        ? incoming.amazon_review_count
        : existing?.amazon_review_count ?? 0,
    amazon_url: incoming.amazon_url || existing?.amazon_url || null,
    affiliate_link: incoming.affiliate_link || existing?.affiliate_link || null,
    is_best_seller: true,
    is_giftable: Boolean(existing?.is_giftable || incoming.is_giftable),
    is_crazy_deal: Boolean(existing?.is_crazy_deal || incoming.is_crazy_deal),
    score: Math.max(safeNumber(existing?.score, 0), safeNumber(incoming.score, 0)),
    priority: Math.max(safeNumber(existing?.priority, 0), safeNumber(incoming.priority, 0)),
    updated_at: nowIso(),
    created_at: existing?.created_at || nowIso()
  };
}

function normalizeSeedItem(item, rawCategory, index) {
  const asin = String(item?.asin || "")
    .trim()
    .toUpperCase();

  const amazonUrl = normalizeUrl(item?.amazon_url || "");
  if (!asin || !amazonUrl) return null;

  const category = normalizeCatalogCategory(rawCategory);
  const title = String(item?.name || "").trim() || `Amazon Product ${asin}`;

  return {
    asin,
    slug: slugify(`${title}-${asin}`),
    name: title,
    brand: item?.brand || null,
    description: item?.description || null,
    short_description: item?.short_description || null,
    image_url: isUsableImage(item?.image_url) ? item.image_url : null,
    price: safeNumber(item?.price, 0),
    original_price: safeNumber(item?.original_price, 0),
    discount_percentage: safeNumber(item?.discount_percentage, 0),
    currency: item?.currency || "USD",
    amazon_rating: safeNumber(item?.amazon_rating, 0),
    amazon_review_count: safeNumber(item?.amazon_review_count, 0),
    amazon_url: amazonUrl,
    affiliate_link: buildAffiliateLink(amazonUrl),
    is_best_seller: true,
    is_giftable: Boolean(item?.is_giftable),
    is_crazy_deal: false,
    score: Math.max(100 - index, 1),
    priority: Math.max(100 - index, 1),
    normalized_category: category,
    source_rank: index + 1,
    source_name: "catalog-seed"
  };
}

function uniqueByAsin(items) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    if (!item?.asin) continue;
    if (seen.has(item.asin)) continue;
    seen.add(item.asin);
    result.push(item);
  }

  return result;
}

function buildGroupedItems(seed) {
  const grouped = {};

  for (const category of CATEGORY_PRIORITY_ORDER) {
    grouped[category] = [];
  }

  for (const [rawCategory, items] of Object.entries(seed || {})) {
    const normalizedCategory = normalizeCatalogCategory(rawCategory);

    (items || []).forEach((item, index) => {
      const normalized = normalizeSeedItem(item, rawCategory, index);
      if (!normalized) return;
      grouped[normalizedCategory].push(normalized);
    });
  }

  for (const category of Object.keys(grouped)) {
    grouped[category] = uniqueByAsin(grouped[category]);
  }

  return grouped;
}

function cloneWithCategory(item, category, rank) {
  return {
    ...item,
    normalized_category: category,
    source_rank: rank
  };
}

function fillCategoryMinimums(groupedItems) {
  const output = {};

  for (const category of CATEGORY_PRIORITY_ORDER) {
    output[category] = uniqueByAsin(groupedItems[category] || []);
  }

  const allPools = uniqueByAsin(
    CATEGORY_PRIORITY_ORDER.flatMap((category) => output[category] || [])
  );

  for (const [category, minCount] of Object.entries(CATEGORY_MINIMUMS)) {
    const current = output[category] || [];
    const seen = new Set(current.map((item) => item.asin));

    const supportCategories = [
      category,
      ...(CATEGORY_SUPPORT_POOLS[category] || []),
      "general"
    ];

    const supportPool = uniqueByAsin(
      supportCategories.flatMap((cat) => output[cat] || [])
    );

    let rank = current.length + 1;

    for (const item of supportPool) {
      if (current.length >= minCount) break;
      if (!item?.asin || seen.has(item.asin)) continue;

      current.push(cloneWithCategory(item, category, rank));
      seen.add(item.asin);
      rank += 1;
    }

    if (current.length < minCount) {
      for (const item of allPools) {
        if (current.length >= minCount) break;
        if (!item?.asin || seen.has(item.asin)) continue;

        current.push(cloneWithCategory(item, category, rank));
        seen.add(item.asin);
        rank += 1;
      }
    }

    output[category] = current;
  }

  return output;
}

function collectProductsAndSources(groupedItems) {
  const productMap = new Map();
  const sourceRows = [];

  for (const category of CATEGORY_PRIORITY_ORDER) {
    const items = groupedItems[category] || [];

    items.forEach((item, index) => {
      const sourceRank = item.source_rank || index + 1;

      if (!productMap.has(item.asin)) {
        productMap.set(item.asin, {
          asin: item.asin,
          slug: item.slug,
          name: item.name,
          brand: item.brand,
          description: item.description,
          short_description: item.short_description,
          image_url: item.image_url,
          price: item.price,
          original_price: item.original_price,
          discount_percentage: item.discount_percentage,
          currency: item.currency,
          amazon_rating: item.amazon_rating,
          amazon_review_count: item.amazon_review_count,
          amazon_url: item.amazon_url,
          affiliate_link: item.affiliate_link,
          is_best_seller: true,
          is_giftable: item.is_giftable,
          is_crazy_deal: false,
          score: item.score,
          priority: item.priority
        });
      }

      sourceRows.push({
        asin: item.asin,
        source_kind: "catalog",
        category,
        source_name: item.source_name || "catalog-seed",
        source_rank: sourceRank,
        is_active: true,
        last_seen_at: nowIso(),
        published_at: null,
        created_at: nowIso(),
        updated_at: nowIso()
      });
    });
  }

  return {
    products: [...productMap.values()],
    sources: sourceRows
  };
}

function dedupeSources(rows) {
  const map = new Map();

  for (const row of rows) {
    const key = `${row.asin}::${row.source_kind}::${row.category}`;
    if (!map.has(key)) {
      map.set(key, row);
    } else {
      const existing = map.get(key);
      if (safeNumber(row.source_rank, 999999) < safeNumber(existing.source_rank, 999999)) {
        map.set(key, row);
      }
    }
  }

  return [...map.values()];
}

async function main() {
  const seed = await loadSeed();

  const grouped = buildGroupedItems(seed);
  const filled = fillCategoryMinimums(grouped);
  const { products, sources } = collectProductsAndSources(filled);

  const uniqueProducts = uniqueByAsin(products);
  const uniqueSources = dedupeSources(sources);

  const existingMap = await fetchExistingProducts(uniqueProducts.map((p) => p.asin));
  const productsToUpsert = uniqueProducts.map((product) =>
    mergeProduct(existingMap.get(product.asin), product)
  );

  log(
    "prepared category counts:",
    Object.fromEntries(
      CATEGORY_PRIORITY_ORDER.map((category) => [category, (filled[category] || []).length])
    )
  );

  const { error: productsError } = await supabase
    .from("products")
    .upsert(productsToUpsert, { onConflict: "asin" });

  if (productsError) throw productsError;

  const { error: sourcesError } = await supabase
    .from("product_sources")
    .upsert(uniqueSources, { onConflict: "asin,source_kind,category" });

  if (sourcesError) throw sourcesError;

  log("upserted products:", productsToUpsert.length);
  log("upserted catalog sources:", uniqueSources.length);
  log("DONE");
}

main().catch((error) => {
  console.error("[sync-catalog] FAILED", error);
  process.exit(1);
});
