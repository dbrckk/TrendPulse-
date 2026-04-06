(function () {
  function getCategoryFromURL() {
    const parts = window.location.pathname.split("/").filter(Boolean);
    if (parts[0] === "catalog" && parts[1]) {
      return decodeURIComponent(parts[1]);
    }
    return null;
  }

  function capitalize(value) {
    return value
      ? value.charAt(0).toUpperCase() + value.slice(1)
      : "";
  }

  function computeScore(product) {
    return (
      (product.reviews || 0) * 0.4 +
      (product.rating || 0) * 100 * 0.3 +
      (product.discount || 0) * 10 * 0.2 +
      (product.priority || 0) * 4
    );
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const category = getCategoryFromURL();
    if (!category) return;

    const titleEl = document.getElementById("category-title");
    const descEl = document.getElementById("category-description");
    const countEl = document.getElementById("category-count");
    const container = document.getElementById("products");

    if (titleEl) titleEl.textContent = capitalize(category);
    if (descEl)
      descEl.textContent = `Top ${category} products based on demand and popularity`;

    if (!window.TrendPulseData || !window.TrendPulseUI) {
      console.error("Missing data or UI layer");
      return;
    }

    try {
      const products =
        await window.TrendPulseData.fetchCatalogByCategory(category, 100);

      const sorted = products
        .map((p) => ({
          ...p,
          score: computeScore(p)
        }))
        .sort((a, b) => b.score - a.score);

      if (window.TrendPulseUI) {
        window.TrendPulseUI.renderProducts(sorted, container);
      }

      if (countEl) {
        countEl.textContent = `${sorted.length} products`;
      }

      document.title = `${capitalize(category)} Products | TrendPulse`;
    } catch (err) {
      console.error("Category load error:", err);
      if (countEl) countEl.textContent = "Failed to load";
    }
  });
})();
