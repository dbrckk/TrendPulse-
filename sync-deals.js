// sync-deals.js

import Parser from "rss-parser";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AFFILIATE_TAG = process.env.AFFILIATE_TAG || "Drackk-20";
const SITE_URL = process.env.SITE_URL || "https://www.trend-pulse.shop";
const RSS_FEEDS = (process.env.RSS_FEEDS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const parser = new Parser({
  timeout: 20000,
  customFields: {
    item: [
      ["media:content", "mediaContent", { keepArray: true }],
      ["media:thumbnail", "mediaThumbnail", { keepArray: true }],
      ["content:encoded", "contentEncoded"],
      ["description", "description"]
    ]
  }
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slugify(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function stripHtml(value = "") {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeWhitespace(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function cleanTitle(value = "") {
  return normalizeWhitespace(
    String(value)
      .replace(/\|\s*Amazon.*$/i, "")
      .replace(/-\s*Amazon.*$/i, "")
      .replace(/\(\s*Limited Time Deal\s*\)/gi, "")
      .replace(/\[\s*Limited Time Deal\s*\]/gi, "")
  );
}

function extractAsin(value = "") {
  const text = String(value);
  const patterns = [
    /\/dp\/([A-Z0-9]{10})(?:[/?]|$)/i,
    /\/gp\/product\/([A-Z0-9]{10})(?:[/?]|$)/i,
    /[?&]asin=([A-Z0-9]{10})(?:[&#]|$)/i,
    /\b([A-Z0-9]{10})\b/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].toUpperCase();
  }

  return null;
}

function extractAmazonUrl(value = "") {
  const text = String(value);
  const match = text.match(/https?:\/\/[^\s"'<>]+/i);
  if (!match) return null;

  try {
    const parsed = new URL(match[0]);
    if (!parsed.hostname.toLowerCase().includes("amazon.")) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function ensureAffiliateTag(url) {
  if (!url) return null;

  try {
    const parsed = new URL(url);

    if (parsed.hostname.includes("amazon.")) {
      parsed.searchParams.set("tag", AFFILIATE_TAG);
    }

    return parsed.toString();
  } catch {
    return url;
  }
}

function extractImageFromHtml(html = "") {
  const patterns = [
    /<img[^>]+src=["']([^"']+)["']/i,
    /data-old-hires=["']([^"']+)["']/i,
    /https?:\/\/m\.media-amazon\.com\/images\/I\/[^"' <>()]+/i,
    /https?:\/\/images-na\.ssl-images-amazon\.com\/images\/I\/[^"' <>()]+/i
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) return match[1];
    if (match && match[0]?.startsWith("http")) return match[0];
  }

  return null;
}

function extractImage(item) {
  const fromMediaContent = Array.isArray(item.mediaContent)
    ? item.mediaContent.find((entry) => entry?.$?.url)?.$?.url
    : item.mediaContent?.$?.url;

  const fromMediaThumbnail = Array.isArray(item.mediaThumbnail)
    ? item.mediaThumbnail.find((entry) => entry?.$?.url)?.$?.url
    : item.mediaThumbnail?.$?.url;

  const fromEnclosure = item.enclosure?.url || null;
  const fromContent = extractImageFromHtml(item["content:encoded"] || item.contentEncoded || item.content || "");
  const fromDescription = extractImageFromHtml(item.description || "");

  return (
    fromMediaContent ||
    fromMediaThumbnail ||
    fromEnclosure ||
    fromContent ||
    fromDescription ||
    null
  );
}

function parseMoney(value = "") {
  const text = String(value).replace(/,/g, "");
  const match = text.match(/\$?\s*([0-9]+(?:\.[0-9]{1,2})?)/);
  if (!match) return null;
  return Number.parseFloat(match[1]);
}

function extractPriceBlock(text = "") {
  const clean = String(text);

  const salePatterns = [
    /(?:deal price|price|now|for)\s*:?\s*\$([0-9]+(?:\.[0-9]{1,2})?)/i,
    /\$([0-9]+(?:\.[0-9]{1,2})?)/
  ];

  let price = null;
  for (const pattern of salePatterns) {
    const match = clean.match(pattern);
    if (match) {
      price = Number.parseFloat(match[1]);
      break;
    }
  }

  const originalMatch =
    clean.match(/(?:was|list price|regular price|original(?:ly)?)\s*:?\s*\$([0-9]+(?:\.[0-9]{1,2})?)/i) ||
    clean.match(/\$([0-9]+(?:\.[0-9]{1,2})?)\s*(?:->|→|-)\s*\$([0-9]+(?:\.[0-9]{1,2})?)/i);

  let originalPrice = null;

  if (originalMatch) {
    if (originalMatch.length >= 3) {
      originalPrice = Number.parseFloat(originalMatch[1]);
      price = Number.parseFloat(originalMatch[2]);
    } else {
      originalPrice = Number.parseFloat(originalMatch[1]);
    }
  }

  if (price && originalPrice && originalPrice < price) {
    const swap = originalPrice;
    originalPrice = price;
    price = swap;
  }

  let discountPercentage = null;
  const discountMatch = clean.match(/([0-9]{1,2})\s*%+\s*off/i);
  if (discountMatch) {
    discountPercentage = Number.parseFloat(discountMatch[1]);
  } else if (price && originalPrice && originalPrice > 0) {
    discountPercentage = Number.parseFloat((((originalPrice - price) / originalPrice) * 100).toFixed(2));
  }

  return { price, originalPrice, discountPercentage };
}

function inferCategory(text = "") {
  const source = String(text).toLowerCase();

  const categoryMap = [
    ["jewelry", ["jewelry", "necklace", "bracelet", "ring", "earring"]],
    ["tech", ["tech", "usb", "charger", "phone", "bluetooth", "headphone", "laptop", "monitor", "gadget", "keyboard", "mouse", "speaker", "camera"]],
    ["sports", ["sports", "fitness", "gym", "running", "workout", "training", "bike", "outdoor"]],
    ["health", ["health", "wellness", "sleep", "vitamin", "posture", "massager"]],
    ["beauty", ["beauty", "skincare", "makeup", "cosmetic", "self care"]],
    ["home", ["home", "blanket", "pillow", "storage", "lamp", "cleaning", "organizer"]],
    ["kitchen", ["kitchen", "air fryer", "blender", "cooking", "pan", "knife", "coffee"]],
    ["women", ["women", "woman", "female", "dress", "handbag"]],
    ["men", ["men", "man", "male", "wallet", "beard"]],
    ["pets", ["pet", "dog", "cat"]],
    ["baby", ["baby", "newborn", "nursery"]],
    ["fashion", ["fashion", "clothes", "hoodie", "jacket", "shirt", "sneaker"]],
    ["travel", ["travel", "luggage", "carry on", "trip", "car organizer"]]
  ];

  for (const [category, keywords] of categoryMap) {
    if (keywords.some((keyword) => source.includes(keyword))) {
      return category;
    }
  }

  return "general";
}

function buildShortDescription(text = "") {
  const clean = normalizeWhitespace(stripHtml(text));
  if (!clean) return null;
  return clean.length > 160 ? `${clean.slice(0, 157)}...` : clean;
}

function buildDescription(item) {
  const parts = [
    item.contentSnippet,
    stripHtml(item.contentEncoded || ""),
    stripHtml(item.description || "")
  ].filter(Boolean);

  const text = normalizeWhitespace(parts.join(" "));
  return text.length > 1200 ? `${text.slice(0, 1197)}...` : text;
}

function computeScore(product) {
  let score = 0;

  if (product.is_best_seller) score += 30;
  if (product.is_crazy_deal) score += 20;
  if (product.is_giftable) score += 10;

  if (product.discount_percentage >= 50) score += 25;
  else if (product.discount_percentage >= 30) score += 18;
  else if (product.discount_percentage >= 15) score += 10;

  if (product.price > 0 && product.price <= 10) score += 14;
  else if (product.price <= 20) score += 10;
  else if (product.price <= 50) score += 6;

  return score;
}

function normalizeFeedItem(item, feedUrl) {
  const title = cleanTitle(item.title || item.contentSnippet || "Amazon Deal");
  const sourceText = [
    item.title,
    item.contentSnippet,
    item.contentEncoded,
    item.description,
    item.link
  ]
    .filter(Boolean)
    .join(" ");

  const asin =
    extractAsin(item.link) ||
    extractAsin(item.guid) ||
    extractAsin(sourceText);

  if (!asin) return null;

  const amazonUrl =
    ensureAffiliateTag(extractAmazonUrl(item.link)) ||
    ensureAffiliateTag(`https://www.amazon.com/dp/${asin}?tag=${AFFILIATE_TAG}`);

  const description = buildDescription(item);
  const shortDescription = buildShortDescription(description || title);
  const imageUrl = extractImage(item);
  const { price, originalPrice, discountPercentage } = extractPriceBlock(sourceText);
  const category = inferCategory(sourceText);
  const slug = `${slugify(title || asin)}-${asin.toLowerCase()}`;

  const isBestSeller = /best seller/i.test(sourceText);
  const isCrazyDeal = /lightning deal|limited time deal|deal of the day|crazy deal|huge discount/i.test(sourceText);
  const isGiftable = /gift|giftable|present/i.test(sourceText);

  const product = {
    asin,
    slug,
    name: title,
    brand: null,
    description: description || title,
    short_description: shortDescription || title,
    image_url: imageUrl,
    gallery_urls: [],
    category,
    subcategory: null,
    price,
    original_price: originalPrice,
    discount_percentage: discountPercentage,
    currency: "USD",
    amazon_rating: null,
    amazon_review_count: 0,
    amazon_url: amazonUrl,
    affiliate_link: amazonUrl,
    source_url: item.link || feedUrl,
    type: "deal",
    is_active: true,
    is_best_seller: isBestSeller,
    is_giftable: isGiftable,
    is_crazy_deal: isCrazyDeal,
    score: 0,
    priority: 0,
    source_name: feedUrl,
    last_seen_at: new Date().toISOString(),
    published_at: item.isoDate || item.pubDate || new Date().toISOString()
  };

  product.score = computeScore(product);
  return product;
}

async function fetchFeed(feedUrl) {
  try {
    const feed = await parser.parseURL(feedUrl);
    const items = Array.isArray(feed.items) ? feed.items : [];
    return items
      .map((item) => normalizeFeedItem(item, feedUrl))
      .filter(Boolean);
  } catch (error) {
    console.error(`Failed to parse RSS feed: ${feedUrl}`, error.message);
    return [];
  }
}

function dedupeByAsin(products) {
  const map = new Map();

  for (const product of products) {
    const existing = map.get(product.asin);

    if (!existing) {
      map.set(product.asin, product);
      continue;
    }

    if ((product.score || 0) > (existing.score || 0)) {
      map.set(product.asin, product);
    }
  }

  return Array.from(map.values());
}

async function upsertProducts(products) {
  if (!products.length) return;

  const { error } = await supabase
    .from("products")
    .upsert(products, { onConflict: "asin" });

  if (error) {
    throw error;
  }
}

async function deactivateStaleDeals(days = 3) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase
    .from("products")
    .update({
      is_active: false,
      updated_at: new Date().toISOString()
    })
    .eq("type", "deal")
    .lt("last_seen_at", cutoff);

  if (error) {
    throw error;
  }
}

async function pingSite() {
  try {
    await fetch(SITE_URL, { method: "GET" });
  } catch {
    // ignore
  }
}

async function main() {
  console.log("Starting deal sync");

  if (!RSS_FEEDS.length) {
    console.log("No RSS_FEEDS configured. Nothing to sync.");
    return;
  }

  const allProducts = [];

  for (const feedUrl of RSS_FEEDS) {
    console.log(`Fetching: ${feedUrl}`);
    const items = await fetchFeed(feedUrl);
    console.log(`Parsed ${items.length} items from ${feedUrl}`);
    allProducts.push(...items);
    await sleep(500);
  }

  const dedupedProducts = dedupeByAsin(allProducts);
  console.log(`Upserting ${dedupedProducts.length} unique deals`);

  await upsertProducts(dedupedProducts);
  await deactivateStaleDeals(3);
  await pingSite();

  console.log("Deal sync completed");
}

main().catch((error) => {
  console.error("Deal sync failed", error);
  process.exit(1);
});
