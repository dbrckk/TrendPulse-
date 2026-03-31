import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL = process.env.SITE_URL || "https://trend-pulse.shop";

const X_EMAIL = process.env.X_EMAIL || "";
const X_USERNAME = process.env.X_USERNAME || "";
const X_PASSWORD = process.env.X_PASSWORD || "";
const X_PHONE = process.env.X_PHONE || "";

const SESSION_FILE = path.resolve(".x-session.json");
const STATE_FILE = path.resolve(".tweet-state.json");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function safeReadJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function safeWriteJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function formatPrice(v) {
  const n = Number(v || 0);
  if (!Number.isFinite(n) || n <= 0) return "Check price";
  return `$${n.toFixed(n % 1 === 0 ? 0 : 2)}`;
}

function pickHashtag(product) {
  const category = String(product.category || "").toLowerCase();

  if (category.includes("tech")) return "#TechDeals";
  if (category.includes("fashion")) return "#FashionDeals";
  if (category.includes("jewelry")) return "#JewelryDeals";
  if (category.includes("shoes")) return "#ShoeDeals";
  if (category.includes("sports")) return "#SportsDeals";
  if (category.includes("health")) return "#HealthDeals";
  if (category.includes("baby")) return "#BabyDeals";
  if (category.includes("pets")) return "#PetDeals";
  if (category.includes("office")) return "#OfficeDeals";
  if (category.includes("gaming")) return "#GamingDeals";
  if (category.includes("outdoor")) return "#OutdoorDeals";
  if (category.includes("home")) return "#HomeDeals";
  if (category.includes("kitchen")) return "#KitchenDeals";
  if (category.includes("beauty")) return "#BeautyDeals";

  return "#AmazonDeals";
}

function buildTweetText(product) {
  const hooks = shuffle([
    "🔥 Amazon deal worth checking",
    "⚡ Strong Amazon price drop",
    "👀 This one stands out",
    "💸 Good Amazon deal live now",
    "🛒 Popular Amazon pick on sale",
    "🔥 Spotted on TrendPulse"
  ]);

  const lines = [];
  lines.push(hooks[0]);

  if (product.name) {
    lines.push(String(product.name).trim());
  }

  if (product.price) {
    if (product.discount_percent) {
      lines.push(`Now ${formatPrice(product.price)} with ${Math.round(Number(product.discount_percent))}% off`);
    } else {
      lines.push(`Now ${formatPrice(product.price)}`);
    }
  } else if (product.discount_percent) {
    lines.push(`${Math.round(Number(product.discount_percent))}% off right now`);
  }

  lines.push(pickHashtag(product));
  lines.push(`${SITE_URL}/deal.html?asin=${encodeURIComponent(product.asin)}`);

  return lines.join("\n").slice(0, 280);
}

function getTweetedAsins() {
  const state = safeReadJson(STATE_FILE, { tweeted_asins: [] });
  return Array.isArray(state.tweeted_asins) ? state.tweeted_asins : [];
}

function saveTweetedAsin(asin) {
  const state = safeReadJson(STATE_FILE, { tweeted_asins: [] });
  const set = new Set(Array.isArray(state.tweeted_asins) ? state.tweeted_asins : []);
  set.add(asin);

  const trimmed = [...set].slice(-300);
  safeWriteJson(STATE_FILE, { tweeted_asins: trimmed, updated_at: new Date().toISOString() });
}

async function getCandidateProducts() {
  const tweetedAsins = getTweetedAsins();

  const { data, error } = await sb
    .from("products")
    .select("*")
    .eq("is_active", true)
    .order("score", { ascending: false })
    .limit(120);

  if (error) throw error;

  const rows = data || [];
  const filtered = rows.filter(p => !tweetedAsins.includes(p.asin));

  if (filtered.length > 0) return filtered;
  return rows;
}

async function chooseProduct() {
  const candidates = await getCandidateProducts();

  if (!candidates.length) {
    throw new Error("No product available to tweet");
  }

  const top = candidates.slice(0, 25);
  return top[rand(0, Math.max(0, top.length - 1))];
}

async function saveSession(page) {
  const cookies = await page.cookies();
  safeWriteJson(SESSION_FILE, {
    saved_at: new Date().toISOString(),
    cookies
  });
  console.log(`Saved ${cookies.length} cookies to ${SESSION_FILE}`);
}

async function restoreSession(page) {
  if (!fs.existsSync(SESSION_FILE)) {
    console.log("No saved session file found");
    return false;
  }

  const session = safeReadJson(SESSION_FILE, null);
  if (!session?.cookies || !Array.isArray(session.cookies) || session.cookies.length === 0) {
    console.log("Saved session file exists but is empty");
    return false;
  }

  try {
    await page.setCookie(...session.cookies);
    console.log(`Restored ${session.cookies.length} cookies`);
    return true;
  } catch (error) {
    console.log(`Failed restoring cookies: ${error.message}`);
    return false;
  }
}

async function gotoWithRetry(page, url, attempts = 3) {
  let lastError = null;

  for (let i = 0; i < attempts; i += 1) {
    try {
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 60000
      });
      return;
    } catch (error) {
      lastError = error;
      await sleep(1500);
    }
  }

  throw lastError;
}

async function waitForAny(page, selectors, timeout = 20000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    for (const selector of selectors) {
      const el = await page.$(selector);
      if (el) return { selector, el };
    }
    await sleep(300);
  }

  return null;
}

async function clickIfExists(page, selectors) {
  for (const selector of selectors) {
    const el = await page.$(selector);
    if (el) {
      await el.click();
      return true;
    }
  }
  return false;
}

async function typeIntoFirst(page, selectors, value) {
  for (const selector of selectors) {
    const el = await page.$(selector);
    if (el) {
      await el.click({ clickCount: 3 });
      await page.keyboard.press("Backspace");
      await page.type(selector, value, { delay: rand(20, 60) });
      return true;
    }
  }
  return false;
}

async function isLoggedIn(page) {
  await gotoWithRetry(page, "https://x.com/home");

  await sleep(2500);

  const homeMarkers = [
    '[data-testid="SideNav_NewTweet_Button"]',
    '[data-testid="AppTabBar_Home_Link"]',
    '[aria-label="Home timeline"]',
    '[data-testid="primaryColumn"]'
  ];

  for (const selector of homeMarkers) {
    if (await page.$(selector)) {
      return true;
    }
  }

  const currentUrl = page.url();
  if (currentUrl.includes("/home")) return true;

  return false;
}

async function handlePossibleIntermediateStep(page) {
  const bodyText = await page.evaluate(() => document.body?.innerText || "");

  if (/phone, email, or username/i.test(bodyText) && X_USERNAME) {
    const typed = await typeIntoFirst(page, [
      'input[autocomplete="username"]',
      'input[name="text"]',
      'input[data-testid="ocfEnterTextTextInput"]'
    ], X_USERNAME);

    if (typed) {
      await sleep(500);
      await clickIfExists(page, [
        '[data-testid="ocfEnterTextNextButton"]',
        'div[role="button"][data-testid="LoginForm_Login_Button"]',
        'div[role="button"]'
      ]);
      await sleep(2500);
      return true;
    }
  }

  return false;
}

async function loginToX(page) {
  if (!X_EMAIL || !X_PASSWORD) {
    throw new Error("Missing X_EMAIL or X_PASSWORD for fallback login");
  }

  console.log("Performing fresh X login");

  await gotoWithRetry(page, "https://x.com/i/flow/login");
  await sleep(3000);

  const usernameInputFound = await typeIntoFirst(page, [
    'input[autocomplete="username"]',
    'input[name="text"]',
    'input[data-testid="ocfEnterTextTextInput"]'
  ], X_EMAIL);

  if (!usernameInputFound) {
    throw new Error("Could not find username/email input on X login page");
  }

  await sleep(rand(500, 900));

  await clickIfExists(page, [
    'div[role="button"] span',
    '[data-testid="LoginForm_Login_Button"]',
    'div[role="button"]'
  ]);

  await sleep(3500);

  const bodyTextAfterUser = await page.evaluate(() => document.body?.innerText || "");

  if (/enter your phone number or username/i.test(bodyTextAfterUser) || /phone, email, or username/i.test(bodyTextAfterUser)) {
    const secondaryValue = X_USERNAME || X_PHONE;
    if (!secondaryValue) {
      throw new Error("X requested an additional identifier but X_USERNAME/X_PHONE is missing");
    }

    const typed = await typeIntoFirst(page, [
      'input[autocomplete="username"]',
      'input[name="text"]',
      'input[data-testid="ocfEnterTextTextInput"]'
    ], secondaryValue);

    if (!typed) {
      throw new Error("Could not complete X intermediate identifier step");
    }

    await sleep(600);

    const clicked = await clickIfExists(page, [
      '[data-testid="ocfEnterTextNextButton"]',
      'div[role="button"]'
    ]);

    if (!clicked) {
      await page.keyboard.press("Enter");
    }

    await sleep(3000);
  }

  const passwordTyped = await typeIntoFirst(page, [
    'input[name="password"]',
    'input[autocomplete="current-password"]',
    'input[type="password"]'
  ], X_PASSWORD);

  if (!passwordTyped) {
    const preview = await page.evaluate(() => document.body?.innerText?.slice(0, 1200) || "");
    console.log("Password page preview:", preview);
    throw new Error("Could not find password input on X login page");
  }

  await sleep(rand(500, 900));

  const clicked = await clickIfExists(page, [
    '[data-testid="LoginForm_Login_Button"]',
    'div[role="button"]'
  ]);

  if (!clicked) {
    await page.keyboard.press("Enter");
  }

  await sleep(5000);

  const maybeHandled = await handlePossibleIntermediateStep(page);
  if (maybeHandled) {
    await sleep(3000);
  }

  const ok = await isLoggedIn(page);
  if (!ok) {
    throw new Error("Fresh login did not reach a logged-in state");
  }

  await saveSession(page);
}

async function ensureLoggedIn(page) {
  const restored = await restoreSession(page);

  if (restored) {
    const ok = await isLoggedIn(page);
    if (ok) {
      console.log("Logged in using saved session");
      return;
    }
    console.log("Saved session did not work, falling back to fresh login");
  }

  await loginToX(page);
}

async function composeAndPostTweet(page, text) {
  await gotoWithRetry(page, "https://x.com/compose/post");
  await sleep(4000);

  const composer = await waitForAny(page, [
    '[data-testid="tweetTextarea_0"]',
    'div[role="textbox"][data-testid="tweetTextarea_0"]',
    'div[role="textbox"]'
  ], 20000);

  if (!composer) {
    throw new Error("Could not find tweet composer");
  }

  await composer.el.click();
  await sleep(400);
  await page.keyboard.type(text, { delay: rand(15, 40) });
  await sleep(1200);

  const postButton = await waitForAny(page, [
    '[data-testid="tweetButtonInline"]',
    '[data-testid="tweetButton"]'
  ], 10000);

  if (!postButton) {
    throw new Error("Could not find post button");
  }

  await postButton.el.click();
  await sleep(5000);
}

async function main() {
  const product = await chooseProduct();
  const tweetText = buildTweetText(product);

  console.log(`Posting deal: ${product.asin} - ${product.name}`);
  console.log(tweetText);

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
      "--window-size=1400,1000"
    ]
  });

  try {
    const page = await browser.newPage();

    await page.setViewport({ width: 1400, height: 1000 });
    await page.setUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    );

    await ensureLoggedIn(page);
    await composeAndPostTweet(page, tweetText);
    await saveSession(page);
    saveTweetedAsin(product.asin);

    console.log("Tweet posted successfully");
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
