#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import Parser from "rss-parser";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent": "TrendPulse/1.0"
  }
});

const TARGET_CATEGORIES = [
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

const MIN_DEALS_TOTAL = 48;
const PAGE_SIZE = 1000;

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function getHaystack(row = {}) {
  return [
    row.category,
    row.subcategory,
    row.name,
    row.brand,
    row.short_description,
    row.description,
    row.source_name
  ]
    .map(normalizeLower)
    .filter(Boolean)
    .join(" ");
}

function hasAny(haystack, keywords) {
  return keywords.some((keyword) => haystack.includes(keyword));
}

function normalizeCategory(rawCategory, row = {}) {
  const haystack = [normalizeLower(rawCategory), getHaystack(row)].filter(Boolean).join(" ");

  if (!haystack) return "general";

  if (hasAny(haystack, ["tech", "electronics", "gadget", "gaming", "computer", "laptop", "phone", "charger", "audio", "tablet", "camera"])) return "tech";
  if (hasAny(haystack, ["home", "furniture", "decor", "storage", "household", "vacuum", "blanket", "lamp", "organizer"])) return "home";
  if (hasAny(haystack, ["kitchen", "cookware", "cooking", "air fryer", "coffee", "blender", "knife", "toaster"])) return "kitchen";
  if (hasAny(haystack, ["beauty", "skincare", "makeup", "cosmetic", "serum", "shampoo", "perfume"])) return "beauty";
  if (hasAny(haystack, ["health", "wellness", "vitamin", "supplement", "massager", "recovery", "sleep"])) return "health";
  if (hasAny(haystack, ["sport", "outdoor", "exercise", "training", "fitness", "yoga", "workout", "camping"])) return "sports";
  if (hasAny(haystack, ["travel", "luggage", "suitcase", "backpack", "adapter", "packing cube"])) return "travel";
  if (hasAny(haystack, ["fashion", "men", "women", "jewelry", "shoe", "watch", "wallet", "clothing", "bag"])) return "fashion";
  if (hasAny(haystack, ["family", "kid", "baby", "pet", "dog", "cat", "toy", "stroller", "diaper"])) return "family";

  return "general";
}

function computeDiscountPercent(row) {
  const explicit = safeNumber(row.discount_percentage ?? row.discount_percent, NaN);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  const price = safeNumber(row.price, 0);
  const original = safeNumber(row.original_price, 0);
  if (price > 0 && original > price) {
    return ((original - price) / original) * 100;
  }

  return 0;
}

function looksLikeDealFeed(row) {
  const haystack = getHaystack(row);
  return hasAny(haystack, ["deal", "discount", "flash sale", "limited time", "coupon", "clearance", "price drop", "sale"]);
}

function isGoodDeal(row) {
  const price = safeNumber(row.price, 0);
  const original = safeNumber(row.original_price, 0);
  const discount = computeDiscountPercent(row);
  const score = safeNumber(row.score, 0);
  const likes = safeNumber(row.likes, 0);
  const rating = safeNumber(row.amazon_rating, 0);
  const reviews = safeNumber(row.amazon_review_count, 0);
  const crazyDeal = row.is_crazy_deal === true;
  const explicitDeal = normalizeLower(row.type) === "deal" || normalizeLower(row.source_kind) === "deal";

  if (crazyDeal || explicitDeal || looksLikeDealFeed(row)) return true;
  if (discount >= 15) return true;
  if (original > price && price > 0) return true;
  if (score >= 60) return true;
  if (likes >= 10) return true;
  if (rating >= 4.4 && reviews >= 1000) return true;

  return false;
}

function computeDealPriority(row) {
  const discount = computeDiscountPercent(row);
  const reviews = safeNumber(row.amazon_review_count, 0);
  const rating = safeNumber(row.amazon_rating, 0);
  const score = safeNumber(row.score, 0);
  const priority = safeNumber(row.priority, 0);
  const clicks = safeNumber(row.clicks, 0);
  const views = safeNumber(row.views, 0);
  const likes = safeNumber(row.likes, 0);
  const crazyDealBonus = row.is_crazy_deal === true ? 120 : 0;
  const bestsellerBonus = row.is_best_seller === true ? 60 : 0;
  const explicitDealBonus = looksLikeDealFeed(row) ? 80 : 0;

  return (
    discount * 12 +
    reviews * 0.25 +
    rating * 100 * 0.22 +
    score * 0.25 +
    priority * 5 +
    clicks * 1.8 +
    views * 0.15 +
    likes * 3 +
    crazyDealBonus +
    bestsellerBonus +
    explicitDealBonus
  );
}

function buildDealSourceRow(row) {
  const asin = normalizeText(row.asin);
  const name = normalizeText(row.name);

  if (!asin || !name) return null;
  if (row.is_active === false) return null;
  if (!isGoodDeal(row)) return null;

  const category = normalizeCategory(row.category, row);

  return {
    asin,
    source_kind: "deal",
    category,
    source_name: normalizeText(row.source_name) || normalizeText(row.brand) || "deal-feed",
    source_rank: 0,
    is_active: true,
    last_seen_at: new Date().toISOString(),
    published_at: row.published_at || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    _priority_score: computeDealPriority(row),
    _name: name
  };
}

function buildFallbackDealRow(row) {
  const asin = normalizeText(row.asin);
  const name = normalizeText(row.name);

  if (!asin || !name) return null;
  if (row.is_active === false) return null;

  const category = normalizeCategory(row.category, row);

  return {
    asin,
    source_kind: "deal",
    category,
    source_name: "catalog-fallback",
    source_rank: 0,
    is_active: true,
    last_seen_at: new Date().toISOString(),
    published_at: row.published_at || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    _priority_score:
      safeNumber(row.amazon_review_count, 0) * 0.45 +
      safeNumber(row.amazon_rating, 0) * 100 * 0.25 +
      safeNumber(row.score, 0) * 0.2 +
      safeNumber(row.priority, 0) * 5 +
      safeNumber(row.likes, 0) * 2 +
      20,
    _name: name
  };
}

async function fetchAllProducts() {
  let from = 0;
  let all = [];

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase.from("products").select("*").range(from, to);

    if (error) throw new Error(`Failed to fetch products: ${error.message}`);
    if (!data || data.length === 0) break;

    all = all.concat(data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return all;
}

function dedupeByAsin(rows) {
  const map = new Map();

  for (const row of rows) {
    if (!row?.asin) continue;
    const existing = map.get(row.asin);
    if (!existing || row._priority_score > existing._priority_score) {
      map.set(row.asin, row);
    }
  }

  return Array.from(map.values());
}

function ensureMinimumDeals(primaryDeals, allProducts) {
  if (primaryDeals.length >= MIN_DEALS_TOTAL) return primaryDeals;

  const existing = new Set(primaryDeals.map((row) => row.asin));
  const fallbackCandidates = allProducts
    .map(buildFallbackDealRow)
    .filter(Boolean)
    .sort((a, b) => b._priority_score - a._priority_score);

  const out = [...primaryDeals];

  for (const row of fallbackCandidates) {
    if (existing.has(row.asin)) continue;
    out.push(row);
    existing.add(row.asin);
    if (out.length >= MIN_DEALS_TOTAL) break;
  }

  return out;
}

function assignRanks(rows) {
  const grouped = new Map();
  for (const category of TARGET_CATEGORIES) grouped.set(category, []);
  for (const row of rows) grouped.get(row.category).push(row);

  const finalRows = [];

  for (const [category, items] of grouped.entries()) {
    items.sort((a, b) => {
      if (b._priority_score !== a._priority_score) return b._priority_score - a._priority_score;
      return a._name.localeCompare(b._name);
    });

    items.forEach((item, index) => {
      finalRows.push({
        asin: item.asin,
        source_kind: item.source_kind,
        category,
        source_name: item.source_name,
        source_rank: index + 1,
        is_active: item.is_active,
        last_seen_at: item.last_seen_at,
        published_at: item.published_at,
        created_at: item.created_at,
        updated_at: item.updated_at
      });
    });
  }

  return finalRows;
}

async function deleteExistingDealSources() {
  const { error } = await supabase.from("product_sources").delete().eq("source_kind", "deal");
  if (error) throw new Error(`Failed to delete old deal sources: ${error.message}`);
}

async function insertDealSources(rows) {
  if (!rows.length) return;

  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from("product_sources").insert(chunk);
    if (error) throw new Error(`Failed to insert deal sources: ${error.message}`);
  }
}

async function verifyCounts() {
  const { data, error } = await supabase
    .from("product_sources")
    .select("category")
    .eq("source_kind", "deal");

  if (error) throw new Error(`Failed to verify deal source counts: ${error.message}`);

  const counts = {};
  for (const row of data || []) counts[row.category] = (counts[row.category] || 0) + 1;
  return counts;
}

async function fetchDealsFromRssFeeds() {
  const feeds = [
    "https://www.dealnews.com/c142/Electronics/?rss=1",
    "https://www.dealnews.com/c39/Home-Garden/?rss=1",
    "https://www.dealnews.com/c238/Health-Beauty/?rss=1"
  ];

  const allEntries = [];

  for (const url of feeds) {
    try {
      const feed = await parser.parseURL(url);
      for (const item of feed.items || []) {
        allEntries.push({
          title: item.title || "",
          link: item.link || "",
          pubDate: item.pubDate || "",
          source_name: feed.title || "rss-feed"
        });
      }
    } catch (error) {
      console.error(`RSS fetch failed for ${url}:`, error.message);
    }
  }

  return allEntries;
}

async function boostProductsFromRss(allProducts) {
  const rssEntries = await fetchDealsFromRssFeeds();
  if (!rssEntries.length) return [];

  const boosted = [];
  const entriesText = rssEntries.map((entry) => `${normalizeLower(entry.title)} ${normalizeLower(entry.link)}`);

  for (const product of allProducts) {
    const haystack = getHaystack(product);
    if (!haystack) continue;

    const match = entriesText.find((text) => {
      const words = haystack.split(" ").filter((w) => w.length > 3).slice(0, 8);
      return words.some((word) => text.includes(word));
    });

    if (!match) continue;

    boosted.push(
      buildDealSourceRow({
        ...product,
        type: "deal",
        source_name: "rss-match",
        score: safeNumber(product.score, 0) + 20
      })
    );
  }

  return boosted.filter(Boolean);
}

async function main() {
  console.log("Starting deals sync...");

  const products = await fetchAllProducts();
  console.log(`Fetched ${products.length} products`);

  const directDeals = products.map(buildDealSourceRow).filter(Boolean);
  console.log(`Mapped ${directDeals.length} direct deal rows`);

  const rssBoostedDeals = await boostProductsFromRss(products);
  console.log(`Mapped ${rssBoostedDeals.length} RSS-boosted deal rows`);

  const deduped = dedupeByAsin([...directDeals, ...rssBoostedDeals]);
  console.log(`Deduped to ${deduped.length} unique deal products`);

  const withFallback = ensureMinimumDeals(deduped, products);
  console.log(`Expanded to ${withFallback.length} deal rows after fallback`);

  const ranked = assignRanks(withFallback);
  console.log(`Ranked ${ranked.length} deal rows`);

  await deleteExistingDealSources();
  console.log("Deleted old deal sources");

  await insertDealSources(ranked);
  console.log("Inserted new deal sources");

  const counts = await verifyCounts();
  console.log("Deal categories:", counts);
  console.log("Deals sync complete");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
