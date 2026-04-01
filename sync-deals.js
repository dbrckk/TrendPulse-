// sync-deals.js

import fetch from "node-fetch";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function fetchProducts() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/products?select=*`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`
    }
  });

  return res.json();
}

async function updateScores(products) {
  for (const product of products) {
    const score =
      (product.views || 0) * 0.1 +
      (product.clicks || 0) * 0.3 +
      (product.is_best_seller ? 20 : 0) +
      (product.is_crazy_deal ? 15 : 0);

    await fetch(`${SUPABASE_URL}/rest/v1/products?id=eq.${product.id}`, {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ score })
    });
  }
}

async function main() {
  console.log("Sync started");

  const products = await fetchProducts();

  console.log(`Loaded ${products.length} products`);

  await updateScores(products);

  console.log("Scores updated");
}

main();
