import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function updateScores(){

  const { data: products } = await sb
    .from("products")
    .select("*");

  for (const p of products){

    const { data: events } = await sb
      .from("analytics")
      .select("*")
      .eq("asin", p.asin);

    let views = events.filter(e => e.event === "view").length;
    let clicks = events.filter(e => e.event === "click").length;

    let ctr = views > 0 ? clicks / views : 0;

    let score =
      (p.discount_percent || 0) * 2 +
      clicks * 5 +
      ctr * 100 +
      (p.price < 50 ? 20 : 0);

    await sb.from("products")
      .update({ score })
      .eq("asin", p.asin);

    console.log(p.asin, "score:", score);
  }

}

updateScores();
