(function () {
  function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normalizeText(value) {
    return String(value || "").trim();
  }

  function renderProducts(products) {
    const container =
      document.querySelector("#collection-grid") ||
      document.querySelector("#products") ||
      document.querySelector("#products-container");

    if (!container) return;

    if (
      window.TrendPulseUI &&
      typeof window.TrendPulseUI.renderProducts === "function"
    ) {
      window.TrendPulseUI.renderProducts(products, container);
      return;
    }

    if (!products || !products.length) {
      container.innerHTML = `
        <div class="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-center text-zinc-400">
          No products found
        </div>
      `;
    }
  }

  function setEmptyState(isEmpty) {
    const emptyStateEl = document.getElementById("collection-empty-state");
    if (!emptyStateEl) return;
    emptyStateEl.classList.toggle("hidden", !isEmpty);
  }

  async function fetchProgrammaticPages() {
    const response = await fetch("/programmatic-pages.json?v=1", {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error("Failed to load programmatic-pages.json");
    }

    const pages = await response.json();

    if (!Array.isArray(pages)) {
      throw new Error("Invalid programmatic-pages.json format");
    }

    return pages;
  }

  async function loadCollection() {
    const titleEl = document.getElementById("collection-title");
    const descEl = document.getElementById("collection-description");
    const countEl = document.getElementById("collection-count");
    const seoEl = document.getElementById("collection-seo-text");
    const relatedLinksEl = document.getElementById("collection-related-links");
    const breadcrumbEl = document.getElementById("collection-breadcrumb");
    const canonicalEl = document.getElementById("canonical-url");

    try {
      const pathParts = window.location.pathname.split("/").filter(Boolean);
      const slug =
        pathParts[0] === "collections" && pathParts[1]
          ? decodeURIComponent(pathParts[1]).toLowerCase()
          : "";

      if (!slug) {
        throw new Error("Missing collection slug");
      }

      const pages = await fetchProgrammaticPages();
      const config = (pages || []).find(
        (page) => String(page.slug).toLowerCase() === String(slug).toLowerCase()
      );

      if (!config) {
        throw new Error("Collection config not found");
      }

      if (titleEl) titleEl.textContent = config.title;
      if (descEl) descEl.textContent = config.description;
      if (seoEl) seoEl.textContent = config.seoText || config.description;
      if (countEl) countEl.textContent = "Loading products...";
      if (breadcrumbEl) breadcrumbEl.textContent = config.title;

      document.title = `${config.title} | TrendPulse`;

      if (canonicalEl) {
        canonicalEl.setAttribute(
          "href",
          `https://www.trend-pulse.shop/collections/${encodeURIComponent(config.slug)}`
        );
      }

      if (!window.TrendPulseData) {
        throw new Error("TrendPulseData not ready");
      }

      let products = await window.TrendPulseData.fetchCollectionProducts(config, 24);
      products = Array.isArray(products) ? products : [];

      renderProducts(products);
      setEmptyState(products.length === 0);

      if (countEl) {
        countEl.textContent = `${products.length} ${
          products.length === 1 ? "product" : "products"
        }`;
      }

      if (relatedLinksEl) {
        const sameCategory = (pages || [])
          .filter(
            (page) =>
              page.slug !== config.slug &&
              String(page.category).toLowerCase() === String(config.category).toLowerCase()
          )
          .slice(0, 6);

        relatedLinksEl.innerHTML = sameCategory
          .map(
            (page) => `
              <a
                href="/collections/${encodeURIComponent(page.slug)}"
                class="rounded-full border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-white"
              >
                ${escapeHtml(page.title)}
              </a>
            `
          )
          .join("");
      }
    } catch (error) {
      console.error("COLLECTION ERROR:", error);

      renderProducts([]);
      setEmptyState(true);

      if (descEl) descEl.textContent = "Error loading collection";
      if (countEl) countEl.textContent = "Error loading products";
      if (seoEl && !seoEl.textContent.trim()) {
        seoEl.textContent = "Collection details unavailable right now.";
      }
    }
  }

  document.addEventListener("DOMContentLoaded", loadCollection);
})();
