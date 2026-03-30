import Parser from "rss-parser";
import { createClient } from "@supabase/supabase-js";
import * as cheerio from "cheerio";
import fs from "fs";

const parser = new Parser({
  timeout: 25000,
  headers: {
    "User-Agent": "TrendPulseBot/7.0"
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
        "User-Agent": "Mozilla/5.0 TrendPulseBot/7.0"
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
        "User-Agent": "Mozilla/5.0 TrendPulseBot/7.0"
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
          <a class="cta" href="/deal/${escapeHtml(p.asin)}/${escapeHtml(slugify(p.name))}">View Deal</a>
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
    .nav a { padding: 10px 14px; border-radius: 999px; text-decoration: none; color: #e4e4e7; background: rgba(255,255,255,.04); border: 1px s
