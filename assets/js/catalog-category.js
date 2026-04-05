document.addEventListener("DOMContentLoaded", async () => {
  if (!window.supabaseClient || !window.TrendPulseUI) {
    console.error("Missing Supabase or TrendPulseUI");
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

  function getCategoryFromURL() {
    const pathParts = window.location.pathname.split("/").filter(Boolean);

    if (pathParts[0] === "catalog" && pathParts[1]) {
      return decodeURIComponent(pathParts[1]).toLowerCase();
    }

    const params = new URLSearchParams(window.location.search);
    return (params.get("category") || "general").toLowerCase();
  }

  const category = getCategoryFromURL();

  const categoryMeta = {
    tech: {
      title: "Tech Catalog",
      description: "Popular tech products with strong buying frequency on Amazon, plus relevant active deals.",
      seo: "This tech catalog combines evergreen best-selling Amazon products with active deals in the same category."
    },
    home: {
      title: "Home Catalog",
      description: "Popular home products with strong buying frequency on Amazon, plus relevant active deals.",
      seo: "This home catalog combines evergreen best sellers and active deals for storage, comfort, and daily living."
    },
    kitchen: {
      title: "Kitchen Catalog",
      description: "Popular kitchen products with strong buying frequency on Amazon, plus relevant active deals.",
      seo: "This kitchen catalog highlights frequently bought cookware, tools, appliances, and useful kitchen products."
    },
    beauty: {
      title: "Beauty Catalog",
      description: "Popular beauty products with strong buying frequency on Amazon, plus relevant active deals.",
      seo: "This beauty catalog combines high-demand skincare, self-care, and beauty products with matching deals."
    },
    health: {
      title: "Health Catalog",
      description: "Popular health products with strong buying frequency on Amazon, plus relevant active deals.",
      seo: "This health catalog focuses on wellness and daily-use products with stable demand."
    },
    sports: {
      title: "Sports Catalog",
      description: "Popular sports products with strong buying frequency on Amazon, plus relevant active deals.",
      seo: "This sports catalog brings together frequently bought fitness and activity products."
    },
    travel: {
      title: "Travel Catalog",
      description: "Popular travel products with strong buying frequency on Amazon, plus relevant active deals.",
      seo: "This travel catalog surfaces proven travel essentials, luggage, and accessories."
    },
    fashion: {
      title: "Fashion Catalog",
      description: "Popular fashion products with strong buying frequency on Amazon, plus relevant active deals.",
      seo: "This fashion catalog merges strong-demand products across men, women, and jewelry."
    },
    family: {
      title: "Family Catalog",
      description: "Popular family products with strong buying frequency on Amazon, plus relevant active deals.",
      seo: "This family catalog groups baby and pet related products into a stronger evergreen category."
    },
    general: {
      title: "General Catalog",
      description: "Popular Amazon products with strong buying frequency, plus relevant active deals.",
      seo: "This general catalog mixes frequently bought Amazon products across categories."
    }
  };

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
    if (!raw || raw.includes("your-image-url.com") || raw.includes("placeholder")) {
      return "https://via.placeholder.com/600x600?text=No+Image";
    }
    return raw;
  }

  function capitalize(value = "") {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
  }

  function updateMeta() {
    const meta = categoryMeta[category] || categoryMeta.general;

    if (titleEl) titleEl.textContent = meta.title;
    if (breadcrumbEl) breadcrumbEl.textContent = capitalize(category);
    if (descriptionEl) descriptionEl.textContent = meta.description;
    if (seoTextEl) seoTextEl.textContent = meta.seo;

    document.title = `${meta.title} | TrendPulse`;
  }

  function productCard(product) {
    const rating = safeNumber(product.amazon_rating);
    const reviewCount = safeNumber(product.amazon_review_count);
    const price = formatPrice(product.price);
    const image = proxyImage(product.image_url);
    const discount = window.TrendPulseUI.getDiscount(product);
    const original = safeNumber(product.original_price, 0) || safeNumber(product.price, 0) * 1.5;
    const hook = window.ProductHooks ? window.ProductHooks.getHook(product) : "Popular right now";
    const urgency = window.ProductHooks ? window.ProductHooks.getUrgency(product) : "Selling fast";
    const proof = window.ProductHooks ? window.ProductHooks.getSocialProof(product) : "Frequently bought";
    const priceStory = window.ProductHooks ? window.ProductHooks.getPriceStory(product) : "High-demand product";

    return `
      <article class="group h-full overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 transition hover:scale-[1.02] hover:border-zinc-600">
        <a href="${window.TrendPulseUI.productPath(product)}" class="flex h-full flex-col">
          <div class="relative aspect-square overflow-hidden bg-white">
            <img
              src="${image}"
              alt="${escapeHtml(product.name || "Product")}"
              class="h-full w-full object-contain transition duration-300 group-hover:scale-[1.02]"
              loading="lazy"
              onerror="this.src='https://via.placeholder.com/600x600?text=No+Image'"
            />

            <div class="absolute left-3 top-3 rounded-full bg-red-500 px-2.5 py-1 text-[11px] font-bold text-white">
              -${discount}%
            </div>

            <div class="absolute bottom-3 right-3 rounded-full bg-black/80 px-2.5 py-1 text-[11px] font-semibold text-white">
              🔥 ${escapeHtml(proof)}
            </div>
          </div>

          <div class="flex flex-1 flex-col p-4">
            <div class="text-xs font-semibold text-green-400">
              ${escapeHtml(hook)}
            </div>

            <h3 class="mt-2 min-h-[3rem] text-sm font-semibold leading-6 text-white">
              ${escapeHtml(product.name || "Product")}
            </h3>

            <div class="mt-2 text-xs text-zinc-400">
              ⭐ ${rating > 0 ? rating.toFixed(1) : "—"} (${reviewCount.toLocaleString()})
            </div>

            <div class="mt-1 text-xs font-semibold text-red-400">
              ⚡ ${escapeHtml(urgency)}
            </div>

            <div class="mt-1 text-xs text-zinc-500">
              ${escapeHtml(priceStory)}
            </div>

            <div class="mt-auto flex items-end justify-between gap-3 pt-4">
              <div class="flex flex-col">
                <span class="text-lg font-bold text-green-400">${price}</span>
                <span class="text-[10px] text-zinc-500 line-through">
                  ${original > 0 ? formatPrice(original) : ""}
                </span>
              </div>

              <div class="rounded-xl bg-green-500 px-3 py-2 text-xs font-bold text-black">
                View Deal →
              </div>
            </div>
          </div>
        </a>
      </article>
    `;
  }

  async function fetchCategoryProducts() {
    const { data, error } = await window.supabaseClient
      .from("catalog_category_feed")
      .select("*")
      .eq("category", category)
      .limit(300);

    if (error) {
      console.error("Failed to load category feed:", error);
      return [];
    }

    return (data || [])
      .map(window.TrendPulseUI.sanitizeProduct)
      .filter((p) => p.name && p.is_active !== false)
      .map((p) => ({
        ...p,
        final_score: window.TrendPulseUI.computeScore(p)
      }));
  }

  async function fetchFallbackProducts() {
    const all = await window.TrendPulseUI.fetchProducts();

    let sameCategory = all.filter(
      (p) => window.TrendPulseUI.normalizeCategory(p.category) === category
    );

    if (!sameCategory.length) {
      sameCategory = all.filter(
        (p) => window.TrendPulseUI.normalizeCategory(p.category) === "general"
      );
    }

    if (!sameCategory.length) {
      sameCategory = all;
    }

    return sameCategory.slice(0, 80);
  }

  function sortProducts(items, sort) {
    if (sort === "price-low") return window.TrendPulseUI.sortProducts(items, "low");
    if (sort === "price-high") return window.TrendPulseUI.sortProducts(items, "high");
    return window.TrendPulseUI.sortProducts(items, sort);
  }

  function applyFilters(products) {
    const search = String(searchInput?.value || "").trim().toLowerCase();
    const sort = sortSelect?.value || "score";

    let filtered = [...products];

    if (search) {
      filtered = filtered.filter((p) => {
        const haystack = [
          p.name,
          p.brand,
          p.description,
          p.short_description,
          p.category
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(search);
      });
    }

    filtered = sortProducts(filtered, sort);

    if (!filtered.length) {
      filtered = sortProducts(products, "score").slice(0, 24);
    }

    grid.innerHTML = filtered.map(productCard).join("");

    if (countEl) {
      countEl.textContent = `${filtered.length} ${filtered.length === 1 ? "product" : "products"}`;
    }

    if (emptyState) {
      emptyState.classList.toggle("hidden", filtered.length !== 0);
    }
  }

  updateMeta();

  let products = await fetchCategoryProducts();

  if (!products.length) {
    products = await fetchFallbackProducts();
  }

  applyFilters(products);

  searchInput?.addEventListener("input", () => applyFilters(products));
  sortSelect?.addEventListener("change", () => applyFilters(products));
});
