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

function log(...args) {
  console.log("[sync-catalog]", ...args);
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function nowIso() {
  return new Date().toISOString();
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
    image_url: isUsableImage(incoming.image_url) ? incoming.image_url : existing?.image_url || null,
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

function buildCatalogSource(product, category, rank) {
  return {
    asin: product.asin,
    source_kind: "catalog",
    category,
    source_name: "catalog-seed",
    source_rank: rank,
    is_active: true,
    last_seen_at: nowIso(),
    published_at: null,
    created_at: nowIso(),
    updated_at: nowIso()
  };
}

async function main() {
  const seed = await loadSeed();

  const flatItems = [];
  const sourceRows = [];

  for (const [category, items] of Object.entries(seed)) {
    items.forEach((item, index) => {
      const amazonUrl = normalizeUrl(item.amazon_url || "");
      const asin = String(item.asin || "").trim().toUpperCase();

      if (!asin || !amazonUrl) return;

      const normalized = {
        asin,
        slug: slugify(`${item.name}-${asin}`),
        name: item.name || `Amazon Product ${asin}`,
        brand: item.brand || null,
        description: item.description || null,
        short_description: item.short_description || null,
        image_url: item.image_url || null,
        price: safeNumber(item.price, 0),
        original_price: safeNumber(item.original_price, 0),
        discount_percentage: safeNumber(item.discount_percentage, 0),
        currency: item.currency || "USD",
        amazon_rating: safeNumber(item.amazon_rating, 0),
        amazon_review_count: safeNumber(item.amazon_review_count, 0),
        amazon_url: amazonUrl,
        affiliate_link: buildAffiliateLink(amazonUrl),
        is_best_seller: true,
        is_giftable: Boolean(item.is_giftable),
        is_crazy_deal: false,
        score: Math.max(100 - index, 1),
        priority: Math.max(100 - index, 1)
      };

      flatItems.push(normalized);
      sourceRows.push(buildCatalogSource(normalized, category, index + 1));
    });
  }

  const uniqueProducts = new Map();
  for (const item of flatItems) {
    uniqueProducts.set(item.asin, item);
  }

  const asins = [...uniqueProducts.keys()];
  const existingMap = await fetchExistingProducts(asins);

  const productsToUpsert = [...uniqueProducts.values()].map((item) =>
    mergeProduct(existingMap.get(item.asin), item)
  );

  const { error: productsError } = await supabase
    .from("products")
    .upsert(productsToUpsert, { onConflict: "asin" });

  if (productsError) throw productsError;

  const { error: sourcesError } = await supabase
    .from("product_sources")
    .upsert(sourceRows, { onConflict: "asin,source_kind,category" });

  if (sourcesError) throw sourcesError;

  log("upserted products:", productsToUpsert.length);
  log("upserted catalog sources:", sourceRows.length);
}

main()
  .then(() => {
    log("DONE");
    process.exit(0);
  })
  .catch((error) => {
    console.error("[sync-catalog] FAILED", error);
    process.exit(1);
  });
