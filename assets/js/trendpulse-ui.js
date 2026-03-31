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

  function computeScore(deal) {
    let score = 0;

    if (deal.badge === "Best Gift") score += 12;
    if (deal.badge === "Trending Deal") score += 10;
    if (deal.badge === "Popular Pick") score += 9;
    if (deal.badge === "Strong Value") score += 8;
    if (deal.badge === "Giftable Pick") score += 8;
    if (deal.price <= 10) score += 10;
    else if (deal.price <= 25) score += 8;
    else if (deal.price <= 50) score += 5;

    if (deal.category === "tech" || deal.category === "gifts") score += 3;
    if ((deal.tags || []).length >= 4) score += 2;
    if (deal.best_for) score += 2;

    return score;
  }

  function filterDeals({ search = "", category = "all", sort = "default", limit = null, priceBand = "all" } = {}) {
    const normalizedSearch = normalizeText(search);

    let result = getDeals().filter((deal) => {
      const haystack = [
        deal.title,
        deal.description,
        deal.badge,
        deal.category,
        deal.best_for,
        deal.price_band,
        ...(deal.tags || []),
        ...(deal.quick_points || [])
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch = !normalizedSearch || haystack.includes(normalizedSearch);
      const matchesCategory = category === "all" || deal.category === category;
      const matchesPriceBand = priceBand === "all" || deal.price_band === priceBand;

      return matchesSearch && matchesCategory && matchesPriceBand;
    });

    if (sort === "low") result.sort((a, b) => a.price - b.price);
    else if (sort === "high") result.sort((a, b) => b.price - a.price);
    else if (sort === "title") result.sort((a, b) => a.title.localeCompare(b.title));
    else result.sort((a, b) => computeScore(b) - computeScore(a));

    if (typeof limit === "number") result = result.slice(0, limit);

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
            <div class="flex flex-wrap gap-2">
              <div class="inline-flex rounded-full border border-zinc-700 px-2.5 py-1 text-[11px] font-medium text-zinc-300">
                ${escapeHtml(deal.badge)}
              </div>
              ${deal.best_for ? `
                <div class="inline-flex rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] font-medium text-zinc-400">
                  ${escapeHtml(deal.best_for)}
                </div>
              ` : ""}
            </div>

            <h3 class="mt-3 line-clamp-2 text-sm font-semibold leading-6 text-white">
              ${escapeHtml(deal.title)}
            </h3>

            <ul class="mt-2 space-y-1 text-[11px] text-zinc-400">
              ${(deal.quick_points || []).slice(0, 2).map(p => `<li>• ${escapeHtml(p)}</li>`).join("")}
            </ul>

            <div class="mt-3 flex items-center justify-between gap-3">
              <span class="text-base font-bold text-white">$${Number(deal.price).toFixed(2)}</span>
              <span class="text-sm font-medium text-zinc-300 transition group-hover:text-white">View →</span>
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
    const priceFilter = document.getElementById("priceFilter");

    if (!searchInput || !categoryFilter || !sortFilter) return;

    const initialQuery = getQueryParam("q");
    if (initialQuery) searchInput.value = initialQuery;

    function run() {
      const deals = filterDeals({
        search: searchInput.value,
        category: categoryFilter.value,
        sort: sortFilter.value,
        priceBand: priceFilter ? priceFilter.value : "all"
      });

      renderGrid("#deals-grid", deals);
      updateResultCount("#resultCount", deals.length);
    }

    searchInput.addEventListener("input", run);
    categoryFilter.addEventListener("change", run);
    sortFilter.addEventListener("change", run);
    if (priceFilter) priceFilter.addEventListener("change", run);

    run();
  }

  function renderDealPage() {
    const asin = getQueryParam("asin");
    const product = getDealByAsin(asin) || getDeals()[0];
    if (!product) return;

    const set = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };

    const img = document.getElementById("deal-image");
    if (img) {
      img.src = product.image;
      img.alt = product.title;
    }

    set("deal-title", product.title);
    set("deal-description", product.description);
    set("deal-price", `$${product.price}`);
    set("deal-badge", product.badge);
    set("deal-market", "US Market");
    set("deal-market-card", "US Amazon");
    set("deal-type-card", product.badge);
    set("deal-best-for", product.best_for || "General use");
    set("breadcrumb-product-name", product.title);

    const link = ensureAffiliateTag(product.affiliate_link);

    const btn = document.getElementById("amazon-button");
    if (btn) btn.href = link;

    const stickyBtn = document.getElementById("sticky-amazon-button");
    if (stickyBtn) stickyBtn.href = link;

    set("sticky-deal-title", product.title);
    set("sticky-deal-price", `$${product.price}`);

    const qp = document.getElementById("deal-quick-points");
    if (qp) {
      qp.innerHTML = (product.quick_points || []).map(p => `<li>${escapeHtml(p)}</li>`).join("");
    }

    const related = getDeals()
      .filter(d => d.asin !== product.asin)
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
