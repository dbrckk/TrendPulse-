import fs from "fs";
import puppeteer from "puppeteer";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL = process.env.SITE_URL;

const SESSION_FILE = ".x-session.json";

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatPrice(v) {
  return `$${Number(v).toFixed(2)}`;
}

function buildTweet(p) {
  return `🔥 Amazon deal

${p.name}

Now ${formatPrice(p.price)}
#AmazonDeals

${SITE_URL}/deal.html?asin=${p.asin}`;
}

async function restoreSession(page) {
  if (!fs.existsSync(SESSION_FILE)) {
    throw new Error("NO SESSION FILE FOUND");
  }

  const cookies = JSON.parse(fs.readFileSync(SESSION_FILE));
  await page.setCookie(...cookies);
}

async function checkLogged(page) {
  await page.goto("https://x.com/home", { waitUntil: "domcontentloaded" });
  await sleep(3000);

  const el = await page.$('[data-testid="tweetTextarea_0"]');
  return !!el;
}

async function postTweet(page, text) {
  await page.goto("https://x.com/compose/post");
  await sleep(4000);

  const box = await page.$('[data-testid="tweetTextarea_0"]');
  if (!box) throw new Error("Tweet box not found");

  await box.click();
  await page.keyboard.type(text, { delay: 30 });

  await sleep(1500);

  const btn = await page.$('[data-testid="tweetButtonInline"]');
  if (!btn) throw new Error("Tweet button not found");

  await btn.click();

  await sleep(4000);
}

async function getProduct() {
  const { data } = await sb
    .from("products")
    .select("*")
    .eq("is_active", true)
    .order("score", { ascending: false })
    .limit(20);

  return data[Math.floor(Math.random() * data.length)];
}

async function main() {
  const product = await getProduct();
  const tweet = buildTweet(product);

  console.log("Posting:", product.name);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox"]
  });

  const page = await browser.newPage();

  await restoreSession(page);

  const ok = await checkLogged(page);

  if (!ok) {
    throw new Error("SESSION EXPIRED → relog manually");
  }

  await postTweet(page, tweet);

  await browser.close();

  console.log("Tweet success");
}

main().catch(e => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
