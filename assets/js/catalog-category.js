document.addEventListener("DOMContentLoaded", async () => {
  if (!window.supabaseClient) {
    console.error("Supabase client is not available.");
    return;
  }

  const grid = document.getElementById("catalog-category-grid");
  const countEl = document.getElementById("catalog-count");
  const searchInput = document.getElementById("catalog-search");
  const sortSelect = document.getElementById("catalog-sort");
  const emptyState = document.getElementById("catalog-empty-state");

  const titleEl = document.getElementById("catalog-category-title");
  const breadcrumbEl = document.getElementById("catalog-category-breadcrumb");
  const descriptionEl = document.getElementById("catalog-category-description");
  const seoTextEl = document.getElementById("catalog-seo-text");
  const relatedCategoriesEl = document.getElementById("related-categories");

  if (!grid) return;

  // ========================
  // CATEGORY DETECTION (SEO URL)
  // ========================
  function getCategoryFromURL() {
    const pathParts = window.location.pathname.split("/").filter(Boolean);

    // /catalog/tech
    if (pathParts[0] === "catalog" && pathParts[1]) {
      return pathParts[1].toLowerCase();
    }

    // fallback ?category=
    const params = new URLSearchParams(window.location.search);
    return (params.get("category") || "tech").toLowerCase();
  }

  const category = getCategoryFromURL();

  // ========================
  // META CONFIG
  // ========================
  const categoryMeta = {
    tech: {
      title: "Tech Catalog",
      description: "Popular tech products with strong buying frequency on Amazon.",
      seo: "This tech catalog highlights frequently bought Amazon products across gadgets, electronics, and accessories."
    },
    home: {
      title: "Home Catalog",
      description: "Popular home products with strong buying frequency on Amazon.",
      seo: "This home catalog features products for comfort, storage, and everyday living."
    },
    kitchen: {
      title: "Kitchen Catalog",
      description: "Popular kitchen products with strong buying frequency on Amazon.",
      seo: "Explore cooking tools, appliances, and kitchen essentials that people buy regularly."
    },
    beauty: {
      title: "Beauty Catalog",
      description: "Popular beauty products with strong buying frequency on Amazon.",
      seo: "Discover skincare, cosmetics, and self-care products with strong demand."
    },
    sports: {
      title: "Sports Catalog",
      description: "Popular sports products with strong buying frequency on Amazon.",
      seo: "Fitness equipment and sports gear frequently bought on Amazon."
    },
    health: {
      title: "Health Catalog",
      description: "Popular health products with strong buying frequency on Amazon.",
      seo: "Wellness and health-related products with consistent demand."
    },
    travel: {
      title: "Travel Catalog",
      description: "Popular travel products with strong buying frequency on Amazon.",
      seo: "Travel gear and accessories for frequent travelers."
    },
    women: {
      title: "Women Catalog",
      description: "Popular products for women with strong buying frequency.",
      seo: "Fashion, accessories, and essentials for women."
    },
    men: {
      title: "Men Catalog",
      description: "Popular products for men with strong buying frequency.",
      seo: "Accessories, essentials, and everyday items for men."
    },
    jewelry: {
      title: "Jewelry Catalog",
      description: "Popular jewelry products with strong buying frequency.",
      seo: "Rings, necklaces, bracelets, and more."
    },
    baby: {
      title: "Baby Catalog",
      description: "Popular baby products with strong buying frequency.",
      seo: "Baby care products and essentials."
    },
    pets: {
      title: "Pets Catalog",
      description: "Popular pet products with strong buying frequency.",
      seo: "Pet supplies for dogs, cats, and more."
    },
    general: {
      title: "General Catalog",
      description: "Popular Amazon products with strong buying frequency.",
      seo: "A mix of popular products across all categories."
    }
  };

  const relatedCategoryMap = {
    tech: ["home", "travel", "general"],
    home: ["kitchen", "beauty", "general"],
    kitchen: ["home", "health", "general"],
    beauty: ["health", "women", "general"],
    sports: ["health", "men", "general"],
    health: ["sports", "beauty", "general"],
    travel: ["tech", "general"],
    women: ["beauty", "jewelry", "general"],
    men: ["tech", "sports", "general"],
    jewelry: ["women", "general"],
    baby: ["home", "general"],
    pets: ["home", "general"],
    general: ["tech", "home", "beauty"]
  };

  // ========================
  // HELPERS
  // ========================
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

  function proxyImage(url) {
    if (!url) return "https://via.placeholder.com/600x600?text=No+Image";
    return url;
  }

  function productUrl(product) {
    if (product.slug) {
      return `/product/${encodeURIComponent(product.slug)}`;
    }
    return `/product/${encodeURIComponent(product.asin || "")}`;
  }

  // ========================
  // META UPDATE
  // ========================
  function updateMeta() {
    const meta = categoryMeta[category] || categoryMeta.general;

    if (titleEl) titleEl.textContent = meta.title;
    if (breadcrumbEl) breadcrumbEl.textContent = category;
    if (descriptionEl) descriptionEl.textContent = meta.description;
    if (seoTextEl) seoTextEl.textContent = meta.seo;

    document.title = `${meta.title} | TrendPulse`;

    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute("content", meta.description);

    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) {
      canonical.setAttribute(
        "href",
        `https://www.trend-pulse.shop/catalog/${category}`
      );
    }
  }

  // ========================
  // RELATED CATEGORIES
  // ========================
  function renderRelatedCategories() {
    if (!relatedCategoriesEl) return;

    const related = relatedCategoryMap[category] || ["general"];

    relatedCategoriesEl.innerHTML = related
      .map(
        (cat) => `
        <a href="/catalog/${cat}"
           class="px-3 py-2 border border-zinc-700 rounded-full text-xs">
          ${cat}
        </a>
      `
      )
      .join("");
  }

  // ========================
  // CARD
  // ========================
  function productCard(product) {
    return `
      <a href="${productUrl(product)}"
         class="block rounded-2xl border border-zinc-800 bg-zinc-900 p-4 hover:border-zinc-600">

        <img src="${proxyImage(product.image_url)}"
             class="w-full h-40 object-contain bg-white rounded-xl"
             loading="lazy"
             onerror="this.src='https://via.placeholder.com/600x600?text=No+Image'" />

        <h3 class="mt-3 text-sm font-semibold text-white">
          ${escapeHtml(product.name)}
        </h3>

        <div class="text-xs text-zinc-400 mt-1">
          ⭐ ${safeNumber(product.amazon_rating)} (${safeNumber(product.amazon_review_count)})
        </div>

        <div class="mt-2 text-green-400 font-bold">
          ${formatPrice(product.price)}
        </div>
      </a>
    `;
  }

  // ========================
  // FETCH
  // ========================
  async function fetchProducts() {
    const { data, error } = await window.supabaseClient
      .from("catalog_products")
      .select("*")
      .eq("category", category)
      .limit(300);

    if (error) {
      console.error(error);
      return [];
    }

    const seen = new Set();

    return (data || []).filter((p) => {
      const key = p.asin || p.slug;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // ========================
  // SORT
  // ========================
  function sortProducts(items, sort) {
    const arr = [...items];

    if (sort === "reviews") {
      arr.sort((a, b) => safeNumber(b.amazon_review_count) - safeNumber(a.amazon_review_count));
    } else if (sort === "rating") {
      arr.sort((a, b) => safeNumber(b.amazon_rating) - safeNumber(a.amazon_rating));
    } else if (sort === "price-low") {
      arr.sort((a, b) => safeNumber(a.price) - safeNumber(b.price));
    } else if (sort === "price-high") {
      arr.sort((a, b) => safeNumber(b.price) - safeNumber(a.price));
    }

    return arr;
  }

  // ========================
  // FILTER
  // ========================
  function applyFilters(products) {
    const search = (searchInput?.value || "").toLowerCase();
    const sort = sortSelect?.value || "score";

    let filtered = [...products];

    if (search) {
      filtered = filtered.filter((p) =>
        (p.name || "").toLowerCase().includes(search)
      );
    }

    filtered = sortProducts(filtered, sort);

    grid.innerHTML = filtered.map(productCard).join("");

    if (countEl) {
      countEl.textContent = `${filtered.length} products`;
    }

    if (emptyState) {
      emptyState.classList.toggle("hidden", filtered.length !== 0);
    }
  }

  // ========================
  // INIT
  // ========================
  updateMeta();
  renderRelatedCategories();

  const products = await fetchProducts();
  applyFilters(products);

  searchInput?.addEventListener("input", () => applyFilters(products));
  sortSelect?.addEventListener("change", () => applyFilters(products));
});
