(function () {
  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function renderProducts(products) {
    const container =
      document.querySelector("#collection-grid") ||
      document.querySelector("#products") ||
      document.querySelector("#products-container");

    if (!container) return;

    if (window.TrendPulseUI && typeof window.TrendPulseUI.renderProducts === "function") {
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

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function setEmptyState(isEmpty) {
    const el = document.getElementById("collection-empty-state");
    if (!el) return;
    el.classList.toggle("hidden", !isEmpty);
  }

  async function fetchProgrammaticPages() {
    const res = await fetch("/programmatic-pages.json?v=2", {
      cache: "no-store"
    });

    if (!res.ok) {
      throw new Error("Failed to load programmatic-pages.json");
    }

    const pages = await res.json();

    if (!Array.isArray(pages)) {
      throw new Error("Invalid programmatic-pages.json format");
    }

    return pages;
  }

  function getSlugFromURL() {
    const parts = window.location.pathname.split("/").filter(Boolean);
    if (parts[0] === "collections" && parts[1]) {
      return decodeURIComponent(parts[1]).toLowerCase();
    }

    const params = new URLSearchParams(window.location.search);
    return String(params.get("slug") || "").toLowerCase();
  }

  async function loadCollection() {
    try {
      const slug = getSlugFromURL();

      if (!slug) {
        throw new Error("Missing collection slug");
      }

      const pages = await fetchProgrammaticPages();
      const config = pages.find(
        (page) => String(page?.slug || "").toLowerCase() === slug
      );

      if (!config) {
        throw new Error("Collection config not found");
      }

      setText("collection-title", config.title || "Collection");
      setText("collection-description", config.description || "");
      setText("collection-seo-text", config.seoText || config.description || "");
      setText("collection-breadcrumb", config.title || "Collection");
      setText("collection-count", "Loading products...");

      document.title = `${config.title} | TrendPulse`;

      const canonical = document.getElementById("canonical-url");
      if (canonical) {
        canonical.setAttribute(
          "href",
          `https://www.trend-pulse.shop/collections/${encodeURIComponent(config.slug)}`
        );
      }

      if (!window.TrendPulseData) {
        throw new Error("TrendPulseData not ready");
      }

      const products = await window.TrendPulseData.fetchCollectionProducts(config, 24);

      renderProducts(products);
      setEmptyState(!products.length);
      setText(
        "collection-count",
        `${products.length} ${products.length === 1 ? "product" : "products"}`
      );

      const relatedLinks = document.getElementById("collection-related-links");
      if (relatedLinks) {
        const related = pages
          .filter(
            (page) =>
              String(page?.slug || "").toLowerCase() !== slug &&
              String(page?.category || "").toLowerCase() === String(config.category || "").toLowerCase()
          )
          .slice(0, 6);

        relatedLinks.innerHTML = related
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
      setText("collection-description", "Error loading collection");
      setText("collection-count", "Error loading products");

      const seo = document.getElementById("collection-seo-text");
      if (seo && !seo.textContent.trim()) {
        seo.textContent = "Collection details unavailable right now.";
      }
    }
  }

  document.addEventListener("DOMContentLoaded", loadCollection);
})();
