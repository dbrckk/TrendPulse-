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

  function formatPrice(value) {
    return `$${safeNumber(value).toFixed(2)}`;
  }

  function proxyImage(url) {
    const raw = String(url || "").trim();
    if (!raw || raw.includes("placeholder")) {
      return "https://via.placeholder.com/600x600?text=No+Image";
    }
    return raw;
  }

  function getDiscount(product) {
    const explicit = safeNumber(
      product.discount ?? product.discount_percentage,
      0
    );

    if (explicit > 0) return Math.round(explicit);

    const price = safeNumber(product.price, 0);
    const oldPrice = safeNumber(
      product.oldPrice ?? product.original_price,
      0
    );

    if (oldPrice > price && price > 0) {
      return Math.max(1, Math.round(((oldPrice - price) / oldPrice) * 100));
    }

    return 0;
  }

  function productPath(product) {
    const slug = String(product?.slug || "").trim();
    const asin = String(product?.asin || "").trim();

    if (slug) return `/product/${encodeURIComponent(slug)}`;
    if (asin) return `/product/${encodeURIComponent(asin)}`;
    return "/catalog";
  }

  function card(product) {
    const title = escapeHtml(product.name || product.title || "Amazon Product");
    const image = escapeHtml(proxyImage(product.image || product.image_url));
    const price = safeNumber(product.price, 0);
    const oldPrice = product.oldPrice ?? product.original_price;
    const rating = safeNumber(product.rating ?? product.amazon_rating, 0);
    const reviews = safeNumber(product.reviews ?? product.amazon_review_count, 0);
    const discount = getDiscount(product);
    const url = escapeHtml(
      product.affiliate || product.affiliate_link || product.amazon_url || "#"
    );
    const path = productPath(product);

    return `
      <article class="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 shadow-sm transition hover:scale-[1.01] hover:border-zinc-700">
        <a href="${path}" class="block">
          <div class="relative overflow-hidden rounded-xl bg-white">
            <img
              src="${image}"
              alt="${title}"
              class="h-40 w-full object-contain"
              loading="lazy"
              onerror="this.src='https://via.placeholder.com/600x600?text=No+Image'"
            />
            ${
              discount > 0
                ? `<div class="absolute left-2 top-2 rounded-full bg-red-500 px-2 py-1 text-xs font-bold text-white">-${discount}%</div>`
                : ""
            }
          </div>

          <h3 class="mt-3 line-clamp-2 text-sm font-semibold text-white">${title}</h3>

          <div class="mt-2 text-xs text-zinc-400">
            ⭐ ${rating > 0 ? rating.toFixed(1) : "—"} (${reviews.toLocaleString()})
          </div>

          <div class="mt-3 flex items-center gap-2">
            <span class="text-lg font-bold text-green-400">${formatPrice(price)}</span>
            ${
              oldPrice
                ? `<span class="text-xs text-zinc-500 line-through">${formatPrice(oldPrice)}</span>`
                : ""
            }
          </div>
        </a>

        <a
          href="${url}"
          target="_blank"
          rel="nofollow sponsored noopener"
          class="mt-4 block rounded-xl bg-green-500 px-4 py-2 text-center text-sm font-bold text-black"
        >
          View Deal
        </a>
      </article>
    `;
  }

  function renderProducts(products, target) {
    let container = null;

    if (typeof target === "string") {
      container = document.querySelector(target);
    } else {
      container = target;
    }

    if (!container) return;

    if (!products || !products.length) {
      container.innerHTML = `
        <div class="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-center text-zinc-400">
          No products found
        </div>
      `;
      return;
    }

    container.innerHTML = products.map(card).join("");
  }

  window.TrendPulseUI = {
    renderProducts
  };
})();
