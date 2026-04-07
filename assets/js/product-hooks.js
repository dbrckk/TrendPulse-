(function () {
  function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function setStatus(text) {
    const status = document.getElementById("home-status");
    if (status) status.textContent = text;
  }

  function getContainer() {
    return document.getElementById("deals");
  }

  async function loadDeals() {
    const container = getContainer();

    if (!container) {
      console.error("Missing #deals container");
      return;
    }

    if (!window.TrendPulseData) {
      console.error("TrendPulseData not ready");
      setStatus("Failed to load products");
      return;
    }

    if (!window.TrendPulseUI || typeof window.TrendPulseUI.renderProducts !== "function") {
      console.error("TrendPulseUI not ready");
      setStatus("Failed to render products");
      return;
    }

    try {
      setStatus("Loading products...");

      let products = [];

      if (typeof window.TrendPulseData.fetchHomeFeed === "function") {
        products = await window.TrendPulseData.fetchHomeFeed(24);
      } else if (typeof window.TrendPulseData.fetchTopProducts === "function") {
        products = await window.TrendPulseData.fetchTopProducts(24);
      }

      products = Array.isArray(products) ? products : [];

      window.TrendPulseUI.renderProducts(products, container);

      if (!products.length) {
        setStatus("No products available right now");
        return;
      }

      const dealsCount = products.filter((p) => String(p.source_kind || "").toLowerCase() === "deal").length;
      const catalogCount = products.length - dealsCount;

      if (dealsCount > 0 && catalogCount > 0) {
        setStatus(`${products.length} products loaded (${dealsCount} deals + ${catalogCount} catalog)`);
      } else if (dealsCount > 0) {
        setStatus(`${products.length} deals loaded`);
      } else {
        setStatus(`${products.length} catalog products loaded`);
      }
    } catch (err) {
      console.error("loadDeals error:", err);
      window.TrendPulseUI.renderProducts([], container);
      setStatus("Failed to load products");
    }
  }

  function computeHomepageMetrics(products) {
    const items = Array.isArray(products) ? products : [];

    return {
      total: items.length,
      avgRating:
        items.length > 0
          ? items.reduce((sum, p) => sum + safeNumber(p.rating, 0), 0) / items.length
          : 0,
      avgDiscount:
        items.length > 0
          ? items.reduce((sum, p) => sum + safeNumber(p.discount, 0), 0) / items.length
          : 0
    };
  }

  window.TrendPulseHome = {
    loadDeals,
    computeHomepageMetrics
  };

  window.loadDeals = loadDeals;
})();
