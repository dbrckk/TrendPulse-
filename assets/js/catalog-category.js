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

  function getCategoryFromURL() {
    const pathParts = window.location.pathname.split("/").filter(Boolean);

    if (pathParts[0] === "catalog" && pathParts[1]) {
      return decodeURIComponent(pathParts[1]).toLowerCase();
    }

    const params = new URLSearchParams(window.location.search);
    return (params.get("category") || "tech").toLowerCase();
  }

  const category = getCategoryFromURL();

  const categoryMeta = {
    tech: {
      title: "Tech Catalog",
      description: "Popular tech products with strong buying frequency on Amazon, plus relevant active deals.",
      seo: "This tech catalog combines evergreen best-selling Amazon products with active deals in the same category, helping users discover high-demand electronics, gadgets, and accessories."
    },
    home: {
      title: "Home Catalog",
      description: "Popular home products with strong buying frequency on Amazon, plus relevant active deals.",
      seo: "This home catalog combines evergreen best sellers and active deals for storage, comfort, daily living, and practical home essentials."
    },
    kitchen: {
      title: "Kitchen Catalog",
      description: "Popular kitchen products with strong buying frequency on Amazon, plus relevant active deals.",
      seo: "This kitchen catalog highlights frequently bought cookware, tools, appliances, and useful kitchen products, alongside category-relevant deals."
    },
    beauty: {
      title: "Beauty Catalog",
      description: "Popular beauty products with strong buying frequency on Amazon, plus relevant active deals.",
      seo: "This beauty catalog combines high-demand skincare, self-care, and beauty products with any matching deals currently available."
    },
    health: {
      title: "Health Catalog",
      description: "Popular health products with strong buying frequency on Amazon, plus relevant active deals.",
      seo: "This health catalog focuses on wellness and daily-use products with stable demand, while also surfacing relevant category deals."
    },
    sports: {
      title: "Sports Catalog",
      description: "Popular sports products with strong buying frequency on Amazon, plus relevant active deals.",
      seo: "This sports catalog brings together frequently bought fitness and activity products, along with active deals when available."
    },
    travel: {
      title: "Travel Catalog",
      description: "Popular travel products with strong buying frequency on Amazon, plus relevant active deals.",
      seo: "This travel catalog surfaces proven travel essentials, luggage, and accessories, together with matching category deals."
    },
    fashion: {
      title: "Fashion Catalog",
      description: "Popular fashion products with strong buying frequency on Amazon, plus relevant active deals.",
      seo: "This fashion catalog merges strong-demand products across men, women, and jewelry, creating a denser category with both evergreen products and live deals."
    },
    family: {
      title: "Family Catalog",
      description: "Popular family products with strong buying frequency on Amazon, plus relevant active deals.",
      seo: "This family catalog groups baby and pet related products into a stronger evergreen category, enriched with matching live deals."
    },
    general: {
      title: "General Catalog",
      description: "Popular Amazon products with strong buying frequency, plus relevant active deals.",
      seo: "This general catalog mixes frequently bought Amazon products across categories and supplements them with active deals when relevant."
    }
  };

  const relatedCategoryMap = {
    tech: ["home", "travel", "general", "fashion"],
    home: ["kitchen", "beauty", "general", "family"],
    kitchen: ["home", "health", "general", "beauty"],
    beauty: ["health", "fashion", "general", "home"],
    health: ["sports", "beauty", "general", "kitchen"],
    sports: ["health", "fashion", "general", "travel"],
    travel: ["tech", "fashion", "general", "home"],
    fashion: ["beauty", "tech", "general", "travel"],
    family: ["home", "health", "general", "fashion"],
    general: ["tech", "home", "beauty", "kitchen"]
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

  function capitalize(value = "") {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
  }

  function proxyImage(url = "") {
    const raw = String(url).trim();
    if (!raw || raw.includes("your-image-url.com") || raw.includes("placeholder")) {
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

  function getCategoryBadge(product) {
    const sourceKind = String(product.source_kind || "").toLowerCase();

    if (sourceKind === "deal") {
      return `<span class="rounded-full bg-green-500/15 px-2.5 py-1 text-[11px] font-medium text-green-300">Deal</span>`;
    }

    if (product.is_best_seller) {
      return `<span class="rounded-full bg-blue-500/15 px-2.5 py-1 text-[11px] font-medium text-blue-300">Best Seller</span>`;
    }

    return `<span class="rounded-full border border-zinc-700 px-2.5 py-1 text-[11px] font-medium text-zinc-300">${escapeHtml(capitalize(product.category || category))}</span>`;
  }

  function updateMeta() {
    const meta = categoryMeta[category] || categoryMeta.general;

    if (titleEl) titleEl.textContent = meta.title;
    if (breadcrumbEl) breadcrumbEl.textContent = capitalize(category);
    if (descriptionEl) descriptionEl.textContent = meta.description;
    if (seoTextEl) seoTextEl.textContent = meta.seo;

    document.title = `${meta.title} | TrendPulse`;

    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute("content", meta.description);

    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) {
      canonical.setAttribute("href", `https://www.trend-pulse.shop/catalog/${encodeURIComponent(category)}`);
    }

    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute("content", `${meta.title} | TrendPulse`);

    const ogDescription = document.querySelector('meta[property="og:description"]');
    if (ogDescription) ogDescription.setAttribute("content", meta.description);

    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) ogUrl.setAttribute("content", `https://www.trend-pulse.shop/catalog/${encodeURIComponent(category)}`);
  }

  function renderRelatedCategories() {
    if (!relatedCategoriesEl) return;

    const related = relatedCategoryMap[category] || ["general"];

    relatedCategoriesEl.innerHTML = related
      .map(
        (cat) => `
          <a
            href="/catalog/${encodeURIComponent(cat)}"
            class="rounded-full border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-white"
          >
            ${escapeHtml(capitalize(cat))}
          </a>
        `
      )
      .join("");
  }

  function productCard(product) {
    const rating = safeNumber(product.amazon_rating);
    const reviewCount = safeNumber(product.amazon_review_count);
    const price = formatPrice(product.price);
    const image = proxyImage(product.image_url);
    const isDeal = String(product.source_kind || "").toLowerCase() === "deal";

    return `
      <article class="group h-full overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/70 transition hover:border-zinc-500 hover:shadow-xl hover:shadow-black/30">
        <a href="${productUrl(product)}" class="flex h-full flex-col">
          <div class="relative aspect-square overflow-hidden bg-white">
            <img
              src="${image}"
              alt="${escapeHtml(product.name || "Product")}"
              class="h-full w-full object-contain transition duration-300 group-hover:scale-[1.02]"
              loading="lazy"
              onerror="this.src='https://via.placeholder.com/600x600?text=No+Image'"
            />

            ${
              product.source_rank
                ? `
                <div class="absolute right-3 top-3 rounded-full bg-black/80 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
                  #${safeNumber(product.source_rank, 0)}
                </div>
              `
                : ""
            }
          </div>

          <div class="flex flex-1 flex-col p-4">
            <div class="mb-2 flex flex-wrap gap-2">
              ${getCategoryBadge(product)}
              ${
                isDeal
                  ? `<span class="rounded-full border border-green-500/30 px-2.5 py-1 text-[11px] font-medium text-green-300">Live Now</span>`
                  : ""
              }
            </div>

            <h3 class="min-h-[3rem] text-sm font-semibold leading-6 text-white">
              ${escapeHtml(product.name || "Product")}
            </h3>

            <div class="mt-2 text-xs text-zinc-400">
              ⭐ ${rating > 0 ? rating.toFixed(1) : "—"} (${reviewCount.toLocaleString()})
            </div>

            <div class="mt-auto flex items-end justify-between gap-3 pt-4">
              <div class="flex flex-col">
                <span class="text-lg font-bold text-green-400">${price}</span>
                <span class="text-[10px] text-zinc-500">
                  ${isDeal ? "Catalog + deal" : "Frequently bought"}
                </span>
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

  async function fetchProducts() {
    const { data, error } = await window.supabaseClient
      .from("catalog_category_feed")
      .select("*")
      .eq("category", category)
      .limit(300);

    if (error) {
      console.error("Failed to load category feed:", error);
      return [];
    }

    const seen = new Set();

    return (data || []).filter((p) => {
      const key = p.asin || p.slug || p.name;
      if (!key) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

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

    grid.innerHTML = filtered.map(productCard).join("");

    if (countEl) {
      countEl.textContent = `${filtered.length} ${filtered.length === 1 ? "product" : "products"}`;
    }

    if (emptyState) {
      emptyState.classList.toggle("hidden", filtered.length !== 0);
    }
  }

  updateMeta();
  renderRelatedCategories();

  const products = await fetchProducts();
  applyFilters(products);

  searchInput?.addEventListener("input", () => applyFilters(products));
  sortSelect?.addEventListener("change", () => applyFilters(products));
});
