// assets/js/trendpulse-ui.js

(function () {
  const config = window.TRENDPULSE_CONFIG || {
    siteUrl: "https://www.trend-pulse.shop",
    affiliateTag: "Drackk-20"
  };

  const FALLBACK_IMAGE = `${config.siteUrl}/og-image.jpg`;
  const DISLIKED_STORAGE_KEY = "trendpulse_disliked_deals_v2";

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
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
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

  function getDisplayImage(url) {
    const raw = String(url || "").trim();
    if (!raw) return FALLBACK_IMAGE;

    try {
      const parsed = new URL(raw);

      if (parsed.hostname.includes("amazon")) {
        return `https://images.weserv.nl/?url=${encodeURIComponent(parsed.host + parsed.pathname + parsed.search)}&w=900&h=900&fit=contain&bg=ffffff&output=jpg`;
      }

      return raw;
    } catch {
      return FALLBACK_IMAGE;
    }
  }

  function getDeals() {
    const rawDeals = Array.isArray(window.TRENDPULSE_DEALS) ? window.TRENDPULSE_DEALS : [];
    const seen = new Set();

    return rawDeals
      .filter((deal) => deal && (deal.asin || deal.title))
      .map((deal) => {
        const title = deal.title || "Amazon Deal";
        const asin = deal.asin || slugify(title);
        const price = safeNumber(deal.price, 0);
        const badge = deal.badge || "Deal";
        const category = normalize(deal.category || "general") || "general";
        const tags = Array.isArray(deal.tags) ? deal.tags : [];
        const quickPoints = Array.isArray(deal.quick_points) ? deal.quick_points : [];
        const affiliateLink = ensureAffiliateTag(deal.affiliate_link || "#");

        return {
          ...deal,
          asin,
          title,
          image: getDisplayImage(deal.image),
          raw_image: deal.image || "",
          price,
          badge,
          category,
          tags,
          quick_points: quickPoints,
          best_for: deal.best_for || "",
          affiliate_link: affiliateLink
        };
      })
      .filter((deal) => {
        const key = `${deal.asin}|${deal.title}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function getDealByAsin(asin) {
    return getDeals().find((deal) => deal.asin === asin) || null;
  }

  function scoreDeal(deal) {
    let score = 0;
    const price = safeNumber(deal.price, 0);

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

    if (price <= 10) score += 10;
    else if (price <= 15) score += 9;
    else if (price <= 25) score += 8;
    else if (price <= 50) score += 5;

    if (deal.category === "tech") score += 3;
    if (deal.category === "gifts") score += 3;
    if (deal.category === "home") score += 2;
    if (deal.best_for) score += 2;
    if ((deal.quick_points || []).length >= 2) score += 2;

    return score;
  }

  function getHotLabel(deal) {
    const price = safeNumber(deal.price, 0);

    if (price <= 10) return "Hot Price";
    if (price <= 20) return "Low Price";
    if (deal.badge === "Trending Deal") return "Trending";
    if (deal.badge === "Best Gift") return "Top Gift";
    if (deal.badge === "Cheap Tech") return "Budget Pick";
    if (deal.badge === "Strong Value") return "Best Value";
    return "Popular";
  }

  function filterDeals({ search = "", category = "all", maxPrice = null, sort = "score" } = {}) {
    const query = normalize(search);

    let deals = getDeals().filter((deal) => {
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
    const badge = escapeHtml(deal.badge || "Deal");
    const initials = escapeHtml(initialsFromTitle(deal.title));
    const imgClass =
      mode === "detail"
        ? "h-full w-full object-contain transition duration-300"
        : "h-full w-full object-contain transition duration-300 group-hover:scale-[1.03]";

    const fallbackText =
      mode === "detail"
        ? `<div>
             <div class="text-4xl font-bold text-zinc-700">${initials}</div>
             <div class="mt-2 px-4 text-sm font-medium text-zinc-500">${title}</div>
           </div>`
        : `<div>
             <div class="text-3xl font-bold text-zinc-700">${initials}</div>
             <div class="mt-2 px-4 text-xs font-medium text-zinc-500">${badge}</div>
           </div>`;

    return `
      <div class="relative h-full w-full">
        <img
          src="${escapeHtml(deal.image || FALLBACK_IMAGE)}"
          alt="${title}"
          loading="lazy"
          referrerpolicy="no-referrer"
          class="${imgClass}"
          onerror="
            if(!this.dataset.fallbackTried){
              this.dataset.fallbackTried='1';
              this.src='${escapeHtml(FALLBACK_IMAGE)}';
              return;
            }
            this.onerror=null;
            this.style.display='none';
            var fallback=this.parentElement.querySelector('[data-fallback]');
            if(fallback){fallback.classList.remove('hidden');fallback.classList.add('flex');}
          "
        />
        <div data-fallback class="absolute inset-0 hidden items-center justify-center bg-zinc-100 text-center">
          ${fallbackText}
        </div>
      </div>
    `;
  }

  function productCard(deal) {
    const isHot = safeNumber(deal.price, 0) <= 15 || deal.badge === "Trending Deal";
    const points = (deal.quick_points || []).slice(0, 2);

    return `
      <article class="group h-full overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/70 transition hover:-translate-y-0.5 hover:border-zinc-500 hover:shadow-xl hover:shadow-black/30">
        <a href="/deal.html?asin=${encodeURIComponent(deal.asin)}" class="flex h-full flex-col">
          <div class="relative aspect-square overflow-hidden bg-white p-4">
            ${imageMarkup(deal, "card")}

            ${isHot ? `
              <div class="absolute left-3 top-3 z-10 rounded-full bg-red-500 px-3 py-1 text-[11px] font-bold text-white shadow">
                🔥 HOT
              </div>
            ` : ""}

            <div class="absolute right-3 top-3 z-10 rounded-full bg-black/80 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
              ${escapeHtml(getHotLabel(deal))}
            </div>
          </div>

          <div class="flex flex-1 flex-col p-4">
            <div class="mb-2 flex flex-wrap gap-2">
              <span class="rounded-full border border-zinc-700 px-2.5 py-1 text-[11px] font-medium text-zinc-300">
                ${escapeHtml(deal.badge || "Deal")}
              </span>
              ${deal.best_for ? `
                <span class="rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] font-medium text-zinc-400">
                  ${escapeHtml(deal.best_for)}
                </span>
              ` : ""}
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

  function renderByConfig(selector, options) {
    renderGrid(selector, filterDeals(options).slice(0, 8));
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
    renderByConfig("#gaming-grid", { search: "creator tripod phone desk tech remote gaming", sort: "score" });
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
    renderByConfig("#fashion-grid", { search: "gift bottle cozy blanket travel everyday", sort: "score" });
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
      if (results) {
        results.textContent = `${deals.length} ${deals.length === 1 ? "deal" : "deals"}`;
      }
    }

    if (searchInput) searchInput.addEventListener("input", run);
    if (categoryFilter) categoryFilter.addEventListener("change", run);
    if (sortFilter) sortFilter.addEventListener("change", run);
    if (priceFilter) priceFilter.addEventListener("change", run);

    run();
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
    if (ogImage) ogImage.setAttribute("content", deal.image || FALLBACK_IMAGE);
    if (twitterTitle) twitterTitle.setAttribute("content", title);
    if (twitterDescription) twitterDescription.setAttribute("content", description);
    if (twitterImage) twitterImage.setAttribute("content", deal.image || FALLBACK_IMAGE);
  }

  function renderDetailImage(containerId, deal) {
    const container = document.getElementById(containerId);
    if (!container) return false;

    container.classList.add("bg-white", "p-4", "overflow-hidden");
    container.innerHTML = imageMarkup(deal, "detail");
    return true;
  }

  function renderDealPage() {
    const asin = new URLSearchParams(window.location.search).get("asin");
    const deal = getDealByAsin(asin) || getDeals()[0];
    if (!deal) return;

    const finalLink = ensureAffiliateTag(deal.affiliate_link);

    const detailWrapper = document.getElementById("deal-image-wrapper");
    if (detailWrapper) {
      renderDetailImage("deal-image-wrapper", deal);
    } else {
      const imageEl = document.getElementById("product-image") || document.getElementById("deal-image");
      if (imageEl) {
        imageEl.src = deal.image || FALLBACK_IMAGE;
        imageEl.alt = deal.title;
        imageEl.referrerPolicy = "no-referrer";
        imageEl.onerror = function () {
          if (!this.dataset.fallbackTried) {
            this.dataset.fallbackTried = "1";
            this.src = FALLBACK_IMAGE;
            return;
          }
          this.onerror = null;
          this.style.display = "none";
          const fallback = document.createElement("div");
          fallback.className = "flex h-full w-full items-center justify-center bg-zinc-100 text-center";
          fallback.innerHTML = `
            <div>
              <div class="text-4xl font-bold text-zinc-700">${escapeHtml(initialsFromTitle(deal.title))}</div>
              <div class="mt-2 px-4 text-sm font-medium text-zinc-500">${escapeHtml(deal.title)}</div>
            </div>
          `;
          this.parentElement.appendChild(fallback);
        };
        imageEl.classList.add("object-contain");
        if (imageEl.parentElement) {
          imageEl.parentElement.classList.add("bg-white", "p-4");
        }
      }
    }

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
      const estimatedOld = Math.round(safeNumber(deal.price) * 1.25 * 100) / 100;
      oldPrice.textContent = `$${estimatedOld.toFixed(2)}`;
    }

    const quickPoints = document.getElementById("deal-quick-points");
    if (quickPoints) {
      quickPoints.innerHTML = (deal.quick_points || [])
        .map((point) => `<li>${escapeHtml(point)}</li>`)
        .join("");
    }

    const related = filterDeals({ sort: "score" })
      .filter((item) => item.asin !== deal.asin)
      .slice(0, 4);

    renderGrid("#related-deals", related);
    updateMetaForDeal(deal);
  }

  function getSwipeDeals() {
    const disliked = new Set(getDislikedDeals());
    return filterDeals({ sort: "score" }).filter((deal) => !disliked.has(deal.asin));
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

          <div class="h-[58%] overflow-hidden bg-white p-5">
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

  function renderSwipeHome() {
    const stack = document.getElementById("swipe-stack");
    if (!stack) return;

    const emptyState = document.getElementById("swipe-empty-state");
    const dislikeBtn = document.getElementById("swipe-dislike-btn");
    const likeBtn = document.getElementById("swipe-like-btn");
    const resetBtn = document.getElementById("reset-disliked-deals");

    let deals = getSwipeDeals();

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

    function buyTopDeal() {
      const current = topDeal();
      if (!current) return;
      addDislikedDeal(current.asin);
      deals = deals.filter((deal) => deal.asin !== current.asin);
      window.open(current.affiliate_link, "_blank", "noopener,noreferrer");
      render();
    }

    function dislikeTopDeal() {
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

      topCard.addEventListener("touchstart", function (event) {
        dragging = true;
        startX = event.touches[0].clientX;
        currentX = 0;
      }, { passive: true });

      topCard.addEventListener("touchmove", function (event) {
        onPointerMove(event.touches[0].clientX);
      }, { passive: true });

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
      resetBtn.addEventListener("click", function () {
        clearDislikedDeals();
        deals = getSwipeDeals();
        render();
      });
    }

    render();
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
    renderSwipeHome();
  });
})();
