import Parser from "rss-parser";
import { createClient } from "@supabase/supabase-js";
import * as cheerio from "cheerio";
import fs from "fs";

const parser = new Parser({
  timeout: 25000,
  headers: {
    "User-Agent": "TrendPulseBot/12.0"
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

async function fetchText(url) {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 TrendPulseBot/12.0"
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
        "User-Agent": "Mozilla/5.0 TrendPulseBot/12.0"
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

  if (!foundLinks.length) {
    console.log("No Amazon link found");
    return null;
  }

  const bestRawAmazonLink = chooseBestAmazonLink(foundLinks);
  if (!bestRawAmazonLink) {
    console.log("No valid Amazon product link found");
    return null;
  }

  const finalUrl = await resolveFinalUrl(bestRawAmazonLink);
  const asin = extractAsinFromAmazonUrl(finalUrl) || extractAsinFromAmazonUrl(bestRawAmazonLink);

  if (!isValidAsin(asin)) {
    console.log("Invalid ASIN");
    return null;
  }

  const mergedText = `${sourceTitle} ${sourceDescription}`;
  const price = extractPriceFromText(mergedText);
  const discountPercent = extractDiscountPercent(mergedText);
  const originalPrice = discountPercent ? estimateOriginalPrice(price, discountPercent) : null;
  const sourceName = new URL(sourceUrl).hostname.replace(/^www\./, "");
  const description = buildDescription(sourceTitle, sourceDescription, price, discountPercent);
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
    category: extractCategory(sourceTitle, sourceDescription),
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

  if (!idsToDisable.length) {
    console.log("No weak deals disabled");
    return;
  }

  const { error: updateError } = await sb
    .from("products")
    .update({ is_active: false })
    .in("id", idsToDisable);

  if (updateError) throw updateError;

  console.log(`Disabled ${idsToDisable.length} weak deals`);
}

function formatPriceForHtml(v) {
  if (v === null || v === undefined || v === "") return "Check price";
  const n = Number(v);
  if (Number.isNaN(n)) return "Check price";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n % 1 === 0 ? 0 : 2
  }).format(n);
}

function fallbackImage(name, label = "TrendPulse Deal") {
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><rect width="100%" height="100%" fill="%23070a11"/><text x="50%" y="42%" text-anchor="middle" fill="white" font-size="52" font-family="Arial" font-weight="800">${escapeHtml(label)}</text><text x="50%" y="58%" text-anchor="middle" fill="%23cbd5e1" font-size="30" font-family="Arial">${escapeHtml(name || "Deal")}</text></svg>`;
}

function renderCardGrid(items, label) {
  return items.map(p => `
    <article class="card">
      <img src="${escapeHtml(p.image_url || buildPrimaryImage(p.asin) || buildFallbackImage(p.asin) || fallbackImage(p.name, label))}" alt="${escapeHtml(p.name)}" loading="lazy" onerror="this.onerror=null;this.src='${escapeHtml(buildFallbackImage(p.asin) || fallbackImage(p.name, label))}';">
      <div class="content">
        <div class="kicker">${escapeHtml(label)} · Score ${Math.round(Number(p.score || 0))}</div>
        <h2 class="title">${escapeHtml(p.name)}</h2>
        <div class="desc">${escapeHtml(p.description || "Trending deal from our live feed.")}</div>
        <div class="row">
          <div>
            ${p.original_price ? `<div class="old">${escapeHtml(formatPriceForHtml(p.original_price))}</div>` : ""}
            <div class="price">${escapeHtml(formatPriceForHtml(p.price))}</div>
          </div>
          <a class="cta" href="${escapeHtml(productLink(p))}">View Deal</a>
        </div>
      </div>
    </article>
  `).join("");
}

function editorialTemplate({ title, description, canonicalPath, intro, section1Title, section1Text, section2Title, section2Text, navExtra, items, label }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)} | TrendPulse</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <link rel="canonical" href="${escapeHtml(SITE_URL + canonicalPath)}" />
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${escapeHtml(title)} | TrendPulse" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(SITE_URL + canonicalPath)}" />
  <meta property="og:image" content="${escapeHtml(SITE_URL + "/og-image.jpg")}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)} | TrendPulse" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(SITE_URL + "/og-image.jpg")}" />
  <style>
    body { margin:0; background:#050505; color:white; font-family:Inter,sans-serif; }
    .wrap { max-width:1100px; margin:0 auto; padding:20px; }
    .nav { display:flex; gap:10px; flex-wrap:wrap; margin:18px 0 24px; }
    .nav a { padding:10px 14px; border-radius:999px; text-decoration:none; color:#e4e4e7; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08); font-weight:700; font-size:13px; }
    h1 { font-size:clamp(34px,6vw,58px); line-height:.95; letter-spacing:-.05em; margin:0 0 14px; font-weight:900; font-style:italic; }
    h2 { font-size:28px; margin:32px 0 12px; font-weight:900; letter-spacing:-.03em; }
    p { color:#c4c4cc; line-height:1.75; font-size:15px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:18px; margin-top:20px; }
    .card { background:linear-gradient(180deg,#111722 0%,#090b11 100%); border:1px solid rgba(255,255,255,.08); border-radius:24px; overflow:hidden; }
    .card img { width:100%; height:220px; object-fit:cover; background:white; }
    .content { padding:16px; }
    .kicker { color:#93c5fd; font-size:11px; font-weight:900; text-transform:uppercase; letter-spacing:.12em; }
    .title { margin:8px 0; font-size:20px; line-height:1.15; font-weight:800; min-height:46px; }
    .desc { color:#c4c4cc; font-size:14px; line-height:1.55; min-height:64px; }
    .row { display:flex; justify-content:space-between; align-items:end; gap:12px; margin-top:14px; }
    .price { font-size:28px; font-weight:900; }
    .old { color:#71717a; text-decoration:line-through; font-size:13px; font-weight:700; }
    .cta { display:inline-flex; align-items:center; justify-content:center; padding:12px 14px; border-radius:16px; text-decoration:none; background:linear-gradient(180deg,#3275ff 0%,#1d4ed8 100%); color:white; font-size:12px; font-weight:900; text-transform:uppercase; }
    .section { background:linear-gradient(180deg,#111722 0%,#090b11 100%); border:1px solid rgba(255,255,255,.08); border-radius:24px; padding:22px; margin-top:24px; }
  </style>
</head>
<body>
  <div class="wrap">
    <nav class="nav">
      <a href="/">Home</a>
      <a href="/deals.html">All Deals</a>
      <a href="/best-sellers.html">Best Sellers</a>
      <a href="/crazy-deals.html">Crazy Deals</a>
      <a href="/tech.html">Tech</a>
      <a href="/fashion.html">Fashion</a>
      <a href="/jewelry.html">Jewelry</a>
      <a href="/shoes.html">Shoes</a>
      ${navExtra}
    </nav>

    <header>
      <p style="margin:0;color:#60a5fa;font-weight:900;letter-spacing:.18em;text-transform:uppercase;font-size:12px;">TrendPulse Editorial</p>
      <h1>${escapeHtml(title)}</h1>
      ${intro.map(p => `<p>${escapeHtml(p)}</p>`).join("")}
    </header>

    <section class="section">
      <h2>${escapeHtml(section1Title)}</h2>
      <p>${escapeHtml(section1Text)}</p>
    </section>

    <section>
      <div class="grid">
        ${renderCardGrid(items, label)}
      </div>
    </section>

    <section class="section">
      <h2>${escapeHtml(section2Title)}</h2>
      <p>${escapeHtml(section2Text)}</p>
    </section>
  </div>
</body>
</html>`;
}

function dealsPageTemplate(items) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>Amazon Deals Today | TrendPulse</title>
  <meta name="description" content="Browse trending Amazon deals updated live. Discover hot discounts, top-rated products, and the best deals in the US." />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <link rel="canonical" href="${escapeHtml(SITE_URL + "/deals.html")}" />
  <meta name="theme-color" content="#050505" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="Amazon Deals Today | TrendPulse" />
  <meta property="og:description" content="Browse trending Amazon deals updated live for shoppers in the US." />
  <meta property="og:url" content="${escapeHtml(SITE_URL + "/deals.html")}" />
  <meta property="og:image" content="${escapeHtml(SITE_URL + "/og-image.jpg")}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Amazon Deals Today | TrendPulse" />
  <meta name="twitter:description" content="Browse trending Amazon deals updated live for shoppers in the US." />
  <meta name="twitter:image" content="${escapeHtml(SITE_URL + "/og-image.jpg")}" />
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <style>
    body { margin:0; font-family:Inter,sans-serif; background:#050505; color:white; }
    .wrap { max-width:1100px; margin:0 auto; padding:20px; }
    .nav { display:flex; gap:10px; flex-wrap:wrap; margin:18px 0 24px; }
    .nav a { padding:10px 14px; border-radius:999px; text-decoration:none; color:#e4e4e7; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08); font-weight:700; font-size:13px; }
    h1 { font-size:clamp(34px,6vw,58px); line-height:.95; letter-spacing:-.05em; margin:0; font-weight:900; font-style:italic; }
    p.lead { color:#a1a1aa; max-width:760px; line-height:1.7; font-size:15px; }
    .stats { display:flex; gap:10px; flex-wrap:wrap; margin:16px 0 24px; }
    .pill { background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08); border-radius:999px; padding:10px 14px; font-size:12px; font-weight:800; color:#e4e4e7; text-transform:uppercase; letter-spacing:.12em; }
    .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:18px; }
    .card { background:linear-gradient(180deg,#111722 0%,#090b11 100%); border:1px solid rgba(255,255,255,.08); border-radius:26px; overflow:hidden; box-shadow:0 24px 50px rgba(0,0,0,.28); }
    .card img { width:100%; height:230px; object-fit:cover; background:white; }
    .content { padding:16px; }
    .kicker { color:#93c5fd; font-size:11px; font-weight:900; letter-spacing:.12em; text-transform:uppercase; }
    .title { margin:8px 0 10px; font-size:20px; line-height:1.15; font-weight:800; letter-spacing:-.03em; min-height:46px; }
    .desc { color:#c4c4cc; font-size:14px; line-height:1.55; min-height:64px; }
    .row { display:flex; justify-content:space-between; align-items:end; gap:12px; margin-top:14px; }
    .price { font-size:28px; font-weight:900; letter-spacing:-.04em; }
    .old { color:#71717a; text-decoration:line-through; font-size:13px; font-weight:700; }
    .cta { display:inline-flex; align-items:center; justify-content:center; padding:12px 14px; border-radius:16px; text-decoration:none; background:linear-gradient(180deg,#3275ff 0%,#1d4ed8 100%); color:white; font-size:12px; font-weight:900; text-transform:uppercase; letter-spacing:.08em; }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <p style="margin:0;color:#60a5fa;font-weight:900;letter-spacing:.18em;text-transform:uppercase;font-size:12px;">TrendPulse</p>
      <h1>Amazon Deals Today</h1>
      <p class="lead">Explore live Amazon deals, trending discounts, and popular product picks updated from our automated deal feed.</p>
      <nav class="nav" aria-label="Site navigation">
        <a href="/">Home</a>
        <a href="/best-amazon-deals.html">Editorial Deals</a>
        <a href="/best-sellers.html">Best Sellers</a>
        <a href="/crazy-deals.html">Crazy Deals</a>
        <a href="/tech.html">Tech</a>
        <a href="/fashion.html">Fashion</a>
        <a href="/jewelry.html">Jewelry</a>
      </nav>
      <div class="stats">
        <div class="pill">${items.length} live deals</div>
        <div class="pill">Updated live</div>
        <div class="pill">US Amazon offers</div>
      </div>
    </header>
    <main>
      <section>
        <div class="grid">
          ${renderCardGrid(items, "All")}
        </div>
      </section>
    </main>
  </div>
</body>
</html>`;
}

function simpleCategoryPageTemplate({ title, description, canonicalPath, items, label }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)} | TrendPulse</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${escapeHtml(SITE_URL + canonicalPath)}" />
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <style>
    body { margin:0; font-family:Inter,sans-serif; background:#050505; color:white; }
    .wrap { max-width:1100px; margin:0 auto; padding:20px; }
    .nav { display:flex; gap:10px; flex-wrap:wrap; margin:18px 0 24px; }
    .nav a { padding:10px 14px; border-radius:999px; text-decoration:none; color:#e4e4e7; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08); font-weight:700; font-size:13px; }
    h1 { font-size:clamp(34px,6vw,58px); line-height:.95; letter-spacing:-.05em; margin:0; font-weight:900; font-style:italic; }
    .lead { color:#a1a1aa; max-width:760px; line-height:1.7; font-size:15px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:18px; margin-top:24px; }
    .card { background:linear-gradient(180deg,#111722 0%,#090b11 100%); border:1px solid rgba(255,255,255,.08); border-radius:26px; overflow:hidden; }
    .card img { width:100%; height:230px; object-fit:cover; background:white; }
    .content { padding:16px; }
    .kicker { color:#93c5fd; font-size:11px; font-weight:900; letter-spacing:.12em; text-transform:uppercase; }
    .title { margin:8px 0; font-size:20px; line-height:1.15; font-weight:800; min-height:46px; }
    .desc { color:#c4c4cc; font-size:14px; line-height:1.55; min-height:64px; }
    .row { display:flex; justify-content:space-between; align-items:end; gap:12px; margin-top:14px; }
    .price { font-size:28px; font-weight:900; }
    .old { color:#71717a; text-decoration:line-through; font-size:13px; font-weight:700; }
    .cta { display:inline-flex; align-items:center; justify-content:center; padding:12px 14px; border-radius:16px; text-decoration:none; background:linear-gradient(180deg,#3275ff 0%,#1d4ed8 100%); color:white; font-size:12px; font-weight:900; text-transform:uppercase; }
  </style>
</head>
<body>
  <div class="wrap">
    <p style="margin:0;color:#60a5fa;font-weight:900;letter-spacing:.18em;text-transform:uppercase;font-size:12px;">TrendPulse</p>
    <h1>${escapeHtml(title)}</h1>
    <p class="lead">${escapeHtml(description)}</p>
    <nav class="nav">
      <a href="/">Home</a>
      <a href="/deals.html">All Deals</a>
      <a href="/best-sellers.html">Best Sellers</a>
      <a href="/crazy-deals.html">Crazy Deals</a>
      <a href="/tech.html">Tech</a>
      <a href="/fashion.html">Fashion</a>
      <a href="/jewelry.html">Jewelry</a>
      <a href="/shoes.html">Shoes</a>
      <a href="/sports.html">Sports</a>
      <a href="/health.html">Health</a>
      <a href="/baby.html">Baby</a>
      <a href="/pets.html">Pets</a>
      <a href="/office.html">Office</a>
      <a href="/gaming.html">Gaming</a>
      <a href="/outdoor.html">Outdoor</a>
      <a href="/home.html">Home</a>
      <a href="/kitchen.html">Kitchen</a>
      <a href="/beauty.html">Beauty</a>
    </nav>
    <div class="grid">
      ${renderCardGrid(items, label)}
    </div>
  </div>
</body>
</html>`;
}

async function generateEditorialPages() {
  const { data, error } = await sb
    .from("products")
    .select("asin,name,description,price,original_price,image_url,affiliate_link,category,score,is_active,updated_at,is_best_seller,is_crazy_deal")
    .eq("is_active", true)
    .order("score", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(MAX_ACTIVE_DEALS);

  if (error) throw error;

  const items = data || [];
  const byCategory = category => items.filter(p => p.category === category);
  const bestSellers = items.filter(p => p.is_best_seller).slice(0, 48);
  const crazyDeals = items.filter(p => p.is_crazy_deal).slice(0, 48);

  fs.writeFileSync("deals.html", dealsPageTemplate(items.slice(0, 60)), "utf8");

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
    fs.writeFileSync(file, simpleCategoryPageTemplate({
      title,
      description,
      canonicalPath: `/${file}`,
      items: byCategory(category).slice(0, 60),
      label: category
    }), "utf8");
  }

  fs.writeFileSync("best-sellers.html", editorialTemplate({
    title: "Best Selling Amazon Products Right Now",
    description: "Discover some of the most popular Amazon products people are already buying right now, including tech, home, beauty, fashion, and more.",
    canonicalPath: "/best-sellers.html",
    intro: [
      "Not every visitor wants only discounted products. Some people simply want strong Amazon products that already have real buying appeal.",
      "This page highlights products that look strong from a popularity and demand perspective, so visitors can find items they may actually want even when they are not the deepest discount on the site."
    ],
    section1Title: "Why best sellers matter",
    section1Text: "Best-selling products reduce friction because shoppers already trust that these kinds of products are in demand. That makes them useful for both conversions and user confidence.",
    section2Title: "How we use best sellers on TrendPulse",
    section2Text: "We surface products that appear to have strong buyer appeal based on score, value, and site interaction signals, creating a more rounded shopping experience beyond discounts alone.",
    navExtra: `<a href="/best-sellers.html">Best Sellers</a><a href="/crazy-deals.html">Crazy Deals</a>`,
    items: bestSellers,
    label: "Best Seller"
  }), "utf8");

  fs.writeFileSync("crazy-deals.html", editorialTemplate({
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
    section2Text: "Very strong discounts can lose traction quickly as inventory shifts or pricing updates. That makes fast visibility especially important for this type of page.",
    navExtra: `<a href="/crazy-deals.html">Crazy Deals</a><a href="/best-sellers.html">Best Sellers</a>`,
    items: crazyDeals,
    label: "Crazy Deal"
  }), "utf8");

  fs.writeFileSync("best-amazon-deals.html", editorialTemplate({
    title: "Best Amazon Deals Today",
    description: "Find the best Amazon deals today. Discover trending discounts, top-rated products, and daily updated deals in the US.",
    canonicalPath: "/best-amazon-deals.html",
    intro: [
      "Looking for the best Amazon deals right now? You’re in the right place. We track trending discounts, popular products, and price drops across Amazon to bring you the most relevant deals available today.",
      "Our system automatically scans deal sources and highlights products with strong discounts, higher value, and better click potential."
    ],
    section1Title: "Why these Amazon deals matter",
    section1Text: "The most attractive deals are often the ones that combine useful products with meaningful discounts and current shopping momentum. Instead of showing random bargains, we focus on live deal signals and current relevance.",
    section2Title: "How to use this page",
    section2Text: "Browse the featured products below, then open any item to view its dedicated deal page. You can also explore category collections like Tech, Fashion, Home, Kitchen, Beauty, and Best Sellers.",
    navExtra: `<a href="/best-sellers.html">Best Sellers</a><a href="/crazy-deals.html">Crazy Deals</a>`,
    items: items.slice(0, 30),
    label: "All"
  }), "utf8");

  console.log("Editorial pages generated");
}

async function generateSitemap() {
  const { data, error } = await sb
    .from("products")
    .select("asin, updated_at")
    .eq("is_active", true)
    .limit(MAX_ACTIVE_DEALS);

  if (error) throw error;

  const staticUrls = [
    { loc: `${SITE_URL}/`, changefreq: "hourly", priority: "1.0" },
    { loc: `${SITE_URL}/deals.html`, changefreq: "hourly", priority: "0.9" },
    { loc: `${SITE_URL}/best-amazon-deals.html`, changefreq: "daily", priority: "0.95" },
    { loc: `${SITE_URL}/best-sellers.html`, changefreq: "daily", priority: "0.95" },
    { loc: `${SITE_URL}/crazy-deals.html`, changefreq: "daily", priority: "0.9" },
    { loc: `${SITE_URL}/tech.html`, changefreq: "daily", priority: "0.8" },
    { loc: `${SITE_URL}/fashion.html`, changefreq: "daily", priority: "0.8" },
    { loc: `${SITE_URL}/jewelry.html`, changefreq: "daily", priority: "0.8" },
    { loc: `${SITE_URL}/shoes.html`, changefreq: "daily", priority: "0.8" },
    { loc: `${SITE_URL}/sports.html`, changefreq: "daily", priority: "0.8" },
    { loc: `${SITE_URL}/health.html`, changefreq: "daily", priority: "0.8" },
    { loc: `${SITE_URL}/baby.html`, changefreq: "daily", priority: "0.8" },
    { loc: `${SITE_URL}/pets.html`, changefreq: "daily", priority: "0.8" },
    { loc: `${SITE_URL}/office.html`, changefreq: "daily", priority: "0.8" },
    { loc: `${SITE_URL}/gaming.html`, changefreq: "daily", priority: "0.8" },
    { loc: `${SITE_URL}/outdoor.html`, changefreq: "daily", priority: "0.8" },
    { loc: `${SITE_URL}/home.html`, changefreq: "daily", priority: "0.8" },
    { loc: `${SITE_URL}/kitchen.html`, changefreq: "daily", priority: "0.8" },
    { loc: `${SITE_URL}/beauty.html`, changefreq: "daily", priority: "0.8" }
  ];

  const dealUrls = (data || []).map(item => ({
    loc: `${SITE_URL}/deal.html?asin=${encodeURIComponent(item.asin)}`,
    lastmod: item.updated_at ? new Date(item.updated_at).toISOString() : new Date().toISOString(),
    changefreq: "daily",
    priority: "0.7"
  }));

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
  console.log("Starting sync V4");

  const activeCountBefore = await getActiveDealsCount();
  console.log(`Active deals before sync: ${activeCountBefore}`);

  let targetCount;
  if (activeCountBefore === 0) targetCount = INITIAL_TARGET_ON_EMPTY;
  else if (activeCountBefore < MIN_ACTIVE_DEALS) targetCount = MIN_ACTIVE_DEALS;
  else targetCount = Math.min(activeCountBefore + 40, MAX_ACTIVE_DEALS);

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
  await expireOldDeals();
  await disableWeakDeals();
  await enforceMaxActiveDeals(MAX_ACTIVE_DEALS);
  await generateEditorialPages();
  await generateSitemap();

  console.log("Sync complete");
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
