// assets/js/trendpulse-ui.js

(function () {
  const config = window.TRENDPULSE_CONFIG || {
    siteUrl: "https://www.trend-pulse.shop",
    affiliateTag: "Drackk-20"
  };

  function escapeHtml(v = "") {
    return String(v)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getDeals() {
    return Array.isArray(window.TRENDPULSE_DEALS) ? window.TRENDPULSE_DEALS : [];
  }

  function getDealByAsin(asin) {
    return getDeals().find((d) => d.asin === asin);
  }

  function ensureAffiliateTag(url) {
    try {
      const u = new URL(url);
      if (u.hostname.includes("amazon")) {
        u.searchParams.set("tag", config.affiliateTag);
      }
      return u.toString();
    } catch {
      return url || "#";
    }
  }

  function normalize(str = "") {
    return String(str).trim().toLowerCase();
  }

  function scoreDeal(deal) {
    let score = 0;

    if (deal.badge === "Best Gift") score += 12;
    if (deal.badge === "Trending Deal") score += 10;
    if (deal.badge === "Popular Pick") score += 9;
    if (deal.badge === "Strong Value") score += 8;
    if (deal.badge === "Giftable Pick") score += 8;
    if (deal.badge === "Cheap Tech") score += 7;
    if (deal.badge === "Creator Pick") score += 7;
    if (deal.badge === "Useful Tech") score += 7;
    if (deal.badge === "Home Find") score += 6;
    if (deal.badge === "Smart Utility") score += 6;
    if (deal.badge === "Budget Find") score += 6;

    if (deal.price <= 10) score += 10;
    else if (deal.price <= 25) score += 8;
    else if (deal.price <= 50) score += 5;

    if (deal.category === "tech") score += 3;
    if (deal.category === "gifts") score += 3;
    if (deal.category === "home") score += 2;
    if (deal.best_for) score += 2;
    if ((deal.quick_points || []).length >= 2) score += 2;

    return score;
  }

  function getHotLabel(deal) {
    if (deal.price <= 10) return "Hot Price";
    if (deal.badge === "Trending Deal") return "Trending";
    if (deal.badge === "Best Gift") return "Top Gift";
    if (deal.badge === "Cheap Tech") return "Budget Pick";
    return "Popular";
  }

  function filterDeals({ search = "", category = "all", maxPrice = null, sort = "score" } = {}) {
    const q = normalize(search);

    let deals = getDeals().filter((deal) => {
      const haystack = [
        deal.title,
        deal.description,
        deal.badge,
        deal.category,
        deal.best_for,
        ...(deal.tags || []),
        ...(deal.quick_points || [])
      ].join(" ").toLowerCase();

      const searchOk = !q || haystack.includes(q);
      const categoryOk = category === "all" || deal.category === category;
      const priceOk = maxPrice == null || Number(deal.price) <= maxPrice;

      return searchOk && categoryOk && priceOk;
    });

    if (sort === "low") deals.sort((a, b) => a.price - b.price);
    else if (sort === "high") deals.sort((a, b) => b.price - a.price);
    else if (sort === "title") deals.sort((a, b) => a.title.localeCompare(b.title));
    else deals.sort((a, b) => scoreDeal(b) - scoreDeal(a));

    return deals;
  }

  function productCard(deal) {
    return `
      <article class="group overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/60 transition hover:border-zinc-600">
        <a href="/deal.html?asin=${encodeURIComponent(deal.asin)}" class="block">
          <div class="relative aspect-square overflow-hidden bg-zinc-950">
            <img
              src="${escapeHtml(deal.image)}"
              alt="${escapeHtml(deal.title)}"
              class="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
              loading="lazy"
            />
            <div class="absolute left-3 top-3 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-black">
              ${escapeHtml(getHotLabel(deal))}
            </div>
          </div>

          <div class="p-4">
            <div class="flex flex-wrap gap-2">
              <span class="rounded-full border border-zinc-700 px-2.5 py-1 text-[11px] font-medium text-zinc-300">
                ${escapeHtml(deal.badge || "Deal")}
              </span>
              ${deal.best_for ? `
                <span class="rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] font-medium text-zinc-400">
                  ${escapeHtml(deal.best_for)}
                </span>
              ` : ""}
            </div>

            <h3 class="mt-3 line-clamp-2 text-sm font-semibold leading-6 text-white">
              ${escapeHtml(deal.title)}
            </h3>

            <ul class="mt-2 space-y-1 text-[11px] text-zinc-400">
              ${(deal.quick_points || []).slice(0, 2).map(point => `<li>• ${escapeHtml(point)}</li>`).join("")}
            </ul>

            <div class="mt-3 flex items-center justify-between gap-3">
              <span class="text-base font-bold text-green-400">$${Number(deal.price).toFixed(2)}</span>
              <span class="text-sm font-medium text-zinc-300 transition group-hover:text-white">View →</span>
            </div>
          </div>
        </a>
      </article>
    `;
  }

  function renderGrid(selector, deals) {
    const el = document.querySelector(selector);
    if (!el) return;
    el.innerHTML = deals.map(productCard).join("");
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function setHref(id, value) {
    const el = document.getElementById(id);
    if (el) el.href = value;
  }

  function renderByConfig(selector, config) {
    renderGrid(selector, filterDeals(config).slice(0, 8));
  }

  function renderHomeDeals() {
    renderGrid("#home-deals", filterDeals({ sort: "score" }).slice(0, 4));
  }

  function renderBestSellerGrid() {
    renderGrid("#best-seller-grid", filterDeals({ sort: "score" }).slice(0, 8));
  }

  function renderCheapTechGrid() {
    renderByConfig("#cheap-tech-grid", { category: "tech", sort: "score" });
  }

  function renderGiftGrid() {
    renderByConfig("#best-gifts-grid", { category: "gifts", sort: "score" });
  }

  function renderHomeCategoryGrid() {
    renderByConfig("#home-grid", { category: "home", sort: "score" });
  }

  function renderKitchenGrid() {
    renderByConfig("#kitchen-grid", { category: "kitchen", sort: "score" });
  }

  function renderBeautyGrid() {
    renderByConfig("#beauty-grid", { search: "beauty skincare self-care gift cozy", sort: "score" });
  }

  function renderOfficeGrid() {
    renderByConfig("#office-grid", { search: "desk office usb lamp cable organizer tripod", sort: "score" });
  }

  function renderGamingGrid() {
    renderByConfig("#gaming-grid", { search: "creator tripod phone desk tech remote", sort: "score" });
  }

  function renderOutdoorGrid() {
    renderByConfig("#outdoor-grid", { search: "travel car bottle water outdoor", sort: "score" });
  }

  function renderTravelGrid() {
    renderByConfig("#travel-grid", { search: "travel car sleep phone bottle holder", sort: "score" });
  }

  function renderTechGrid() {
    renderByConfig("#tech-grid", { category: "tech", sort: "score" });
  }

  function renderFashionGrid() {
    renderByConfig("#fashion-grid", { search: "gift bottle cozy blanket travel", sort: "score" });
  }

  function renderJewelryGrid() {
    renderByConfig("#jewelry-grid", { search: "gift women memory photo cozy", sort: "score" });
  }

  function renderBabyGrid() {
    renderByConfig("#baby-grid", { search: "night light home cozy gift", sort: "score" });
  }

  function renderHealthGrid() {
    renderByConfig("#health-grid", { search: "sleep water bottle home utility", sort: "score" });
  }

  function renderPetsGrid() {
    renderByConfig("#pets-grid", { search: "home blanket utility gift", sort: "score" });
  }

  function renderShoesGrid() {
    renderByConfig("#shoes-grid", { search: "travel gift useful everyday", sort: "score" });
  }

  function renderSportsGrid() {
    renderByConfig("#sports-grid", { search: "water bottle tripod travel sleep", sort: "score" });
  }

  function renderUnder10Grid() {
    renderByConfig("#under-10-grid", { maxPrice: 10, sort: "score" });
  }

  function renderUnder20Grid() {
    renderByConfig("#under-20-grid", { maxPrice: 20, sort: "score" });
  }

  function renderUnder50Grid() {
    renderByConfig("#under-50-grid", { maxPrice: 50, sort: "score" });
  }

  function renderDealsPage() {
    const searchInput = document.getElementById("searchInput");
    const categoryFilter = document.getElementById("categoryFilter");
    const sortFilter = document.getElementById("sortFilter");
    const priceFilter = document.getElementById("priceFilter");
    const results = document.getElementById("resultCount");
    const grid = document.getElementById("deals-grid");

    if (!grid) return;

    function parseMaxPrice() {
      if (!priceFilter) return null;
      if (priceFilter.value === "under-10") return 10;
      if (priceFilter.value === "under-25") return 25;
      if (priceFilter.value === "under-50") return 50;
      return null;
    }

    function run() {
      const deals = filterDeals({
        search: searchInput ? searchInput.value : "",
        category: categoryFilter ? categoryFilter.value : "all",
        maxPrice: parseMaxPrice(),
        sort: sortFilter ? sortFilter.value : "score"
      });

      grid.innerHTML = deals.map(productCard).join("");
      if (results) results.textContent = `${deals.length} ${deals.length === 1 ? "deal" : "deals"}`;
    }

    if (searchInput) searchInput.addEventListener("input", run);
    if (categoryFilter) categoryFilter.addEventListener("change", run);
    if (sortFilter) sortFilter.addEventListener("change", run);
    if (priceFilter) priceFilter.addEventListener("change", run);

    run();
  }

  function renderDealPage() {
    const asin = new URLSearchParams(window.location.search).get("asin");
    const deal = getDealByAsin(asin) || getDeals()[0];
    if (!deal) return;

    const finalLink = ensureAffiliateTag(deal.affiliate_link);

    const imageEl = document.getElementById("product-image") || document.getElementById("deal-image");
    if (imageEl) {
      imageEl.src = deal.image;
      imageEl.alt = deal.title;
    }

    setText("product-title", deal.title);
    setText("deal-title", deal.title);
    setText("product-description", deal.description);
    setText("deal-description", deal.description);
    setText("product-price", `$${Number(deal.price).toFixed(2)}`);
    setText("deal-price", `$${Number(deal.price).toFixed(2)}`);
    setText("deal-badge", deal.badge || "Deal");
    setText("deal-best-for", deal.best_for || "Useful pick");
    setText("deal-market", "US Market");
    setText("deal-market-card", "US Amazon");
    setText("deal-type-card", deal.badge || "Deal");
    setText("breadcrumb-product-name", deal.title);
    setText("sticky-deal-title", deal.title);
    setText("sticky-deal-price", `$${Number(deal.price).toFixed(2)}`);

    setHref("buy-btn", finalLink);
    setHref("buy-btn-2", finalLink);
    setHref("amazon-button", finalLink);
    setHref("sticky-amazon-button", finalLink);

    const oldPrice = document.getElementById("product-old-price");
    if (oldPrice) {
      const estimatedOld = Math.round((Number(deal.price) * 1.25) * 100) / 100;
      oldPrice.textContent = `$${estimatedOld.toFixed(2)}`;
    }

    const quickPoints = document.getElementById("deal-quick-points");
    if (quickPoints) {
      quickPoints.innerHTML = (deal.quick_points || []).map(point => `<li>${escapeHtml(point)}</li>`).join("");
    }

    const related = filterDeals({ sort: "score" })
      .filter(item => item.asin !== deal.asin)
      .slice(0, 4);

    renderGrid("#related-deals", related);

    document.title = `${deal.title} | TrendPulse`;
  }

  document.addEventListener("DOMContentLoaded", function () {
    renderHomeDeals();
    renderBestSellerGrid();
    renderCheapTechGrid();
    renderGiftGrid();
    renderHomeCategoryGrid();
    renderKitchenGrid();
    renderBeautyGrid();
    renderOfficeGrid();
    renderGamingGrid();
    renderOutdoorGrid();
    renderTravelGrid();
    renderTechGrid();
    renderFashionGrid();
    renderJewelryGrid();
    renderBabyGrid();
    renderHealthGrid();
    renderPetsGrid();
    renderShoesGrid();
    renderSportsGrid();
    renderUnder10Grid();
    renderUnder20Grid();
    renderUnder50Grid();
    renderDealsPage();
    renderDealPage();
  });
})();
