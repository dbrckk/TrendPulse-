document.addEventListener("DOMContentLoaded", async () => {
  if (!window.supabaseClient) return;

  const pathParts = window.location.pathname.split("/").filter(Boolean);
  const slug = pathParts[0] === "collections" && pathParts[1] ? pathParts[1].toLowerCase() : null;
  if (!slug) return;

  const titleEl = document.getElementById("collection-title");
  const descriptionEl = document.getElementById("collection-description");
  const countEl = document.getElementById("collection-count");
  const gridEl = document.getElementById("collection-grid");
  const seoTextEl = document.getElementById("collection-seo-text");
  const relatedLinksEl = document.getElementById("collection-related-links");

  const collectionMap = {
    "best-tech-products": {
      title: "Best Tech Products",
      description: "Discover popular tech products frequently bought on Amazon.",
      category: "tech",
      seo: "This page highlights popular tech products with strong buying frequency on Amazon. It is designed to help users quickly discover proven electronics, gadgets, and accessories."
    },
    "best-home-products": {
      title: "Best Home Products",
      description: "Discover popular home products frequently bought on Amazon.",
      category: "home",
      seo: "This page gathers popular home products that users buy regularly on Amazon, including everyday essentials, comfort items, and useful home upgrades."
    },
    "best-kitchen-products": {
      title: "Best Kitchen Products",
      description: "Discover popular kitchen products frequently bought on Amazon.",
      category: "kitchen",
      seo: "This page focuses on high-demand kitchen products, cookware, and tools that perform well over time on Amazon."
    },
    "best-beauty-products": {
      title: "Best Beauty Products",
      description: "Discover popular beauty products frequently bought on Amazon.",
      category: "beauty",
      seo: "This page highlights beauty and skincare products with consistent buying demand on Amazon."
    },
    "best-sports-products": {
      title: "Best Sports Products",
      description: "Discover popular sports products frequently bought on Amazon.",
      category: "sports",
      seo: "This page groups frequently bought sports and fitness products with strong long-term demand."
    },
    "best-health-products": {
      title: "Best Health Products",
      description: "Discover popular health products frequently bought on Amazon.",
      category: "health",
      seo: "This page covers popular health and wellness products often bought by Amazon users."
    },
    "best-travel-products": {
      title: "Best Travel Products",
      description: "Discover popular travel products frequently bought on Amazon.",
      category: "travel",
      seo: "This page highlights travel essentials and gear with strong purchase frequency on Amazon."
    },
    "best-products-for-men": {
      title: "Best Products for Men",
      description: "Discover popular products for men frequently bought on Amazon.",
      category: "men",
      seo: "This page features frequently bought products for men, including accessories, essentials, and high-demand daily items."
    },
    "best-products-for-women": {
      title: "Best Products for Women",
      description: "Discover popular products for women frequently bought on Amazon.",
      category: "women",
      seo: "This page features frequently bought products for women across fashion, personal care, and lifestyle."
    },
    "best-jewelry-products": {
      title: "Best Jewelry Products",
      description: "Discover popular jewelry products frequently bought on Amazon.",
      category: "jewelry",
      seo: "This page highlights jewelry products with strong demand, including rings, necklaces, and bracelets."
    }
  };

  const config = collectionMap[slug];
  if (!config) return;

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

  const { data, error } = await window.supabaseClient
    .from("catalog_products")
    .select("*")
    .eq("category", config.category)
    .order("source_rank", { ascending: true })
    .limit(24);

  if (error) {
    console.error(error);
    return;
  }

  const products = data || [];

  if (titleEl) titleEl.textContent = config.title;
  if (descriptionEl) descriptionEl.textContent = config.description;
  if (countEl) countEl.textContent = `${products.length} ${products.length === 1 ? "product" : "products"}`;
  if (gridEl) gridEl.innerHTML = products.map(card).join("");
  if (seoTextEl) seoTextEl.textContent = config.seo;

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

  const related = Object.entries(collectionMap)
    .filter(([key]) => key !== slug)
    .slice(0, 6);

  if (relatedLinksEl) {
    relatedLinksEl.innerHTML = related.map(([key, value]) => `
      <a
        href="/collections/${key}"
        class="rounded-full border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-white"
      >
        ${escapeHtml(value.title)}
      </a>
    `).join("");
  }
});
