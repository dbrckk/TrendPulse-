import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function updateScores(){

  const { data: products } = await sb
    .from("products")
    .select("asin, price, discount_percent");

  for(const p of products){

    const { data: stats } = await sb
      .from("analytics")
      .select("event")
      .eq("asin", p.asin);

    const views = stats.filter(e=>e.event==="view").length;
    const clicks = stats.filter(e=>e.event==="click").length;

    const ctr = views > 0 ? clicks / views : 0;

    let score = 0;

    // DISCOUNT
    score += (p.discount_percent || 0) * 1.5;

    // CLICKS
    score += clicks * 4;

    // CTR (puissant)
    score += ctr * 120;

    // LOW PRICE BONUS
    if(p.price < 25) score += 25;
    else if(p.price < 50) score += 15;

    // MINIMUM SCORE
    if(views < 5) score *= 0.5;

    await sb.from("products")
      .update({ score })
      .eq("asin", p.asin);

    console.log(p.asin, score);
  }

}

updateScores();
