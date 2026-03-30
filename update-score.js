import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function updateScores() {
  const { data: products, error: productsError } = await sb
    .from("products")
    .select("asin, price, discount_percent, created_at, updated_at");

  if (productsError) {
    console.error(productsError);
    process.exit(1);
  }

  for (const p of products || []) {
    const { data: stats, error: statsError } = await sb
      .from("analytics")
      .select("event")
      .eq("asin", p.asin);

    if (statsError) {
      console.error(`Analytics error for ${p.asin}`, statsError);
      continue;
    }

    const views = (stats || []).filter(e => e.event === "view").length;
    const clicks = (stats || []).filter(e => e.event === "click").length;

    const ctr = views > 0 ? clicks / views : 0;

    let score = 0;

    score += Number(p.discount_percent || 0) * 1.5;
    score += clicks * 4;
    score += ctr * 120;

    const price = Number(p.price || 0);
    if (price > 0 && price < 25) score += 25;
    else if (price > 0 && price < 50) score += 15;

    if (views < 5) score *= 0.5;

    const { error: updateError } = await sb
      .from("products")
      .update({
        score: Math.round(score * 100) / 100,
        views,
        clicks
      })
      .eq("asin", p.asin);

    if (updateError) {
      console.error(`Update error for ${p.asin}`, updateError);
      continue;
    }

    console.log(`Updated ${p.asin} | views=${views} clicks=${clicks} score=${score}`);
  }
}

updateScores().catch(err => {
  console.error(err);
  process.exit(1);
});
