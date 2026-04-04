import Parser from "rss-parser";
import { createClient } from "@supabase/supabase-js";

const parser = new Parser({
  timeout: 20000,
  headers: {
    "User-Agent": "TrendPulse/1.0 (+https://www.trend-pulse.shop/)"
  }
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const RSS_FEEDS = (process.env.RSS_FEEDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function log(...args) {
  console.log("[sync-deals]", ...args);
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

function uniqueBy(items, getKey) {
  const map = new Map();
  for (const item of items) {
    map.set(getKey(item), item);
  }
  return [...map.values()];
}

function isUsableImage(url = "") {
  const raw = String(url).trim().toLowerCase();
  if (!raw) return false;
  if (!raw.startsWith("http")) return false;
  if (raw.includes("your-image-url.com")) return false;
  if (raw.includes("placeholder")) return false;
  if (raw.includes("data:image")) return false;
  return true;
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

function extractImageFromHtml(html = "") {
  if (!html) return "";
  const patterns = [
    /<img[^>]+src=["']([^"']+)["']/i,
    /<img[^>]+data-lazy-src=["']([^"']+)["']/i,
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const url = normalizeUrl(match[1]);
      if (isUsableImage(url)) return url;
    }
  }

  return "";
}

function extractImage(item) {
  const candidates = [
    item?.enclosure?.url,
    item?.["media:content"]?.url,
    item?.["media:thumbnail"]?.url,
    item?.image?.url,
    item?.image,
    item?.thumbnail
  ];

  for (const candidate of candidates) {
    const url = normalizeUrl(candidate);
    if (isUsableImage(url)) return url;
  }

  const htmlCandidates = [
    item?.content,
    item?.["content:encoded"],
    item?.summary,
    item?.contentSnippet
  ];

  for (const html of htmlCandidates) {
    const url = extractImageFromHtml(html || "");
    if (isUsableImage(url)) return url;
  }

  return "";
}

function extractAmazonUrlFromText(text = "") {
  if (!text) return "";
  const regex = /https?:\/\/[^\s"'<>]*amazon\.com[^\s"'<>]*/gi;
  const match = text.match(regex);
  if (!match?.length) return "";
  return normalizeUrl(match[0]);
}

function extractAmazonUrl(item) {
  const directCandidates = [
    item?.amazon_url,
    item?.link,
    item?.guid,
    item?.id
  ];

  for (const candidate of directCandidates) {
    const url = normalizeUrl(candidate);
    if (url.includes("amazon.com")) return url;
  }

  const textCandidates = [
    item?.content,
    item?.["content:encoded"],
    item?.summary,
    item?.contentSnippet,
    item?.title
  ];

  for (const text of textCandidates) {
    const url = extractAmazonUrlFromText(text || "");
    if (url) return url;
  }

  return "";
}

function extractASIN(url = "") {
  const raw = String(url);
  const patterns = [
    /\/dp\/([A-Z0-9]{10})(?:[/?]|$)/i,
    /\/gp\/product\/([A-Z0-9]{10})(?:[/?]|$)/i,
    /\/product\/([A-Z0-9]{10})(?:[/?]|$)/i,
    /[?&]asin=([A-Z0-9]{10})(?:[&#]|$)/i
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) return match[1].toUpperCase();
  }

  return "";
}

function extractPrice(text = "") {
  if (!text) return 0;
  const match = String(text).match(/\$ ?([0-9]+(?:\.[0-9]{1,2})?)/);
  return match ? safeNumber(match[1], 0) : 0;
}

function cleanupTitle(title = "") {
  return String(title)
    .replace(/\s+/g, " ")
    .replace(/\[[^\]]+\]/g, "")
    .trim()
    .slice(0, 250);
}

function inferCategory(text = "") {
  const haystack = String(text).toLowerCase();

  const map = [
    ["tech", ["laptop", "monitor", "ssd", "keyboard", "mouse", "router", "charger", "usb", "headphones", "earbuds", "speaker", "iphone", "ipad", "galaxy", "pc", "gaming", "tv", "camera", "webcam", "tech"]],
    ["home", ["blanket", "pillow", "mattress", "storage", "organizer", "cleaner", "vacuum", "home"]],
    ["kitchen", ["air fryer", "blender", "knife", "cookware", "pan", "pot", "coffee", "espresso", "kitchen", "toaster"]],
    ["beauty", ["skincare", "serum", "beauty", "makeup", "moisturizer", "cleanser", "shampoo", "conditioner"]],
    ["sports", ["dumbbell", "yoga", "fitness", "sports", "running", "gym", "bike", "treadmill"]],
    ["health", ["supplement", "vitamin", "protein", "sleep", "health", "wellness", "magnesium"]],
    ["travel", ["travel", "luggage", "backpack", "suitcase", "passport", "carry-on"]],
    ["women", ["women", "dress", "handbag", "purse", "bra", "leggings"]],
    ["men", ["men", "wallet", "beard", "razor", "shirt", "watch"]],
    ["jewelry", ["ring", "necklace", "bracelet", "earrings", "jewelry"]],
    ["baby", ["baby", "stroller", "diaper", "nursery"]],
    ["pets", ["dog", "cat", "pet", "litter", "leash"]]
  ];

  for (const [category, keywords] of map) {
    if (keywords.some((kw) => haystack.includes(kw))) {
      return category;
    }
  }

  return "general";
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
    is_best_seller: Boolean(existing?.is_best_seller || incoming.is_best_seller),
    is_giftable: Boolean(existing?.is_giftable || incoming.is_giftable),
    is_crazy_deal: Boolean(incoming.is_crazy_deal || existing?.is_crazy_deal),
    score: Math.max(safeNumber(existing?.score, 0), safeNumber(incoming.score, 0)),
    priority: Math.max(safeNumber(existing?.priority, 0), safeNumber(incoming.priority, 0)),
    updated_at: nowIso(),
    created_at: existing?.created_at || nowIso()
  };
}

function buildDealSource(product, sourceName, publishedAt) {
  return {
    asin: product.asin,
    source_kind: "deal",
    category: product.category || "general",
    source_name: sourceName,
    source_rank: null,
    is_active: true,
    last_seen_at: nowIso(),
    published_at: publishedAt || null,
    created_at: nowIso(),
    updated_at: nowIso()
  };
}

async function processFeed(feedUrl) {
  const feed = await parser.parseURL(feedUrl);
  const sourceName = feed?.title || feedUrl;

  const items = [];

  for (const item of feed.items || []) {
    const amazonUrl = extractAmazonUrl(item);
    const asin = extractASIN(amazonUrl);

    if (!amazonUrl || !asin) continue;

    const title = cleanupTitle(item.title || "");
    const description = String(item.contentSnippet || item.summary || "").trim();
    const combinedText = `${title} ${description}`;
    const imageUrl = extractImage(item);
    const price = extractPrice(item.title || item.contentSnippet || "");
    const category = inferCategory(combinedText);
    const slug = slugify(`${title}-${asin}`);

    items.push({
      asin,
      slug,
      name: title || `Amazon Product ${asin}`,
      brand: null,
      description: description || null,
      short_description: description ? description.slice(0, 180) : null,
      image_url: imageUrl || null,
      price: price || 0,
      original_price: 0,
      discount_percentage: 0,
      currency: "USD",
      amazon_rating: 0,
      amazon_review_count: 0,
      amazon_url: amazonUrl,
      affiliate_link: buildAffiliateLink(amazonUrl),
      is_best_seller: false,
      is_giftable: false,
      is_crazy_deal: true,
      score: 10,
      priority: 10,
      category,
      published_at: item.isoDate || item.pubDate || null,
      source_name: sourceName
    });
  }

  return items;
}

async function main() {
  if (!RSS_FEEDS.length) {
    throw new Error("RSS_FEEDS is empty");
  }

  log("feeds:", RSS_FEEDS.length);

  let rawItems = [];

  for (const feedUrl of RSS_FEEDS) {
    try {
      log("parsing feed:", feedUrl);
      const items = await processFeed(feedUrl);
      log("items found:", items.length, "from", feedUrl);
      rawItems.push(...items);
    } catch (error) {
      log("feed error:", feedUrl, error.message || error);
    }
  }

  rawItems = uniqueBy(rawItems, (item) => item.asin);

  log("unique deals:", rawItems.length);

  if (!rawItems.length) {
    log("nothing to upsert");
    return;
  }

  const asins = rawItems.map((item) => item.asin);
  const existingMap = await fetchExistingProducts(asins);

  const coreProducts = rawItems.map((item) =>
    mergeProduct(existingMap.get(item.asin), item)
  );

  const dealSources = rawItems.map((item) =>
    buildDealSource(item, item.source_name, item.published_at)
  );

  const { error: productsError } = await supabase
    .from("products")
    .upsert(coreProducts, { onConflict: "asin" });

  if (productsError) {
    throw productsError;
  }

  const { error: sourcesError } = await supabase
    .from("product_sources")
    .upsert(dealSources, { onConflict: "asin,source_kind,category" });

  if (sourcesError) {
    throw sourcesError;
  }

  log("upserted products:", coreProducts.length);
  log("upserted deal sources:", dealSources.length);
}

main()
  .then(() => {
    log("DONE");
    process.exit(0);
  })
  .catch((error) => {
    console.error("[sync-deals] FAILED", error);
    process.exit(1);
  });
