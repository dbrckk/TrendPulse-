import fs from "fs";
import os from "os";
import path from "path";
import puppeteer from "puppeteer";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL = process.env.SITE_URL || "https://trend-pulse.shop";

const STATE_FILE = "tweet-state.json";
const SESSION_FILE = "x-session.json";

const MIN_MINUTES = 40;
const MAX_MINUTES = 80;
const MAX_RECENT_ASINS = 12;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

function randomDelayMinutes() {
  return Math.floor(Math.random() * (MAX_MINUTES - MIN_MINUTES + 1)) + MIN_MINUTES;
}

function isoAfterMinutes(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function loadJsonFile(filepath, fallbackValue) {
  if (!fs.existsSync(filepath)) return fallbackValue;
  try {
    return JSON.parse(fs.readFileSync(filepath, "utf8"));
  } catch {
    return fallbackValue;
  }
}

function saveJsonFile(filepath, value) {
  fs.writeFileSync(filepath, JSON.stringify(value, null, 2), "utf8");
}

function loadState() {
  return loadJsonFile(STATE_FILE, {
    next_post_at: isoAfterMinutes(randomDelayMinutes()),
    last_posted_asin: null,
    last_posted_at: null,
    last_posted_category: null,
    recent_asins: []
  });
}

function saveState(state) {
  saveJsonFile(STATE_FILE, state);
}

function loadSession() {
  return loadJsonFile(SESSION_FILE, {
    cookies: []
  });
}

function saveSession(session) {
  saveJsonFile(SESSION_FILE, session);
}

function shouldPost(state) {
  if (!state.next_post_at) return true;
  return Date.now() >= new Date(state.next_post_at).getTime();
}

function slugToUrl(deal) {
  return `${SITE_URL}/deal/${deal.asin}/${slugify(deal.name)}/`;
}

function formatPrice(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  return `$${n.toFixed(n % 1 === 0 ? 0 : 2)}`;
}

function truncateForTweet(text, maxLen = 280) {
  if (text.length <= maxLen) return text;
  return text.slice(0, Math.max(0, maxLen - 1)).trimEnd() + "…";
}

function categoryHashtag(category) {
  const map = {
    Tech: "#TechDeals",
    Kitchen: "#KitchenDeals",
    Beauty: "#BeautyDeals",
    Home: "#HomeDeals",
    Fitness: "#FitnessDeals",
    Kids: "#KidsDeals",
    All: "#AmazonDeals"
  };
  return map[category] || "#AmazonDeals";
}

function buildTweetText(deal) {
  const url = slugToUrl(deal);
  const price = formatPrice(deal.price);
  const discount = Number(deal.discount_percent || 0);
  const hashtag = categoryHashtag(String(deal.category || "All").trim());

  const templates = [];

  if (price && discount >= 40) {
    templates.push(`🚨 BIG DEAL ALERT\n${deal.name}\nNow ${price} (-${Math.round(discount)}%)\n${hashtag}\n${url}`);
    templates.push(`🔥 This one stands out\n${deal.name}\nDown to ${price} right now\n${hashtag}\n${url}`);
  }

  if (price && discount > 0) {
    templates.push(`💥 Amazon price drop\n${deal.name}\nNow ${price} with ${Math.round(discount)}% off\n${hashtag}\n${url}`);
    templates.push(`👀 Worth checking right now\n${deal.name}\nOnly ${price} today\n${hashtag}\n${url}`);
    templates.push(`⚡ Deal spotted on TrendPulse\n${deal.name}\nNow ${price}\n${hashtag}\n${url}`);
  }

  if (price) {
    templates.push(`🔥 Amazon deal worth checking\n${deal.name}\nOnly ${price}\n${hashtag}\n${url}`);
  }

  templates.push(`👀 Spotted on TrendPulse\n${deal.name}\n${hashtag}\n${url}`);

  return truncateForTweet(
    templates[Math.floor(Math.random() * templates.length)],
    280
  );
}

function baseScore(item) {
  return Number(item.score || 0) + Number(item.likes || 0) * 2 - Number(item.nopes || 0);
}

function priorityScore(item) {
  let score = baseScore(item);

  const discount = Number(item.discount_percent || 0);
  const price = Number(item.price || 0);

  if (discount >= 50) score += 60;
  else if (discount >= 40) score += 40;
  else if (discount >= 30) score += 25;
  else if (discount >= 20) score += 12;

  if (price > 0 && price <= 25) score += 28;
  else if (price > 0 && price <= 50) score += 15;
  else if (price > 0 && price <= 100) score += 7;

  if (score >= 80) score += 12;

  return score;
}

async function fetchCandidateDeals() {
  const { data, error } = await sb
    .from("products")
    .select("asin, name, price, original_price, discount_percent, category, score, likes, nopes, is_active, image_url, clicks")
    .eq("is_active", true)
    .not("asin", "is", null)
    .order("score", { ascending: false })
    .limit(150);

  if (error) throw error;
  return data || [];
}

function weightedShuffle(items) {
  return [...items]
    .map(item => ({
      item,
      weight: Math.random() * Math.max(1, priorityScore(item))
    }))
    .sort((a, b) => b.weight - a.weight)
    .map(x => x.item);
}

function pickDeal(candidates, state) {
  const recentAsins = Array.isArray(state.recent_asins) ? state.recent_asins : [];

  const baseFiltered = candidates
    .filter(d => d.asin && d.name)
    .filter(d => !recentAsins.includes(d.asin));

  if (!baseFiltered.length) return null;

  const categoryDifferent = baseFiltered.filter(d => {
    if (!state.last_posted_category) return true;
    return String(d.category || "All") !== String(state.last_posted_category);
  });

  const usable = categoryDifferent.length ? categoryDifferent : baseFiltered;

  const sorted = [...usable].sort((a, b) => priorityScore(b) - priorityScore(a));
  const topPool = sorted.slice(0, Math.min(30, sorted.length));
  const shuffledWeighted = weightedShuffle(topPool);

  return shuffledWeighted[0] || null;
}

async function clickButtonByText(page, textOptions) {
  const clicked = await page.evaluate((texts) => {
    const nodes = Array.from(document.querySelectorAll('div[role="button"], button, a[role="button"], a, span'));
    for (const el of nodes) {
      const txt = (el.innerText || el.textContent || "").trim().toLowerCase();
      if (!txt) continue;
      if (texts.some(t => txt === t || txt.includes(t))) {
        const target = el.closest('div[role="button"], button, a[role="button"], a') || el;
        target.click();
        return true;
      }
    }
    return false;
  }, textOptions.map(t => t.toLowerCase()));

  return clicked;
}

async function saveCookies(page) {
  const browserCookies = await page.browserContext().cookies();
  saveSession({ cookies: browserCookies });
  console.log(`Saved ${browserCookies.length} cookies to ${SESSION_FILE}`);
}

async function loadCookies(page) {
  const session = loadSession();
  if (!session.cookies || !session.cookies.length) {
    console.log("No saved session cookies found");
    return false;
  }

  try {
    await page.browserContext().setCookie(...session.cookies);
    console.log(`Loaded ${session.cookies.length} cookies from ${SESSION_FILE}`);
    return true;
  } catch (err) {
    console.log("Could not load saved cookies:", err.message);
    return false;
  }
}

async function saveDebugArtifacts(page, prefix) {
  try {
    const url = page.url();
    const text = await page.evaluate(() => document.body.innerText.slice(0, 3000));
    const html = await page.content();

    fs.writeFileSync(`${prefix}-url.txt`, url, "utf8");
    fs.writeFileSync(`${prefix}-text.txt`, text, "utf8");
    fs.writeFileSync(`${prefix}.html`, html, "utf8");

    try {
      await page.screenshot({ path: `${prefix}.png`, fullPage: true });
    } catch {}
  } catch {}
}

async function isLoggedIn(page) {
  await page.goto("https://x.com/home", {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  await sleep(5000);

  const url = page.url().toLowerCase();
  if (!url.includes("/home")) return false;

  const bodyText = await page.evaluate(() => document.body.innerText.toLowerCase());
  if (
    bodyText.includes("for you") ||
    bodyText.includes("following") ||
    bodyText.includes("what is happening") ||
    bodyText.includes("home")
  ) {
    return true;
  }

  const hasComposer = await page.evaluate(() => {
    return !!document.querySelector(
      'a[href="/compose/post"], div[data-testid="SideNav_NewTweet_Button"], div[data-testid="tweetTextarea_0"], div[role="textbox"]'
    );
  });

  return hasComposer;
}

async function ensureLoggedIn(page) {
  const loaded = await loadCookies(page);

  if (!loaded) {
    throw new Error("No valid X session found. Create x-session.json manually and store it in GitHub.");
  }

  const ok = await isLoggedIn(page);
  if (ok) {
    console.log("Using saved X session");
    return;
  }

  await saveDebugArtifacts(page, "debug-invalid-session");
  throw new Error("Saved X session is invalid or expired. Refresh x-session.json.");
}

async function downloadImageToTemp(url, asin) {
  if (!url) return null;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 TrendPulseBot/9.0"
      }
    });

    if (!response.ok) {
      console.log(`Image download failed with status ${response.status}`);
      return null;
    }

    const contentType = response.headers.get("content-type") || "";
    let ext = ".jpg";

    if (contentType.includes("png")) ext = ".png";
    if (contentType.includes("webp")) ext = ".webp";
    if (contentType.includes("jpeg")) ext = ".jpg";
    if (contentType.includes("jpg")) ext = ".jpg";

    const tempPath = path.join(os.tmpdir(), `trendpulse-source-${asin}${ext}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(tempPath, buffer);

    return tempPath;
  } catch (err) {
    console.log("Could not download image:", err.message);
    return null;
  }
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildBrandedCardHtml(deal, imageUrl, styleVariant) {
  const price = formatPrice(deal.price) || "Check price";
  const originalPrice = formatPrice(deal.original_price);
  const discount = Number(deal.discount_percent || 0);
  const badge = discount > 0 ? `-${Math.round(discount)}% OFF` : "HOT DEAL";
  const category = deal.category || "Amazon Deal";
  const safeName = escapeHtml(deal.name || "Trending Deal");
  const safeCategory = escapeHtml(category);
  const safeImage = escapeHtml(imageUrl || "");
  const safeBadge = escapeHtml(badge);
  const bg1 = "#050505";
  const bg2 = "#0b1220";

  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        width: 1200px;
        height: 675px;
        font-family: Arial, sans-serif;
        background:
          radial-gradient(circle at top right, rgba(37,99,235,.35), transparent 28%),
          linear-gradient(180deg, ${bg1} 0%, ${bg2} 100%);
        color: white;
      }
      .frame { width: 1200px; height: 675px; padding: 28px; }
      .card {
        width: 100%;
        height: 100%;
        display: grid;
        grid-template-columns: 1.05fr 0.95fr;
        background: linear-gradient(180deg, #111722 0%, #090b11 100%);
        border: 1px solid rgba(255,255,255,.09);
        border-radius: 34px;
        overflow: hidden;
      }
      .left {
        background: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 34px;
      }
      .left img {
        width: 100%;
        height: 100%;
        object-fit: contain;
      }
      .right {
        padding: 34px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      }
      .brand {
        font-size: 20px;
        font-weight: 900;
        letter-spacing: .18em;
        text-transform: uppercase;
        color: #93c5fd;
        margin-bottom: 10px;
      }
      .badge {
        display: inline-block;
        padding: 10px 14px;
        border-radius: 999px;
        background: linear-gradient(135deg, #ff4d4d, #ff7a18);
        font-weight: 900;
        font-size: 18px;
        letter-spacing: .05em;
        align-self: flex-start;
        margin-bottom: 18px;
      }
      .category {
        color: #93c5fd;
        font-size: 18px;
        font-weight: 900;
        letter-spacing: .14em;
        text-transform: uppercase;
        margin-bottom: 14px;
      }
      .title {
        font-size: 54px;
        line-height: .98;
        font-weight: 900;
        letter-spacing: -.05em;
        font-style: italic;
        display: -webkit-box;
        -webkit-line-clamp: 4;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .old {
        color: #71717a;
        font-size: 24px;
        text-decoration: line-through;
        font-weight: 700;
        margin-bottom: 4px;
      }
      .price {
        font-size: 68px;
        line-height: 1;
        font-weight: 900;
        letter-spacing: -.05em;
      }
      .footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        margin-top: 24px;
      }
      .cta {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 18px 22px;
        border-radius: 20px;
        background: linear-gradient(180deg, #3275ff 0%, #1d4ed8 100%);
        font-weight: 900;
        font-size: 22px;
        letter-spacing: .08em;
        text-transform: uppercase;
      }
      .site {
        color: #c4c4cc;
        font-size: 18px;
        font-weight: 700;
      }
    </style>
  </head>
  <body>
    <div class="frame">
      <div class="card">
        <div class="left">
          <img src="${safeImage}" alt="">
        </div>
        <div class="right">
          <div>
            <div class="brand">TrendPulse</div>
            <div class="badge">${safeBadge}</div>
            <div class="category">${safeCategory}</div>
            <div class="title">${safeName}</div>
          </div>

          <div>
            ${originalPrice ? `<div class="old">${escapeHtml(originalPrice)}</div>` : ""}
            <div class="price">${escapeHtml(price)}</div>
            <div class="footer">
              <div class="cta">Get Deal</div>
              <div class="site">trend-pulse.shop</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </body>
  </html>`;
}

async function generateBrandedImage(deal, localImagePath) {
  const outputPath = path.join(os.tmpdir(), `trendpulse-card-${deal.asin}.png`);
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage"
    ]
  });

  const styleVariant = [1, 2, 3][Math.floor(Math.random() * 3)];

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 675, deviceScaleFactor: 1 });

    const imageUrl = localImagePath
      ? `file://${localImagePath}`
      : `https://images.amazon.com/images/P/${deal.asin}.01._SX500_.jpg`;

    const html = buildBrandedCardHtml(deal, imageUrl, styleVariant);
    await page.setContent(html, { waitUntil: "networkidle0" });

    await page.screenshot({
      path: outputPath,
      type: "png"
    });

    return outputPath;
  } finally {
    await browser.close();
  }
}

async function attachImageIfPossible(page, imagePath) {
  if (!imagePath || !fs.existsSync(imagePath)) {
    console.log("No image file available for upload");
    return false;
  }

  const inputSelectors = [
    'input[data-testid="fileInput"]',
    'input[type="file"]'
  ];

  for (const selector of inputSelectors) {
    try {
      const input = await page.waitForSelector(selector, { timeout: 10000 });
      await input.uploadFile(imagePath);
      await sleep(5000);
      console.log("Image uploaded to composer");
      return true;
    } catch {}
  }

  console.log("Could not find image upload input on X");
  return false;
}

async function publishTweet(page, text, imagePath = null) {
  await page.goto("https://x.com/compose/post", {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  await sleep(5000);

  const editorSelectors = [
    'div[data-testid="tweetTextarea_0"]',
    'div[role="textbox"]',
    'div[contenteditable="true"]'
  ];

  let editorFound = false;
  for (const selector of editorSelectors) {
    try {
      await page.waitForSelector(selector, { timeout: 10000 });
      await page.click(selector);
      await page.keyboard.type(text, { delay: 18 });
      editorFound = true;
      break;
    } catch {}
  }

  if (!editorFound) {
    await saveDebugArtifacts(page, "debug-compose-step");
    throw new Error("Could not find tweet editor");
  }

  await sleep(1500);

  if (imagePath) {
    await attachImageIfPossible(page, imagePath);
  }

  await sleep(2000);

  const posted = await clickButtonByText(page, ["post", "tweet", "publier"]);
  if (!posted) {
    await saveDebugArtifacts(page, "debug-post-button-step");
    throw new Error("Could not find post button");
  }

  await sleep(6000);
  await saveCookies(page);
}

async function postDealToX(deal, text) {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage"
    ]
  });

  let sourceImagePath = null;
  let brandedImagePath = null;

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 900 });
    await page.setUserAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36");

    await ensureLoggedIn(page);

    sourceImagePath = await downloadImageToTemp(
      deal.image_url || `https://images.amazon.com/images/P/${deal.asin}.01._SX500_.jpg`,
      deal.asin
    );

    brandedImagePath = await generateBrandedImage(deal, sourceImagePath);

    await publishTweet(page, text, brandedImagePath);
  } finally {
    for (const file of [sourceImagePath, brandedImagePath]) {
      if (file && fs.existsSync(file)) {
        try {
          fs.unlinkSync(file);
        } catch {}
      }
    }
    await browser.close();
  }
}

function updateRecentAsins(state, asin) {
  const list = Array.isArray(state.recent_asins) ? state.recent_asins : [];
  return [asin, ...list.filter(x => x !== asin)].slice(0, MAX_RECENT_ASINS);
}

async function main() {
  const state = loadState();

  if (!shouldPost(state)) {
    console.log(`Not time yet. Next post at ${state.next_post_at}`);
    return;
  }

  const candidates = await fetchCandidateDeals();

  if (!candidates.length) {
    console.log("No active deals available for posting");
    state.next_post_at = isoAfterMinutes(randomDelayMinutes());
    saveState(state);
    return;
  }

  const deal = pickDeal(candidates, state);

  if (!deal) {
    console.log("No eligible deal found");
    state.next_post_at = isoAfterMinutes(randomDelayMinutes());
    saveState(state);
    return;
  }

  const tweetText = buildTweetText(deal);
  console.log(`Posting deal: ${deal.asin} - ${deal.name}`);
  console.log(tweetText);

  await postDealToX(deal, tweetText);

  state.last_posted_asin = deal.asin;
  state.last_posted_at = new Date().toISOString();
  state.last_posted_category = deal.category || "All";
  state.recent_asins = updateRecentAsins(state, deal.asin);
  state.next_post_at = isoAfterMinutes(randomDelayMinutes());

  saveState(state);
  console.log(`Next post scheduled around ${state.next_post_at}`);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
