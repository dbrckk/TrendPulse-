import Parser from "rss-parser";
import { createClient } from "@supabase/supabase-js";
import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";

const parser = new Parser({
  timeout: 25000,
  headers: {
    "User-Agent": "TrendPulseBot/8.0"
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

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
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
        "User-Agent": "Mozilla/5.0 TrendPulseBot/8.0"
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
        "User-Agent": "Mozilla/5.0 TrendPulseBot/8.0"
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
      <img src="${escapeHtml(p.image_url || fallbackImage(p.name, label))}" alt="${escapeHtml(p.name)}" loading="lazy" onerror="this.onerror=null;this.src='${escapeHtml(fallbackImage(p.name, label))}';">
      <div class="content">
        <div class="kicker">${escapeHtml(label)} · Score ${Math.round(Number(p.score || 0))}</div>
        <h2 class="title">${escapeHtml(p.name)}</h2>
        <div class="desc">${escapeHtml(p.description || "Trending deal from our live feed.")}</div>
        <div class="row">
          <div>
            ${p.original_price ? `<div class="old">${escapeHtml(formatPriceForHtml(p.original_price))}</div>` : ""}
            <div class="price">${escapeHtml(formatPriceForHtml(p.price))}</div>
          </div>
          <a class="cta" href="/deal/${escapeHtml(p.asin)}/${escapeHtml(slugify(p.name))}/">View Deal</a>
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
      <a href="/tech.html">Tech</a>
      <a href="/kitchen.html">Kitchen</a>
      <a href="/beauty.html">Beauty</a>
      <a href="/home.html">Home</a>
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
    body { margin: 0; font-family: Inter, sans-serif; background: #050505; color: white; }
    .wrap { max-width: 1100px; margin: 0 auto; padding: 20px; }
    .nav { display: flex; gap: 10px; flex-wrap: wrap; margin: 18px 0 24px; }
    .nav a { padding: 10px 14px; border-radius: 999px; text-decoration: none; color: #e4e4e7; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); font-weight: 700; font-size: 13px; }
    h1 { font-size: clamp(34px, 6vw, 58px); line-height: .95; letter-spacing: -.05em; margin: 0; font-weight: 900; font-style: italic; }
    p.lead { color: #a1a1aa; max-width: 760px; line-height: 1.7; font-size: 15px; }
    .stats { display: flex; gap: 10px; flex-wrap: wrap; margin: 16px 0 24px; }
    .pill { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); border-radius: 999px; padding: 10px 14px; font-size: 12px; font-weight: 800; color: #e4e4e7; text-transform: uppercase; letter-spacing: .12em; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 18px; }
    .card { background: linear-gradient(180deg, #111722 0%, #090b11 100%); border: 1px solid rgba(255,255,255,.08); border-radius: 26px; overflow: hidden; box-shadow: 0 24px 50px rgba(0,0,0,.28); }
    .card img { width: 100%; height: 230px; object-fit: cover; background: white; }
    .content { padding: 16px; }
    .kicker { color: #93c5fd; font-size: 11px; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; }
    .title { margin: 8px 0 10px; font-size: 20px; line-height: 1.15; font-weight: 800; letter-spacing: -.03em; min-height: 46px; }
    .desc { color: #c4c4cc; font-size: 14px; line-height: 1.55; min-height: 64px; }
    .row { display: flex; justify-content: space-between; align-items: end; gap: 12px; margin-top: 14px; }
    .price { font-size: 28px; font-weight: 900; letter-spacing: -.04em; }
    .old { color: #71717a; text-decoration: line-through; font-size: 13px; font-weight: 700; }
    .cta { display: inline-flex; align-items: center; justify-content: center; padding: 12px 14px; border-radius: 16px; text-decoration: none; background: linear-gradient(180deg, #3275ff 0%, #1d4ed8 100%); color: white; font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: .08em; }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <p style="margin:0;color:#60a5fa;font-weight:900;letter-spacing:.18em;text-transform:uppercase;font-size:12px;">TrendPulse</p>
      <h1>Amazon Deals Today</h1>
      <p class="lead">Explore live Amazon deals, trending product discounts, and popular bargain picks updated from our automated deal feed.</p>
      <nav class="nav" aria-label="Site navigation">
        <a href="/">Home</a>
        <a href="/best-amazon-deals.html">Editorial Deals</a>
        <a href="/deals.html">All Deals</a>
        <a href="/tech.html">Tech</a>
        <a href="/kitchen.html">Kitchen</a>
        <a href="/beauty.html">Beauty</a>
        <a href="/home.html">Home</a>
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
      <a href="/best-amazon-deals.html">Editorial Deals</a>
      <a href="/tech.html">Tech</a>
      <a href="/kitchen.html">Kitchen</a>
      <a href="/beauty.html">Beauty</a>
      <a href="/home.html">Home</a>
    </nav>
    <div class="grid">
      ${renderCardGrid(items, label)}
    </div>
  </div>
</body>
</html>`;
}

function staticDealPageTemplate(product) {
  const slug = slugify(product.name);
  const canonicalUrl = `${SITE_URL}/deal/${product.asin}/${slug}/`;
  const image = product.image_url || buildAmazonImage(product.asin) || fallbackImage(product.name, "TrendPulse");
  const description = product.description || "Trending Amazon deal updated from our live feed.";
  const discount = Number(product.discount_percent || 0);
  const score = Math.round(Number(product.score || 0));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />

  <title>${escapeHtml(product.name)} | TrendPulse</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <meta name="theme-color" content="#050505" />
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />

  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="apple-touch-icon" href="/icon-192.png" />
  <link rel="manifest" href="/manifest.json" />

  <meta property="og:type" content="product" />
  <meta property="og:title" content="${escapeHtml(product.name)} | TrendPulse" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${escapeHtml(image)}" />
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(product.name)} | TrendPulse" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(image)}" />

  <script type="application/ld+json">
  {
    "@context":"https://schema.org",
    "@type":"Product",
    "name":"${escapeHtml(product.name)}",
    "description":"${escapeHtml(description)}",
    "image":["${escapeHtml(image)}"],
    "offers":{
      "@type":"Offer",
      "priceCurrency":"USD",
      "price":"${escapeHtml(product.price ?? "")}",
      "url":"${escapeHtml(canonicalUrl)}",
      "availability":"https://schema.org/InStock"
    }
  }
  </script>

  <style>
    body { margin: 0; background: #050505; color: white; font-family: Inter, sans-serif; }
    .wrap { max-width: 900px; margin: 0 auto; padding: 20px; }
    .nav { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 24px; }
    .nav a { padding: 10px 14px; border-radius: 999px; text-decoration: none; color: #e4e4e7; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); font-weight: 700; font-size: 13px; }
    .card { background: linear-gradient(180deg, #111722 0%, #090b11 100%); border: 1px solid rgba(255,255,255,.08); border-radius: 28px; overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,.35); }
    .hero { display: grid; grid-template-columns: 1fr 1fr; }
    .hero-image { background: white; min-height: 420px; }
    .hero-image img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .content { padding: 26px; }
    .kicker { color: #93c5fd; font-size: 12px; font-weight: 900; letter-spacing: .14em; text-transform: uppercase; margin-bottom: 12px; }
    h1 { margin: 0 0 14px; font-size: clamp(30px, 5vw, 48px); line-height: .98; font-weight: 900; letter-spacing: -.05em; font-style: italic; }
    .desc { color: #c4c4cc; font-size: 15px; line-height: 1.7; margin-bottom: 20px; }
    .meta-row { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 18px; }
    .pill { padding: 10px 12px; border-radius: 999px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); color: #e4e4e7; font-size: 11px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
    .old-price { color: #71717a; font-size: 15px; text-decoration: line-through; font-weight: 700; margin-bottom: 2px; }
    .price { font-size: 42px; font-weight: 900; letter-spacing: -.05em; margin-bottom: 18px; }
    .cta { display: inline-flex; align-items: center; justify-content: center; width: 100%; padding: 16px 18px; border-radius: 18px; text-decoration: none; background: linear-gradient(180deg, #3275ff 0%, #1d4ed8 100%); color: white; font-size: 14px; font-weight: 900; text-transform: uppercase; letter-spacing: .08em; box-shadow: 0 16px 30px rgba(37,99,235,.28); }
    .section { margin-top: 28px; background: linear-gradient(180deg, #111722 0%, #090b11 100%); border: 1px solid rgba(255,255,255,.08); border-radius: 24px; padding: 22px; }
    .section h2 { margin: 0 0 12px; font-size: 24px; font-weight: 900; letter-spacing: -.03em; }
    .section p { margin: 0; color: #c4c4cc; line-height: 1.7; font-size: 15px; }
    @media (max-width: 820px) {
      .hero { grid-template-columns: 1fr; }
      .hero-image { min-height: 320px; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <nav class="nav">
      <a href="/">Home</a>
      <a href="/deals.html">All Deals</a>
      <a href="/tech.html">Tech</a>
      <a href="/kitchen.html">Kitchen</a>
      <a href="/beauty.html">Beauty</a>
      <a href="/home.html">Home</a>
    </nav>

    <main>
      <article class="card">
        <div class="hero">
          <div class="hero-image">
            <img src="${escapeHtml(image)}" alt="${escapeHtml(product.name)}" onerror="this.onerror=null;this.src='${escapeHtml(fallbackImage(product.name, "TrendPulse"))}';">
          </div>

          <div class="content">
            <div class="kicker">${escapeHtml(product.category || "All")} · Amazon Deal</div>
            <h1>${escapeHtml(product.name)}</h1>
            <p class="desc">${escapeHtml(description)}</p>

            <div class="meta-row">
              ${discount > 0 ? `<span class="pill">${discount}% off</span>` : ""}
              <span class="pill">Score ${score}</span>
              ${product.source_name ? `<span class="pill">${escapeHtml(product.source_name)}</span>` : ""}
            </div>

            ${product.original_price ? `<div class="old-price">${escapeHtml(formatPriceForHtml(product.original_price))}</div>` : ""}
            <div class="price">${escapeHtml(formatPriceForHtml(product.price))}</div>

            <a href="${escapeHtml(product.affiliate_link || "#")}" target="_blank" rel="nofollow sponsored noopener noreferrer" class="cta">
              🔥 Get Deal on Amazon
            </a>
          </div>
        </div>
      </article>

      <section class="section">
        <h2>Why this deal stands out</h2>
        <p>
          We surface trending Amazon bargains based on discount strength, category relevance, and live activity signals from our automated deal feed. This helps highlight products that are more likely to be worth checking before pricing or availability changes.
        </p>
      </section>

      <section class="section">
        <h2>More live deal categories</h2>
        <p>
          Explore more deals on our <a href="/deals.html" style="color:#60a5fa;">all deals page</a>, or browse category collections including
          <a href="/tech.html" style="color:#60a5fa;">Tech</a>,
          <a href="/kitchen.html" style="color:#60a5fa;">Kitchen</a>,
          <a href="/beauty.html" style="color:#60a5fa;">Beauty</a>, and
          <a href="/home.html" style="color:#60a5fa;">Home</a>.
        </p>
      </section>
    </main>
  </div>
</body>
</html>`;
}

function cleanGeneratedDealDirs() {
  const dealRoot = path.join(process.cwd(), "deal");
  if (!fs.existsSync(dealRoot)) return;

  for (const entry of fs.readdirSync(dealRoot, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      fs.rmSync(path.join(dealRoot, entry.name), { recursive: true, force: true });
    }
  }
}

async function generateStaticDealPages() {
  const { data, error } = await sb
    .from("products")
    .select("asin,name,description,price,original_price,image_url,affiliate_link,category,score,discount_percent,source_name,updated_at")
    .eq("is_active", true)
    .order("score", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(MAX_ACTIVE_DEALS);

  if (error) throw error;

  const items = data || [];
  const dealRoot = path.join(process.cwd(), "deal");
  ensureDir(dealRoot);
  cleanGeneratedDealDirs();

  for (const product of items) {
    const slug = slugify(product.name);
    const dir = path.join(dealRoot, product.asin, slug);
    ensureDir(dir);
    fs.writeFileSync(path.join(dir, "index.html"), staticDealPageTemplate(product), "utf8");
  }

  console.log(`Static deal pages generated: ${items.length}`);
}

async function generateEditorialPages() {
  const { data, error } = await sb
    .from("products")
    .select("asin,name,description,price,original_price,image_url,affiliate_link,category,score,is_active,updated_at")
    .eq("is_active", true)
    .order("score", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(MAX_ACTIVE_DEALS);

  if (error) throw error;

  const items = data || [];
  const tech = items.filter(p => p.category === "Tech");
  const kitchen = items.filter(p => p.category === "Kitchen");
  const beauty = items.filter(p => p.category === "Beauty");
  const home = items.filter(p => p.category === "Home");
  const techUnder50 = tech.filter(p => Number(p.price) > 0 && Number(p.price) <= 50);

  fs.writeFileSync("deals.html", dealsPageTemplate(items.slice(0, 60)), "utf8");

  fs.writeFileSync("tech.html", simpleCategoryPageTemplate({
    title: "Best Amazon Tech Deals",
    description: "Discover discounted tech, electronics, gadgets, laptop accessories, audio gear, and trending Amazon devices updated from our live deal feed.",
    canonicalPath: "/tech.html",
    items: tech.slice(0, 60),
    label: "Tech"
  }), "utf8");

  fs.writeFileSync("kitchen.html", simpleCategoryPageTemplate({
    title: "Best Amazon Kitchen Deals",
    description: "Explore discounted coffee makers, cookware, kitchen tools, appliances, and trending Amazon kitchen bargains updated from our deal feed.",
    canonicalPath: "/kitchen.html",
    items: kitchen.slice(0, 60),
    label: "Kitchen"
  }), "utf8");

  fs.writeFileSync("beauty.html", simpleCategoryPageTemplate({
    title: "Best Amazon Beauty Deals",
    description: "Browse discounted skincare, beauty, grooming, hair care, and personal care products trending on Amazon right now.",
    canonicalPath: "/beauty.html",
    items: beauty.slice(0, 60),
    label: "Beauty"
  }), "utf8");

  fs.writeFileSync("home.html", simpleCategoryPageTemplate({
    title: "Best Amazon Home Deals",
    description: "Explore home bargains including decor, storage, bedding, vacuums, and trending Amazon household deals updated from our live feed.",
    canonicalPath: "/home.html",
    items: home.slice(0, 60),
    label: "Home"
  }), "utf8");

  fs.writeFileSync("best-amazon-deals.html", editorialTemplate({
    title: "Best Amazon Deals Today",
    description: "Find the best Amazon deals today. Discover trending discounts, top-rated products, and daily updated deals in the US.",
    canonicalPath: "/best-amazon-deals.html",
    intro: [
      "Looking for the best Amazon deals right now? You’re in the right place. We track trending discounts, popular products, and price drops across Amazon to bring you the most relevant deals available today.",
      "Our system automatically scans deal sources and highlights products with strong discounts, high demand, and great value."
    ],
    section1Title: "Why these Amazon deals matter",
    section1Text: "The most attractive deals are often the ones that combine useful products with meaningful discounts and current shopping momentum. Instead of showing random bargains, we focus on live deal signals and current relevance.",
    section2Title: "How to use this page",
    section2Text: "Browse the featured products below, then open any item to view its dedicated deal page. You can also explore focused collections in Tech, Kitchen, Beauty, and Home to find more relevant offers faster.",
    navExtra: `<a href="/best-tech-deals-under-50.html">Tech Under $50</a><a href="/best-kitchen-deals-this-week.html">Kitchen This Week</a><a href="/best-beauty-deals-on-amazon.html">Beauty Deals</a><a href="/best-home-deals-this-week.html">Home This Week</a>`,
    items: items.slice(0, 30),
    label: "All"
  }), "utf8");

  fs.writeFileSync("best-tech-deals-under-50.html", editorialTemplate({
    title: "Best Tech Deals Under $50",
    description: "Browse the best Amazon tech deals under $50. Find affordable gadgets, headphones, accessories, and trending electronics at low prices.",
    canonicalPath: "/best-tech-deals-under-50.html",
    intro: [
      "Looking for affordable Amazon electronics that still feel worth buying? This page highlights cheap tech deals under $50, including headphones, small accessories, portable gadgets, and practical home-office items.",
      "Budget-friendly deals tend to move fast because they combine low price with impulse-buy appeal."
    ],
    section1Title: "Why tech deals under $50 are worth watching",
    section1Text: "Lower-priced tech products often outperform bigger-ticket items when it comes to shopping momentum. Accessories, chargers, earbuds, desk gear, and small smart devices can drop to highly attractive price points without requiring a major buying decision.",
    section2Title: "How we choose these budget tech deals",
    section2Text: "We surface products based on category fit, score, and recency. This helps show budget electronics that are more likely to be useful, popular, and worth checking right now.",
    navExtra: `<a href="/best-tech-deals-under-50.html">Tech Under $50</a>`,
    items: techUnder50.slice(0, 36),
    label: "Tech"
  }), "utf8");

  fs.writeFileSync("best-kitchen-deals-this-week.html", editorialTemplate({
    title: "Best Kitchen Deals This Week",
    description: "Discover the best kitchen deals this week on Amazon, including cookware, coffee makers, small appliances, and useful kitchen tools.",
    canonicalPath: "/best-kitchen-deals-this-week.html",
    intro: [
      "Kitchen deals are some of the most practical Amazon bargains to watch because they often combine everyday usefulness with meaningful discounts.",
      "From coffee makers and cookware to utensils and countertop appliances, this page highlights some of the best live kitchen offers worth checking this week."
    ],
    section1Title: "Why kitchen bargains matter",
    section1Text: "Kitchen products are some of the easiest deals to justify because they are used frequently and can improve everyday routines immediately.",
    section2Title: "How to spot a good kitchen deal",
    section2Text: "The best kitchen deals usually balance three things: usefulness, discount level, and product quality. That is why we sort for current relevance and live activity instead of showing random low-quality offers.",
    navExtra: `<a href="/best-kitchen-deals-this-week.html">Kitchen This Week</a>`,
    items: kitchen.slice(0, 36),
    label: "Kitchen"
  }), "utf8");

  fs.writeFileSync("best-beauty-deals-on-amazon.html", editorialTemplate({
    title: "Best Beauty Deals on Amazon",
    description: "Discover the best beauty deals on Amazon including skincare, haircare, personal care, grooming, and trending beauty products.",
    canonicalPath: "/best-beauty-deals-on-amazon.html",
    intro: [
      "Beauty deals on Amazon can be especially attractive because many products are replenishment purchases.",
      "When skincare, personal care, haircare, or grooming items go on sale, shoppers often take advantage quickly because the products are already part of their routine."
    ],
    section1Title: "Why beauty deals perform well",
    section1Text: "Beauty bargains tend to combine strong repeat demand with simple buying decisions. If someone already knows the kind of product they want, a discount can be enough to trigger a fast purchase.",
    section2Title: "What to look for in a beauty discount",
    section2Text: "The best beauty deals usually stand out when they lower the price of products people already use regularly. Discounts on skincare, haircare, and personal care essentials can create stronger value than one-time novelty products.",
    navExtra: `<a href="/best-beauty-deals-on-amazon.html">Beauty Deals</a>`,
    items: beauty.slice(0, 36),
    label: "Beauty"
  }), "utf8");

  fs.writeFileSync("best-home-deals-this-week.html", editorialTemplate({
    title: "Best Home Deals This Week",
    description: "Find the best Amazon home deals this week including storage, decor, bedding, vacuums, furniture, and household essentials.",
    canonicalPath: "/best-home-deals-this-week.html",
    intro: [
      "Home deals can be some of the most practical Amazon bargains because they apply to everyday life immediately.",
      "This page focuses on discounted storage products, bedding, decor, vacuums, and useful household items from our live deal feed."
    ],
    section1Title: "What makes a strong home deal",
    section1Text: "Home products tend to perform well when the value is obvious and the product solves a clear problem.",
    section2Title: "Why check these deals regularly",
    section2Text: "Home deals can change quickly because stock availability and promotional pricing are often temporary. If a product is both useful and discounted, it tends to get attention fast.",
    navExtra: `<a href="/best-home-deals-this-week.html">Home This Week</a>`,
    items: home.slice(0, 36),
    label: "Home"
  }), "utf8");

  console.log("Editorial pages generated");
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
    { loc: `${SITE_URL}/home.html`, changefreq: "daily", priority: "0.8" },
    { loc: `${SITE_URL}/best-tech-deals-under-50.html`, changefreq: "daily", priority: "0.85" },
    { loc: `${SITE_URL}/best-kitchen-deals-this-week.html`, changefreq: "daily", priority: "0.85" },
    { loc: `${SITE_URL}/best-beauty-deals-on-amazon.html`, changefreq: "daily", priority: "0.85" },
    { loc: `${SITE_URL}/best-home-deals-this-week.html`, changefreq: "daily", priority: "0.85" }
  ];

  const dealUrls = (data || []).map(item => {
    const slug = slugify(item.name);
    return {
      loc: `${SITE_URL}/deal/${item.asin}/${slug}/`,
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
  console.log("Starting sync V8");

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

  await generateEditorialPages();
  await generateStaticDealPages();
  await generateSitemap();

  console.log("Sync complete");
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
