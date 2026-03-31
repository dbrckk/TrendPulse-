// update assets/js/trendpulse-ui.js (FULL FILE REPLACEMENT with conversion optimization)

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
    return window.TRENDPULSE_DEALS || [];
  }

  function getDealByAsin(asin) {
    return getDeals().find(d => d.asin === asin);
  }

  function ensureAffiliateTag(url) {
    try {
      const u = new URL(url);
      if (u.hostname.includes("amazon")) {
        u.searchParams.set("tag", config.affiliateTag);
      }
      return u.toString();
    } catch {
      return url;
    }
  }

  function urgencyBadge(deal) {
    if (deal.price <= 10) return "🔥 Low Price";
    if (deal.badge === "Trending Deal") return "🔥 Trending";
    if (deal.badge === "Best Gift") return "🎁 Popular Gift";
    return deal.badge;
  }

  function cardTemplate(deal) {
    return `
      <article class="group rounded-3xl border border-zinc-800 bg-zinc-900/60 overflow-hidden hover:border-zinc-600 transition">
        <a href="/deal.html?asin=${deal.asin}">
          <div class="aspect-square bg-zinc-950">
            <img src="${deal.image}" alt="${escapeHtml(deal.title)}"
              class="w-full h-full object-cover group-hover:scale-105 transition" loading="lazy"/>
          </div>

          <div class="p-4">
            <div class="flex gap-2 flex-wrap text-[11px]">
              <span class="px-2 py-1 border border-zinc-700 rounded-full text-zinc-300">
                ${urgencyBadge(deal)}
              </span>
              <span class="px-2 py-1 bg-zinc-950 border border-zinc-800 rounded-full text-zinc-400">
                ${deal.best_for || "Popular"}
              </span>
            </div>

            <h3 class="mt-2 text-sm font-semibold text-white line-clamp-2">
              ${escapeHtml(deal.title)}
            </h3>

            <div class="mt-3 flex justify-between items-center">
              <span class="text-white font-bold">$${deal.price}</span>
              <span class="text-zinc-300 text-sm">View →</span>
            </div>
          </div>
        </a>
      </article>
    `;
  }

  function renderGrid(id, deals) {
    const el = document.querySelector(id);
    if (!el) return;
    el.innerHTML = deals.map(cardTemplate).join("");
  }

  function filterDeals(opts = {}) {
    let deals = getDeals();

    if (opts.category && opts.category !== "all") {
      deals = deals.filter(d => d.category === opts.category);
    }

    if (opts.search) {
      const s = opts.search.toLowerCase();
      deals = deals.filter(d =>
        (d.title + d.description + d.tags.join(" ")).toLowerCase().includes(s)
      );
    }

    deals.sort((a, b) => a.price - b.price);

    return deals;
  }

  function renderDealsPage() {
    const input = document.getElementById("searchInput");
    const category = document.getElementById("categoryFilter");

    if (!input || !category) return;

    function update() {
      const deals = filterDeals({
        search: input.value,
        category: category.value
      });

      renderGrid("#deals-grid", deals);
    }

    input.addEventListener("input", update);
    category.addEventListener("change", update);

    update();
  }

  function renderHomeDeals() {
    renderGrid("#home-deals", getDeals().slice(0, 4));
  }

  function renderCategory(selector, category) {
    renderGrid(selector, filterDeals({ category }).slice(0, 8));
  }

  function renderDealPage() {
    const asin = new URLSearchParams(location.search).get("asin");
    const deal = getDealByAsin(asin) || getDeals()[0];
    if (!deal) return;

    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    document.getElementById("deal-image").src = deal.image;

    set("deal-title", deal.title);
    set("deal-description", deal.description);
    set("deal-price", `$${deal.price}`);
    set("deal-best-for", deal.best_for);

    const link = ensureAffiliateTag(deal.affiliate_link);

    document.getElementById("amazon-button").href = link;
    document.getElementById("sticky-amazon-button").href = link;

    // 🔥 CONVERSION BOOST (auto scroll CTA)
    setTimeout(() => {
      document.getElementById("sticky-amazon-button").classList.add("animate-pulse");
    }, 2000);
  }

  document.addEventListener("DOMContentLoaded", () => {
    renderHomeDeals();
    renderCategory("#cheap-tech-grid", "tech");
    renderCategory("#best-gifts-grid", "gifts");
    renderDealsPage();
    renderDealPage();
  });

})();
