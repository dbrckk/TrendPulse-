(function () {
  const config = window.TRENDPULSE_CONFIG || {
    affiliateTag: "Drackk-20"
  };

  let productsCache = null;
  let productsPromise = null;
  let debugBox = null;

  function ensureDebugBox() {
    if (debugBox) return debugBox;

    debugBox = document.createElement("div");
    debugBox.id = "tp-debug-box";
    debugBox.style.position = "fixed";
    debugBox.style.left = "0";
    debugBox.style.right = "0";
    debugBox.style.bottom = "0";
    debugBox.style.maxHeight = "220px";
    debugBox.style.overflow = "auto";
    debugBox.style.background = "rgba(0,0,0,0.92)";
    debugBox.style.color = "#7CFC00";
    debugBox.style.fontSize = "11px";
    debugBox.style.lineHeight = "1.45";
    debugBox.style.padding = "8px";
    debugBox.style.zIndex = "99999";
    debugBox.style.whiteSpace = "pre-wrap";
    debugBox.style.borderTop = "1px solid #222";

    function appendBox() {
      if (document.body && !document.body.contains(debugBox)) {
        document.body.appendChild(debugBox);
      }
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", appendBox, { once: true });
    } else {
      appendBox();
    }

    return debugBox;
  }

  function debugLog(label, value) {
    const box = ensureDebugBox();
    let text;

    try {
      text =
        typeof value === "string"
          ? value
          : JSON.stringify(value, null, 2);
    } catch {
      text = String(value);
    }

    box.textContent += `\n[${label}]\n${text}\n`;
    console.log(label, value);
  }

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

  function normalize(value = "") {
    return String(value).trim().toLowerCase();
  }

  function capitalize(value = "") {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
  }

  function formatPrice(value) {
    return `$${safeNumber(value).toFixed(2)}`;
  }

  function ensureAffiliateTag(url) {
    const raw = String(url || "").trim();
    if (!raw) return "#";

    try {
      const parsed = new URL(raw);
      if (parsed.hostname.includes("amazon")) {
        parsed.searchParams.set("tag", config.affiliateTag || "Drackk-20");
      }
      return parsed.toString();
    } catch {
      return raw;
    }
  }

  function proxyImage(url) {
    const raw = String(url || "").trim();

    if (!raw || raw.includes("your-image-url.com")) {
      return "https://via.placeholder.com/600x600?text=No+Image";
    }

    try {
      const parsed = new URL(raw);
      return `https://images.weserv.nl/?url=${encodeURIComponent(
        parsed.host + parsed.pathname + parsed.search
      )}&w=1200&h=1200&fit=contain&bg=ffffff&output=jpg`;
    } catch {
      return "https://via.placeholder.com/600x600?text=No+Image";
    }
  }

  function initialsFromTitle(title = "") {
    const words = String(title).trim().split(/\s+/).filter(Boolean).slice(0, 2);
    if (!words.length) return "TP";
    return words.map((word) => word[0]).join("").toUpperCase();
  }

  function buildPlaceholder(product) {
    const title = String(product.name || product.title || "Product");
    const badge = product.is_best_seller
      ? "Best Seller"
      : product.is_giftable
      ? "Giftable"
      : product.is_crazy_deal
      ? "Hot Deal"
      : "Product";

    const price = formatPrice(product.price || 0);
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
        <circle cx="660" cy="140" r="110" fill="#ffffff" opacity="0.07"/>
        <circle cx="130" cy="670" r="150" fill="#ffffff" opacity="0.05"/>
        <rect x="42" y="42" rx="24" ry="24" width="190" height="58" fill="#09090b" opacity="0.95"/>
        <text x="137" y="79" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700" fill="#ffffff">${escapeHtml(
          badge
        )}</text>
        <text x="400" y="355" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="170" font-weight="800" fill="#ffffff" opacity="0.12">${escapeHtml(
          initials
        )}</text>
        <text x="50" y="560" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="800" fill="#ffffff">${escapeHtml(
          title.slice(0, 24)
        )}</text>
        <text x="50" y="622" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="800" fill="#ffffff">${escapeHtml(
          title.slice(24, 48)
        )}</text>
        <rect x="42" y="690" rx="24" ry="24" width="190" height="70" fill="#09090b" opacity="0.95"/>
        <text x="137" y="736" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="800" fill="#22c55e">${escapeHtml(
          price
        )}</text>
      </svg>
    `;

    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function buildProductUrl(product) {
    if (product.slug) {
      return `/product.html?slug=${encodeURIComponent(product.slug)}`;
    }
    return `/product.html?asin=${encodeURIComponent(product.asin || "")}`;
  }

  function normalizeProduct(row) {
    return {
      ...row,
      name: row.name || row.title || "Amazon Product",
      category: normalize(row.category || "general"),
      price: safeNumber(row.price, 0),
      original_price: safeNumber(row.original_price, 0),
      amazon_rating: safeNumber(row.amazon_rating, 0),
      amazon_review_count: safeNumber(row.amazon_review_count, 0),
      discount_percentage: safeNumber(row.discount_percentage, 0),
      score: safeNumber(row.score, 0),
      priority: safeNumber(row.priority, 0),
      affiliate_link: ensureAffiliateTag(row.affiliate_link || row.amazon_url || "#")
    };
  }

  async function fetchProducts() {
    if (productsCache) return productsCache;
    if (productsPromise) return productsPromise;

    if (!window.supabaseClient) {
      debugLog("supabase", "client missing");
      productsCache = [];
      return productsCache;
    }

    productsPromise = window.supabaseClient
      .from("products")
      .select("*")
      .limit(300)
      .then(({ data, error }) => {
        debugLog("raw error", error || "none");
        debugLog("raw count", Array.isArray(data) ? data.length : 0);

        if (Array.isArray(data) && data.length) {
          debugLog(
            "raw sample",
            data.slice(0, 3).map((p) => ({
              id: p.id,
              name: p.name,
              type: p.type,
              is_active: p.is_active,
              image_url: p.image_url
            }))
          );
        }

        if (error) {
          productsCache = [];
          return productsCache;
        }

        productsCache = (data || []).map(normalizeProduct);
        return productsCache;
      })
      .catch((error) => {
        debugLog("fetch catch", String(error));
        productsCache = [];
        return productsCache;
      });

    return productsPromise;
  }

  function getHotLabel(product) {
    if (product.is_best_seller) return "Best Seller";
    if (product.is_crazy_deal) return "Hot Deal";
    if (product.discount_percentage >= 40) return "Big Discount";
    if (product.price <= 10) return "Hot Price";
    if (product.price <= 20) return "Low Price";
    return "Popular";
  }

  function productCard(product) {
    const proxiedImage = proxyImage(product.image_url || product.image || "");
    const placeholder = buildPlaceholder(product);
    const rating = product.amazon_rating > 0 ? product.amazon_rating.toFixed(1) : "—";
    const reviews = product.amazon_review_count.toLocaleString();
    const price = formatPrice(product.price);

    return `
      <article class="group h-full overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/70 transition hover:border-zinc-500 hover:shadow-xl hover:shadow-black/30">
        <a href="${buildProductUrl(product)}" class="flex h-full flex-col">
          <div class="relative aspect-square overflow-hidden bg-white">
            <img
              src="${placeholder}"
              alt="${escapeHtml(product.name)}"
              class="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
            />
            <img
              src="${proxiedImage}"
              alt="${escapeHtml(product.name)}"
              class="relative z-10 h-full w-full object-contain transition duration-300 group-hover:scale-[1.02]"
              loading="lazy"
              referrerpolicy="no-referrer"
              onerror="this.src='https://via.placeholder.com/600x600?text=No+Image'"
            />

            <div class="absolute right-3 top-3 z-20 rounded-full bg-black/80 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
              ${escapeHtml(getHotLabel(product))}
            </div>
          </div>

          <div class="flex flex-1 flex-col p-4">
            <div class="mb-2 flex flex-wrap gap-2">
              ${
                product.category
                  ? `
                <span class="rounded-full border border-zinc-700 px-2.5 py-1 text-[11px] font-medium text-zinc-300">
                  ${escapeHtml(capitalize(product.category))}
                </span>
              `
                  : ""
              }
              ${
                product.is_giftable
                  ? `
                <span class="rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] font-medium text-zinc-400">
                  Giftable
                </span>
              `
                  : ""
              }
            </div>

            <h3 class="min-h-[3rem] text-sm font-semibold leading-6 text-white">
              ${escapeHtml(product.name)}
            </h3>

            <div class="mt-2 text-xs text-zinc-400">
              ⭐ ${rating} (${reviews})
            </div>

            <div class="mt-auto flex items-end justify-between gap-3 pt-4">
              <div class="flex flex-col">
                <span class="text-lg font-bold text-green-400">${price}</span>
                <span class="text-[10px] text-zinc-500">View details</span>
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

  function renderGrid(selector, items) {
    const el = document.querySelector(selector);
    if (!el) return;
    el.innerHTML = items.map(productCard).join("");
  }

  function sortByScore(items) {
    return [...items].sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      if (b.score !== a.score) return b.score - a.score;
      return b.amazon_review_count - a.amazon_review_count;
    });
  }

  async function renderDealsPage() {
    const grid = document.getElementById("deals-grid");
    if (!grid) {
      debugLog("page", "not deals page");
      return;
    }

    const searchInput = document.getElementById("searchInput");
    const categoryFilter = document.getElementById("categoryFilter");
    const sortFilter = document.getElementById("sortFilter");
    const priceFilter = document.getElementById("priceFilter");
    const results = document.getElementById("resultCount");

    function parseMaxPrice() {
      if (!priceFilter) return null;
      if (priceFilter.value === "under-10") return 10;
      if (priceFilter.value === "under-25") return 25;
      if (priceFilter.value === "under-50") return 50;
      return null;
    }

    function sortItems(items, sortValue) {
      const sorted = [...items];

      if (sortValue === "low") {
        sorted.sort((a, b) => a.price - b.price);
      } else if (sortValue === "high") {
        sorted.sort((a, b) => b.price - a.price);
      } else if (sortValue === "title") {
        sorted.sort((a, b) => a.name.localeCompare(b.name));
      } else {
        return sortByScore(sorted);
      }

      return sorted;
    }

    async function run() {
      const products = await fetchProducts();
      debugLog("normalized count", products.length);

      const query = normalize(searchInput ? searchInput.value : "");
      const category = normalize(categoryFilter ? categoryFilter.value : "all");
      const maxPrice = parseMaxPrice();
      const sortValue = sortFilter ? sortFilter.value : "score";

      let items = products.filter((p) => p.is_active !== false);

      debugLog(
        "after active filter",
        items.slice(0, 5).map((p) => ({
          name: p.name,
          type: p.type,
          is_active: p.is_active,
          image_url: p.image_url
        }))
      );

      if (query) {
        items = items.filter((p) => {
          const haystack = [
            p.name,
            p.description,
            p.short_description,
            p.category,
            p.brand,
            p.subcategory
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return haystack.includes(query);
        });
      }

      if (category && category !== "all") {
        items = items.filter((p) => p.category === category);
      }

      if (maxPrice != null) {
        items = items.filter((p) => p.price <= maxPrice);
      }

      items = sortItems(items, sortValue);

      debugLog("final visible count", items.length);

      grid.innerHTML = items.map(productCard).join("");

      if (results) {
        results.textContent = `${items.length} ${items.length === 1 ? "deal" : "deals"}`;
      }
    }

    searchInput?.addEventListener("input", run);
    categoryFilter?.addEventListener("change", run);
    sortFilter?.addEventListener("change", run);
    priceFilter?.addEventListener("change", run);

    await run();
  }

  window.TrendPulseUI = {
    fetchProducts,
    productCard,
    proxyImage,
    buildPlaceholder
  };

  window.debugDeals = async function () {
    const { data, error } = await window.supabaseClient
      .from("products")
      .select("*")
      .limit(5);

    debugLog("manual data", data || []);
    debugLog("manual error", error || "none");
    return { data, error };
  };

  document.addEventListener("DOMContentLoaded", async function () {
    ensureDebugBox();
    await renderDealsPage();
  });
})();
