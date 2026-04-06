(function () {
  async function loadCollection() {
    const titleEl = document.getElementById("collection-title");
    const descEl = document.getElementById("collection-description");
    const countEl = document.getElementById("collection-count");
    const seoEl = document.getElementById("collection-seo-text");

    try {
      const pathParts = window.location.pathname.split("/").filter(Boolean);
      const slug =
        pathParts[0] === "collections" && pathParts[1]
          ? decodeURIComponent(pathParts[1])
          : "";

      if (!slug) {
        throw new Error("Missing collection slug");
      }

      const response = await fetch("/programmatic-pages.json");
      const pages = await response.json();
      const config = (pages || []).find((page) => page.slug === slug);

      if (!config) {
        throw new Error("Collection config not found");
      }

      if (titleEl) titleEl.textContent = config.title;
      if (descEl) descEl.textContent = config.description;
      if (seoEl) seoEl.textContent = config.seoText || config.description;
      if (countEl) countEl.textContent = "Loading products...";

      document.title = `${config.title} | TrendPulse`;

      const products = await window.TrendPulseData.fetchCollectionProducts(
        config,
        24
      );

      if (window.TrendPulseUI && typeof window.TrendPulseUI.renderProducts === "function") {
        window.TrendPulseUI.renderProducts(products, "#products");
      }

      if (countEl) {
        countEl.textContent = `${products.length} ${
          products.length === 1 ? "product" : "products"
        }`;
      }
    } catch (error) {
      console.error("COLLECTION ERROR:", error);

      const container = document.getElementById("products");
      if (container) {
        container.innerHTML = `
          <div class="rounded-2xl border border-red-900 bg-red-950/30 p-6 text-center text-red-300">
            Error loading collection
          </div>
        `;
      }

      if (descEl) descEl.textContent = "Error loading collection";
      if (countEl) countEl.textContent = "Error loading products";
    }
  }

  document.addEventListener("DOMContentLoaded", loadCollection);
})();
