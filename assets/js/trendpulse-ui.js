// assets/js/trendpulse-ui.js

(function () {
  const config = window.TRENDPULSE_CONFIG || {
    siteUrl: "https://www.trend-pulse.shop",
    affiliateTag: "Drackk-20",
    contactEmail: "contact@trend-pulse.shop",
    market: "US"
  };

  function escapeHtml(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function dedupeDeals(deals = []) {
    const seen = new Set();

    return deals.filter((deal) => {
      const key =
        deal.asin ||
        deal.affiliate_link ||
        deal.url ||
        (deal.title || "").trim().toLowerCase();

      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function normalizeText(value = "") {
    return String(value).trim().toLowerCase();
  }

  function getDeals() {
    return dedupeDeals(window.TRENDPULSE_DEALS || []);
  }

  function getDealByAsin(asin) {
    return getDeals().find((deal) => deal.asin === asin) || null;
  }

  function ensureAffiliateTag(url) {
    if (!url) return "#";

    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes("amazon.")) {
        parsed.searchParams.set("tag", config.affiliateTag);
      }
      return parsed.toString();
    } catch {
      return url;
    }
  }

  function filterDeals({ search = "", category = "all", sort = "default", limit = null } = {}) {
    const normalizedSearch = normalizeText(search);

    let result = getDeals().filter((deal) => {
      const haystack = [
        deal.title,
        deal.description,
        deal.badge,
        deal.category,
        ...(deal.tags || [])
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch = !normalizedSearch || haystack.includes(normalizedSearch);
      const matchesCategory = category === "all" || deal.category === category;

      return matchesSearch && matchesCategory;
    });

    if (sort === "low") result.sort((a, b) => a.price - b.price);
    if (sort === "high") result.sort((a, b) => b.price - a.price);
    if (sort === "title") result.sort((a, b) => a.title.localeCompare(b.title));

    if (typeof limit === "number") {
      result = result.slice(0, limit);
    }

    return result;
  }

  function cardTemplate(deal) {
    return `
      <article class="group overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/60 transition hover:border-zinc-600">
        <a href="/deal.html?asin=${encodeURIComponent(deal.asin)}" class="block">
          <div class="aspect-square overflow-hidden bg-zinc-950">
            <img
              src="${escapeHtml(deal.image)}"
              alt="${escapeHtml(deal.title)}"
              class="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
              loading="lazy"
            />
          </div>
          <div class="p-4">
            <div class="inline-flex rounded-full border border-zinc-700 px-2.5 py-1 text-[11px] font-medium text-zinc-300">
              ${escapeHtml(deal.badge)}
            </div>
            <h3 class="mt-3 line-clamp-2 text-sm font-semibold leading-6 text-white">
              ${escapeHtml(deal.title)}
            </h3>
            <div class="mt-3 flex items-center justify-between gap-3">
              <span class="text-base font-bold text-white">$${Number(deal.price).toFixed(2)}</span>
              <span class="text-sm font-medium text-zinc-300 transition group-hover:text-white">View Deal →</span>
            </div>
          </div>
        </a>
      </article>
    `;
  }

  function renderGrid(selector, deals) {
    const element = document.querySelector(selector);
    if (!element) return;
    element.innerHTML = deals.map(cardTemplate).join("");
  }

  function updateResultCount(selector, count) {
    const element = document.querySelector(selector);
    if (!element) return;
    element.textContent = `${count} ${count === 1 ? "deal" : "deals"}`;
  }

  function getQueryParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name) || "";
  }

  function updateMeta(product) {
    if (!product) return;

    const pageUrl = `${config.siteUrl}/deal.html?asin=${encodeURIComponent(product.asin)}`;
    const title = `${product.title} | TrendPulse`;
    const description = product.description || "Explore this Amazon deal on TrendPulse.";

    document.title = title;

    const metaDescription = document.querySelector('meta[name="description"]');
    const canonical = document.querySelector('link[rel="canonical"]');
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const ogDescription = document.querySelector('meta[property="og:description"]');
    const ogUrl = document.querySelector('meta[property="og:url"]');
    const ogImage = document.querySelector('meta[property="og:image"]');
    const twitterTitle = document.querySelector('meta[name="twitter:title"]');
    const twitterDescription = document.querySelector('meta[name="twitter:description"]');
    const twitterImage = document.querySelector('meta[name="twitter:image"]');

    if (metaDescription) metaDescription.setAttribute("content", description);
    if (canonical) canonical.setAttribute("href", pageUrl);
    if (ogTitle) ogTitle.setAttribute("content", title);
    if (ogDescription) ogDescription.setAttribute("content", description);
    if (ogUrl) ogUrl.setAttribute("content", pageUrl);
    if (ogImage) ogImage.setAttribute("content", product.image);
    if (twitterTitle) twitterTitle.setAttribute("content", title);
    if (twitterDescription) twitterDescription.setAttribute("content", description);
    if (twitterImage) twitterImage.setAttribute("content", product.image);
  }

  function updateDealSchema(product) {
    const el = document.getElementById("deal-schema");
    if (!el || !product) return;

    el.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.title,
      image: [product.image],
      sku: product.asin,
      offers: {
        "@type": "Offer",
        priceCurrency: "USD",
        price: String(product.price || ""),
        availability: "https://schema.org/InStock",
        url: `${config.siteUrl}/deal.html?asin=${encodeURIComponent(product.asin)}`
      }
    });
  }

  function renderHomeDeals() {
    renderGrid("#home-deals", filterDeals({ limit: 4 }));
  }

  function renderBestSellers() {
    renderGrid("#best-seller-grid", filterDeals({ limit: 8 }));
  }

  function renderCategoryGrid(selector, category, limit = 8) {
    renderGrid(selector, filterDeals({ category, limit }));
  }

  function renderDealsPage() {
    const searchInput = document.getElementById("searchInput");
    const categoryFilter = document.getElementById("categoryFilter");
    const sortFilter = document.getElementById("sortFilter");

    if (!searchInput || !categoryFilter || !sortFilter) return;

    const initialQuery = getQueryParam("q");
    if (initialQuery) searchInput.value = initialQuery;

    function run() {
      const deals = filterDeals({
        search: searchInput.value,
        category: categoryFilter.value,
        sort: sortFilter.value
      });

      renderGrid("#deals-grid", deals);
      updateResultCount("#resultCount", deals.length);

      const params = new URLSearchParams(window.location.search);
      if (searchInput.value.trim()) {
        params.set("q", searchInput.value.trim());
      } else {
        params.delete("q");
      }

      const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
      window.history.replaceState({}, "", nextUrl);
    }

    searchInput.addEventListener("input", run);
    categoryFilter.addEventListener("change", run);
    sortFilter.addEventListener("change", run);

    run();
  }

  function renderDealPage() {
    const asin = getQueryParam("asin");
    const product = getDealByAsin(asin) || getDeals()[0];
    if (!product) return;

    const title = document.getElementById("deal-title");
    const description = document.getElementById("deal-description");
    const price = document.getElementById("deal-price");
    const badge = document.getElementById("deal-badge");
    const image = document.getElementById("deal-image");
    const button = document.getElementById("amazon-button");
    const market = document.getElementById("deal-market");

    if (title) title.textContent = product.title;
    if (description) description.textContent = product.description;
    if (price) price.textContent = `$${Number(product.price).toFixed(2)}`;
    if (badge) badge.textContent = product.badge;
    if (image) {
      image.src = product.image;
      image.alt = product.title;
    }
    if (button) {
      button.href = ensureAffiliateTag(product.affiliate_link);
      button.setAttribute("rel", "nofollow sponsored noopener");
      button.setAttribute("target", "_blank");
    }
    if (market) {
      market.textContent = `${config.market} Market`;
    }

    updateMeta(product);
    updateDealSchema(product);

    const related = getDeals()
      .filter((deal) => deal.asin !== product.asin)
      .slice(0, 4);

    renderGrid("#related-deals", related);
  }

  document.addEventListener("DOMContentLoaded", function () {
    renderHomeDeals();
    renderBestSellers();
    renderCategoryGrid("#cheap-tech-grid", "tech", 8);
    renderCategoryGrid("#best-gifts-grid", "gifts", 8);
    renderDealsPage();
    renderDealPage();
  });
})();
