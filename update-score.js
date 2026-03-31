import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function safeNum(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

function computeScore(product) {
  const baseScore = safeNum(product.score);
  const discount = safeNum(product.discount_percent);
  const price = safeNum(product.price);
  const views = safeNum(product.views);
  const clicks = safeNum(product.clicks);
  const likes = safeNum(product.likes);
  const nopes = safeNum(product.nopes);

  let score = 0;

  score += baseScore * 0.45;
  score += discount * 1.9;

  if (price > 0 && price <= 10) score += 18;
  else if (price <= 20) score += 14;
  else if (price <= 35) score += 10;
  else if (price <= 60) score += 6;
  else if (price <= 120) score += 3;

  score += clicks * 2.5;
  score += likes * 2.0;
  score += views * 0.08;
  score -= nopes * 2.2;

  const ctr = views > 0 ? clicks / views : 0;
  score += ctr * 140;

  if (discount >= 70 && price > 0 && price <= 60) score += 18;
  if (clicks >= 10) score += 8;
  if (likes >= 5) score += 5;
  if (views >= 50 && clicks === 0) score -= 10;

  return Math.max(0, Math.round(score * 100) / 100);
}

function inferBestSeller(product, finalScore) {
  const clicks = safeNum(product.clicks);
  const views = safeNum(product.views);
  const price = safeNum(product.price);
  const ctr = views > 0 ? clicks / views : 0;

  if (clicks >= 20) return true;
  if (finalScore >= 95) return true;
  if (ctr >= 0.12 && clicks >= 6) return true;
  if (price > 0 && price < 60 && finalScore >= 80) return true;

  return false;
}

function inferCrazyDeal(product, finalScore) {
  const discount = safeNum(product.discount_percent);
  const price = safeNum(product.price);

  if (discount >= 75 && price > 0 && price <= 80) return true;
  if (discount >= 65 && price > 0 && price <= 30 && finalScore >= 75) return true;

  return false;
}

async function main() {
  console.log("Updating product scores...");

  const { data, error } = await sb
    .from("products")
    .select("id, score, discount_percent, price, views, clicks, likes, nopes, is_best_seller, is_crazy_deal")
    .eq("is_active", true)
    .limit(1000);

  if (error) throw error;

  const rows = data || [];
  console.log(`Found ${rows.length} active products`);

  for (const product of rows) {
    const newScore = computeScore(product);
    const isBestSeller = inferBestSeller(product, newScore);
    const isCrazyDeal = inferCrazyDeal(product, newScore);

    const { error: updateError } = await sb
      .from("products")
      .update({
        score: newScore,
        is_best_seller: isBestSeller,
        is_crazy_deal: isCrazyDeal
      })
      .eq("id", product.id);

    if (updateError) {
      console.log(`Failed updating product ${product.id}: ${updateError.message}`);
    }
  }

  console.log("Score update complete");
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
