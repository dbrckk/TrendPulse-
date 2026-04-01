// assets/js/trendpulse-ui.js

(function () {
  const config = window.TRENDPULSE_CONFIG || {
    siteUrl: "https://www.trend-pulse.shop",
    affiliateTag: "Drackk-20"
  };

  const DISLIKED_STORAGE_KEY = "trendpulse_disliked_deals_v6";
  const IMAGE_PROXY_BASE = "https://images.weserv.nl/?url=";

  let cachedDeals = null;
  let dealsPromise = null;

  function escapeHtml(value = "") {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normalize(value = "") {
    return String(value).trim().toLowerCase();
  }

  function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function slugify(value = "") {
    return String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function initialsFromTitle(title = "") {
    const words = String(title).trim().split(/\s+/).filter(Boolean).slice(0, 2);
    if (!words.length) return "TP";
    return words.map((word) => word[0]).join("").toUpperCase();
  }

  function ensureAffiliateTag(url) {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes("amazon")) {
        parsed.searchParams.set("tag", config.affiliateTag);
      }
      return parsed.toString();
    } catch {
      return url || "#";
    }
  }

  function getDislikedDeals() {
    try {
      const raw = localStorage.getItem(DISLIKED_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveDislikedDeals(list) {
    try {
      localStorage.setItem(DISLIKED_STORAGE_KEY, JSON.stringify(list));
    } catch {}
  }

  function addDislikedDeal(asin) {
    const current = new Set(getDislikedDeals());
    current.add(asin);
    saveDislikedDeals(Array.from(current));
  }

  function clearDislikedDeals() {
    try {
      localStorage.removeItem(DISLIKED_STORAGE_KEY);
    } catch {}
  }

  function proxyImage(url) {
    const raw = String(url || "").trim();
    if (!raw) return "";

    try {
      const parsed = new URL(raw);
      return `${IMAGE_PROXY_BASE}${encodeURIComponent(
        parsed.host + parsed.pathname + parsed.search
      )}&w=1200&h=1200&fit=contain&bg=ffffff&output=jpg`;
    } catch {
      return "";
    }
  }

  function buildSvgPlaceholder(deal) {
    const title = String(deal.title || "Amazon Deal");
    const badge = String(deal.badge || "Deal");
    const price = `$${safeNumber(deal.price, 0).toFixed(2)}`;
    const initials = initialsFromTitle(title);

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#18181b"/>
            <stop offset="100%" stop-color="#3f3f46"/>
          </linearGradient>
        </defs>
        <rect width="800" height="800" fill="url(#g)"/>
        <circle cx="665" cy="135" r="110" fill="#ffffff" opacity="0.07"/>
        <circle cx="130" cy="680" r="150" fill="#ffffff" opacity="0.05"/>
        <rect x="40" y="40" rx="24" ry="24" width="180" height="56" fill="#09090b" opacity="0.95"/>
        <text x="130" y="76" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700" fill="#ffffff">${escapeXml(
          badge
        )}</text>
        <text x="400" y="370" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="170" font-weight="800" fill="#ffffff" opacity="0.12">${escapeXml(
          initials
        )}</text>
        <text x="50" y="560" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="800" fill="#ffffff">${escapeXml(
          title.slice(0, 26)
        )}</text>
        <text x="50" y="625" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="800" fill="#ffffff">${escapeXml(
          title.slice(26, 52)
        )}</text>
        <rect x="40" y="690" rx="24" ry="24" width="180" height="70" fill="#09090b" opacity="0.95"/>
        <text x="130" y="736" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="800" fill="#22c55e">${escapeXml(
          price
        )}</text>
      </svg>
    `;

    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function escapeXml(value = "") {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function badgeFromRow(row) {
    if (row.is_best_seller) return "Best Seller";
    if (row.is_crazy_deal) return "Crazy Deal";
    if (row.is_giftable) return "Giftable Pick";
    if (safeNumber(row.discount_percentage || row.discount_percent, 0) >= 40) return "Strong Value";
    return "Deal";
  }

  function bestForFromRow(row) {
    if (row.best_for) return row.best_for;
    if (row.is_giftable) return "Gift";
    if (normalize(row.category) === "tech") return "Tech";
    if (normalize(row.category) === "home") return "Home";
    if (normalize(row.category) === "kitchen") return "Kitchen";
    return row.tagline || "Popular";
  }

  function sanitizeRow(row) {
    const title = row.name || row.title || "Amazon Deal";
    const asin = row.asin || row.id || slugify(title);
    const price = safeNumber(row.price, 0);
    const originalPrice = safeNumber(row.original_price, price > 0 ? price * 1.25 : 0);
    const views = safeNumber(row.views, 0);
    const clicks = safeNumber(row.clicks, 0);
    const discount = safeNumber(row.discount_percentage ?? row.discount_percent, 0);
    const badge = badgeFromRow(row);
    const image = proxyImage(row.image_url || row.image || "");
    const quickPoints = [
      row.tagline || `${badge} on Amazon`,
      discount > 0 ? `${discount}% off` : null,
      views > 0 ? `${views} views` : null,
      clicks > 0 ? `${clicks} clicks` : null
    ]
      .filter(Boolean)
      .slice(0, 3);

    const deal = {
      id: row.id || asin,
      asin,
      title,
      description: row.description || row.tagline || "Amazon product selected by TrendPulse.",
      price,
      original_price: originalPrice,
      image,
      image_url: row.image_url || row.image || "",
      affiliate_link: ensureAffiliateTag(
        row.affiliate_link || row.amazon_url || row.raw_amazon_url || "#"
      ),
      category: normalize(row.category || "general") || "general",
      badge,
      best_for: bestForFromRow(row),
      quick_points: quickPoints,
      tags: [row.category, row.source_name, row.tagline].filter(Boolean),
      score: safeNumber(row.score, 0),
      views,
      clicks,
      is_active: row.is_active !== false
    };

    deal.placeholder = buildSvgPlaceholder(deal);
    return deal;
  }

  async function fetchDealsFromSupabase() {
    if (!window.supabaseClient) {
      console.error("Supabase client not initialized.");
      return [];
    }

    const { data, error } = await window.supabaseClient
      .from("products")
      .select("*")
      .eq("is_active", true)
      .order("score", { ascending: false })
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Supabase fetch error:", error);
      return [];
    }

    return (data || []).map(sanitizeRow);
  }

  async function getDeals() {
    if (cachedDeals) return cachedDeals;
    if (dealsPromise) return dealsPromise;

    dealsPromise = fetchDealsFromSupabase()
      .then((rows) => {
        cachedDeals = Array.isArray(rows) ? rows : [];
        return cachedDeals;
      })
      .catch((error) => {
        console.error("Deal loading failed:", error);
        cachedDeals = [];
        return cachedDeals;
      });

    return dealsPromise;
  }

  async function getDealByAsin(asin) {
    const deals = await getDeals();
    return deals.find((deal) => deal.asin === asin) || null;
  }

  function scoreDeal(deal) {
    let score = 0;
    const price = safeNumber(deal.price, 0);

    if (deal.badge === "Best Seller") score += 12;
    if (deal.badge === "Crazy Deal") score += 10;
    if (deal.badge === "Giftable Pick") score += 8;
    if (deal.badge === "Strong Value") score += 7;
    if (deal.badge === "Deal") score += 5;

    if (price <= 10) score += 10;
    else if (price <= 15) score += 9;
    else if (price <= 25) score += 8;
    else if (price <= 50) score += 5;

    score += safeNumber(deal.score, 0);
    score += Math.min(safeNumber(deal.clicks, 0), 20);
    score += Math.min(Math.floor(safeNumber(deal.views, 0) / 10), 20);

    if (deal.category === "tech") score += 3;
    if (deal.category === "gifts") score += 3;
    if (deal.category === "home") score += 2;
    if (deal.best_for) score += 2;
    if ((deal.quick_points || []).length >= 2) score += 2;

    return score;
  }

  function getHotLabel(deal) {
    const price = safeNumber(deal.price, 0);

    if (deal.badge === "Best Seller") return "Best Seller";
    if (deal.badge === "Crazy Deal") return "Hot Deal";
    if (price <= 10) return "Hot Price";
    if (price <= 20) return "Low Price";
    if (deal.badge === "Giftable Pick") return "Top Gift";
    if (deal.badge === "Strong Value") return "Best Value";
    return "Popular";
  }

  async function filterDeals({ search = "", category = "all", maxPrice = null, sort = "score" } = {}) {
    const query = normalize(search);
    const allDeals = await getDeals();

    let deals = allDeals.filter((deal) => {
      const haystack = [
        deal.title,
        deal.description,
        deal.badge,
        deal.category,
        deal.best_for,
        ...(deal.tags || []),
        ...(deal.quick_points || [])
      ]
        .join(" ")
        .toLowerCase();

      const searchOk = !query || haystack.includes(query);
      const categoryOk = category === "all" || deal.category === normalize(category);
      const priceOk = maxPrice == null || safeNumber(deal.price, 0) <= maxPrice;

      return searchOk && categoryOk && priceOk;
    });

    if (sort === "low") deals.sort((a, b) => safeNumber(a.price) - safeNumber(b.price));
    else if (sort === "high") deals.sort((a, b) => safeNumber(b.price) - safeNumber(a.price));
    else if (sort === "title") deals.sort((a, b) => a.title.localeCompare(b.title));
    else deals.sort((a, b) => scoreDeal(b) - scoreDeal(a));

    return deals;
  }

  function imageMarkup(deal, mode = "card") {
    const title = escapeHtml(deal.title || "Amazon Deal");
    const imgClass =
      mode === "detail"
        ? "absolute inset-0 z-10 h-full w-full object-contain"
        : "absolute inset-0 z-10 h-full w-full object-contain transition duration-300 group-hover:scale-[1.02]";

    return `
      <div class="relative h-full w-full overflow-hidden bg-white">
        <img
          src="${escapeHtml(deal.placeholder)}"
          alt="${title}"
          class="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
        />
        ${
          deal.image
            ? `
          <img
            src="${escapeHtml(deal.image)}"
            alt="${title}"
            loading="lazy"
            referrerpolicy="no-referrer"
            class="${imgClass}"
            onerror="this.remove()"
          />
        `
            : ""
        }
      </div>
    `;
  }

  function productCard(deal) {
    const isHot =
      safeNumber(deal.price, 0) <= 15 ||
      deal.badge === "Crazy Deal" ||
      deal.badge === "Best Seller";

    const points = (deal.quick_points || []).slice(0, 2);

    return `
      <article class="group h-full overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/70 transition hover:border-zinc-500 hover:shadow-xl hover:shadow-black/30">
        <a href="/deal.html?asin=${encodeURIComponent(deal.asin)}" class="flex h-full flex-col">
          <div class="relative aspect-square overflow-hidden">
            ${imageMarkup(deal, "card")}

            ${
              isHot
                ? `
              <div class="absolute left-3 top-3 z-20 rounded-full bg-red-500 px-3 py-1 text-[11px] font-bold text-white shadow">
                🔥 HOT
              </div>
            `
                : ""
            }

            <div class="absolute right-3 top-3 z-20 rounded-full bg-black/80 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
              ${escapeHtml(getHotLabel(deal))}
            </div>
          </div>

          <div class="flex flex-1 flex-col p-4">
            <div class="mb-2 flex flex-wrap gap-2">
              <span class="rounded-full border border-zinc-700 px-2.5 py-1 text-[11px] font-medium text-zinc-300">
                ${escapeHtml(deal.badge || "Deal")}
              </span>
              ${
                deal.best_for
                  ? `
                <span class="rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] font-medium text-zinc-400">
                  ${escapeHtml(deal.best_for)}
                </span>
              `
                  : ""
              }
            </div>

            <h3 class="min-h-[3rem] text-sm font-semibold leading-6 text-white">
              ${escapeHtml(deal.title)}
            </h3>

            <ul class="mt-2 min-h-[2.5rem] space-y-1 text-[11px] text-zinc-400">
              ${points.map((point) => `<li>• ${escapeHtml(point)}</li>`).join("")}
            </ul>

            <div class="mt-auto flex items-end justify-between gap-3 pt-4">
              <div class="flex flex-col">
                <span class="text-lg font-bold text-green-400">$${safeNumber(deal.price, 0).toFixed(2)}</span>
                <span class="text-[10px] text-zinc-500">Check on Amazon</span>
              </div>

              <div class="rounded-lg bg-green-500 px-3 py-2 text-xs font-bold text-black">
                View →
              </div>
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

  async function renderByConfig(selector, options) {
    const deals = await filterDeals(options);
    renderGrid(selector, deals.slice(0, 8));
  }

  async function renderHomeDeals() {
    const deals = await filterDeals({ sort: "score" });
    renderGrid("#home-deals", deals.slice(0, 4));
  }

  async function renderBestSellerGrid() {
    const deals = await filterDeals({ sort: "score" });
    renderGrid(
      "#best-seller-grid",
      deals.filter((deal) => deal.badge === "Best Seller").slice(0, 8)
    );
  }

  async function renderCheapTechGrid() {
    await renderByConfig("#cheap-tech-grid", { category: "tech", sort: "score" });
  }

  async function renderGiftGrid() {
    await renderByConfig("#best-gifts-grid", { category: "gifts", sort: "score" });
  }

  async function renderHomeCategoryGrid() {
    await renderByConfig("#home-grid", { category: "home", sort: "score" });
  }

  async function renderKitchenGrid() {
    await renderByConfig("#kitchen-grid", { category: "kitchen", sort: "score" });
  }

  async function renderBeautyGrid() {
    await renderByConfig("#beauty-grid", { search: "beauty self care gift", sort: "score" });
  }

  async function renderOfficeGrid() {
    await renderByConfig("#office-grid", { search: "desk office organizer lamp", sort: "score" });
  }

  async function renderGamingGrid() {
    await renderByConfig("#gaming-grid", { search: "gaming creator phone tripod", sort: "score" });
  }

  async function renderOutdoorGrid() {
    await renderByConfig("#outdoor-grid", { search: "travel water outdoor car", sort: "score" });
  }

  async function renderTravelGrid() {
    await renderByConfig("#travel-grid", { search: "travel organizer car sleep", sort: "score" });
  }

  async function renderTechGrid() {
    await renderByConfig("#tech-grid", { category: "tech", sort: "score" });
  }

  async function renderFashionGrid() {
    await renderByConfig("#fashion-grid", { search: "gift cozy everyday", sort: "score" });
  }

  async function renderJewelryGrid() {
    await renderByConfig("#jewelry-grid", { search: "gift women memory photo", sort: "score" });
  }

  async function renderBabyGrid() {
    await renderByConfig("#baby-grid", { search: "gift home cozy light", sort: "score" });
  }

  async function renderHealthGrid() {
    await renderByConfig("#health-grid", { search: "sleep hydration wellness", sort: "score" });
  }

  async function renderPetsGrid() {
    await renderByConfig("#pets-grid", { search: "home gift useful", sort: "score" });
  }

  async function renderShoesGrid() {
    await renderByConfig("#shoes-grid", { search: "everyday travel useful", sort: "score" });
  }

  async function renderSportsGrid() {
    await renderByConfig("#sports-grid", { search: "water sports travel", sort: "score" });
  }

  async function renderUnder10Grid() {
    await renderByConfig("#under-10-grid", { maxPrice: 10, sort: "score" });
  }

  async function renderUnder20Grid() {
    await renderByConfig("#under-20-grid", { maxPrice: 20, sort: "score" });
  }

  async function renderUnder50Grid() {
    await renderByConfig("#under-50-grid", { maxPrice: 50, sort: "score" });
  }

  async function renderDealsPage() {
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

    async function run() {
      const deals = await filterDeals({
        search: searchInput ? searchInput.value : "",
        category: categoryFilter ? categoryFilter.value : "all",
        maxPrice: parseMaxPrice(),
        sort: sortFilter ? sortFilter.value : "score"
      });

      grid.innerHTML = deals.map(productCard).join("");
      if (results) {
        results.textContent = `${deals.length} ${deals.length === 1 ? "deal" : "deals"}`;
      }
    }

    if (searchInput) searchInput.addEventListener("input", run);
    if (categoryFilter) categoryFilter.addEventListener("change", run);
    if (sortFilter) sortFilter.addEventListener("change", run);
    if (priceFilter) priceFilter.addEventListener("change", run);

    const urlQuery = new URLSearchParams(window.location.search).get("q");
    if (urlQuery && searchInput) searchInput.value = urlQuery;

    await run();
  }

  function updateMetaForDeal(deal) {
    const pageUrl = `${config.siteUrl}/deal.html?asin=${encodeURIComponent(deal.asin)}`;
    const title = `${deal.title} | TrendPulse`;
    const description = deal.description || "View product details and continue to Amazon.";

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
    if (ogImage) ogImage.setAttribute("content", deal.image || deal.placeholder);
    if (twitterTitle) twitterTitle.setAttribute("content", title);
    if (twitterDescription) twitterDescription.setAttribute("content", description);
    if (twitterImage) twitterImage.setAttribute("content", deal.image || deal.placeholder);
  }

  function renderDetailImage(containerId, deal) {
    const container = document.getElementById(containerId);
    if (!container) return false;

    container.classList.add("bg-white", "overflow-hidden");
    container.innerHTML = imageMarkup(deal, "detail");
    return true;
  }

  async function trackView(deal) {
    if (!window.supabaseClient || !deal?.id) return;

    try {
      await window.supabaseClient
        .from("products")
        .update({ views: safeNumber(deal.views, 0) + 1 })
        .eq("id", deal.id);
    } catch {}
  }

  async function trackClick(deal) {
    if (!window.supabaseClient || !deal?.id) return;

    try {
      await window.supabaseClient
        .from("products")
        .update({ clicks: safeNumber(deal.clicks, 0) + 1 })
        .eq("id", deal.id);
    } catch {}
  }

  async function renderDealPage() {
    const asin = new URLSearchParams(window.location.search).get("asin");
    if (!asin && !document.getElementById("deal-title")) return;

    const deal = (await getDealByAsin(asin)) || (await getDeals())[0];
    if (!deal) return;

    const finalLink = ensureAffiliateTag(deal.affiliate_link);

    renderDetailImage("deal-image-wrapper", deal);

    setText("product-title", deal.title);
    setText("deal-title", deal.title);
    setText("product-description", deal.description);
    setText("deal-description", deal.description);
    setText("product-price", `$${safeNumber(deal.price).toFixed(2)}`);
    setText("deal-price", `$${safeNumber(deal.price).toFixed(2)}`);
    setText("deal-badge", deal.badge || "Deal");
    setText("deal-best-for", deal.best_for || "Useful pick");
    setText("deal-market", "US Market");
    setText("deal-market-card", "US Amazon");
    setText("deal-type-card", deal.badge || "Deal");
    setText("breadcrumb-product-name", deal.title);
    setText("sticky-deal-title", deal.title);
    setText("sticky-deal-price", `$${safeNumber(deal.price).toFixed(2)}`);

    setHref("buy-btn", finalLink);
    setHref("buy-btn-2", finalLink);
    setHref("amazon-button", finalLink);
    setHref("sticky-amazon-button", finalLink);

    const oldPrice = document.getElementById("product-old-price");
    if (oldPrice) {
      oldPrice.textContent = `$${safeNumber(
        deal.original_price,
        safeNumber(deal.price) * 1.25
      ).toFixed(2)}`;
    }

    const quickPoints = document.getElementById("deal-quick-points");
    if (quickPoints) {
      quickPoints.innerHTML = (deal.quick_points || [])
        .map((point) => `<li>${escapeHtml(point)}</li>`)
        .join("");
    }

    const related = (await filterDeals({ sort: "score" }))
      .filter((item) => item.asin !== deal.asin)
      .slice(0, 4);

    renderGrid("#related-deals", related);
    updateMetaForDeal(deal);
    trackView(deal);

    ["amazon-button", "sticky-amazon-button", "buy-btn", "buy-btn-2"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener("click", function () {
          trackClick(deal);
        });
      }
    });
  }

  async function getSwipeDeals() {
    let disliked = new Set(getDislikedDeals());
    let deals = (await filterDeals({ sort: "score" })).filter((deal) => !disliked.has(deal.asin));

    if (!deals.length) {
      clearDislikedDeals();
      disliked = new Set();
      deals = await filterDeals({ sort: "score" });
    }

    return deals;
  }

  function swipeCardMarkup(deal, offset) {
    const price = `$${safeNumber(deal.price).toFixed(2)}`;
    const points = (deal.quick_points || []).slice(0, 3);

    return `
      <article
        class="swipe-card absolute inset-0 overflow-hidden rounded-[2rem] border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/30"
        data-asin="${escapeHtml(deal.asin)}"
        style="transform: translateY(${offset * 10}px) scale(${1 - offset * 0.04}); z-index: ${30 - offset};"
      >
        <div class="relative h-full">
          <div class="absolute left-4 top-4 z-20 rounded-full bg-black/75 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
            ${escapeHtml(getHotLabel(deal))}
          </div>

          <div class="h-[58%] overflow-hidden bg-white">
            ${imageMarkup(deal, "detail")}
          </div>

          <div class="flex h-[42%] flex-col bg-zinc-950 p-5">
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="inline-flex rounded-full border border-zinc-700 px-3 py-1 text-[11px] font-medium text-zinc-300">
                  ${escapeHtml(deal.badge)}
                </div>
                <h2 class="mt-3 text-2xl font-bold leading-tight text-white">
                  ${escapeHtml(deal.title)}
                </h2>
              </div>
              <div class="text-right">
                <div class="text-3xl font-bold text-green-400">${price}</div>
                <div class="mt-1 text-xs text-zinc-500">Amazon deal</div>
              </div>
            </div>

            <ul class="mt-4 space-y-2 text-sm text-zinc-300">
              ${points.map((point) => `<li>• ${escapeHtml(point)}</li>`).join("")}
            </ul>

            <div class="mt-auto flex gap-3 pt-5">
              <button
                type="button"
                class="swipe-dislike inline-flex flex-1 items-center justify-center rounded-full border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-300"
              >
                Dislike
              </button>
              <a
                href="${escapeHtml(deal.affiliate_link)}"
                target="_blank"
                rel="nofollow sponsored noopener"
                class="swipe-buy inline-flex flex-1 items-center justify-center rounded-full bg-green-500 px-4 py-3 text-sm font-semibold text-black"
              >
                Buy on Amazon
              </a>
            </div>
          </div>
        </div>
      </article>
    `;
  }

  async function renderSwipeHome() {
    const stack = document.getElementById("swipe-stack");
    if (!stack) return;

    const emptyState = document.getElementById("swipe-empty-state");
    const dislikeBtn = document.getElementById("swipe-dislike-btn");
    const likeBtn = document.getElementById("swipe-like-btn");
    const resetBtn = document.getElementById("reset-disliked-deals");

    let deals = await getSwipeDeals();

    function topDeal() {
      return deals[0] || null;
    }

    function updateButtons() {
      const current = topDeal();
      const disabled = !current;

      if (dislikeBtn) {
        dislikeBtn.disabled = disabled;
        dislikeBtn.classList.toggle("opacity-50", disabled);
      }

      if (likeBtn) {
        likeBtn.disabled = disabled;
        likeBtn.classList.toggle("opacity-50", disabled);
      }
    }

    function render() {
      const visible = deals.slice(0, 3);
      stack.innerHTML = visible
        .map((deal, index) => swipeCardMarkup(deal, index))
        .reverse()
        .join("");

      if (emptyState) {
        emptyState.classList.toggle("hidden", deals.length > 0);
      }

      stack.classList.toggle("hidden", deals.length === 0);
      updateButtons();
      bindSwipeCards();
    }

    async function buyTopDeal() {
      const current = topDeal();
      if (!current) return;
      addDislikedDeal(current.asin);
      deals = deals.filter((deal) => deal.asin !== current.asin);
      trackClick(current);
      window.open(current.affiliate_link, "_blank", "noopener,noreferrer");
      render();
    }

    async function dislikeTopDeal() {
      const current = topDeal();
      if (!current) return;
      addDislikedDeal(current.asin);
      deals = deals.filter((deal) => deal.asin !== current.asin);
      render();
    }

    function animateOut(card, direction, callback) {
      if (!card) {
        callback();
        return;
      }

      card.style.transition = "transform 220ms ease, opacity 220ms ease";
      card.style.transform = `translateX(${direction * 120}%) rotate(${direction * 14}deg)`;
      card.style.opacity = "0";

      window.setTimeout(callback, 220);
    }

    function bindSwipeCards() {
      const topCard = stack.querySelector(".swipe-card:last-child");
      if (!topCard) return;

      const dislikeAction = topCard.querySelector(".swipe-dislike");
      const buyAction = topCard.querySelector(".swipe-buy");

      if (dislikeAction) {
        dislikeAction.addEventListener("click", function (event) {
          event.preventDefault();
          animateOut(topCard, -1, dislikeTopDeal);
        });
      }

      if (buyAction) {
        buyAction.addEventListener("click", function () {
          const current = topDeal();
          if (!current) return;
          addDislikedDeal(current.asin);
          deals = deals.filter((deal) => deal.asin !== current.asin);
          trackClick(current);
          window.setTimeout(render, 50);
        });
      }

      let startX = 0;
      let currentX = 0;
      let dragging = false;

      function onPointerMove(clientX) {
        if (!dragging) return;
        currentX = clientX - startX;
        topCard.style.transition = "none";
        topCard.style.transform = `translateX(${currentX}px) rotate(${currentX / 18}deg)`;
      }

      function onPointerEnd() {
        if (!dragging) return;
        dragging = false;

        if (currentX < -100) {
          animateOut(topCard, -1, dislikeTopDeal);
        } else if (currentX > 100) {
          animateOut(topCard, 1, buyTopDeal);
        } else {
          topCard.style.transition = "transform 180ms ease";
          topCard.style.transform = "";
        }
      }

      topCard.addEventListener(
        "touchstart",
        function (event) {
          dragging = true;
          startX = event.touches[0].clientX;
          currentX = 0;
        },
        { passive: true }
      );

      topCard.addEventListener(
        "touchmove",
        function (event) {
          onPointerMove(event.touches[0].clientX);
        },
        { passive: true }
      );

      topCard.addEventListener("touchend", onPointerEnd, { passive: true });

      topCard.addEventListener("mousedown", function (event) {
        dragging = true;
        startX = event.clientX;
        currentX = 0;

        function moveHandler(moveEvent) {
          onPointerMove(moveEvent.clientX);
        }

        function upHandler() {
          document.removeEventListener("mousemove", moveHandler);
          document.removeEventListener("mouseup", upHandler);
          onPointerEnd();
        }

        document.addEventListener("mousemove", moveHandler);
        document.addEventListener("mouseup", upHandler);
      });
    }

    if (dislikeBtn) {
      dislikeBtn.addEventListener("click", function () {
        const card = stack.querySelector(".swipe-card:last-child");
        animateOut(card, -1, dislikeTopDeal);
      });
    }

    if (likeBtn) {
      likeBtn.addEventListener("click", function () {
        const card = stack.querySelector(".swipe-card:last-child");
        animateOut(card, 1, buyTopDeal);
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", async function () {
        clearDislikedDeals();
        deals = await getSwipeDeals();
        render();
      });
    }

    render();
  }

  document.addEventListener("DOMContentLoaded", async function () {
    await getDeals();

    await Promise.all([
      renderHomeDeals(),
      renderBestSellerGrid(),
      renderCheapTechGrid(),
      renderGiftGrid(),
      renderHomeCategoryGrid(),
      renderKitchenGrid(),
      renderBeautyGrid(),
      renderOfficeGrid(),
      renderGamingGrid(),
      renderOutdoorGrid(),
      renderTravelGrid(),
      renderTechGrid(),
      renderFashionGrid(),
      renderJewelryGrid(),
      renderBabyGrid(),
      renderHealthGrid(),
      renderPetsGrid(),
      renderShoesGrid(),
      renderSportsGrid(),
      renderUnder10Grid(),
      renderUnder20Grid(),
      renderUnder50Grid(),
      renderDealsPage(),
      renderDealPage(),
      renderSwipeHome()
    ]);
  });
})();
