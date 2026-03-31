import Parser from "rss-parser";
import { createClient } from "@supabase/supabase-js";
import * as cheerio from "cheerio";
import fs from "fs";

const parser = new Parser({
  timeout: 25000,
  headers: {
    "User-Agent": "TrendPulseBot/15.0"
  }
});

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AFFILIATE_TAG = process.env.AFFILIATE_TAG || "Drackk-20";
const SITE_URL = (process.env.SITE_URL || "https://www.trend-pulse.shop").replace(/\/+$/, "");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
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

const INITIAL_TARGET_ON_EMPTY = 160;
const MIN_ACTIVE_DEALS = 80;
const MAX_ACTIVE_DEALS = 400;
const ITEMS_PER_FEED = 120;
const REQUEST_DELAY_MS = 900;
const MAX_DESCRIPTION_LENGTH = 240;
const MAX_DEAL_AGE_DAYS = 14;
const MIN_KEEP_SCORE = 12;
const MIN_KEEP_DISCOUNT = 8;

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

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
  return `https://www.amazon.com/dp/${asin}?tag=${AFFILIATE_TAG}&linkCode=ogi&th=1&psc=1`;
}

function buildPrimaryImage(asin) {
  return `https://m.media-amazon.com/images/I/${asin}.jpg`;
}

function buildFallbackImage(asin) {
  return `https://images-na.ssl-images-amazon.com/images/P/${asin}.01.LZZZZZZZ.jpg`;
}

function chooseImage(product) {
  return product?.image_url || buildPrimaryImage(product.asin);
}

function productLink(product) {
  return `/deal.html?asin=${encodeURIComponent(product.asin)}`;
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

function isAmazonUrl(url) {
  if (!url) return false;
  return /amazon\.(com|fr|de|co\.uk|ca|it|es|nl|com\.mx|com\.au|co\.jp)/i.test(url) || /amzn\.to/i.test(url);
}

function looksLikeUsAmazon(url) {
  if (!url) return false;
  return /amazon\.com\//i.test(url) || /amzn\.to/i.test(url);
}

function normalizeUrl(url, baseUrl) {
  if (!url) return null;
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
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

function inferBestSeller(product) {
  const score = Number(product.score || 0);
  const clicks = Number(product.clicks || 0);
  const price = Number(product.price || 0);

  if (clicks >= 20) return true;
  if (score >= 85) return true;
  if (score >= 70 && price > 0 && price < 60) return true;
  return false;
}

function inferCrazyDeal(product) {
  const discount = Number(product.discount_percent || 0);
  const price = Number(product.price || 0);
  return discount >= 70 && price > 0 && price <= 60;
}

function looksLikeGiftProduct(title, description, category) {
  const text = `${title} ${description} ${category}`.toLowerCase();
  return /gift|christmas|present|birthday|mom|dad|wife|husband|kids|women|men|home decor|jewelry|beauty|candle|mug|blanket|accessory|gadget/.test(text);
}

function looksLikeGadget(title, description, category) {
  const text = `${title} ${description} ${category}`.toLowerCase();
  return /gadget|smart|portable|charger|headphone|earbuds|speaker|usb|keyboard|mouse|light|tech|device|bluetooth|adapter|camera|stand|dock/.test(text);
}

function looksLikeHomeDecor(title, description, category) {
  const text = `${title} ${description} ${category}`.toLowerCase();
  return /decor|home decor|lamp|wall|frame|candle|blanket|pillow|vase|mirror|rug|curtain|throw|art/.test(text);
}

function looksLikeWomenGift(title, description, category) {
  const text = `${title} ${description} ${category}`.toLowerCase();
  return /women|wife|girlfriend|mom|mother|beauty|jewelry|candle|self care|handbag|fashion/.test(text);
}

function looksLikeMenGift(title, description, category) {
  const text = `${title} ${description} ${category}`.toLowerCase();
  return /men|dad|father|husband|wallet|tech|gadget|gaming|tool|watch|outdoor/.test(text);
}

async function fetchText(url) {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 TrendPulseBot/15.0"
      }
    });

    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function resolveFinalUrl(url) {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 TrendPulseBot/15.0"
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
    if (value.includes("amazon.") || value.includes("amzn.to") || value.includes("/dp/") || value.includes("/gp/product/")) {
      results.add(value);
    }
  });

  const htmlMatches = html.match(/https?:\/\/[^\s"'<>]+/g) || [];
  for (const url of htmlMatches) {
    if (url.includes("amazon.") || url.includes("amzn.to")) {
      results.add(url);
    }
  }

  return [...results];
}

function extractCategory(title, description) {
  const text = `${title} ${description}`.toLowerCase();

  if (/coffee|kitchen|cookware|dish soap|dishwasher|pan|knife|food|appliance|mixer|grinder|cook|bake|utensil|air fryer|blender|toaster|microwave/.test(text)) return "Kitchen";
  if (/toothbrush|beauty|skincare|soap refill|cleanser|makeup|hair|serum|lotion|shampoo|conditioner|grooming|cosmetic|face cream|lipstick|mascara/.test(text)) return "Beauty";
  if (/headphone|speaker|tablet|laptop|tech|electronic|monitor|keyboard|mouse|ssd|router|tv|smartphone|earbuds|charger|usb|gaming|webcam|printer|bluetooth|ipad/.test(text)) return "Tech";
  if (/ring|necklace|bracelet|earring|jewelry|watch|pendant|gemstone/.test(text)) return "Jewelry";
  if (/shoe|sneaker|boot|heel|slipper|running shoe|loafer|sandals/.test(text)) return "Shoes";
  if (/dress|shirt|hoodie|jacket|coat|jeans|pants|leggings|bra|fashion|clothing|sweater|sock|underwear|top|skirt/.test(text)) return "Fashion";
  if (/toy|kid|baby|alphabet|lego|game|stroller|diaper|pacifier|nursery|bottle warmer|baby monitor/.test(text)) return "Baby";
  if (/dog|cat|pet|litter|pet bed|leash|pet food|pet toy|aquarium/.test(text)) return "Pets";
  if (/fitness|sport|exercise|health|workout|yoga|treadmill|weights|dumbbell|resistance band|protein|running/.test(text)) return "Sports";
  if (/vitamin|supplement|health|blood pressure|thermometer|massager|pain relief|humidifier|air purifier/.test(text)) return "Health";
  if (/desk|office|notebook|planner|pen|chair|filing|paper shredder|whiteboard|stapler/.test(text)) return "Office";
  if (/xbox|playstation|nintendo|gaming|controller|gaming chair|pc gaming|gaming headset/.test(text)) return "Gaming";
  if (/camping|outdoor|tent|backpack|hiking|grill|patio|garden|lantern|bike/.test(text)) return "Outdoor";
  if (/home|furniture|decor|storage|bedding|vacuum|cleaning|organizer|lamp|closet|bathroom|travel bag|anti-theft bag|luggage/.test(text)) return "Home";

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

function chooseBestAmazonLink(links) {
  if (!links?.length) return null;

  const us = links.find(link => looksLikeUsAmazon(link) && extractAsinFromAmazonUrl(link));
  if (us) return us;

  const anyAmazon = links.find(link => isAmazonUrl(link) && extractAsinFromAmazonUrl(link));
  if (anyAmazon) return anyAmazon;

  return null;
}

function chooseImageUrl(metaImage, asin) {
  if (metaImage && /^https?:\/\//i.test(metaImage)) return metaImage;
  return buildPrimaryImage(asin);
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
  const foundLinks = extractAmazonLinksFromHtml(html).map(link => normalizeUrl(link, sourceUrl));

  if (!foundLinks.length) return null;

  const bestRawAmazonLink = chooseBestAmazonLink(foundLinks);
  if (!bestRawAmazonLink) return null;

  const finalUrl = await resolveFinalUrl(bestRawAmazonLink);
  const asin = extractAsinFromAmazonUrl(finalUrl) || extractAsinFromAmazonUrl(bestRawAmazonLink);

  if (!isValidAsin(asin)) return null;

  const mergedText = `${sourceTitle} ${sourceDescription}`;
  const price = extractPriceFromText(mergedText);
  const discountPercent = extractDiscountPercent(mergedText);
  const originalPrice = discountPercent ? estimateOriginalPrice(price, discountPercent) : null;
  const sourceName = new URL(sourceUrl).hostname.replace(/^www\./, "");
  const description = buildDescription(sourceTitle, sourceDescription, price, discountPercent);
  const category = extractCategory(sourceTitle, sourceDescription);
  const nowIso = new Date().toISOString();

  const product = {
    asin,
    name: sourceTitle.slice(0, 180) || `Amazon Deal ${asin}`,
    tagline: "Top Amazon deal",
    description,
    price: price ?? null,
    original_price: originalPrice ?? null,
    discount_percent: discountPercent ?? null,
    image_url: chooseImageUrl(metaImage, asin),
    affiliate_link: buildAffiliateLink(asin),
    category,
    likes: 0,
    nopes: 0,
    clicks: 0,
    views: 0,
    source_url: sourceUrl,
    source_name: sourceName,
    is_active: true,
    score: scoreProduct({
      price,
      discount_percent: discountPercent,
      name: sourceTitle,
      source_name: sourceName
    }),
    updated_at: nowIso,
    created_at: nowIso
  };

  product.is_best_seller = inferBestSeller(product);
  product.is_crazy_deal = inferCrazyDeal(product);
  product.is_giftable = looksLikeGiftProduct(sourceTitle, sourceDescription, category);

  if (!isStrongEnoughProduct(product)) return null;
  return product;
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
    .upsert(products, { onConflict: "asin" });

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
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .in("id", idsToDisable);

  if (updateError) throw updateError;

  console.log(`${idsToDisable.length} extra deals disabled to keep max ${maxDeals}`);
}

async function expireOldDeals() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MAX_DEAL_AGE_DAYS);

  const { error } = await sb
    .from("products")
    .update({ is_active: false })
    .lt("updated_at", cutoff.toISOString())
    .eq("is_active", true);

  if (error) throw error;

  console.log(`Expired deals older than ${MAX_DEAL_AGE_DAYS} days`);
}

async function disableWeakDeals() {
  const { data, error } = await sb
    .from("products")
    .select("id, score, discount_percent, views, clicks, updated_at")
    .eq("is_active", true);

  if (error) throw error;

  const now = Date.now();
  const idsToDisable = [];

  for (const item of data || []) {
    const ageDays = item.updated_at ? (now - new Date(item.updated_at).getTime()) / 86400000 : 0;
    const views = Number(item.views || 0);
    const clicks = Number(item.clicks || 0);
    const score = Number(item.score || 0);
    const discount = Number(item.discount_percent || 0);

    const lowQuality =
      ageDays > 3 &&
      views >= 10 &&
      clicks === 0 &&
      score < MIN_KEEP_SCORE &&
      discount < MIN_KEEP_DISCOUNT;

    if (lowQuality) idsToDisable.push(item.id);
  }

  if (!idsToDisable.length) return;

  const { error: updateError } = await sb
    .from("products")
    .update({ is_active: false })
    .in("id", idsToDisable);

  if (updateError) throw updateError;

  console.log(`Disabled ${idsToDisable.length} weak deals`);
}

function formatPrice(v) {
  if (v === null || v === undefined || v === "") return "Check price";
  const n = Number(v);
  if (Number.isNaN(n)) return "Check price";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n % 1 === 0 ? 0 : 2
  }).format(n);
}

function getBadgeText(p) {
  if (p.is_crazy_deal) return "⚠ CRAZY DEAL";
  if (p.discount_percent) return `🔥 ${Math.round(p.discount_percent)}% OFF`;
  if (p.is_best_seller) return "⭐ BEST SELLER";
  return "LIVE DEAL";
}

function getUrgencyText(p) {
  if (p.is_crazy_deal) return "⚡ Often disappears fast";
  if (Number(p.discount_percent || 0) >= 50) return "🔥 Strong price drop";
  if (p.is_best_seller) return "👀 Popular with shoppers";
  return "⚡ Limited-time deal";
}

function renderCard(p) {
  return `
    <article class="deal-card soft-card rounded-2xl overflow-hidden">
      <a href="${escapeHtml(productLink(p))}" class="block">
        <img
          src="${escapeHtml(chooseImage(p))}"
          alt="${escapeHtml(p.name)}"
          class="w-full h-44 md:h-52 object-cover bg-white"
          loading="lazy"
          onerror="this.onerror=null;this.src='${escapeHtml(buildFallbackImage(p.asin))}'"
        >
      </a>
      <div class="p-3">
        <div class="text-red-400 font-black text-[11px] mb-1">${escapeHtml(getBadgeText(p))}</div>
        <a href="${escapeHtml(productLink(p))}" class="block text-sm font-black line-clamp-2 mb-2 min-h-[40px]">${escapeHtml(p.name)}</a>
        <div class="flex items-end gap-2 mb-2 flex-wrap">
          <div class="text-xl md:text-2xl font-black">${escapeHtml(formatPrice(p.price))}</div>
          ${p.original_price ? `<div class="text-zinc-500 line-through text-xs">${escapeHtml(formatPrice(p.original_price))}</div>` : ""}
        </div>
        <div class="text-[12px] text-orange-400 font-bold mb-3">${escapeHtml(getUrgencyText(p))}</div>
        <a href="${escapeHtml(productLink(p))}" class="block text-center bg-[#ff9900] hover:bg-[#ffb84d] transition px-4 py-3 rounded-xl font-black text-sm text-black">
          Buy on Amazon →
        </a>
      </div>
    </article>
  `;
}

function shellHead({ title, description, canonicalPath }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="${escapeHtml(SITE_URL + canonicalPath)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(SITE_URL + canonicalPath)}">
  <meta property="og:image" content="${escapeHtml(SITE_URL + "/og-image.jpg")}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(SITE_URL + "/og-image.jpg")}">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <style>
    body{background:#050505;color:#fff;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0}
    .wrap{max-width:1200px;margin:0 auto;padding:20px}
    .soft-card{background:linear-gradient(180deg,#111722 0%,#090b11 100%);border:1px solid rgba(255,255,255,.08)}
    .deal-card{transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease}
    .deal-card:hover{transform:translateY(-2px);box-shadow:0 18px 42px rgba(0,0,0,.30);border-color:rgba(255,255,255,.16)}
    .line-clamp-2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .chip{font-size:12px;font-weight:800;border-radius:999px;padding:10px 14px;border:1px solid rgb(39 39 42);background:rgb(24 24 27);color:rgb(228 228 231);white-space:nowrap;text-decoration:none;display:inline-block}
    a{text-decoration:none}
    .navlink{color:#d4d4d8;font-size:14px;font-weight:600}
    .navlink:hover{color:#fff}
    .grid4{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
    @media(min-width:768px){.grid4{grid-template-columns:repeat(4,minmax(0,1fr))}}
  </style>
</head>
<body>
<div class="wrap">`;
}

function shellFoot() {
  return `
  <footer style="text-align:center;color:#71717a;font-size:14px;margin-top:40px;padding-bottom:24px">
    © 2026 TrendPulse — Amazon Deals Tracker
  </footer>
</div>
</body>
</html>`;
}

function renderTopNav() {
  return `
    <header style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <a href="/" style="font-size:28px;font-weight:900;font-style:italic;color:#fff">TrendPulse</a>
      <div style="display:flex;gap:12px;align-items:center">
        <a href="/best-sellers.html" class="navlink">Best Sellers</a>
        <a href="/deals.html" class="navlink">All Deals</a>
      </div>
    </header>
  `;
}

function renderHero(hero) {
  if (!hero) {
    return `<div class="soft-card" style="border-radius:24px;padding:24px">No top deal available.</div>`;
  }

  return `
    <a href="${escapeHtml(productLink(hero))}" class="soft-card" style="border-radius:24px;overflow:hidden;display:block;min-height:420px">
      <div style="display:grid;grid-template-rows:260px auto;height:100%">
        <div style="background:#fff">
          <img
            src="${escapeHtml(chooseImage(hero))}"
            alt="${escapeHtml(hero.name)}"
            style="width:100%;height:100%;object-fit:contain"
            onerror="this.onerror=null;this.src='${escapeHtml(buildFallbackImage(hero.asin))}'"
          >
        </div>
        <div style="padding:24px">
          <div style="color:#f87171;font-size:12px;font-weight:900;margin-bottom:8px">${escapeHtml(getBadgeText(hero))}</div>
          <h2 style="font-size:34px;line-height:1.05;font-weight:900;letter-spacing:-.03em;margin:0 0 12px">${escapeHtml(hero.name)}</h2>
          <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:8px">
            <div style="font-size:38px;font-weight:900">${escapeHtml(formatPrice(hero.price))}</div>
            ${hero.original_price ? `<div style="color:#71717a;text-decoration:line-through;font-size:18px">${escapeHtml(formatPrice(hero.original_price))}</div>` : ""}
          </div>
          <div style="color:#fb923c;font-size:14px;font-weight:800;margin-bottom:16px">${escapeHtml(getUrgencyText(hero))}</div>
          <div style="display:inline-flex;background:#ff9900;color:#000;padding:14px 18px;border-radius:14px;font-weight:900">
            Buy on Amazon →
          </div>
        </div>
      </div>
    </a>
  `;
}

function renderHomePage(items) {
  const topPicks = items.slice(0, 8);
  const hero = topPicks[0];
  const bestSellers = items.filter(p => p.is_best_seller);
  const crazyDeals = items.filter(p => p.is_crazy_deal);
  const under25 = items.filter(p => Number(p.price || 0) > 0 && Number(p.price || 0) < 25);

  return `${shellHead({
    title: "Best Amazon Deals Today (Up to 70% Off) | TrendPulse",
    description: "Discover the best Amazon deals today. Huge discounts on tech, home, fashion, beauty, gifts, gadgets, and more.",
    canonicalPath: "/"
  })}
  ${renderTopNav()}

  <section style="margin-bottom:20px">
    <div style="display:grid;gap:16px;grid-template-columns:1.05fr .95fr">
      <div class="soft-card" style="border-radius:24px;padding:28px">
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
          <span style="font-size:11px;padding:5px 10px;border-radius:999px;font-weight:800;background:#ef4444;color:#fff">🔥 Updated Often</span>
          <span style="font-size:11px;padding:5px 10px;border-radius:999px;font-weight:800;background:#3b82f6;color:#fff">⭐ Best Sellers</span>
          <span style="font-size:11px;padding:5px 10px;border-radius:999px;font-weight:800;background:#facc15;color:#000">⚠ Big Price Drops</span>
        </div>
        <h1 style="font-size:64px;line-height:.92;font-weight:900;font-style:italic;letter-spacing:-.05em;margin:0 0 12px">
          Best Amazon Deals<br>That Are Actually<br>Worth Clicking
        </h1>
        <p style="color:#a1a1aa;font-size:18px;line-height:1.7;margin:0 0 14px">
          Hand-picked deals, strong discounts, popular products, and budget-friendly finds without the clutter.
        </p>
        <div style="color:#22c55e;font-weight:800;font-size:13px;line-height:1.7;margin-bottom:16px">
          ✔ Trending deals updated often<br>
          ✔ Limited-time discounts<br>
          ✔ Popular products selling fast
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">
          <a href="#top-deals" style="background:#fff;color:#000;padding:14px 18px;border-radius:12px;font-weight:900">View Top Deals</a>
          <a href="/under-20.html" style="background:#09090b;color:#fff;border:1px solid #27272a;padding:14px 18px;border-radius:12px;font-weight:800">Shop Under $20</a>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px">
          <div style="background:#09090b;border:1px solid #27272a;border-radius:16px;padding:12px">
            <div style="font-weight:900;margin-bottom:4px">Fast browsing</div>
            <div style="font-size:12px;color:#a1a1aa">Image, price, discount, click.</div>
          </div>
          <div style="background:#09090b;border:1px solid #27272a;border-radius:16px;padding:12px">
            <div style="font-weight:900;margin-bottom:4px">Popular picks</div>
            <div style="font-size:12px;color:#a1a1aa">Best sellers and trending items.</div>
          </div>
          <div style="background:#09090b;border:1px solid #27272a;border-radius:16px;padding:12px">
            <div style="font-weight:900;margin-bottom:4px">Budget pages</div>
            <div style="font-size:12px;color:#a1a1aa">Under $10, $20, $50 and more.</div>
          </div>
        </div>
      </div>
      ${renderHero(hero)}
    </div>
  </section>

  <section style="margin-bottom:20px">
    <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px">
      <div class="soft-card" style="border-radius:16px;padding:16px"><div style="color:#71717a;font-size:14px;margin-bottom:4px">Live Deals</div><div style="font-size:32px;font-weight:900">${items.length}</div></div>
      <div class="soft-card" style="border-radius:16px;padding:16px"><div style="color:#71717a;font-size:14px;margin-bottom:4px">Best Sellers</div><div style="font-size:32px;font-weight:900">${bestSellers.length}</div></div>
      <div class="soft-card" style="border-radius:16px;padding:16px"><div style="color:#71717a;font-size:14px;margin-bottom:4px">Crazy Deals</div><div style="font-size:32px;font-weight:900">${crazyDeals.length}</div></div>
      <div class="soft-card" style="border-radius:16px;padding:16px"><div style="color:#71717a;font-size:14px;margin-bottom:4px">Under $25</div><div style="font-size:32px;font-weight:900">${under25.length}</div></div>
    </div>
  </section>

  <section style="margin-bottom:20px">
    <div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:4px">
      ${[
        ["Top Picks", "/deals.html"],
        ["Best Sellers", "/best-sellers.html"],
        ["Crazy Deals", "/crazy-deals.html"],
        ["Under $10", "/under-10.html"],
        ["Under $20", "/under-20.html"],
        ["Under $50", "/under-50.html"],
        ["Cheap Tech", "/cheap-tech.html"],
        ["Best Gifts", "/best-gifts.html"]
      ].map(([label, href]) => `<a class="chip" href="${href}">${label}</a>`).join("")}
    </div>
  </section>

  <section id="top-deals" style="margin-bottom:28px">
    <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-bottom:16px">
      <div>
        <h2 style="font-size:32px;font-weight:900;letter-spacing:-.03em;margin:0 0 4px">Top Deals Right Now</h2>
        <p style="color:#a1a1aa;font-size:14px;margin:0">The strongest products to check first.</p>
      </div>
      <a href="/deals.html" class="navlink">See all</a>
    </div>
    <div class="grid4">
      ${topPicks.map(renderCard).join("")}
    </div>
  </section>

  <section style="margin-bottom:28px">
    <div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:16px">
      ${[
        ["BUDGET", "Deals Under $10", "Cheap Amazon finds with low buying friction.", "/under-10.html", "#4ade80"],
        ["VALUE", "Deals Under $20", "Low-cost picks that still feel useful.", "/under-20.html", "#4ade80"],
        ["TECH", "Cheap Tech", "Accessories, gadgets, chargers and more.", "/cheap-tech.html", "#60a5fa"],
        ["GIFTS", "Best Gifts", "Giftable finds that are easy to like.", "/best-gifts.html", "#f472b6"],
        ["POPULAR", "Best Sellers", "Strong products people already buy.", "/best-sellers.html", "#facc15"]
      ].map(([tag, title, desc, href, color]) => `
        <a href="${href}" class="deal-card soft-card" style="border-radius:24px;padding:20px;display:block">
          <div style="color:${color};font-size:12px;font-weight:900;margin-bottom:8px">${tag}</div>
          <h3 style="font-size:22px;font-weight:900;letter-spacing:-.02em;margin:0 0 8px">${title}</h3>
          <p style="color:#a1a1aa;font-size:14px;line-height:1.7;margin:0">${desc}</p>
        </a>
      `).join("")}
    </div>
  </section>

  <section style="margin-bottom:28px">
    <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px">
      ${[
        ["GADGETS", "Amazon Gadgets", "Useful tech and impulse-friendly gadget picks.", "/best-amazon-gadgets.html", "#22d3ee"],
        ["DECOR", "Home Decor Deals", "Decorative finds, candles, lamps, blankets and more.", "/amazon-home-decor-deals.html", "#fb923c"],
        ["GIFTS", "Gifts for Women", "Beauty, jewelry, accessories and giftable finds.", "/best-amazon-gifts-for-women.html", "#e879f9"],
        ["GIFTS", "Gifts for Men", "Gadgets, tools, gaming and practical gift ideas.", "/best-amazon-gifts-for-men.html", "#38bdf8"]
      ].map(([tag, title, desc, href, color]) => `
        <a href="${href}" class="deal-card soft-card" style="border-radius:24px;padding:20px;display:block">
          <div style="color:${color};font-size:12px;font-weight:900;margin-bottom:8px">${tag}</div>
          <h3 style="font-size:22px;font-weight:900;letter-spacing:-.02em;margin:0 0 8px">${title}</h3>
          <p style="color:#a1a1aa;font-size:14px;line-height:1.7;margin:0">${desc}</p>
        </a>
      `).join("")}
    </div>
  </section>

  <section class="soft-card" style="border-radius:24px;padding:28px;margin-bottom:24px">
    <h2 style="font-size:32px;font-weight:900;letter-spacing:-.03em;margin:0 0 12px">Best Amazon Deals Today</h2>
    <p style="color:#a1a1aa;line-height:1.8;font-size:15px;margin:0 0 12px">
      Looking for the best Amazon deals today? TrendPulse helps you discover strong discounts, popular products, budget-friendly finds, and trending Amazon deals across categories like tech, home, fashion, jewelry, kitchen, beauty, gaming, pets, and more.
    </p>
    <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:14px;font-weight:700">
      <a href="/under-10.html" class="navlink">Deals Under $10</a>
      <a href="/under-20.html" class="navlink">Deals Under $20</a>
      <a href="/under-50.html" class="navlink">Deals Under $50</a>
      <a href="/cheap-tech.html" class="navlink">Cheap Tech</a>
      <a href="/best-gifts.html" class="navlink">Best Gifts</a>
      <a href="/best-amazon-gadgets.html" class="navlink">Amazon Gadgets</a>
      <a href="/amazon-home-decor-deals.html" class="navlink">Home Decor Deals</a>
      <a href="/best-amazon-gifts-for-women.html" class="navlink">Gifts for Women</a>
      <a href="/best-amazon-gifts-for-men.html" class="navlink">Gifts for Men</a>
      <a href="/crazy-deals.html" class="navlink">Crazy Deals</a>
    </div>
  </section>

  ${shellFoot()}`;
}

function renderDealsPage(items) {
  return `${shellHead({
    title: "Amazon Deals Today | TrendPulse",
    description: "Browse trending Amazon deals updated live. Discover hot discounts, top-rated products, and the best deals in the US.",
    canonicalPath: "/deals.html"
  })}
  ${renderTopNav()}
  <section style="margin-bottom:20px">
    <h1 style="font-size:56px;line-height:.95;font-weight:900;font-style:italic;letter-spacing:-.05em;margin:0 0 10px">Amazon Deals Today</h1>
    <p style="color:#a1a1aa;max-width:760px;line-height:1.7;font-size:15px;margin:0 0 16px">
      Explore live Amazon deals, trending discounts, and popular product picks updated from our automated deal feed.
    </p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px">
      <a class="chip" href="/">Home</a>
      <a class="chip" href="/best-amazon-deals.html">Editorial Deals</a>
      <a class="chip" href="/best-sellers.html">Best Sellers</a>
      <a class="chip" href="/crazy-deals.html">Crazy Deals</a>
      <a class="chip" href="/under-20.html">Under $20</a>
      <a class="chip" href="/cheap-tech.html">Cheap Tech</a>
      <a class="chip" href="/best-gifts.html">Best Gifts</a>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:24px">
      <div class="chip">${items.length} live deals</div>
      <div class="chip">Updated live</div>
      <div class="chip">US Amazon offers</div>
    </div>
  </section>
  <section>
    <div class="grid4">
      ${items.slice(0, 80).map(renderCard).join("")}
    </div>
  </section>
  ${shellFoot()}`;
}

function renderEditorialPage({ title, description, canonicalPath, intro, section1Title, section1Text, section2Title, section2Text, navExtra, items, label }) {
  return `${shellHead({ title: `${title} | TrendPulse`, description, canonicalPath })}
  ${renderTopNav()}
  <nav style="display:flex;gap:10px;flex-wrap:wrap;margin:10px 0 24px">
    <a class="chip" href="/">Home</a>
    <a class="chip" href="/deals.html">All Deals</a>
    <a class="chip" href="/best-sellers.html">Best Sellers</a>
    <a class="chip" href="/crazy-deals.html">Crazy Deals</a>
    <a class="chip" href="/under-10.html">Under $10</a>
    <a class="chip" href="/under-20.html">Under $20</a>
    <a class="chip" href="/under-50.html">Under $50</a>
    ${navExtra}
  </nav>
  <header>
    <p style="margin:0;color:#60a5fa;font-weight:900;letter-spacing:.18em;text-transform:uppercase;font-size:12px">TrendPulse Editorial</p>
    <h1 style="font-size:58px;line-height:.95;letter-spacing:-.05em;margin:0 0 14px;font-weight:900;font-style:italic">${escapeHtml(title)}</h1>
    ${intro.map(p => `<p style="color:#c4c4cc;line-height:1.75;font-size:15px">${escapeHtml(p)}</p>`).join("")}
  </header>
  <section class="soft-card" style="border-radius:24px;padding:22px;margin-top:24px">
    <h2 style="font-size:28px;margin:0 0 12px;font-weight:900;letter-spacing:-.03em">${escapeHtml(section1Title)}</h2>
    <p style="color:#c4c4cc;line-height:1.75;font-size:15px">${escapeHtml(section1Text)}</p>
  </section>
  <section style="margin-top:24px">
    <div class="grid4">
      ${items.map(renderCard).join("")}
    </div>
  </section>
  <section class="soft-card" style="border-radius:24px;padding:22px;margin-top:24px">
    <h2 style="font-size:28px;margin:0 0 12px;font-weight:900;letter-spacing:-.03em">${escapeHtml(section2Title)}</h2>
    <p style="color:#c4c4cc;line-height:1.75;font-size:15px">${escapeHtml(section2Text)}</p>
  </section>
  ${shellFoot()}`;
}

function longTailConfig() {
  return [
    {
      file: "under-10.html",
      title: "Best Amazon Deals Under $10",
      description: "Browse cheap Amazon deals under $10, including small gadgets, beauty items, home finds, and impulse buys worth checking.",
      intro: [
        "Cheap Amazon deals under $10 can convert surprisingly well because the buying decision feels easy and low-risk.",
        "This page focuses on lower-priced products that still look useful, giftable, or interesting enough to click."
      ],
      section1Title: "Why under $10 deals work",
      section1Text: "Low-priced products create less hesitation and often perform better for impulse-driven traffic, especially on mobile.",
      section2Title: "What kind of products appear here",
      section2Text: "You’ll usually find smaller accessories, beauty items, practical home products, and other low-friction purchases.",
      navExtra: `<a class="chip" href="/under-20.html">Under $20</a><a class="chip" href="/under-50.html">Under $50</a>`,
      filter: items => items.filter(p => Number(p.price || 0) > 0 && Number(p.price || 0) <= 10).slice(0, 48),
      label: "Under $10"
    },
    {
      file: "under-20.html",
      title: "Best Amazon Deals Under $20",
      description: "Discover useful Amazon deals under $20, including trending finds, practical gifts, beauty products, and budget-friendly tech.",
      intro: [
        "Amazon deals under $20 often sit in a sweet spot between affordability and usefulness.",
        "This page helps shoppers find low-cost products that still feel worth buying."
      ],
      section1Title: "Why under $20 deals matter",
      section1Text: "Products under $20 are easier to test, easier to gift, and often more attractive to broad audiences looking for value.",
      section2Title: "How to use this page",
      section2Text: "Start with the top items, then open products that look useful, giftable, or unusually discounted.",
      navExtra: `<a class="chip" href="/under-10.html">Under $10</a><a class="chip" href="/cheap-tech.html">Cheap Tech</a>`,
      filter: items => items.filter(p => Number(p.price || 0) > 0 && Number(p.price || 0) <= 20).slice(0, 48),
      label: "Under $20"
    },
    {
      file: "under-50.html",
      title: "Best Amazon Deals Under $50",
      description: "Explore Amazon deals under $50 across tech, home, kitchen, fashion, gifts, and more.",
      intro: [
        "Deals under $50 can capture a large part of Amazon shopping intent because they still feel affordable while offering more product variety.",
        "This page groups stronger-value deals that remain in a manageable price range for many shoppers."
      ],
      section1Title: "Why under $50 pages perform well",
      section1Text: "This price range includes a wider set of useful products while still feeling accessible for many buyers.",
      section2Title: "What to expect here",
      section2Text: "Expect more variety: tech accessories, home goods, fitness products, gifts, and practical everyday buys.",
      navExtra: `<a class="chip" href="/under-20.html">Under $20</a><a class="chip" href="/best-gifts.html">Best Gifts</a>`,
      filter: items => items.filter(p => Number(p.price || 0) > 0 && Number(p.price || 0) <= 50).slice(0, 48),
      label: "Under $50"
    },
    {
      file: "cheap-tech.html",
      title: "Best Cheap Amazon Tech Deals",
      description: "Browse affordable Amazon tech deals including chargers, headphones, keyboards, smart accessories, and budget gadgets.",
      intro: [
        "Cheap tech is one of the easiest categories to browse because visitors often know what they want and how much they want to spend.",
        "This page focuses on lower-priced tech products that still look useful, giftable, or popular."
      ],
      section1Title: "Why cheap tech converts",
      section1Text: "Affordable tech products often feel practical, low-risk, and easy to buy quickly, especially when the price looks clean.",
      section2Title: "What appears on this page",
      section2Text: "You’ll usually see chargers, accessories, headphones, keyboards, adapters, and small electronics with stronger value signals.",
      navExtra: `<a class="chip" href="/tech.html">Tech</a><a class="chip" href="/under-50.html">Under $50</a>`,
      filter: items => items.filter(p => p.category === "Tech" && Number(p.price || 0) > 0 && Number(p.price || 0) <= 50).slice(0, 48),
      label: "Cheap Tech"
    },
    {
      file: "best-gifts.html",
      title: "Best Amazon Gift Ideas and Giftable Finds",
      description: "Find Amazon gift ideas across beauty, jewelry, home, gadgets, and useful products that are easy to buy and easy to like.",
      intro: [
        "Gift-oriented pages work well because many shoppers are not just looking for deals, they are looking for ideas.",
        "This page groups products that feel more giftable, more presentable, or more likely to appeal to a broad audience."
      ],
      section1Title: "Why gift pages matter",
      section1Text: "Gift pages widen the audience beyond bargain hunters by helping visitors discover products they might buy for someone else.",
      section2Title: "What makes a product giftable",
      section2Text: "Products that are useful, visually appealing, personal, or easy to understand often work better in gift-focused browsing.",
      navExtra: `<a class="chip" href="/under-20.html">Under $20</a><a class="chip" href="/best-sellers.html">Best Sellers</a>`,
      filter: items => items.filter(p => p.is_giftable || looksLikeGiftProduct(p.name, p.description, p.category)).slice(0, 48),
      label: "Best Gifts"
    },
    {
      file: "best-amazon-gadgets.html",
      title: "Best Amazon Gadgets Right Now",
      description: "Explore trending Amazon gadgets, smart accessories, portable devices, and useful tech finds worth checking now.",
      intro: [
        "Gadget pages are strong for both clicks and SEO because shoppers often browse them for discovery, not just discounts.",
        "This page focuses on useful gadgets and tech products that feel practical, interesting, or giftable."
      ],
      section1Title: "Why gadget pages work",
      section1Text: "People love browsing gadgets because they are easy to understand, easy to compare, and often impulse-friendly.",
      section2Title: "What appears here",
      section2Text: "Expect chargers, smart accessories, portable devices, headphones, stands, docks, and other useful tech finds.",
      navExtra: `<a class="chip" href="/cheap-tech.html">Cheap Tech</a><a class="chip" href="/tech.html">Tech</a>`,
      filter: items => items.filter(p => looksLikeGadget(p.name, p.description, p.category)).slice(0, 48),
      label: "Gadgets"
    },
    {
      file: "amazon-home-decor-deals.html",
      title: "Best Amazon Home Decor Deals",
      description: "Browse Amazon home decor deals including lamps, blankets, wall accents, candles, mirrors, and stylish home finds.",
      intro: [
        "Home decor pages are useful because they attract shoppers looking for visual and lifestyle products, not just utility buys.",
        "This page pulls together decorative items that can perform well for browsing and gift intent."
      ],
      section1Title: "Why decor deals matter",
      section1Text: "Decor items often perform well with broad audiences because they are easy to visualize and easy to gift.",
      section2Title: "What to expect",
      section2Text: "Expect candles, lamps, blankets, vases, mirrors, wall accents, and other home-style products.",
      navExtra: `<a class="chip" href="/home.html">Home</a><a class="chip" href="/best-gifts.html">Best Gifts</a>`,
      filter: items => items.filter(p => looksLikeHomeDecor(p.name, p.description, p.category)).slice(0, 48),
      label: "Home Decor"
    },
    {
      file: "best-amazon-gifts-for-women.html",
      title: "Best Amazon Gifts for Women",
      description: "Discover Amazon gift ideas for women including beauty finds, jewelry, home accessories, fashion picks, and more.",
      intro: [
        "Gift pages with a more specific audience can bring in more targeted search traffic and stronger intent.",
        "This page focuses on products that feel more relevant for women-oriented gift shopping."
      ],
      section1Title: "Why this page is useful",
      section1Text: "Shoppers often search with a person in mind, not just a category. More specific gift pages can capture that intent.",
      section2Title: "What kinds of products appear here",
      section2Text: "Expect beauty products, jewelry, candles, accessories, decor, and other broadly giftable picks.",
      navExtra: `<a class="chip" href="/best-gifts.html">Best Gifts</a><a class="chip" href="/fashion.html">Fashion</a>`,
      filter: items => items.filter(p => looksLikeWomenGift(p.name, p.description, p.category)).slice(0, 48),
      label: "Gifts for Women"
    },
    {
      file: "best-amazon-gifts-for-men.html",
      title: "Best Amazon Gifts for Men",
      description: "Discover Amazon gift ideas for men including gadgets, tools, gaming gear, watches, accessories, and more.",
      intro: [
        "Gift pages with stronger audience intent can rank more precisely and feel more relevant to shoppers.",
        "This page focuses on products that feel more naturally aligned with men-oriented gift browsing."
      ],
      section1Title: "Why this page can convert well",
      section1Text: "A more specific page helps visitors browse with less friction when they already know who they are shopping for.",
      section2Title: "What products appear here",
      section2Text: "Expect gadgets, gaming items, tools, watches, accessories, outdoor products, and other practical gift picks.",
      navExtra: `<a class="chip" href="/best-gifts.html">Best Gifts</a><a class="chip" href="/cheap-tech.html">Cheap Tech</a>`,
      filter: items => items.filter(p => looksLikeMenGift(p.name, p.description, p.category)).slice(0, 48),
      label: "Gifts for Men"
    }
  ];
}

async function generatePages() {
  const { data, error } = await sb
    .from("products")
    .select("asin,name,description,price,original_price,image_url,affiliate_link,category,score,is_active,updated_at,is_best_seller,is_crazy_deal,is_giftable")
    .eq("is_active", true)
    .order("score", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(MAX_ACTIVE_DEALS);

  if (error) throw error;

  const items = data || [];
  const byCategory = category => items.filter(p => p.category === category);
  const bestSellers = items.filter(p => p.is_best_seller).slice(0, 48);
  const crazyDeals = items.filter(p => p.is_crazy_deal).slice(0, 48);

  fs.writeFileSync("index.html", renderHomePage(items), "utf8");
  fs.writeFileSync("deals.html", renderDealsPage(items), "utf8");

  const categoryPages = [
    ["tech.html", "Best Amazon Tech Deals", "Discover discounted tech, electronics, gadgets, audio gear, and trending Amazon devices.", "Tech"],
    ["home.html", "Best Amazon Home Deals", "Explore home bargains including decor, storage, bedding, vacuums, and household essentials.", "Home"],
    ["kitchen.html", "Best Amazon Kitchen Deals", "Explore discounted coffee makers, cookware, kitchen tools, appliances, and useful kitchen buys.", "Kitchen"],
    ["beauty.html", "Best Amazon Beauty Deals", "Browse discounted skincare, beauty, grooming, hair care, and personal care products.", "Beauty"],
    ["fashion.html", "Best Amazon Fashion Deals", "Discover clothing, fashion basics, seasonal pieces, and trending Amazon apparel deals.", "Fashion"],
    ["jewelry.html", "Best Amazon Jewelry Deals", "Explore rings, necklaces, bracelets, earrings, watches, and jewelry deals on Amazon.", "Jewelry"],
    ["shoes.html", "Best Amazon Shoes Deals", "Browse sneakers, boots, sandals, slippers, and running shoe deals on Amazon.", "Shoes"],
    ["sports.html", "Best Amazon Sports Deals", "Discover workout gear, fitness accessories, sports equipment, and active deals.", "Sports"],
    ["health.html", "Best Amazon Health Deals", "Browse health essentials, wellness gear, thermometers, humidifiers, and home health items.", "Health"],
    ["baby.html", "Best Amazon Baby Deals", "Find baby essentials, nursery products, feeding gear, and parent-friendly Amazon deals.", "Baby"],
    ["pets.html", "Best Amazon Pet Deals", "Explore pet essentials, dog gear, cat supplies, litter products, and pet accessories.", "Pets"],
    ["office.html", "Best Amazon Office Deals", "Browse desk tools, notebooks, organizers, planners, office furniture, and supplies.", "Office"],
    ["gaming.html", "Best Amazon Gaming Deals", "Discover gaming headsets, controllers, accessories, and console-friendly Amazon deals.", "Gaming"],
    ["outdoor.html", "Best Amazon Outdoor Deals", "Find camping gear, backpacks, patio items, hiking accessories, and outdoor essentials.", "Outdoor"]
  ];

  for (const [file, title, description, category] of categoryPages) {
    const page = renderEditorialPage({
      title,
      description,
      canonicalPath: `/${file}`,
      intro: [description],
      section1Title: `${title} worth checking`,
      section1Text: `TrendPulse groups stronger products in ${category.toLowerCase()} so visitors can browse faster and click with less friction.`,
      section2Title: `Why these ${category.toLowerCase()} deals matter`,
      section2Text: `These pages help surface products with better value, stronger discounts, and cleaner shopping intent.`,
      navExtra: "",
      items: byCategory(category).slice(0, 60),
      label: category
    });
    fs.writeFileSync(file, page, "utf8");
  }

  fs.writeFileSync("best-sellers.html", renderEditorialPage({
    title: "Best Selling Amazon Products Right Now",
    description: "Discover some of the most popular Amazon products people are already buying right now, including tech, home, beauty, fashion, and more.",
    canonicalPath: "/best-sellers.html",
    intro: [
      "Not everyone visiting a deals site wants only discounted products. Some visitors simply want popular Amazon items that already have strong buying appeal.",
      "This page highlights products that look strong from a popularity and demand perspective, so visitors can find items they may actually want even if they are not the deepest discount on the site."
    ],
    section1Title: "Why best sellers matter",
    section1Text: "Best-selling products reduce friction because shoppers already know these kinds of items are in demand. That makes them useful for both conversions and user trust.",
    section2Title: "How we use best sellers on TrendPulse",
    section2Text: "We surface products that appear to have strong buyer appeal based on score, deal quality, and site interaction signals, creating a more rounded browsing experience beyond discounts alone.",
    navExtra: `<a class="chip" href="/cheap-tech.html">Cheap Tech</a><a class="chip" href="/best-gifts.html">Best Gifts</a>`,
    items: bestSellers,
    label: "Best Seller"
  }), "utf8");

  fs.writeFileSync("crazy-deals.html", renderEditorialPage({
    title: "Crazy Amazon Deals and Possible Price Errors",
    description: "Browse unusually deep Amazon discounts, major price drops, and possible crazy deals worth checking fast.",
    canonicalPath: "/crazy-deals.html",
    intro: [
      "Some Amazon deals stand out because the discount looks unusually strong for the product type and price range.",
      "This page gathers deeper discounts and suspiciously sharp price drops that may be worth checking before they disappear."
    ],
    section1Title: "What counts as a crazy deal",
    section1Text: "On TrendPulse, crazy deals are products with much stronger-than-usual discount signals, especially when the price is still low enough to feel like an impulse buy.",
    section2Title: "Why these deals move fast",
    section2Text: "Very strong discounts can lose traction quickly as inventory shifts or pricing updates. That makes visibility especially important for this type of page.",
    navExtra: `<a class="chip" href="/under-10.html">Under $10</a><a class="chip" href="/under-20.html">Under $20</a>`,
    items: crazyDeals,
    label: "Crazy Deal"
  }), "utf8");

  fs.writeFileSync("best-amazon-deals.html", renderEditorialPage({
    title: "Best Amazon Deals Today",
    description: "Find the best Amazon deals today. Discover trending discounts, top-rated products, and daily updated deals in the US.",
    canonicalPath: "/best-amazon-deals.html",
    intro: [
      "Looking for the best Amazon deals right now? You’re in the right place. We track trending discounts, popular products, and price drops across Amazon to bring you the most relevant deals available today.",
      "Our system automatically scans deal sources and highlights products with stronger discounts, better value, and higher click potential."
    ],
    section1Title: "Why these Amazon deals matter",
    section1Text: "The most attractive deals are often the ones that combine useful products with meaningful discounts and current shopping momentum. Instead of showing random bargains, TrendPulse focuses on live signals and stronger product relevance.",
    section2Title: "How to use this page",
    section2Text: "Browse the featured products below, then open any item to view its dedicated deal page. You can also explore category pages like Tech, Fashion, Jewelry, Home, Kitchen, Beauty, and Best Sellers.",
    navExtra: `<a class="chip" href="/under-50.html">Under $50</a><a class="chip" href="/cheap-tech.html">Cheap Tech</a>`,
    items: items.slice(0, 30),
    label: "All"
  }), "utf8");

  for (const cfg of longTailConfig()) {
    fs.writeFileSync(cfg.file, renderEditorialPage({
      title: cfg.title,
      description: cfg.description,
      canonicalPath: `/${cfg.file}`,
      intro: cfg.intro,
      section1Title: cfg.section1Title,
      section1Text: cfg.section1Text,
      section2Title: cfg.section2Title,
      section2Text: cfg.section2Text,
      navExtra: cfg.navExtra,
      items: cfg.filter(items),
      label: cfg.label
    }), "utf8");
  }

  console.log("All static pages generated");
}

async function generateSitemap() {
  const { data, error } = await sb
    .from("products")
    .select("asin, updated_at")
    .eq("is_active", true)
    .limit(MAX_ACTIVE_DEALS);

  if (error) throw error;

  const staticUrls = [
    "/",
    "/deals.html",
    "/best-amazon-deals.html",
    "/best-sellers.html",
    "/crazy-deals.html",
    "/under-10.html",
    "/under-20.html",
    "/under-50.html",
    "/cheap-tech.html",
    "/best-gifts.html",
    "/best-amazon-gadgets.html",
    "/amazon-home-decor-deals.html",
    "/best-amazon-gifts-for-women.html",
    "/best-amazon-gifts-for-men.html",
    "/tech.html",
    "/fashion.html",
    "/jewelry.html",
    "/shoes.html",
    "/sports.html",
    "/health.html",
    "/baby.html",
    "/pets.html",
    "/office.html",
    "/gaming.html",
    "/outdoor.html",
    "/home.html",
    "/kitchen.html",
    "/beauty.html"
  ].map(path => ({
    loc: `${SITE_URL}${path}`,
    changefreq: "daily",
    priority: path === "/" ? "1.0" : "0.8"
  }));

  const dealUrls = (data || []).map(item => ({
    loc: `${SITE_URL}/deal.html?asin=${encodeURIComponent(item.asin)}`,
    lastmod: item.updated_at ? new Date(item.updated_at).toISOString() : new Date().toISOString(),
    changefreq: "daily",
    priority: "0.7"
  }));

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="https://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticUrls, ...dealUrls].map(url => `  <url>
    <loc>${escapeXml(url.loc)}</loc>
    ${url.lastmod ? `<lastmod>${escapeXml(url.lastmod)}</lastmod>` : ""}
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`).join("\n")}
</urlset>
`;

  fs.writeFileSync("sitemap.xml", xml, "utf8");
  console.log("sitemap.xml generated");
}

async function main() {
  console.log("Starting sync");

  const activeCountBefore = await getActiveDealsCount();
  console.log(`Active deals before sync: ${activeCountBefore}`);

  let targetCount;
  if (activeCountBefore === 0) targetCount = INITIAL_TARGET_ON_EMPTY;
  else if (activeCountBefore < MIN_ACTIVE_DEALS) targetCount = MIN_ACTIVE_DEALS;
  else targetCount = Math.min(activeCountBefore + 40, MAX_ACTIVE_DEALS);

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

      if (results.length >= targetCount) break;
      await sleep(REQUEST_DELAY_MS);
    } catch (error) {
      console.log(`Article error: ${error.message}`);
    }
  }

  console.log(`${results.length} valid products found`);

  await upsertProducts(results);
  await expireOldDeals();
  await disableWeakDeals();
  await enforceMaxActiveDeals(MAX_ACTIVE_DEALS);
  await generatePages();
  await generateSitemap();

  console.log("Sync complete");
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
