(function () {
  function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function computeScore(product) {
    return (
      safeNumber(product.reviews, 0) * 0.4 +
      safeNumber(product.rating, 0) * 100 * 0.3 +
      safeNumber(product.discount, 0) * 10 * 0.2 +
      safeNumber(product.priority, 0) * 4
    );
  }

  function getHook(product) {
    const reviews = safeNumber(product.reviews, 0);
    const rating = safeNumber(product.rating, 0);
    const discount = safeNumber(product.discount, 0);

    if (discount >= 30) return "🔥 Big discount right now";
    if (reviews >= 5000) return "📈 Massively bought product";
    if (rating >= 4.6) return "⭐ Highly rated by buyers";
    return "🔥 Popular right now";
  }

  async function loadDeals() {
    if (!window.supabaseClient) {
      console.error("Supabase not ready");
      return;
    }

    const container = document.getElementById("deals");
    const status = document.getElementById("home-status");

    try {
      let { data: deals, error } = await window.supabaseClient
        .from("deals")
        .select("*")
        .limit(24);

      let products = [];

      if (!error && deals && deals.length > 0) {
        products = deals.map(window.TrendPulseData.normalizeProduct);
      } else {
        const fallback = await window.supabaseClient
          .from("products")
          .select("*")
          .limit(24);

        products = (fallback.data || []).map(
          window.TrendPulseData.normalizeProduct
        );
      }

      products = products
        .map((p) => ({
          ...p,
          score: computeScore(p)
        }))
        .sort((a, b) => b.score - a.score);

      if (window.TrendPulseUI) {
        window.TrendPulseUI.renderProducts(products, container);
      }

      if (status) {
        status.textContent = `${products.length} products loaded`;
      }
    } catch (err) {
      console.error("loadDeals error:", err);
      if (status) status.textContent = "Failed to load products";
    }
  }

  window.loadDeals = loadDeals;
})();
