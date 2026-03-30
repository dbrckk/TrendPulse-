import Parser from "rss-parser";
import { createClient } from "@supabase/supabase-js";
import * as cheerio from "cheerio";
import fs from "fs";

const parser = new Parser({
  timeout: 25000,
  headers: {
    "User-Agent": "TrendPulseBot/6.0"
  }
});

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AFFILIATE_TAG = process.env.AFFILIATE_TAG || "Drackk-20";
const SITE_URL = process.env.SITE_URL || "https://trend-pulse.shop";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing required env vars: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const FEEDS = [
  "https://hip2save.com/feed/",
  "https://moneysavingmom.com/category/amazon-deals/feed",
  "https://www.bargainbabe.com/amazon-deals/feed/",
  "https://www.dealnews.com/?rss=1&sort=time",
  "https://www.dealnews.com/?rss=1&sort=hotness",
  "https://www.dealnews.com/f1682/Staff-Pick/?rss=1"
];

const INITIAL_TARGET_ON_EMPTY = 140;
const MIN_ACTIVE_DEALS = 80;
const MAX_ACTIVE_DEALS = 400;
const ITEMS_PER_FEED = 120;
const REQUEST_DELAY_MS = 900;
const MAX_DESCRIPTION_LENGTH = 240;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanText(input) {
  return String(input || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

function escapeXml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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
    if (match?.[1]) return match[1].toUpperCase();
  }

  return null;
}

function extractPriceFromText(text) {
  const value = cleanText(text);
  if (!value) return null;

  const patterns = [
    /\$([0-9]+(?:\.[0-9]{1,2})?)/,
    /only\s+\$([0-9]+(?:\.[0-9]{1,2})?)/i,
    /price[:\s]+\$?([0-9]+(?:\.[0-9]{1,2})?)/i,
    /for\s+\$([0-9]+(?:\.[0-9]{1,2})?)/i,
    /under\s+\$([0-9]+(?:\.[0-9]{1,2})?)/i
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
    /([0-9]{1,2})\s*percent\s*off/i,
    /up to\s+([0-9]{1,2})%\s*off/i
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

function scoreProduct({ price, discount_percent, name, source_name }) {
  const discountScore = Number(discount_percent || 0) * 2.2;
  const lowPriceBoost = price && price < 50 ? 10 : 0;
  const midPriceBoost = price && price >= 50 && price < 120 ? 4 : 0;
  const keywordBoost = /amazon|deal|sale|save|discount|hot|under|clearance|staff pick|popular/i.test(name || "") ? 6 : 0;
  const sourceBoost = /dealnews/i.test(source_name || "") ? 4 : 0;
  return Math.round((discountScore + lowPriceBoost + midPriceBoost + keywordBoost + sourceBoost) * 100) / 100;
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
        "User-Agent": "Mozilla/5.0 TrendPulseBot/6.0"
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
        "User-Agent": "Mozilla/5.0 TrendPulseBot/6.0"
      }
    });

    return res.url || url;
  } catch {
    return url;
  }
}

function extractMetaImage($, sourceUrl) {
  const candidate =
    $('meta[property="og:image"]').attr("content") ||
    $('meta[property="og:image:url"]').attr("content") ||
    $('meta[name="twitter:image"]').attr("content") ||
    $('meta[name="twitter:image:src"]').attr("content") ||
    null;

  return candidate ? normalizeUrl(candidate, sourceUrl) : null;
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
  if (/fitbit|tracker|headphone|speaker|tablet|laptop|tech|electronic|monitor|keyboard|mouse|ssd|router|tv/.test(text)) return "Tech";
  if (/toy|kid|baby|alphabet|lego|game/.test(text)) return "Kids";
  if (/fitness|sport|exercise|health|workout/.test(text)) return "Fitness";
  if (/home|furniture|decor|storage|bedding|vacuum/.test(text)) return "Home";

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
    return cleanDesc.slice(0, MAX_DESCRIPTION_LENGTH);
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
    const sourceName = new URL(sourceUrl).hostname.replace(/^www\./, "");
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
      source_name: sourceName,
      amazon_url: finalUrl,
      is_active: true,
      score: scoreProduct({
        price,
        discount_percent: discountPercent,
        name: sourceTitle,
        source_name: sourceName
      }),
      updated_at: new Date().toISOString()
    };

    if (!isStrongEnoughProduct(product)) return null;
    return product;
  }

  console.log("No valid ASIN found");
  return null;
}

async function fetchFeedItems(feedUrl) {
  try {
    const feed = await parser.parseURL(feedUrl);
    return (feed.items || []).slice(0, ITEMS_PER_FEED);
  } catch (error) {
    console.log(`Feed error for ${feedUrl}: ${error.message}`);
    return [];
  }
}

async function getActiveDealsCount() {
  const { count, error } = await sb
    .from("products")
    .select("*", { count: "exact", head: true })
    .eq("is_active", true);

  if (error) throw error;
  return count || 0;
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

  if (error) throw error;

  console.log(`${products.length} products upserted`);
}

async function enforceMaxActiveDeals(maxDeals) {
  const { data, error } = await sb
    .from("products")
    .select("id, score, updated_at")
    .eq("is_active", true)
    .order("score", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) throw error;
  if (!data || data.length <= maxDeals) return;

  const idsToDisable = data.slice(maxDeals).map(row => row.id);
  if (!idsToDisable.length) return;

  const { error: updateError } = await sb
    .from("products")
    .update({
      is_active: false,
      updated_at: new Date().toISOString()
    })
    .in("id", idsToDisable);

  if (updateError) throw updateError;

  console.log(`${idsToDisable.length} extra deals disabled to keep max ${maxDeals}`);
}

async function generateSitemap() {
  const { data, error } = await sb
    .from("products")
    .select("asin, name, updated_at")
    .eq("is_active", true)
    .order("score", { ascending: false })
    .limit(MAX_ACTIVE_DEALS);

  if (error) throw error;

  const staticUrls = [
    { loc: `${SITE_URL}/`, changefreq: "hourly", priority: "1.0" },
    { loc: `${SITE_URL}/best-amazon-deals.html`, changefreq: "hourly", priority: "0.95" },
    { loc: `${SITE_URL}/deals.html`, changefreq: "hourly", priority: "0.9" },
    { loc: `${SITE_URL}/tech.html`, changefreq: "daily", priority: "0.8" },
    { loc: `${SITE_URL}/kitchen.html`, changefreq: "daily", priority: "0.8" },
    { loc: `${SITE_URL}/beauty.html`, changefreq: "daily", priority: "0.8" },
    { loc: `${SITE_URL}/home.html`, changefreq: "daily", priority: "0.8" }
  ];

  const dealUrls = (data || []).map(item => {
    const slug = slugify(item.name);
    return {
      loc: `${SITE_URL}/deal/${item.asin}/${slug}`,
      lastmod: item.updated_at ? new Date(item.updated_at).toISOString() : new Date().toISOString(),
      changefreq: "daily",
      priority: "0.7"
    };
  });

  const allUrls = [...staticUrls, ...dealUrls];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="https://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls.map(url => `  <url>
    <loc>${escapeXml(url.loc)}</loc>
    ${url.lastmod ? `<lastmod>${escapeXml(url.lastmod)}</lastmod>` : ""}
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`).join("\n")}
</urlset>
`;

  fs.writeFileSync("sitemap.xml", xml, "utf8");
  console.log(`sitemap.xml generated with ${allUrls.length} URLs`);
}

async function main() {
  console.log("Starting sync V6");

  const activeCountBefore = await getActiveDealsCount();
  console.log(`Active deals before sync: ${activeCountBefore}`);

  let targetCount;
  if (activeCountBefore === 0) {
    targetCount = INITIAL_TARGET_ON_EMPTY;
  } else if (activeCountBefore < MIN_ACTIVE_DEALS) {
    targetCount = MIN_ACTIVE_DEALS;
  } else {
    targetCount = Math.min(activeCountBefore + 40, MAX_ACTIVE_DEALS);
  }

  targetCount = Math.min(targetCount, MAX_ACTIVE_DEALS);
  console.log(`Target count for this run: ${targetCount}`);

  const allItems = [];
  for (const feedUrl of FEEDS) {
    const items = await fetchFeedItems(feedUrl);
    console.log(`${items.length} items loaded from ${feedUrl}`);
    allItems.push(...items);
    await sleep(REQUEST_DELAY_MS);
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

      if (results.length >= targetCount) {
        console.log(`Reached target of ${targetCount} valid products`);
        break;
      }

      await sleep(REQUEST_DELAY_MS);
    } catch (error) {
      console.log(`Article error: ${error.message}`);
    }
  }

  console.log(`${results.length} valid products found`);

  await upsertProducts(results);
  await enforceMaxActiveDeals(MAX_ACTIVE_DEALS);

  const activeCountAfter = await getActiveDealsCount();
  console.log(`Active deals after sync: ${activeCountAfter}`);

  await generateSitemap();

  console.log("Sync complete");
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
