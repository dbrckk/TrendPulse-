document.addEventListener("DOMContentLoaded", async () => {
  if (!window.supabaseClient) return;

  const pathParts = window.location.pathname.split("/").filter(Boolean);
  const slug = pathParts[0] === "collections" && pathParts[1]
    ? pathParts[1].toLowerCase()
    : null;

  if (!slug) return;

  const titleEl = document.getElementById("collection-title");
  const descriptionEl = document.getElementById("collection-description");
  const countEl = document.getElementById("collection-count");
  const gridEl = document.getElementById("collection-grid");
  const seoTextEl = document.getElementById("collection-seo-text");
  const relatedLinksEl = document.getElementById("collection-related-links");

  function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function escapeHtml(value = "") {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function formatPrice(value) {
    return `$${safeNumber(value).toFixed(2)}`;
  }

  function productUrl(product) {
    if (product.slug) return `/product/${encodeURIComponent(product.slug)}`;
    return `/product/${encodeURIComponent(product.asin || "")}`;
  }

  function proxyImage(url = "") {
    const raw = String(url).trim();
    if (!raw || raw.includes("placeholder") || raw.includes("your-image-url.com")) {
      return "https://via.placeholder.com/600x600?text=No+Image";
    }
    return raw;
  }

  function card(product) {
    return `
      <a href="${productUrl(product)}" class="block rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 transition hover:border-zinc-600">
        <img
          src="${proxyImage(product.image_url)}"
          alt="${escapeHtml(product.name || "Product")}"
          class="h-40 w-full rounded-xl bg-white object-contain"
          loading="lazy"
          onerror="this.src='https://via.placeholder.com/600x600?text=No+Image'"
        />
        <h3 class="mt-3 text-sm font-semibold text-white">${escapeHtml(product.name || "Product")}</h3>
        <div class="mt-2 text-xs text-zinc-400">
          ⭐ ${safeNumber(product.amazon_rating) > 0 ? safeNumber(product.amazon_rating).toFixed(1) : "—"} (${safeNumber(product.amazon_review_count)})
        </div>
        <div class="mt-2 font-bold text-green-400">${formatPrice(product.price)}</div>
      </a>
    `;
  }

  let pages = [];
  try {
    const response = await fetch("/programmatic-pages.json");
    pages = await response.json();
  } catch (error) {
    console.error("Failed to load programmatic pages config", error);
    return;
  }

  const config = pages.find((page) => page.slug === slug);
  if (!config) return;

  let query = window.supabaseClient
    .from("catalog_products")
    .select("*")
    .eq("category", config.category)
    .limit(48);

  const { data, error } = await query;

  if (error) {
    console.error(error);
    return;
  }

  let products = [...(data || [])];

  if (config.filter?.query) {
    const needle = String(config.filter.query).toLowerCase();
    products = products.filter((product) => {
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

  if (config.filter?.maxPrice != null) {
    products = products.filter(
      (product) => safeNumber(product.price, 999999) <= safeNumber(config.filter.maxPrice, 999999)
    );
  }

  if (config.sort === "reviews") {
    products.sort((a, b) => safeNumber(b.amazon_review_count) - safeNumber(a.amazon_review_count));
  } else if (config.sort === "rating") {
    products.sort((a, b) => safeNumber(b.amazon_rating) - safeNumber(a.amazon_rating));
  } else if (config.sort === "price-low") {
    products.sort((a, b) => safeNumber(a.price) - safeNumber(b.price));
  } else {
    products.sort((a, b) => {
      if (safeNumber(a.source_rank, 999999) !== safeNumber(b.source_rank, 999999)) {
        return safeNumber(a.source_rank, 999999) - safeNumber(b.source_rank, 999999);
      }
      return safeNumber(b.score) - safeNumber(a.score);
    });
  }

  products = products.slice(0, 24);

  if (titleEl) titleEl.textContent = config.title;
  if (descriptionEl) descriptionEl.textContent = config.description;
  if (countEl) countEl.textContent = `${products.length} ${products.length === 1 ? "product" : "products"}`;
  if (gridEl) gridEl.innerHTML = products.map(card).join("");
  if (seoTextEl) seoTextEl.textContent = config.seoText || config.description;

  document.title = `${config.title} | TrendPulse`;

  const canonicalUrl = `https://www.trend-pulse.shop/collections/${slug}`;

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

  const related = pages
    .filter((page) => page.slug !== slug && page.category === config.category)
    .slice(0, 6);

  if (relatedLinksEl) {
    relatedLinksEl.innerHTML = related.map((page) => `
      <a
        href="/collections/${page.slug}"
        class="rounded-full border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-white"
      >
        ${escapeHtml(page.title)}
      </a>
    `).join("");
  }
});
