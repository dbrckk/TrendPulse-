import Parser from "rss-parser";
import { createClient } from "@supabase/supabase-js";
import * as cheerio from "cheerio";

const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent": "TrendPulseBot/1.0"
  }
});

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AFFILIATE_TAG = process.env.AFFILIATE_TAG || "Drackk-20";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Variables manquantes: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY");
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Mets ici tes sources.
// Garde seulement celles qui te donnent de bons résultats.
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
    .replace(/\s+/g, " ")
    .replace(/&nbsp;/g, " ")
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

function normalizeAmazonUrl(url) {
  if (!url) return null;

  try {
    const u = new URL(url);
    if (!/amazon\.com$/i.test(u.hostname) && !/^www\.amazon\.com$/i.test(u.hostname) && !/amzn\.to$/i.test(u.hostname)) {
      return url;
    }
    return u.toString();
  } catch {
    return url;
  }
}

async function fetchText(url) {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 TrendPulseBot/1.0"
      }
    });

    if (!res.ok) {
      console.log(`HTTP ${res.status} pour ${url}`);
      return null;
    }

    return await res.text();
  } catch (error) {
    console.log(`Erreur fetch ${url}: ${error.message}`);
    return null;
  }
}

async function resolveFinalUrl(url) {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 TrendPulseBot/1.0"
      }
    });

    return res.url || url;
  } catch {
    return url;
  }
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

async function extractDealFromArticle(item) {
  const sourceUrl = item.link;
  const sourceTitle = cleanText(item.title);
  const sourceDescription = cleanText(item.contentSnippet || item.content || "");

  if (!sourceUrl) return null;

  console.log(`Analyse: ${sourceTitle}`);

  const html = await fetchText(sourceUrl);
  if (!html) return null;

  const foundLinks = extractAmazonLinksFromHtml(html);
  if (!foundLinks.length) {
    console.log("Aucun lien Amazon trouvé");
    return null;
  }

  for (const rawLink of foundLinks) {
    const normalized = normalizeAmazonUrl(rawLink);
    const finalUrl = await resolveFinalUrl(normalized);
    const asin = extractAsinFromAmazonUrl(finalUrl) || extractAsinFromAmazonUrl(normalized);

    if (!isValidAsin(asin)) continue;

    const affiliateLink = buildAffiliateLink(asin);
    const imageUrl = buildAmazonImage(asin);

    const product = {
      asin,
      name: sourceTitle || `Amazon Deal ${asin}`,
      tagline: "Hot Amazon deal",
      description: sourceDescription || "Amazing Amazon deal found automatically.",
      price: null,
      original_price: null,
      discount_percent: null,
      image_url: imageUrl,
      affiliate_link: affiliateLink,
      category: "All",
      likes: 0,
      nopes: 0,
      source_url: sourceUrl,
      source_name: new URL(sourceUrl).hostname,
      amazon_url: finalUrl,
      is_active: true,
      updated_at: new Date().toISOString()
    };

    return product;
  }

  console.log("Aucun ASIN valide trouvé");
  return null;
}

async function fetchFeedItems(feedUrl) {
  try {
    const feed = await parser.parseURL(feedUrl);
    return (feed.items || []).slice(0, 10);
  } catch (error) {
    console.log(`Erreur flux ${feedUrl}: ${error.message}`);
    return [];
  }
}

async function upsertProducts(products) {
  if (!products.length) {
    console.log("Aucun produit à insérer");
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

  console.log(`${products.length} produits upsert`);
}

async function main() {
  console.log("Début sync");

  const allItems = [];
  for (const feedUrl of FEEDS) {
    const items = await fetchFeedItems(feedUrl);
    console.log(`${items.length} items lus depuis ${feedUrl}`);
    allItems.push(...items);
    await sleep(1000);
  }

  const uniqueArticles = [];
  const seenArticleLinks = new Set();

  for (const item of allItems) {
    const link = item.link?.trim();
    if (!link || seenArticleLinks.has(link)) continue;
    seenArticleLinks.add(link);
    uniqueArticles.push(item);
  }

  console.log(`${uniqueArticles.length} articles uniques`);

  const results = [];
  const seenAsins = new Set();

  for (const item of uniqueArticles) {
    try {
      const product = await extractDealFromArticle(item);
      if (!product) continue;
      if (seenAsins.has(product.asin)) continue;

      seenAsins.add(product.asin);
      results.push(product);

      await sleep(1500);
    } catch (error) {
      console.log(`Erreur article: ${error.message}`);
    }
  }

  console.log(`${results.length} produits valides trouvés`);

  await upsertProducts(results);

  console.log("Fin sync");
}

main().catch(error => {
  console.error("Erreur fatale:", error);
  process.exit(1);
});
