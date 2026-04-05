#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
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

const MIN_PRODUCTS_PER_CATEGORY = 60;
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

function slugify(value) {
  return normalizeLower(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function unique(array) {
  return [...new Set(array)];
}

function getHaystack(row = {}) {
  return [
    row.category,
    row.subcategory,
    row.name,
    row.brand,
    row.short_description,
    row.description
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

  if (
    hasAny(haystack, [
      "tech", "electronics", "gadget", "gaming", "computer", "laptop", "keyboard",
      "mouse", "monitor", "ssd", "router", "webcam", "audio", "speaker", "earbud",
      "headphone", "microphone", "phone", "iphone", "android", "charger", "usb",
      "tablet", "smartwatch", "camera", "tv", "projector", "magsafe"
    ])
  ) {
    return "tech";
  }

  if (
    hasAny(haystack, [
      "home", "furniture", "decor", "storage", "household", "organizer", "vacuum",
      "pillow", "blanket", "lamp", "cleaner", "bedding", "sofa", "shelf",
      "office chair", "desk lamp", "humidifier", "air purifier"
    ])
  ) {
    return "home";
  }

  if (
    hasAny(haystack, [
      "kitchen", "cooking", "cookware", "appliance", "air fryer", "blender",
      "knife", "coffee", "espresso", "toaster", "pan", "pot", "mixer", "fryer",
      "rice cooker", "cutting board", "water bottle", "meal prep"
    ])
  ) {
    return "kitchen";
  }

  if (
    hasAny(haystack, [
      "beauty", "skincare", "makeup", "cosmetic", "serum", "cleanser",
      "moisturizer", "shampoo", "conditioner", "haircare", "face wash", "lip",
      "mascara", "nail", "fragrance", "perfume"
    ])
  ) {
    return "beauty";
  }

  if (
    hasAny(haystack, [
      "health", "wellness", "supplement", "vitamin", "recovery", "massager",
      "fitness tracker", "sleep", "posture", "pain relief", "protein",
      "electrolyte", "healthcare", "medical"
    ])
  ) {
    return "health";
  }

  if (
    hasAny(haystack, [
      "sport", "outdoor", "exercise", "training", "yoga", "gym", "running",
      "dumbbell", "resistance band", "treadmill", "cycling", "basketball",
      "football", "camping", "hiking", "workout"
    ])
  ) {
    return "sports";
  }

  if (
    hasAny(haystack, [
      "travel", "luggage", "suitcase", "carry-on", "passport", "backpack",
      "travel accessory", "packing cube", "neck pillow", "toiletry bag",
      "adapter", "trip"
    ])
  ) {
    return "travel";
  }

  if (
    hasAny(haystack, [
      "fashion", "men", "women", "jewelry", "jewellery", "shoe", "watch",
      "wallet", "bracelet", "necklace", "ring", "bag", "handbag", "clothing",
      "hoodie", "dress", "shirt", "sneaker", "belt", "sunglasses"
    ])
  ) {
    return "fashion";
  }

  if (
    hasAny(haystack, [
      "family", "kid", "baby", "pet", "dog", "cat", "toy", "nursery",
      "stroller", "diaper", "toddler", "children", "puppy", "kitten"
    ])
  ) {
    return "family";
  }

  return "general";
}

function computeCatalogPriority(row) {
  const reviews = safeNumber(row.amazon_review_count, 0);
  const rating = safeNumber(row.amazon_rating, 0);
  const score = safeNumber(row.score, 0);
  const priority = safeNumber(row.priority, 0);
  const clicks = safeNumber(row.clicks, 0);
  const views = safeNumber(row.views, 0);
  const likes = safeNumber(row.likes, 0);
  const price = safeNumber(row.price, 0);
  const sourceRank = safeNumber(row.source_rank, 0);
  const bestSellerBonus = row.is_best_seller === true ? 80 : 0;
  const activeBonus = row.is_active === false ? -1000 : 40;

  let valueScore = 0;
  if (price > 0 && price <= 15) valueScore = 35;
  else if (price <= 30) valueScore = 24;
  else if (price <= 60) valueScore = 14;
  else if (price <= 120) valueScore = 7;

  return (
    reviews * 0.5 +
    rating * 100 * 0.28 +
    score * 0.22 +
    priority * 6 +
    clicks * 2 +
    views * 0.2 +
    likes * 3 +
    sourceRank * 2 +
    valueScore +
    bestSellerBonus +
    activeBonus
  );
}

function getSupplementalCategories(row, baseCategory) {
  const haystack = getHaystack(row);
  const list = [];

  if (baseCategory !== "tech" && hasAny(haystack, ["gaming", "charger", "audio", "phone", "computer"])) list.push("tech");
  if (baseCategory !== "home" && hasAny(haystack, ["home", "storage", "decor", "organizer", "lamp"])) list.push("home");
  if (baseCategory !== "kitchen" && hasAny(haystack, ["kitchen", "cookware", "coffee", "air fryer", "blender"])) list.push("kitchen");
  if (baseCategory !== "beauty" && hasAny(haystack, ["beauty", "skincare", "makeup", "haircare"])) list.push("beauty");
  if (baseCategory !== "health" && hasAny(haystack, ["health", "wellness", "massager", "vitamin", "recovery"])) list.push("health");
  if (baseCategory !== "sports" && hasAny(haystack, ["sports", "fitness", "workout", "yoga", "outdoor"])) list.push("sports");
  if (baseCategory !== "travel" && hasAny(haystack, ["travel", "backpack", "luggage", "adapter"])) list.push("travel");
  if (baseCategory !== "fashion" && hasAny(haystack, ["fashion", "shoe", "watch", "wallet", "jewelry", "bag"])) list.push("fashion");
  if (baseCategory !== "family" && hasAny(haystack, ["baby", "kid", "pet", "dog", "cat", "toy"])) list.push("family");
  if (baseCategory !== "general") list.push("general");

  return unique(list.filter((cat) => TARGET_CATEGORIES.includes(cat)));
}

function buildCatalogSourceRow(row) {
  const asin = normalizeText(row.asin);
  const name = normalizeText(row.name);

  if (!asin || !name) return null;
  if (row.is_active === false) return null;

  const category = normalizeCategory(row.category, row);

  return {
    asin,
    source_kind: "catalog",
    category,
    source_name: "catalog-seed",
    source_rank: 0,
    is_active: true,
    last_seen_at: new Date().toISOString(),
    published_at: row.published_at || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    _priority_score: computeCatalogPriority(row),
    _name: name,
    _slug: normalizeText(row.slug) || slugify(name) || asin.toLowerCase(),
    _base_category: category,
    _all_candidate_categories: unique([category, ...getSupplementalCategories(row, category)])
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

function dedupePrimaryCandidates(rows) {
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

function cloneForCategory(item, category) {
  return {
    asin: item.asin,
    source_kind: "catalog",
    category,
    source_name: "catalog-seed",
    source_rank: 0,
    is_active: true,
    last_seen_at: item.last_seen_at,
    published_at: item.published_at,
    created_at: item.created_at,
    updated_at: item.updated_at,
    _priority_score: item._priority_score,
    _name: item._name
  };
}

function fillCategories(primaryRows) {
  const groupedPrimary = new Map();
  const allByScore = [...primaryRows].sort((a, b) => b._priority_score - a._priority_score);

  for (const category of TARGET_CATEGORIES) groupedPrimary.set(category, []);
  for (const row of primaryRows) groupedPrimary.get(row._base_category).push(row);

  const finalRows = [];
  const usedInCategory = new Map();

  for (const category of TARGET_CATEGORIES) {
    usedInCategory.set(category, new Set());

    const primaries = (groupedPrimary.get(category) || []).sort((a, b) => b._priority_score - a._priority_score);

    for (const row of primaries) {
      if (usedInCategory.get(category).has(row.asin)) continue;
      finalRows.push(cloneForCategory(row, category));
      usedInCategory.get(category).add(row.asin);
    }

    if (usedInCategory.get(category).size < MIN_PRODUCTS_PER_CATEGORY) {
      for (const row of allByScore) {
        if (usedInCategory.get(category).has(row.asin)) continue;
        if (!row._all_candidate_categories.includes(category)) continue;

        finalRows.push(cloneForCategory(row, category));
        usedInCategory.get(category).add(row.asin);

        if (usedInCategory.get(category).size >= MIN_PRODUCTS_PER_CATEGORY) break;
      }
    }

    if (usedInCategory.get(category).size < MIN_PRODUCTS_PER_CATEGORY) {
      for (const row of allByScore) {
        if (usedInCategory.get(category).has(row.asin)) continue;

        finalRows.push(cloneForCategory(row, category));
        usedInCategory.get(category).add(row.asin);

        if (usedInCategory.get(category).size >= MIN_PRODUCTS_PER_CATEGORY) break;
      }
    }
  }

  return finalRows;
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

async function deleteExistingCatalogSources() {
  const { error } = await supabase.from("product_sources").delete().eq("source_kind", "catalog");
  if (error) throw new Error(`Failed to delete old catalog sources: ${error.message}`);
}

async function insertCatalogSources(rows) {
  if (!rows.length) return;

  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from("product_sources").insert(chunk);
    if (error) throw new Error(`Failed to insert catalog sources: ${error.message}`);
  }
}

async function verifyCounts() {
  const { data, error } = await supabase
    .from("product_sources")
    .select("category")
    .eq("source_kind", "catalog");

  if (error) throw new Error(`Failed to verify catalog source counts: ${error.message}`);

  const counts = {};
  for (const row of data || []) counts[row.category] = (counts[row.category] || 0) + 1;
  return counts;
}

async function main() {
  console.log("Starting catalog sync...");

  const products = await fetchAllProducts();
  console.log(`Fetched ${products.length} products`);

  const mapped = products.map(buildCatalogSourceRow).filter(Boolean);
  console.log(`Mapped ${mapped.length} potential catalog rows`);

  const deduped = dedupePrimaryCandidates(mapped);
  console.log(`Deduped to ${deduped.length} unique catalog products`);

  const filled = fillCategories(deduped);
  console.log(`Expanded to ${filled.length} category assignments`);

  const ranked = assignRanks(filled);
  console.log(`Ranked ${ranked.length} catalog rows`);

  await deleteExistingCatalogSources();
  console.log("Deleted old catalog sources");

  await insertCatalogSources(ranked);
  console.log("Inserted new catalog sources");

  const counts = await verifyCounts();
  console.log("Catalog categories:", counts);
  console.log("Catalog sync complete");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
