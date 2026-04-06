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
      safeNumber(product.priority, 0) * 4 +
      safeNumber(product.likes, 0) * 2 +
      safeNumber(product.clicks, 0) * 1.5 +
      safeNumber(product.views, 0) * 0.15
    );
  }

  function setStatus(text) {
    const status = document.getElementById("home-status");
    if (status) status.textContent = text;
  }

  async function loadDeals() {
    if (!window.TrendPulseData) {
      console.error("TrendPulseData not ready");
      setStatus("Failed to load products");
      return;
    }

    const container = document.getElementById("deals");
    if (!container) {
      console.error("Missing #deals container");
      return;
    }

    try {
      setStatus("Loading products...");

      let products = [];

      if (typeof window.TrendPulseData.fetchHomeFeed === "function") {
        products = await window.TrendPulseData.fetchHomeFeed();
      } else if (typeof window.TrendPulseData.fetchDeals === "function") {
        products = await window.TrendPulseData.fetchDeals(24);

        if (!products.length && typeof window.TrendPulseData.fetchTopProducts === "function") {
          products = await window.TrendPulseData.fetchTopProducts(24);
        }
      } else if (typeof window.TrendPulseData.fetchTopProducts === "function") {
        products = await window.TrendPulseData.fetchTopProducts(24);
      }

      products = (products || [])
        .map((p) => ({
          ...p,
          score: computeScore(p)
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 24);

      if (window.TrendPulseUI && typeof window.TrendPulseUI.renderProducts === "function") {
        window.TrendPulseUI.renderProducts(products, container);
      } else {
        console.error("TrendPulseUI not ready");
        setStatus("Failed to render products");
        return;
      }

      setStatus(`${products.length} ${products.length === 1 ? "product" : "products"} loaded`);
    } catch (err) {
      console.error("loadDeals error:", err);

      if (window.TrendPulseUI && typeof window.TrendPulseUI.renderProducts === "function") {
        window.TrendPulseUI.renderProducts([], container);
      }

      setStatus("Failed to load products");
    }
  }

  window.loadDeals = loadDeals;
})();
