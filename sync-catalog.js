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

const TARGET_CATEGORIES = new Set([
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
]);

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

function normalizeCategory(rawCategory, row = {}) {
  const raw = normalizeLower(rawCategory);

  const name = normalizeLower(row.name);
  const brand = normalizeLower(row.brand);
  const subcategory = normalizeLower(row.subcategory);
  const description = normalizeLower(row.short_description || row.description);

  const haystack = [raw, subcategory, name, brand, description].filter(Boolean).join(" ");

  if (!haystack) return "general";

  if (
    haystack.includes("tech") ||
    haystack.includes("electronics") ||
    haystack.includes("gadget") ||
    haystack.includes("gaming") ||
    haystack.includes("computer") ||
    haystack.includes("laptop") ||
    haystack.includes("keyboard") ||
    haystack.includes("mouse") ||
    haystack.includes("monitor") ||
    haystack.includes("ssd") ||
    haystack.includes("router") ||
    haystack.includes("webcam") ||
    haystack.includes("headphone") ||
    haystack.includes("earbud") ||
    haystack.includes("speaker") ||
    haystack.includes("microphone") ||
    haystack.includes("phone") ||
    haystack.includes("iphone") ||
    haystack.includes("android") ||
    haystack.includes("charger") ||
    haystack.includes("usb")
  ) {
    return "tech";
  }

  if (
    haystack.includes("home") ||
    haystack.includes("furniture") ||
    haystack.includes("decor") ||
    haystack.includes("storage") ||
    haystack.includes("household") ||
    haystack.includes("organizer") ||
    haystack.includes("vacuum") ||
    haystack.includes("pillow") ||
    haystack.includes("blanket") ||
    haystack.includes("lamp")
  ) {
    return "home";
  }

  if (
    haystack.includes("kitchen") ||
    haystack.includes("cooking") ||
    haystack.includes("cookware") ||
    haystack.includes("appliance") ||
    haystack.includes("air fryer") ||
    haystack.includes("blender") ||
    haystack.includes("knife") ||
    haystack.includes("coffee") ||
    haystack.includes("espresso") ||
    haystack.includes("toaster") ||
    haystack.includes("pan")
  ) {
    return "kitchen";
  }

  if (
    haystack.includes("beauty") ||
    haystack.includes("skincare") ||
    haystack.includes("makeup") ||
    haystack.includes("cosmetic") ||
    haystack.includes("serum") ||
    haystack.includes("cleanser") ||
    haystack.includes("moisturizer") ||
    haystack.includes("shampoo") ||
    haystack.includes("conditioner")
  ) {
    return "beauty";
  }

  if (
    haystack.includes("health") ||
    haystack.includes("wellness") ||
    haystack.includes("supplement") ||
    haystack.includes("vitamin") ||
    haystack.includes("recovery") ||
    haystack.includes("massager")
  ) {
    return "health";
  }

  if (
    haystack.includes("sport") ||
    haystack.includes("outdoor") ||
    haystack.includes("exercise") ||
    haystack.includes("training") ||
    haystack.includes("fitness") ||
    haystack.includes("yoga") ||
    haystack.includes("gym") ||
    haystack.includes("running") ||
    haystack.includes("dumbbell") ||
    haystack.includes("resistance band")
  ) {
    return "sports";
  }

  if (
    haystack.includes("travel") ||
    haystack.includes("luggage") ||
    haystack.includes("suitcase") ||
    haystack.includes("carry-on") ||
    haystack.includes("passport") ||
    haystack.includes("backpack") ||
    haystack.includes("travel accessory")
  ) {
    return "travel";
  }

  if (
    haystack.includes("fashion") ||
    haystack.includes("men") ||
    haystack.includes("women") ||
    haystack.includes("jewelry") ||
    haystack.includes("jewellery") ||
    haystack.includes("shoe") ||
    haystack.includes("watch") ||
    haystack.includes("wallet") ||
    haystack.includes("bracelet") ||
    haystack.includes("necklace") ||
    haystack.includes("ring") ||
    haystack.includes("bag")
  ) {
    return "fashion";
  }

  if (
    haystack.includes("family") ||
    haystack.includes("kid") ||
    haystack.includes("baby") ||
    haystack.includes("pet") ||
    haystack.includes("dog") ||
    haystack.includes("cat") ||
    haystack.includes("toy") ||
    haystack.includes("nursery") ||
    haystack.includes("stroller") ||
    haystack.includes("diaper")
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

  let valueScore = 0;
  if (price > 0 && price <= 15) valueScore = 25;
  else if (price <= 30) valueScore = 18;
  else if (price <= 60) valueScore = 10;

  return (
    reviews * 0.45 +
    rating * 100 * 0.25 +
    score * 0.2 +
    priority * 5 +
    clicks * 1.5 +
    views * 0.15 +
    likes * 2 +
    valueScore
  );
}

function buildCatalogSourceRow(row) {
  const asin = normalizeText(row.asin);
  const name = normalizeText(row.name);

  if (!asin || !name) return null;
  if (row.is_active === false) return null;

  const category = normalizeCategory(row.category, row);

  if (!TARGET_CATEGORIES.has(category)) {
    return null;
  }

  return {
    asin,
    source_kind: "catalog",
    category,
    source_name: "catalog-seed",
    source_rank: 0,
    is_active: row.is_active !== false,
    last_seen_at: new Date().toISOString(),
    published_at: row.published_at || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    _priority_score: computeCatalogPriority(row),
    _name: name,
    _slug: normalizeText(row.slug) || slugify(name) || asin.toLowerCase()
  };
}

async function fetchAllProducts() {
  const pageSize = 1000;
  let from = 0;
  let all = [];

  while (true) {
    const to = from + pageSize - 1;

    const { data, error } = await supabase
      .from("products")
      .select("*")
      .range(from, to);

    if (error) {
      throw new Error(`Failed to fetch products: ${error.message}`);
    }

    if (!data || data.length === 0) break;

    all = all.concat(data);

    if (data.length < pageSize) break;
    from += pageSize;
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

function assignRanks(rows) {
  const grouped = new Map();

  for (const row of rows) {
    if (!grouped.has(row.category)) grouped.set(row.category, []);
    grouped.get(row.category).push(row);
  }

  const finalRows = [];

  for (const [category, items] of grouped.entries()) {
    items.sort((a, b) => {
      if (b._priority_score !== a._priority_score) {
        return b._priority_score - a._priority_score;
      }
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
  const { error } = await supabase
    .from("product_sources")
    .delete()
    .eq("source_kind", "catalog");

  if (error) {
    throw new Error(`Failed to delete old catalog sources: ${error.message}`);
  }
}

async function insertCatalogSources(rows) {
  if (!rows.length) return;

  const chunkSize = 500;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);

    const { error } = await supabase
      .from("product_sources")
      .insert(chunk);

    if (error) {
      throw new Error(`Failed to insert catalog sources: ${error.message}`);
    }
  }
}

async function verifyCounts() {
  const { data, error } = await supabase
    .from("product_sources")
    .select("source_kind, category", { count: "exact" })
    .eq("source_kind", "catalog");

  if (error) {
    throw new Error(`Failed to verify catalog source counts: ${error.message}`);
  }

  const counts = {};
  for (const row of data || []) {
    counts[row.category] = (counts[row.category] || 0) + 1;
  }

  return counts;
}

async function main() {
  console.log("Starting catalog sync...");

  const products = await fetchAllProducts();
  console.log(`Fetched ${products.length} products`);

  const mapped = products
    .map(buildCatalogSourceRow)
    .filter(Boolean);

  console.log(`Mapped ${mapped.length} potential catalog rows`);

  const deduped = dedupeByAsin(mapped);
  console.log(`Deduped to ${deduped.length} catalog rows`);

  const ranked = assignRanks(deduped);
  console.log(`Ranked ${ranked.length} catalog rows`);

  await deleteExistingCatalogSources();
  console.log("Deleted old catalog sources");

  await insertCatalogSources(ranked);
  console.log("Inserted new catalog sources");

  const counts = await verifyCounts();
  console.log("Catalog categories:");
  console.log(counts);

  console.log("Catalog sync complete");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
