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

  function normalizeText(value) {
    return String(value || "").trim();
  }

  function normalizeCategory(value) {
    if (
      window.TrendPulseData &&
      typeof window.TrendPulseData.normalizeCategory === "function"
    ) {
      return window.TrendPulseData.normalizeCategory(value);
    }

    const v = normalizeText(value).toLowerCase();

    if (["men", "women", "jewelry", "jewellery", "shoes", "watches"].includes(v)) return "fashion";
    if (["baby", "kids", "pets", "toys"].includes(v)) return "family";
    if (["electronics", "gadget", "gaming", "computer", "computers", "phone", "phones", "audio"].includes(v)) return "tech";
    if (["furniture", "decor", "storage", "household", "office"].includes(v)) return "home";
    if (["cooking", "cookware", "appliances"].includes(v)) return "kitchen";
    if (["beauty", "skincare", "makeup", "cosmetics"].includes(v)) return "beauty";
    if (["health", "wellness", "supplement", "supplements"].includes(v)) return "health";
    if (["sport", "sports", "fitness", "outdoor", "exercise", "training"].includes(v)) return "sports";
    if (["travel", "luggage", "backpack", "bags"].includes(v)) return "travel";

    return v || "general";
  }

  function proxyImage(url) {
    const raw = normalizeText(url);
    if (!raw || raw.includes("placeholder") || raw.includes("your-image-url.com")) {
      return "https://via.placeholder.com/600x600?text=No+Image";
    }
    return raw;
  }

  function normalizeProduct(row) {
    const price = safeNumber(row?.price, 0);
    const original = safeNumber(row?.original_price, 0);
    const discount = safeNumber(
      row?.discount ?? row?.discount_percentage ?? row?.discount_percent,
      0
    );

    return {
      id: row?.id || null,
      asin: normalizeText(row?.asin),
      slug: normalizeText(row?.slug) || normalizeText(row?.asin),
      name: normalizeText(row?.name) || normalizeText(row?.title) || "Amazon Product",
      title: normalizeText(row?.name) || normalizeText(row?.title) || "Amazon Product",
      brand: normalizeText(row?.brand),
      description: normalizeText(row?.description),
      short_description: normalizeText(row?.short_description),
      subcategory: normalizeText(row?.subcategory),

      image: proxyImage(row?.image || row?.image_url),
      image_url: proxyImage(row?.image || row?.image_url),

      price,
      oldPrice: original > price ? original : null,
      original_price: original > price ? original : null,

      discount,
      discount_percentage: discount,

      rating: safeNumber(row?.rating ?? row?.amazon_rating, 0),
      reviews: safeNumber(row?.reviews ?? row?.amazon_review_count, 0),
      amazon_rating: safeNumber(row?.rating ?? row?.amazon_rating, 0),
      amazon_review_count: safeNumber(row?.reviews ?? row?.amazon_review_count, 0),

      category: normalizeCategory(row?.category),
      affiliate: normalizeText(
        row?.affiliate || row?.affiliate_link || row?.amazon_url || row?.link || "#"
      ),
      affiliate_link: normalizeText(
        row?.affiliate || row?.affiliate_link || row?.amazon_url || row?.link || "#"
      ),
      amazon_url: normalizeText(
        row?.amazon_url || row?.affiliate || row?.affiliate_link || row?.link || "#"
      ),

      priority: safeNumber(row?.priority, 0),
      clicks: safeNumber(row?.clicks, 0),
      views: safeNumber(row?.views, 0),
      likes: safeNumber(row?.likes, 0),

      created_at: row?.created_at || null,
      updated_at: row?.updated_at || null,
      published_at: row?.published_at || null,
      score: 0
    };
  }

  function dedupeProducts(products) {
    const seen = new Set();

    return (products || []).filter((product) => {
      const key =
        normalizeText(product?.asin) ||
        normalizeText(product?.slug) ||
        normalizeText(product?.id) ||
        normalizeText(product?.name);

      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function computeScore(product) {
    return (
      safeNumber(product.reviews) * 0.4 +
      safeNumber(product.rating) * 100 * 0.3 +
      safeNumber(product.discount) * 10 * 0.2 +
      safeNumber(product.priority) * 4 +
      safeNumber(product.likes) * 2 +
      safeNumber(product.clicks) * 1.5 +
      safeNumber(product.views) * 0.15
    );
  }

  function sortProducts(products, sortMode) {
    const arr = [...products];

    if (sortMode === "reviews") {
      arr.sort((a, b) => safeNumber(b.reviews) - safeNumber(a.reviews));
    } else if (sortMode === "rating") {
      arr.sort((a, b) => safeNumber(b.rating) - safeNumber(a.rating));
    } else if (sortMode === "price-low") {
      arr.sort((a, b) => safeNumber(a.price) - safeNumber(b.price));
    } else if (sortMode === "price-high") {
      arr.sort((a, b) => safeNumber(b.price) - safeNumber(a.price));
    } else {
      arr.sort((a, b) => safeNumber(b.score) - safeNumber(a.score));
    }

    return arr;
  }

  function applyKeywordFilter(products, queryText) {
    if (!queryText) return products;

    const needle = normalizeText(queryText).toLowerCase();

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

  function fallbackCard(product) {
    const title = escapeHtml(product.name || product.title || "Amazon Product");
    const image = escapeHtml(
      product.image || product.image_url || "https://via.placeholder.com/600x600?text=No+Image"
    );
    const price = safeNumber(product.price, 0);
    const oldPrice = product.oldPrice ?? product.original_price;
    const rating = safeNumber(product.rating ?? product.amazon_rating, 0);
    const reviews = safeNumber(product.reviews ?? product.amazon_review_count, 0);
    const url = escapeHtml(
      product.affiliate || product.affiliate_link || product.amazon_url || "#"
    );
    const slug = encodeURIComponent(product.slug || product.asin || "");

    return `
      <article class="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 shadow-sm transition hover:scale-[1.01] hover:border-zinc-700">
        <a href="/product/${slug}" class="block">
          <div class="relative overflow-hidden rounded-xl bg-white">
            <img
              src="${image}"
              alt="${title}"
              class="h-40 w-full object-contain"
              loading="lazy"
              onerror="this.src='https://via.placeholder.com/600x600?text=No+Image'"
            />
          </div>

          <h3 class="mt-3 line-clamp-2 text-sm font-semibold text-white">${title}</h3>

          <div class="mt-2 text-xs text-zinc-400">
            ⭐ ${rating > 0 ? rating.toFixed(1) : "—"} (${reviews.toLocaleString()})
          </div>

          <div class="mt-3 flex items-center gap-2">
            <span class="text-lg font-bold text-green-400">$${price.toFixed(2)}</span>
            ${
              oldPrice
                ? `<span class="text-xs text-zinc-500 line-through">$${safeNumber(oldPrice).toFixed(2)}</span>`
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

  function renderProducts(products) {
    const container =
      document.querySelector("#collection-grid") ||
      document.querySelector("#products") ||
      document.querySelector("#products-container");

    if (!container) return;

    if (
      window.TrendPulseUI &&
      typeof window.TrendPulseUI.renderProducts === "function"
    ) {
      window.TrendPulseUI.renderProducts(products, container);
      return;
    }

    if (!products || !products.length) {
      container.innerHTML = `
        <div class="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-center text-zinc-400">
          No products found
        </div>
      `;
      return;
    }

    container.innerHTML = products.map(fallbackCard).join("");
  }

  function setEmptyState(isEmpty) {
    const emptyStateEl =
      document.getElementById("collection-empty-state") ||
      document.getElementById("empty-state");

    if (!emptyStateEl) return;
    emptyStateEl.classList.toggle("hidden", !isEmpty);
  }

  async function fetchBaseProducts(config) {
    if (
      window.TrendPulseData &&
      typeof window.TrendPulseData.fetchCollectionProducts === "function"
    ) {
      const products = await window.TrendPulseData.fetchCollectionProducts(config, 24);
      return dedupeProducts((products || []).map(normalizeProduct)).map((p) => ({
        ...p,
        score: computeScore(p)
      }));
    }

    if (
      window.TrendPulseData &&
      typeof window.TrendPulseData.fetchCatalogByCategory === "function"
    ) {
      const rows = await window.TrendPulseData.fetchCatalogByCategory(config.category, 120);
      return dedupeProducts((rows || []).map(normalizeProduct)).map((p) => ({
        ...p,
        score: computeScore(p)
      }));
    }

    if (!window.supabaseClient) {
      throw new Error("Missing Supabase client");
    }

    const { data, error } = await window.supabaseClient
      .from("catalog_category_feed")
      .select("*")
      .eq("category", normalizeCategory(config.category))
      .limit(120);

    if (error) {
      throw error;
    }

    return dedupeProducts((data || []).map(normalizeProduct)).map((p) => ({
      ...p,
      score: computeScore(p)
    }));
  }

  async function fetchFallbackProducts() {
    if (
      window.TrendPulseData &&
      typeof window.TrendPulseData.fetchTopProducts === "function"
    ) {
      const rows = await window.TrendPulseData.fetchTopProducts(60);
      return dedupeProducts((rows || []).map(normalizeProduct)).map((p) => ({
        ...p,
        score: computeScore(p)
      }));
    }

    if (!window.supabaseClient) {
      throw new Error("Missing Supabase client");
    }

    const { data, error } = await window.supabaseClient
      .from("products")
      .select("*")
      .limit(120);

    if (error) {
      throw error;
    }

    return dedupeProducts((data || []).map(normalizeProduct)).map((p) => ({
      ...p,
      score: computeScore(p)
    }));
  }

  async function loadCollection() {
    const titleEl = document.getElementById("collection-title");
    const descEl = document.getElementById("collection-description");
    const countEl = document.getElementById("collection-count");
    const seoEl = document.getElementById("collection-seo-text");
    const relatedLinksEl = document.getElementById("collection-related-links");

    try {
      const pathParts = window.location.pathname.split("/").filter(Boolean);
      const slug =
        pathParts[0] === "collections" && pathParts[1]
          ? decodeURIComponent(pathParts[1]).toLowerCase()
          : "";

      if (!slug) {
        throw new Error("Missing collection slug");
      }

      const response = await fetch("/programmatic-pages.json", { cache: "no-store" });
      const pages = await response.json();
      const config = (pages || []).find((page) => page.slug === slug);

      if (!config) {
        throw new Error("Collection config not found");
      }

      if (titleEl) titleEl.textContent = config.title;
      if (descEl) descEl.textContent = config.description;
      if (seoEl) seoEl.textContent = config.seoText || config.description;
      if (countEl) countEl.textContent = "Loading products...";

      document.title = `${config.title} | TrendPulse`;

      let products = await fetchBaseProducts(config);
      products = applyKeywordFilter(products, config.filter?.query || null);
      products = applyPriceFilter(products, config.filter?.maxPrice ?? null);
      products = sortProducts(products, config.sort || "score");

      if (!products.length) {
        let fallback = await fetchFallbackProducts();
        fallback = applyKeywordFilter(fallback, config.filter?.query || null);
        fallback = applyPriceFilter(fallback, config.filter?.maxPrice ?? null);
        fallback = sortProducts(fallback, config.sort || "score");
        products = fallback;
      }

      products = products.slice(0, 24);

      renderProducts(products);
      setEmptyState(products.length === 0);

      if (countEl) {
        countEl.textContent = `${products.length} ${
          products.length === 1 ? "product" : "products"
        }`;
      }

      if (relatedLinksEl) {
        const sameCategory = (pages || [])
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
    } catch (error) {
      console.error("COLLECTION ERROR:", error);

      renderProducts([]);
      setEmptyState(true);

      if (descEl) descEl.textContent = "Error loading collection";
      if (countEl) countEl.textContent = "Error loading products";
    }
  }

  document.addEventListener("DOMContentLoaded", loadCollection);
})();
