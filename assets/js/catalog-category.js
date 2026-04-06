(function () {
  function escapeHtml(value = "") {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function formatPrice(value) {
    return `$${safeNumber(value).toFixed(2)}`;
  }

  function getDiscount(product) {
    const explicit = safeNumber(product.discount, 0);
    if (explicit > 0) return Math.round(explicit);

    const price = safeNumber(product.price, 0);
    const oldPrice = safeNumber(product.oldPrice, 0);

    if (oldPrice > price && price > 0) {
      return Math.max(1, Math.round(((oldPrice - price) / oldPrice) * 100));
    }

    return 0;
  }

  function capitalize(value = "") {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
  }

  function getCategoryFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const byQuery = params.get("category");

    if (byQuery) {
      return window.TrendPulseData.normalizeCategory(byQuery);
    }

    const pathParts = window.location.pathname.split("/").filter(Boolean);
    if (pathParts[0] === "catalog" && pathParts[1]) {
      return window.TrendPulseData.normalizeCategory(decodeURIComponent(pathParts[1]));
    }

    return "general";
  }

  function renderProducts(products) {
    const container = document.getElementById("products");
    if (!container) return;

    if (!products || !products.length) {
      container.innerHTML = `
        <div class="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-center text-zinc-400">
          No products found
        </div>
      `;
      return;
    }

    container.innerHTML = products
      .map((p) => {
        const title = escapeHtml(p.name || "Amazon Product");
        const image = escapeHtml(p.image || "https://via.placeholder.com/600x600?text=No+Image");
        const affiliate = escapeHtml(p.affiliate || "#");
        const slug = encodeURIComponent(p.slug || p.asin || "");
        const discount = getDiscount(p);

        return `
          <article class="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 shadow-sm transition hover:scale-[1.01] hover:border-zinc-700">
            <a href="/product/${slug}" class="block">
              <div class="relative overflow-hidden rounded-xl bg-white">
                <img
                  src="${image}"
                  alt="${title}"
                  class="h-44 w-full object-contain"
                  loading="lazy"
                  onerror="this.src='https://via.placeholder.com/600x600?text=No+Image'"
                />
                ${discount > 0 ? `<div class="absolute left-2 top-2 rounded-full bg-red-500 px-2 py-1 text-xs font-bold text-white">-${discount}%</div>` : ""}
              </div>

              <h3 class="mt-3 line-clamp-2 text-sm font-semibold text-white">${title}</h3>

              <div class="mt-2 text-xs text-zinc-400">
                ⭐ ${safeNumber(p.rating, 0) > 0 ? safeNumber(p.rating, 0).toFixed(1) : "—"}
                (${safeNumber(p.reviews, 0).toLocaleString()})
              </div>

              <div class="mt-3 flex items-center gap-2">
                <span class="text-lg font-bold text-green-400">${formatPrice(p.price)}</span>
                ${p.oldPrice ? `<span class="text-xs text-zinc-500 line-through">${formatPrice(p.oldPrice)}</span>` : ""}
              </div>
            </a>

            <a
              href="${affiliate}"
              target="_blank"
              rel="nofollow sponsored noopener"
              class="mt-4 block rounded-xl bg-green-500 px-4 py-2 text-center text-sm font-bold text-black"
            >
              View Deal
            </a>
          </article>
        `;
      })
      .join("");
  }

  async function loadCategory() {
    const category = getCategoryFromUrl();

    const titleEl = document.getElementById("category-title");
    const descEl = document.getElementById("category-description");
    const countEl = document.getElementById("category-count");

    try {
      if (titleEl) titleEl.textContent = `${capitalize(category)} Catalog`;
      if (descEl) descEl.textContent = `Loading ${category} products...`;
      if (countEl) countEl.textContent = "Loading products...";

      let products = await window.TrendPulseData.fetchCatalogByCategory(category, 60);

      if (!products.length) {
        products = await window.TrendPulseData.fetchTopProducts(24);
      }

      renderProducts(products);

      if (descEl) descEl.textContent = `Browse top Amazon products in ${category}.`;
      if (countEl) {
        countEl.textContent = `${products.length} ${products.length === 1 ? "product" : "products"}`;
      }
    } catch (e) {
      console.error("CATEGORY ERROR:", e);

      const container = document.getElementById("products");
      if (container) {
        container.innerHTML = `
          <div class="rounded-2xl border border-red-900 bg-red-950/30 p-6 text-center text-red-300">
            Error loading products
          </div>
        `;
      }

      if (descEl) descEl.textContent = "Error loading category";
      if (countEl) countEl.textContent = "Error loading products";
    }
  }

  document.addEventListener("DOMContentLoaded", loadCategory);
})();
