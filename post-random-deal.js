import fs from "fs";
import os from "os";
import path from "path";
import puppeteer from "puppeteer";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL = process.env.SITE_URL || "https://trend-pulse.shop";

const X_USERNAME = process.env.X_USERNAME;
const X_PASSWORD = process.env.X_PASSWORD;
const X_EMAIL = process.env.X_EMAIL || "";

const STATE_FILE = "tweet-state.json";
const SESSION_FILE = "x-session.json";

const MIN_MINUTES = 40;
const MAX_MINUTES = 80;
const MAX_RECENT_ASINS = 12;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

if (!X_USERNAME || !X_PASSWORD) {
  throw new Error("Missing X_USERNAME or X_PASSWORD");
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

function scoreValue(item) {
  return Number(item.score || 0) + Number(item.likes || 0) * 2 - Number(item.nopes || 0);
}

function buildDealUrl(deal) {
  return `${SITE_URL}/deal/${deal.asin}/${slugify(deal.name)}/`;
}

function formatPrice(price) {
  if (price === null || price === undefined || price === "") return null;
  const n = Number(price);
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
  const url = buildDealUrl(deal);
  const price = formatPrice(deal.price);
  const discount = Number(deal.discount_percent || 0);
  const category = String(deal.category || "Amazon").trim();
  const hashtag = categoryHashtag(category);

  const templates = [];

  if (price && discount > 0) {
    templates.push(`🚨 DEAL ALERT\n${deal.name}\nNow ${price} (-${Math.round(discount)}%)\n${hashtag}\n${url}`);
    templates.push(`🔥 This ${category.toLowerCase()} deal looks strong\n${deal.name}\nOnly ${price} today\n${hashtag}\n${url}`);
    templates.push(`💥 Amazon price drop\n${deal.name}\nNow ${price} with ${Math.round(discount)}% off\n${hashtag}\n${url}`);
    templates.push(`👀 Worth checking right now\n${deal.name}\nLive for ${price}\n${hashtag}\n${url}`);
  }

  if (price) {
    templates.push(`🔥 Trending deal on TrendPulse\n${deal.name}\nCurrent price: ${price}\n${hashtag}\n${url}`);
    templates.push(`⚡ Amazon find worth a look\n${deal.name}\nNow ${price}\n${hashtag}\n${url}`);
  }

  templates.push(`🔥 Amazon deal worth checking\n${deal.name}\n${hashtag}\n${url}`);
  templates.push(`🚀 Spotted on TrendPulse\n${deal.name}\n${hashtag}\n${url}`);

  const chosen = templates[Math.floor(Math.random() * templates.length)];
  return truncateForTweet(chosen, 280);
}

async function fetchCandidateDeals() {
  const { data, error } = await sb
    .from("products")
    .select("asin, name, price, discount_percent, category, score, likes, nopes, is_active, image_url")
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
      weight: Math.random() * Math.max(1, scoreValue(item))
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

  const sorted = [...usable].sort((a, b) => scoreValue(b) - scoreValue(a));
  const topPool = sorted.slice(0, Math.min(30, sorted.length));
  const shuffledWeighted = weightedShuffle(topPool);

  return shuffledWeighted[0] || null;
}

async function typeLikeHuman(page, selector, value) {
  await page.waitForSelector(selector, { timeout: 20000 });
  await page.click(selector, { clickCount: 3 });
  await page.type(selector, value, { delay: 35 });
}

async function clickButtonByText(page, textOptions) {
  const clicked = await page.evaluate((texts) => {
    const candidates = Array.from(document.querySelectorAll('div[role="button"], button, a[role="button"]'));
    for (const el of candidates) {
      const txt = (el.innerText || el.textContent || "").trim().toLowerCase();
      if (texts.some(t => txt === t || txt.includes(t))) {
        el.click();
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

async function isLoggedIn(page) {
  await page.goto("https://x.com/home", {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  await page.waitForTimeout(5000);

  const url = page.url().toLowerCase();
  if (url.includes("/home")) {
    const hasComposer = await page.evaluate(() => {
      return !!document.querySelector('a[href="/compose/post"], div[data-testid="SideNav_NewTweet_Button"], div[data-testid="tweetTextarea_0"]');
    });
    if (hasComposer) return true;
  }

  const bodyText = await page.evaluate(() => document.body.innerText.toLowerCase());
  if (bodyText.includes("for you") || bodyText.includes("following") || bodyText.includes("what is happening")) {
    return true;
  }

  return false;
}

async function loginToX(page) {
  await page.goto("https://x.com/i/flow/login", {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  await page.waitForTimeout(3000);

  const userInputSelectors = [
    'input[autocomplete="username"]',
    'input[name="text"]',
    'input'
  ];

  let typedUser = false;
  for (const selector of userInputSelectors) {
    try {
      await page.waitForSelector(selector, { timeout: 5000 });
      await typeLikeHuman(page, selector, X_USERNAME);
      typedUser = true;
      break;
    } catch {}
  }

  if (!typedUser) {
    throw new Error("Could not find username input on X login page");
  }

  await page.waitForTimeout(1000);
  let nextClicked = await clickButtonByText(page, ["next", "suivant"]);
  if (!nextClicked) {
    await page.keyboard.press("Enter");
  }

  await page.waitForTimeout(3000);

  const bodyText = await page.evaluate(() => document.body.innerText.toLowerCase());
  const emailChallengeVisible =
    bodyText.includes("phone or email") ||
    bodyText.includes("enter your phone number or username") ||
    bodyText.includes("email");

  if (emailChallengeVisible && X_EMAIL) {
    const challengeInputs = [
      'input[data-testid="ocfEnterTextTextInput"]',
      'input[name="text"]',
      'input'
    ];

    let typedEmail = false;
    for (const selector of challengeInputs) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        await typeLikeHuman(page, selector, X_EMAIL);
        typedEmail = true;
        break;
      } catch {}
    }

    if (typedEmail) {
      await page.waitForTimeout(1000);
      const challengeNext = await clickButtonByText(page, ["next", "suivant"]);
      if (!challengeNext) {
        await page.keyboard.press("Enter");
      }
      await page.waitForTimeout(3000);
    }
  }

  const passwordSelectors = [
    'input[name="password"]',
    'input[autocomplete="current-password"]'
  ];

  let typedPassword = false;
  for (const selector of passwordSelectors) {
    try {
      await page.waitForSelector(selector, { timeout: 15000 });
      await typeLikeHuman(page, selector, X_PASSWORD);
      typedPassword = true;
      break;
    } catch {}
  }

  if (!typedPassword) {
    throw new Error("Could not find password input on X login page");
  }

  await page.waitForTimeout(1000);
  const loginClicked = await clickButtonByText(page, ["log in", "se connecter"]);
  if (!loginClicked) {
    await page.keyboard.press("Enter");
  }

  await page.waitForTimeout(7000);

  const loggedIn = await isLoggedIn(page);
  if (!loggedIn) {
    const finalBody = await page.evaluate(() => document.body.innerText.toLowerCase());
    if (
      finalBody.includes("confirmation code") ||
      finalBody.includes("verify") ||
      finalBody.includes("check your email") ||
      finalBody.includes("captcha") ||
      finalBody.includes("suspicious")
    ) {
      throw new Error("X requested an extra verification step (code/email/captcha).");
    }
    throw new Error("Login to X failed");
  }

  await saveCookies(page);
}

async function ensureLoggedIn(page) {
  const loaded = await loadCookies(page);

  if (loaded) {
    const ok = await isLoggedIn(page);
    if (ok) {
      console.log("Using saved X session");
      return;
    }
    console.log("Saved session is no longer valid");
  }

  console.log("Performing fresh X login");
  await loginToX(page);
}

async function downloadImageToTemp(url, asin) {
  if (!url) return null;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 TrendPulseBot/8.5"
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

    const tempPath = path.join(os.tmpdir(), `trendpulse-${asin}${ext}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(tempPath, buffer);

    return tempPath;
  } catch (err) {
    console.log("Could not download image:", err.message);
    return null;
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
      await page.waitForTimeout(5000);
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

  await page.waitForTimeout(5000);

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
    throw new Error("Could not find tweet editor");
  }

  await page.waitForTimeout(1500);

  if (imagePath) {
    await attachImageIfPossible(page, imagePath);
  }

  await page.waitForTimeout(2000);

  const posted = await clickButtonByText(page, ["post", "tweet", "publier"]);
  if (!posted) {
    throw new Error("Could not find post button");
  }

  await page.waitForTimeout(6000);
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

  let imagePath = null;

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 900 });
    await page.setUserAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36");

    await ensureLoggedIn(page);

    imagePath = await downloadImageToTemp(
      deal.image_url || `https://images.amazon.com/images/P/${deal.asin}.01._SX500_.jpg`,
      deal.asin
    );

    await publishTweet(page, text, imagePath);
  } finally {
    if (imagePath && fs.existsSync(imagePath)) {
      try {
        fs.unlinkSync(imagePath);
      } catch {}
    }
    await browser.close();
  }
}

function updateRecentAsins(state, asin) {
  const list = Array.isArray(state.recent_asins) ? state.recent_asins : [];
  const next = [asin, ...list.filter(x => x !== asin)].slice(0, MAX_RECENT_ASINS);
  return next;
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
