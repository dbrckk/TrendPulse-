(function () {
  let productsCache = null;
  let productsPromise = null;

  function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function normalize(value = "") {
    return String(value).trim().toLowerCase();
  }

  function escapeHtml(value = "") {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatPrice(value) {
    return `$${safeNumber(value).toFixed(2)}`;
  }

  function proxyImage(url = "") {
    const raw = String(url || "").trim();
    if (!raw || raw.includes("placeholder") || raw.includes("your-image-url.com")) {
      return "https://via.placeholder.com/600x600?text=No+Image";
    }
    return raw;
  }

  function productPath(product) {
    const slug = String(product?.slug || "").trim();
    const asin = String(product?.asin || "").trim();

    if (slug) return `/product/${encodeURIComponent(slug)}`;
    if (asin) return `/product/${encodeURIComponent(asin)}`;
    return "/catalog";
  }

  function amazonLink(product) {
    return (
      product?.affiliate_link ||
      product?.amazon_url ||
      product?.raw_amazon_url ||
      "#"
    );
  }

  function normalizeCategory(raw = "") {
    const value = normalize(raw);

    if (["men", "women", "jewelry"].includes(value)) return "fashion";
    if (["baby", "pets"].includes(value)) return "family";
    return value || "general";
  }

  function computeScore(product) {
    const reviews = safeNumber(product.amazon_review_count, 0);
    const rating = safeNumber(product.amazon_rating, 0);
    const discount = safeNumber(
      product.discount_percentage ?? product.discount_percent,
      20
    );
    const priority = safeNumber(product.priority, 0);
    const likes = safeNumber(product.likes, 0);
    const sourceBonus =
      String(product.source_kind || product.type || "").toLowerCase() === "deal"
        ? 120
        : 0;

    return (
      reviews * 0.4 +
      rating * 100 * 0.3 +
      discount * 10 * 0.2 +
      priority * 4 +
      likes * 2 +
      sourceBonus +
      Math.random() * 25
    );
  }

  function dedupeProducts(items) {
    const seen = new Set();

    return items.filter((item) => {
      const key =
        String(item?.asin || "").trim() ||
        String(item?.slug || "").trim() ||
        String(item?.id || "").trim() ||
        String(item?.name || "").trim();

      if (!key) return false;
      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    });
  }

  function sanitizeProduct(row) {
    const price = safeNumber(row?.price, 0);
    const originalPrice =
      safeNumber(row?.original_price, 0) > 0
        ? safeNumber(row.original_price, 0)
        : price > 0
          ? price * 1.5
          : 0;

    return {
      ...row,
      slug: String(row?.slug || "").trim() || String(row?.asin || "").trim(),
      asin: String(row?.asin || "").trim(),
      name: String(row?.name || "").trim() || "Amazon Product",
      description: row?.description || "",
      short_description: row?.short_description || "",
      brand: row?.brand || "",
      category: normalizeCategory(row?.category),
      image_url: proxyImage(row?.image_url),
      price,
      original_price: originalPrice,
      discount_percentage: safeNumber(
        row?.discount_percentage ?? row?.discount_percent,
        0
      ),
      amazon_rating: safeNumber(row?.amazon_rating, 0),
      amazon_review_count: safeNumber(row?.amazon_review_count, 0),
      priority: safeNumber(row?.priority, 0),
      score: safeNumber(row?.score, 0),
      is_active:
        typeof row?.is_active === "boolean" ? row.is_active : true,
      source_kind: row?.source_kind || row?.type || "catalog"
    };
  }

  function getDiscount(product) {
    const price = safeNumber(product.price, 0);
    const original = safeNumber(product.original_price, 0) || price * 1.5;

    if (original > price && price > 0) {
      return Math.max(1, Math.round(((original - price) / original) * 100));
    }

    return Math.max(
      10,
      Math.min(
        65,
        Math.round(
          safeNumber(product.discount_percentage ?? product.discount_percent, 18)
        )
      )
    );
  }

  function productCard(product) {
    const image = proxyImage(product.image_url);
    const rating = safeNumber(product.amazon_rating, 0);
    const reviews = safeNumber(product.amazon_review_count, 0);
    const price = safeNumber(product.price, 0);
    const originalPrice =
      safeNumber(product.original_price, 0) > 0
        ? safeNumber(product.original_price, 0)
        : price > 0
          ? price * 1.5
          : 0;

    const discount = getDiscount(product);
    const hook = window.ProductHooks
      ? window.ProductHooks.getHook(product)
      : "Popular right now";
    const urgency = window.ProductHooks
      ? window.ProductHooks.getUrgency(product)
      : "Selling fast";
    const proof = window.ProductHooks
      ? window.ProductHooks.getSocialProof(product)
      : "Frequently bought";
    const priceStory = window.ProductHooks
      ? window.ProductHooks.getPriceStory(product)
      : "High-demand product";

    return `
      <article class="block rounded-2xl border border-zinc-800 bg-zinc-900 p-4 transition hover:scale-[1.02] hover:border-zinc-600">
        <a href="${productPath(product)}" class="block">
          <div class="relative">
            <img
              src="${image}"
              alt="${escapeHtml(product.name || "Product")}"
              class="h-44 w-full rounded-xl bg-white object-contain"
              loading="lazy"
              onerror="this.src='https://via.placeholder.com/600x600?text=No+Image'"
            />

            <div class="absolute left-2 top-2 rounded-full bg-red-500 px-2 py-1 text-xs font-bold text-white">
              -${discount}%
            </div>

            <div class="absolute bottom-2 right-2 rounded-full bg-black/80 px-2 py-1 text-xs text-white">
              🔥 ${escapeHtml(proof)}
            </div>
          </div>

          <div class="mt-3 text-xs font-semibold text-green-400">
            ${escapeHtml(hook)}
          </div>

          <h3 class="mt-2 line-clamp-2 text-sm font-semibold text-white">
            ${escapeHtml(product.name || "Product")}
          </h3>

          <div class="mt-2 text-xs text-zinc-400">
            ⭐ ${rating > 0 ? rating.toFixed(1) : "—"} (${reviews.toLocaleString()})
          </div>

          <div class="mt-1 text-xs font-semibold text-red-400">
            ⚡ ${escapeHtml(urgency)}
          </div>

          <div class="mt-1 text-xs text-zinc-500">
            ${escapeHtml(priceStory)}
          </div>

          <div class="mt-2 flex items-center gap-2">
            <div class="text-lg font-bold text-green-400">
              ${formatPrice(price)}
            </div>
            <div class="text-xs text-zinc-500 line-through">
              ${originalPrice > 0 ? formatPrice(originalPrice) : ""}
            </div>
          </div>
        </a>

        <a
          href="${escapeHtml(amazonLink(product))}"
          target="_blank"
          rel="nofollow sponsored noopener"
          class="mt-3 block rounded-xl bg-green-500 py-2 text-center text-sm font-bold text-black"
        >
          View Deal →
        </a>
      </article>
    `;
  }

  async function fetchPrimaryProducts() {
    if (!window.supabaseClient) return [];

    try {
      const { data, error } = await window.supabaseClient
        .from("catalog_category_feed")
        .select("*")
        .limit(400);

      if (error) {
        console.error("catalog_category_feed error:", error);
        return [];
      }

      return dedupeProducts(
        (data || [])
          .map(sanitizeProduct)
          .filter((row) => row.name && row.is_active !== false)
      );
    } catch (error) {
      console.error("Primary product fetch failed:", error);
      return [];
    }
  }

  async function fetchFallbackProducts() {
    if (!window.supabaseClient) return [];

    try {
      const { data, error } = await window.supabaseClient
        .from("products")
        .select("*")
        .limit(400);

      if (error) {
        console.error("products fallback error:", error);
        return [];
      }

      return dedupeProducts(
        (data || [])
          .map(sanitizeProduct)
          .filter((row) => row.name && row.is_active !== false)
      );
    } catch (error) {
      console.error("Fallback product fetch failed:", error);
      return [];
    }
  }

  async function fetchProducts() {
    if (productsCache) return productsCache;
    if (productsPromise) return productsPromise;

    productsPromise = (async () => {
      let items = await fetchPrimaryProducts();

      if (!items.length) {
        items = await fetchFallbackProducts();
      }

      items = dedupeProducts(items)
        .map((item) => ({
          ...item,
          final_score: computeScore(item)
        }))
        .sort((a, b) => safeNumber(b.final_score) - safeNumber(a.final_score));

      productsCache = items;
      return productsCache;
    })();

    return productsPromise;
  }

  async function renderDealsPage() {
    const grid = document.getElementById("deals-grid");
    if (!grid) return;

    const searchInput = document.getElementById("searchInput");
    const categoryFilter = document.getElementById("categoryFilter");
    const sortFilter = document.getElementById("sortFilter");
    const priceFilter = document.getElementById("priceFilter");
    const results = document.getElementById("resultCount");

    const products = await fetchProducts();

    function parseMaxPrice() {
      const value = priceFilter?.value || "all";
      if (value === "under-10") return 10;
      if (value === "under-25") return 25;
      if (value === "under-50") return 50;
      return null;
    }

    function sortProducts(items, mode) {
      const arr = [...items];

      if (mode === "reviews") {
        arr.sort((a, b) => safeNumber(b.amazon_review_count) - safeNumber(a.amazon_review_count));
      } else if (mode === "rating") {
        arr.sort((a, b) => safeNumber(b.amazon_rating) - safeNumber(a.amazon_rating));
      } else if (mode === "low") {
        arr.sort((a, b) => safeNumber(a.price) - safeNumber(b.price));
      } else if (mode === "high") {
        arr.sort((a, b) => safeNumber(b.price) - safeNumber(a.price));
      } else {
        arr.sort((a, b) => safeNumber(b.final_score) - safeNumber(a.final_score));
      }

      return arr;
    }

    function run() {
      const query = normalize(searchInput?.value || "");
      const category = normalize(categoryFilter?.value || "all");
      const maxPrice = parseMaxPrice();
      const sortMode = sortFilter?.value || "score";

      let items = [...products];

      if (query) {
        items = items.filter((p) => {
          const haystack = [
            p.name,
            p.description,
            p.short_description,
            p.brand,
            p.category,
            p.subcategory
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return haystack.includes(query);
        });
      }

      if (category && category !== "all") {
        items = items.filter((p) => normalizeCategory(p.category) === category);
      }

      if (maxPrice != null) {
        items = items.filter((p) => safeNumber(p.price, 999999) <= maxPrice);
      }

      items = sortProducts(items, sortMode);
      grid.innerHTML = items.map(productCard).join("");

      if (results) {
        results.textContent = `${items.length} ${items.length === 1 ? "deal" : "deals"}`;
      }
    }

    searchInput?.addEventListener("input", run);
    categoryFilter?.addEventListener("change", run);
    sortFilter?.addEventListener("change", run);
    priceFilter?.addEventListener("change", run);

    run();
  }

  window.TrendPulseUI = {
    fetchProducts,
    productCard,
    computeScore,
    getDiscount,
    productPath,
    amazonLink,
    sanitizeProduct,
    normalizeCategory
  };

  document.addEventListener("DOMContentLoaded", renderDealsPage);
})();
