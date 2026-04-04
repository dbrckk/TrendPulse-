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
    const raw = String(url).trim();
    if (!raw || raw.includes("placeholder") || raw.includes("your-image-url.com")) {
      return "https://via.placeholder.com/600x600?text=No+Image";
    }
    return raw;
  }

  function productUrl(product) {
    if (product.slug) {
      return `/product/${encodeURIComponent(product.slug)}`;
    }
    return `/product/${encodeURIComponent(product.asin || "")}`;
  }

  function capitalize(value = "") {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
  }

  function getBadge(product) {
    const sourceKind = String(product.source_kind || "").toLowerCase();

    if (sourceKind === "deal") {
      return `<span class="rounded-full bg-green-500/15 px-2.5 py-1 text-[11px] font-medium text-green-300">Deal</span>`;
    }

    if (product.is_best_seller) {
      return `<span class="rounded-full bg-blue-500/15 px-2.5 py-1 text-[11px] font-medium text-blue-300">Best Seller</span>`;
    }

    return `<span class="rounded-full border border-zinc-700 px-2.5 py-1 text-[11px] font-medium text-zinc-300">${escapeHtml(capitalize(product.category || "general"))}</span>`;
  }

  function card(product) {
    const rating = safeNumber(product.amazon_rating);
    const reviews = safeNumber(product.amazon_review_count);
    const image = proxyImage(product.image_url);

    return `
      <a href="${productUrl(product)}" class="block rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 transition hover:border-zinc-600">
        <div class="relative">
          <img
            src="${image}"
            alt="${escapeHtml(product.name || "Product")}"
            class="h-40 w-full rounded-xl bg-white object-contain"
            loading="lazy"
            onerror="this.src='https://via.placeholder.com/600x600?text=No+Image'"
          />
          ${
            product.source_rank
              ? `<div class="absolute right-3 top-3 rounded-full bg-black/80 px-2.5 py-1 text-[11px] font-semibold text-white">#${safeNumber(product.source_rank)}</div>`
              : ""
          }
        </div>

        <div class="mt-3 flex flex-wrap gap-2">
          ${getBadge(product)}
        </div>

        <h3 class="mt-3 text-sm font-semibold text-white">
          ${escapeHtml(product.name || "Product")}
        </h3>

        <div class="mt-2 text-xs text-zinc-400">
          ⭐ ${rating > 0 ? rating.toFixed(1) : "—"} (${reviews.toLocaleString()})
        </div>

        <div class="mt-2 font-bold text-green-400">${formatPrice(product.price)}</div>
      </a>
    `;
  }

  function dedupeProducts(products) {
    const seen = new Set();

    return products.filter((product) => {
      const key = product.asin || product.slug || product.name;
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
        product.category
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
      arr.sort((a, b) => {
        if (safeNumber(a.source_priority, 999999) !== safeNumber(b.source_priority, 999999)) {
          return safeNumber(a.source_priority, 999999) - safeNumber(b.source_priority, 999999);
        }

        if (safeNumber(a.source_rank, 999999) !== safeNumber(b.source_rank, 999999)) {
          return safeNumber(a.source_rank, 999999) - safeNumber(b.source_rank, 999999);
        }

        if (safeNumber(b.priority) !== safeNumber(a.priority)) {
          return safeNumber(b.priority) - safeNumber(a.priority);
        }

        if (safeNumber(b.score) !== safeNumber(a.score)) {
          return safeNumber(b.score) - safeNumber(a.score);
        }

        return safeNumber(b.amazon_review_count) - safeNumber(a.amazon_review_count);
      });
    }

    return arr;
  }

  function setEmptyState(isEmpty) {
    if (!emptyStateEl) return;
    emptyStateEl.classList.toggle("hidden", !isEmpty);
  }

  function updateMeta(config, canonicalUrl) {
    document.title = `${config.title} | TrendPulse`;

    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) metaDescription.setAttribute("content", config.description);

    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.setAttribute("href", canonicalUrl);

    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute("content", `${config.title} | TrendPulse`);

    const ogDescription = document.querySelector('meta[property="og:description"]');
    if (ogDescription) ogDescription.setAttribute("content", config.description);

    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) ogUrl.setAttribute("content", canonicalUrl);

    const twitterTitle = document.querySelector('meta[name="twitter:title"]');
    if (twitterTitle) twitterTitle.setAttribute("content", `${config.title} | TrendPulse`);

    const twitterDescription = document.querySelector('meta[name="twitter:description"]');
    if (twitterDescription) twitterDescription.setAttribute("content", config.description);

    const schemaEl = document.getElementById("collection-schema");
    if (schemaEl) {
      schemaEl.textContent = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: `${config.title} | TrendPulse`,
        url: canonicalUrl,
        description: config.description
      });
    }
  }

  function renderRelatedPages(pages, currentConfig) {
    if (!relatedLinksEl) return;

    const sameCategory = pages
      .filter((page) => page.slug !== currentConfig.slug && page.category === currentConfig.category)
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

  let products = dedupeProducts(data || []);
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

  const canonicalUrl = `https://www.trend-pulse.shop/collections/${encodeURIComponent(slug)}`;
  updateMeta(config, canonicalUrl);
  renderRelatedPages(pages, config);
});
