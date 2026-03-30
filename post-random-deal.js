import fs from "fs";
import crypto from "crypto";
import OAuth from "oauth-1.0a";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL = process.env.SITE_URL || "https://trend-pulse.shop";

const X_API_KEY = process.env.X_API_KEY;
const X_API_KEY_SECRET = process.env.X_API_KEY_SECRET;
const X_ACCESS_TOKEN = process.env.X_ACCESS_TOKEN;
const X_ACCESS_TOKEN_SECRET = process.env.X_ACCESS_TOKEN_SECRET;

const STATE_FILE = "tweet-state.json";
const MIN_MINUTES = 40;
const MAX_MINUTES = 80;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

if (!X_API_KEY || !X_API_KEY_SECRET || !X_ACCESS_TOKEN || !X_ACCESS_TOKEN_SECRET) {
  throw new Error("Missing one or more X credentials");
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

function loadState() {
  if (!fs.existsSync(STATE_FILE)) {
    return {
      next_post_at: isoAfterMinutes(randomDelayMinutes()),
      last_posted_asin: null,
      last_posted_at: null
    };
  }

  try {
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return {
      next_post_at: isoAfterMinutes(randomDelayMinutes()),
      last_posted_asin: null,
      last_posted_at: null
    };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
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

function truncateForTweet(text, maxLen) {
  if (!text) return "";
  if (text.length <= maxLen) return text;
  return text.slice(0, Math.max(0, maxLen - 1)).trimEnd() + "…";
}

function buildTweetText(deal) {
  const url = buildDealUrl(deal);
  const category = deal.category ? `${deal.category} deal` : "Amazon deal";
  const price = deal.price ? `$${Number(deal.price).toFixed(Number(deal.price) % 1 === 0 ? 0 : 2)}` : "great price";
  const discount = Number(deal.discount_percent || 0);
  const discountPart = discount > 0 ? ` (-${Math.round(discount)}%)` : "";
  const base = `🔥 ${deal.name}${discountPart}\n${category} now at ${price}\n${url}`;
  return truncateForTweet(base, 280);
}

async function fetchCandidateDeals() {
  const { data, error } = await sb
    .from("products")
    .select("asin, name, price, discount_percent, category, score, likes, nopes, is_active")
    .eq("is_active", true)
    .not("asin", "is", null)
    .order("score", { ascending: false })
    .limit(120);

  if (error) throw error;
  return data || [];
}

function pickDeal(candidates, state) {
  const filtered = candidates
    .filter(d => d.asin && d.name)
    .filter(d => d.asin !== state.last_posted_asin);

  if (!filtered.length) return null;

  const sorted = [...filtered].sort((a, b) => scoreValue(b) - scoreValue(a));
  const topPool = sorted.slice(0, Math.min(25, sorted.length));
  const index = Math.floor(Math.random() * topPool.length);
  return topPool[index];
}

async function createXPost(text) {
  const url = "https://api.x.com/2/tweets";

  const oauth = new OAuth({
    consumer: {
      key: X_API_KEY,
      secret: X_API_KEY_SECRET
    },
    signature_method: "HMAC-SHA1",
    hash_function(baseString, key) {
      return crypto.createHmac("sha1", key).update(baseString).digest("base64");
    }
  });

  const requestData = {
    url,
    method: "POST"
  };

  const authHeader = oauth.toHeader(
    oauth.authorize(requestData, {
      key: X_ACCESS_TOKEN,
      secret: X_ACCESS_TOKEN_SECRET
    })
  );

  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...authHeader,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ text })
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(`X post failed: ${response.status} ${body}`);
  }

  return JSON.parse(body);
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

  const result = await createXPost(tweetText);
  console.log("X post created:", result?.data?.id || "unknown");

  state.last_posted_asin = deal.asin;
  state.last_posted_at = new Date().toISOString();
  state.next_post_at = isoAfterMinutes(randomDelayMinutes());

  saveState(state);
  console.log(`Next post scheduled around ${state.next_post_at}`);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
