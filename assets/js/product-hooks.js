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

  function renderDeals(deals) {
    const container = document.getElementById("deals");
    if (!container) return;

    if (!deals || !deals.length) {
      container.innerHTML = `
        <div class="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-center text-zinc-400">
          No more products right now.
        </div>
      `;
      return;
    }

    container.innerHTML = deals
      .map((d) => {
        const title = escapeHtml(d.name || "Amazon Product");
        const image = escapeHtml(d.image || "https://via.placeholder.com/600x600?text=No+Image");
        const affiliate = escapeHtml(d.affiliate || "#");
        const discount = getDiscount(d);

        return `
          <article class="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 shadow-sm transition hover:scale-[1.01] hover:border-zinc-700">
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
              ⭐ ${safeNumber(d.rating, 0) > 0 ? safeNumber(d.rating, 0).toFixed(1) : "—"}
              (${safeNumber(d.reviews, 0).toLocaleString()})
            </div>

            <div class="mt-3 flex items-center gap-2">
              <span class="text-lg font-bold text-green-400">${formatPrice(d.price)}</span>
              ${d.oldPrice ? `<span class="text-xs text-zinc-500 line-through">${formatPrice(d.oldPrice)}</span>` : ""}
            </div>

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

  async function loadDeals() {
    const status = document.getElementById("home-status");

    try {
      if (status) status.textContent = "Loading products...";

      const deals = await window.TrendPulseData.fetchHomeFeed();

      renderDeals(deals);

      if (status) {
        status.textContent = `${deals.length} ${deals.length === 1 ? "product" : "products"} loaded`;
      }
    } catch (e) {
      console.error("HOME FEED ERROR:", e);

      const container = document.getElementById("deals");
      if (container) {
        container.innerHTML = `
          <div class="rounded-2xl border border-red-900 bg-red-950/30 p-6 text-center text-red-300">
            Error loading products
          </div>
        `;
      }

      if (status) status.textContent = "Error loading products";
    }
  }

  window.loadDeals = loadDeals;
})();
