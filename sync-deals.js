import Parser from "rss-parser";
import { createClient } from "@supabase/supabase-js";
import * as cheerio from "cheerio";

const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent": "TrendPulseBot/3.0"
  }
});

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AFFILIATE_TAG = process.env.AFFILIATE_TAG || "Drackk-20";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing required env vars: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const FEEDS = [
  "https://hip2save.com/feed/",
  "https://moneysavingmom.com/category/amazon-deals/feed",
  "https://www.bargainbabe.com/amazon-deals/feed/"
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanText(input) {
  return String(input || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function isValidAsin(asin) {
  return /^[A-Z0-9]{10}$/.test(String(asin || "").trim());
}

function buildAffiliateLink(asin) {
  return `https://www.amazon.com/dp/${asin}?tag=${AFFILIATE_TAG}`;
}

function buildAmazonImage(asin) {
  return `https://ws-na.amazon-adsystem.com/widgets/q?ServiceVersion=20070822&MarketPlace=US&Operation=GetImage&ASIN=${asin}&Service=Amazon&TemplateId=LargeImage`;
}

function extractAsinFromAmazonUrl(url) {
  if (!url) return null;

  const decoded = decodeURIComponent(url);
  const patterns = [
    /\/dp\/([A-Z0-9]{10})(?:[/?]|$)/i,
    /\/gp\/product\/([A-Z0-9]{10})(?:[/?]|$)/i,
    /\/product\/([A-Z0-9]{10})(?:[/?]|$)/i
  ];

  for (const pattern of patterns) {
    const match = decoded.match(pattern);
    if (match?.[1]) {
      return match[1].toUpperCase();
    }
  }

  return null;
}

function extractPriceFromText(text) {
  const value = cleanText(text);
  if (!value) return null;

  const patterns = [
    /\$([0-9]+(?:\.[0-9]{1,2})?)/,
    /only\s+\$([0-9]+(?:\.[0-9]{1,2})?)/i,
    /price[:\s]+\$?([0-9]+(?:\.[0-9]{1,2})?)/i
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) {
      const num = Number(match[1]);
      if (!Number.isNaN(num)) return num;
    }
  }

  return null;
}

function extractDiscountPercent(text) {
  const value = cleanText(text);
  if (!value) return null;

  const patterns = [
    /([0-9]{1,2})%\s*off/i,
    /save\s+([0-9]{1,2})%/i,
    /([0-9]{1,2})\s*percent\s*off/i
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) {
      const num = Number(match[1]);
      if (!Number.isNaN(num) && num > 0 && num < 100) return num;
    }
  }

  return null;
}

function estimateOriginalPrice(price, discountPercent) {
  if (!price || !discountPercent || discountPercent <= 0 || discountPercent >= 100) return null;
  const original = price / (1 - discountPercent / 100);
  return Math.round(original * 100) / 100;
}

function scoreProduct({ price, discount_percent, name }) {
  const discountScore = Number(discount_percent || 0) * 2;
  const lowPriceBoost = price && price < 50 ? 10 : 0;
  const dealKeywordBoost = /amazon|deal|sale|save|discount|hot|under|clearance/i.test(name || "") ? 5 : 0;
  return Math.round((discountScore + lowPriceBoost + dealKeywordBoost) * 100) / 100;
}

function normalizeUrl(url, baseUrl) {
  if (!url) return null;
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
}

async function fetchText(url) {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 TrendPulseBot/3.0"
      }
    });

    if (!res.ok) {
      console.log(`HTTP ${res.status} for ${url}`);
      return null;
    }

    return await res.text();
  } catch (error) {
    console.log(`Fetch error for ${url}: ${error.message}`);
    return null;
  }
}

async function resolveFinalUrl(url) {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 TrendPulseBot/3.0"
      }
    });

    return res.url || url;
  } catch {
    return url;
  }
}

function extractMetaImage($, sourceUrl) {
  const ogImage =
    $('meta[property="og:image"]').attr("content") ||
    $('meta[property="og:image:url"]').attr("content") ||
    $('meta[name="twitter:image"]').attr("content") ||
    $('meta[name="twitter:image:src"]').attr("content") ||
    null;

  return ogImage ? normalizeUrl(ogImage, sourceUrl) : null;
}

function extractAmazonLinksFromHtml(html) {
  if (!html) return [];

  const $ = cheerio.load(html);
  const results = new Set();

  $("a").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;

    const value = href.trim();

    if (
      value.includes("amazon.com") ||
      value.includes("amzn.to") ||
      value.includes("/dp/") ||
      value.includes("/gp/product/")
    ) {
      results.add(value);
    }
  });

  const htmlMatches = html.match(/https?:\/\/[^\s"'<>]+/g) || [];
  for (const url of htmlMatches) {
    if (url.includes("amazon.com") || url.includes("amzn.to")) {
      results.add(url);
    }
  }

  return [...results];
}

function extractCategory(title, description) {
  const text = `${title} ${description}`.toLowerCase();

  if (/coffee|kitchen|cookware|dish|pan|knife|food|appliance/.test(text)) return "Kitchen";
  if (/toothbrush|beauty|skincare|soap|cleaner|makeup|hair/.test(text)) return "Beauty";
  if (/fitbit|tracker|headphone|speaker|tablet|laptop|tech|electronic|monitor|keyboard|mouse/.test(text)) return "Tech";
  if (/toy|kid|baby|alphabet|lego|game/.test(text)) return "Kids";
  if (/fitness|sport|exercise|health|workout/.test(text)) return "Fitness";
  if (/home|furniture|decor|storage|bedding/.test(text)) return "Home";

  return "All";
}

function isStrongEnoughProduct(product) {
  if (!product.asin || !isValidAsin(product.asin)) return false;
  if (!product.name || product.name.length < 5) return false;
  if (!product.affiliate_link) return false;
  if (product.price !== null && Number(product.price) < 3) return false;
  return true;
}

function buildDescription(title, sourceDescription, price, discountPercent) {
  const cleanDesc = cleanText(sourceDescription);

  if (cleanDesc && cleanDesc.length > 20) {
    return cleanDesc.slice(0, 240);
  }

  if (price && discountPercent) {
    return `Amazon deal spotted for ${title}. Current price: $${price}. Save ${discountPercent}% while it lasts.`;
  }

  if (price) {
    return `Amazon deal spotted for ${title}. Current price: $${price}.`;
  }

  return `Trending Amazon deal found automatically. Tap to check the latest price and availability.`;
}

async function extractDealFromArticle(item) {
  const sourceUrl = item.link;
  const sourceTitle = cleanText(item.title);
  const sourceDescription = cleanText(item.contentSnippet || item.content || "");

  if (!sourceUrl) return null;

  console.log(`Analyzing: ${sourceTitle}`);

  const html = await fetchText(sourceUrl);
  if (!html) return null;

  const $ = cheerio.load(html);
  const metaImage = extractMetaImage($, sourceUrl);

  const foundLinks = extractAmazonLinksFromHtml(html);
  if (!foundLinks.length) {
    console.log("No Amazon link found");
    return null;
  }

  for (const rawLink of foundLinks) {
    const normalized = normalizeUrl(rawLink, sourceUrl);
    const finalUrl = await resolveFinalUrl(normalized);
    const asin = extractAsinFromAmazonUrl(finalUrl) || extractAsinFromAmazonUrl(normalized);

    if (!isValidAsin(asin)) continue;

    const mergedText = `${sourceTitle} ${sourceDescription}`;
    const price = extractPriceFromText(mergedText);
    const discountPercent = extractDiscountPercent(mergedText);
    const originalPrice = discountPercent ? estimateOriginalPrice(price, discountPercent) : null;
    const description = buildDescription(sourceTitle, sourceDescription, price, discountPercent);

    const product = {
      asin,
      name: sourceTitle.slice(0, 180) || `Amazon Deal ${asin}`,
      tagline: "Top Amazon deal",
      description,
      price: price ?? null,
      original_price: originalPrice ?? null,
      discount_percent: discountPercent ?? null,
      image_url: metaImage || buildAmazonImage(asin),
      affiliate_link: buildAffiliateLink(asin),
      category: extractCategory(sourceTitle, sourceDescription),
      likes: 0,
      nopes: 0,
      source_url: sourceUrl,
      source_name: new URL(sourceUrl).hostname,
      amazon_url: finalUrl,
      is_active: true,
      score: scoreProduct({
        price,
        discount_percent: discountPercent,
        name: sourceTitle
      }),
      updated_at: new Date().toISOString()
    };

    if (!isStrongEnoughProduct(product)) {
      return null;
    }

    return product;
  }

  console.log("No valid ASIN found");
  return null;
}

async function fetchFeedItems(feedUrl) {
  try {
    const feed = await parser.parseURL(feedUrl);
    return (feed.items || []).slice(0, 12);
  } catch (error) {
    console.log(`Feed error for ${feedUrl}: ${error.message}`);
    return [];
  }
}

async function upsertProducts(products) {
  if (!products.length) {
    console.log("No products to upsert");
    return;
  }

  const { error } = await sb
    .from("products")
    .upsert(products, {
      onConflict: "asin"
    });

  if (error) {
    throw error;
  }

  console.log(`${products.length} products upserted`);
}

async function main() {
  console.log("Starting sync V3");

  const allItems = [];
  for (const feedUrl of FEEDS) {
    const items = await fetchFeedItems(feedUrl);
    console.log(`${items.length} items loaded from ${feedUrl}`);
    allItems.push(...items);
    await sleep(1200);
  }

  const uniqueArticles = [];
  const seenArticleLinks = new Set();

  for (const item of allItems) {
    const link = item.link?.trim();
    if (!link || seenArticleLinks.has(link)) continue;
    seenArticleLinks.add(link);
    uniqueArticles.push(item);
  }

  console.log(`${uniqueArticles.length} unique articles found`);

  const results = [];
  const seenAsins = new Set();

  for (const item of uniqueArticles) {
    try {
      const product = await extractDealFromArticle(item);
      if (!product) continue;
      if (seenAsins.has(product.asin)) continue;

      seenAsins.add(product.asin);
      results.push(product);

      await sleep(1200);
    } catch (error) {
      console.log(`Article error: ${error.message}`);
    }
  }

  console.log(`${results.length} valid products found`);
  await upsertProducts(results);
  console.log("Sync complete");
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
