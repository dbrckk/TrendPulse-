document.addEventListener("DOMContentLoaded", async () => {
  if (!window.supabaseClient) {
    console.error("Supabase client not available");
    return;
  }

  const titleEl = document.getElementById("collection-title");
  const descriptionEl = document.getElementById("collection-description");
  const countEl = document.getElementById("collection-count");
  const gridEl = document.getElementById("collection-grid");
  const seoTextEl = document.getElementById("collection-seo-text");
  const relatedLinksEl = document.getElementById("collection-related-links");
  const emptyStateEl = document.getElementById("collection-empty-state");

  function getCollectionSlug() {
    const pathParts = window.location.pathname.split("/").filter(Boolean);
    if (pathParts[0] === "collections" && pathParts[1]) {
      return decodeURIComponent(pathParts[1]).toLowerCase();
    }
    return null;
  }

  const slug = getCollectionSlug();
  if (!slug) return;

  function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
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

  function productUrl(product) {
    const slugValue = String(product?.slug || "").trim();
    const asin = String(product?.asin || "").trim();

    if (slugValue) return `/product/${encodeURIComponent(slugValue)}`;
    if (asin) return `/product/${encodeURIComponent(asin)}`;
    return "/catalog";
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
      source_kind: row?.source_kind || row?.type || "catalog",
      is_active: typeof row?.is_active === "boolean" ? row.is_active : true
    };
  }

  function getDiscount(product) {
    return window.TrendPulseUI?.getDiscount
      ? window.TrendPulseUI.getDiscount(product)
      : Math.max(10, Math.min(65, Math.round(safeNumber(product.discount_percentage, 18))));
  }

  function computeScore(product) {
    const reviews = safeNumber(product.amazon_review_count, 0);
    const rating = safeNumber(product.amazon_rating, 0);
    const discount = safeNumber(product.discount_percentage, 20);
    const priority = safeNumber(product.priority, 0);
    const sourceBonus =
      String(product.source_kind || "").toLowerCase() === "deal" ? 120 : 0;

    return (
      reviews * 0.4 +
      rating * 100 * 0.3 +
      discount * 10 * 0.2 +
      priority * 4 +
      sourceBonus +
      Math.random() * 25
    );
  }

  function card(product) {
    const rating = safeNumber(product.amazon_rating);
    const reviews = safeNumber(product.amazon_review_count);
    const image = proxyImage(product.image_url);
    const price = safeNumber(product.price, 0);
    const original = safeNumber(product.original_price, 0) || price * 1.5;
    const discount = getDiscount(product);
    const hook = window.ProductHooks ? window.ProductHooks.getHook(product) : "Popular right now";
    const urgency = window.ProductHooks ? window.ProductHooks.getUrgency(product) : "Selling fast";
    const proof = window.ProductHooks ? window.ProductHooks.getSocialProof(product) : "Frequently bought";
    const priceStory = window.ProductHooks ? window.ProductHooks.getPriceStory(product) : "High-demand product";

    return `
      <a href="${productUrl(product)}" class="block rounded-2xl border border-zinc-800 bg-zinc-900 p-4 transition hover:scale-[1.02] hover:border-zinc-600">
        <div class="relative">
          <img
            src="${image}"
            alt="${escapeHtml(product.name || "Product")}"
            class="h-40 w-full rounded-xl bg-white object-contain"
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

        <h3 class="mt-2 text-sm font-semibold text-white">
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
          <div class="text-lg font-bold text-green-400">${formatPrice(price)}</div>
          <div class="text-xs text-zinc-500 line-through">${formatPrice(original)}</div>
        </div>

        <div class="mt-3 rounded-xl bg-green-500 py-2 text-center text-sm font-bold text-black">
          View Deal →
        </div>
      </a>
    `;
  }

  function dedupeProducts(products) {
    const seen = new Set();

    return products.filter((product) => {
      const key =
        String(product?.asin || "").trim() ||
        String(product?.slug || "").trim() ||
        String(product?.id || "").trim() ||
        String(product?.name || "").trim();

      if (!key) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function applyKeywordFilter(products, queryText) {
    if (!queryText) return products;

    const needle = String(queryText).toLowerCase();

    return products.filter((product) => {
      const haystack = [
        product.name,
        product.brand,
        product.description,
        product.short_description,
        product.category,
        product.subcategory
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(needle);
    });
  }

  function applyPriceFilter(products, maxPrice) {
    if (maxPrice == null) return products;

    return products.filter(
      (product) => safeNumber(product.price, 999999) <= safeNumber(maxPrice, 999999)
    );
  }

  function sortProducts(products, sortMode) {
    const arr = [...products];

    if (sortMode === "reviews") {
      arr.sort((a, b) => safeNumber(b.amazon_review_count) - safeNumber(a.amazon_review_count));
    } else if (sortMode === "rating") {
      arr.sort((a, b) => safeNumber(b.amazon_rating) - safeNumber(a.amazon_rating));
    } else if (sortMode === "price-low") {
      arr.sort((a, b) => safeNumber(a.price) - safeNumber(b.price));
    } else {
      arr.sort((a, b) => safeNumber(b.final_score) - safeNumber(a.final_score));
    }

    return arr;
  }

  function setEmptyState(isEmpty) {
    if (!emptyStateEl) return;
    emptyStateEl.classList.toggle("hidden", !isEmpty);
  }

  function findCollectionConfig(pages, currentSlug) {
    return pages.find((page) => page.slug === currentSlug);
  }

  let pages = [];
  try {
    const response = await fetch("/programmatic-pages.json");
    pages = await response.json();
  } catch (error) {
    console.error("Failed to load programmatic pages config", error);
    return;
  }

  const config = findCollectionConfig(pages, slug);
  if (!config) return;

  const { data, error } = await window.supabaseClient
    .from("catalog_category_feed")
    .select("*")
    .eq("category", config.category)
    .limit(400);

  if (error) {
    console.error("Failed to load collection products", error);
    return;
  }

  let products = dedupeProducts((data || []).map(sanitizeProduct))
    .filter((p) => p.name && p.is_active !== false)
    .map((item) => ({
      ...item,
      final_score: computeScore(item)
    }));

  products = applyKeywordFilter(products, config.filter?.query || null);
  products = applyPriceFilter(products, config.filter?.maxPrice ?? null);
  products = sortProducts(products, config.sort || "score");
  products = products.slice(0, 24);

  if (titleEl) titleEl.textContent = config.title;
  if (descriptionEl) descriptionEl.textContent = config.description;
  if (countEl) {
    countEl.textContent = `${products.length} ${products.length === 1 ? "product" : "products"}`;
  }
  if (seoTextEl) seoTextEl.textContent = config.seoText || config.description;
  if (gridEl) gridEl.innerHTML = products.map(card).join("");

  setEmptyState(products.length === 0);

  if (relatedLinksEl) {
    const sameCategory = pages
      .filter((page) => page.slug !== config.slug && page.category === config.category)
      .slice(0, 6);

    relatedLinksEl.innerHTML = sameCategory
      .map(
        (page) => `
          <a
            href="/collections/${encodeURIComponent(page.slug)}"
            class="rounded-full border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-white"
          >
            ${escapeHtml(page.title)}
          </a>
        `
      )
      .join("");
  }
});
