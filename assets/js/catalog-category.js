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
      seo: "This beauty catalog combines high-demand skincare, self-care, and beauty products with matching deals currently available."
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

  function normalizeCategory(raw = "") {
    const value = String(raw).trim().toLowerCase();
    if (["men", "women", "jewelry"].includes(value)) return "fashion";
    if (["baby", "pets"].includes(value)) return "family";
    return value || "general";
  }

  function getDiscount(product) {
    const price = safeNumber(product.price, 0);
    const original = safeNumber(product.original_price, 0) || price * 1.5;
    if (original > price && price > 0) {
      return Math.max(1, Math.round(((original - price) / original) * 100));
    }
    return Math.max(10, Math.min(65, Math.round(safeNumber(product.discount_percentage, 18))));
  }

  function getCategoryBadge(product) {
    const sourceKind = String(product.source_kind || "").toLowerCase();

    if (sourceKind === "deal") {
      return `<span class="rounded-full bg-green-500/15 px-2.5 py-1 text-[11px] font-medium text-green-300">Deal</span>`;
    }

    if (product.is_best_seller) {
      return `<span class="rounded-full bg-blue-500/15 px-2.5 py-1 text-[11px] font-medium text-blue-300">Best Seller</span>`;
    }

    return `<span class="rounded-full border border-zinc-700 px-2.5 py-1 text-[11px] font-medium text-zinc-300">${escapeHtml(capitalize(normalizeCategory(product.category || category)))}</span>`;
  }

  function computeScore(product) {
    const reviews = safeNumber(product.amazon_review_count, 0);
    const rating = safeNumber(product.amazon_rating, 0);
    const discount = safeNumber(product.discount_percentage, 20);
    const priority = safeNumber(product.priority, 0);
    const sourceBonus = String(product.source_kind || "").toLowerCase() === "deal" ? 120 : 0;

    return (
      reviews * 0.4 +
      rating * 100 * 0.3 +
      discount * 10 * 0.2 +
      priority * 4 +
      sourceBonus +
      Math.random() * 50
    );
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

    const twitterTitle = document.querySelector('meta[name="twitter:title"]');
    if (twitterTitle) twitterTitle.setAttribute("content", `${meta.title} | TrendPulse`);

    const twitterDescription = document.querySelector('meta[name="twitter:description"]');
    if (twitterDescription) twitterDescription.setAttribute("content", meta.description);
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
    const discount = getDiscount(product);
    const original = safeNumber(product.original_price, 0) || safeNumber(product.price, 0) * 1.5;
    const hook = window.ProductHooks ? window.ProductHooks.getHook(product) : "Popular right now";
    const urgency = window.ProductHooks ? window.ProductHooks.getUrgency(product) : "Selling fast";
    const proof = window.ProductHooks ? window.ProductHooks.getSocialProof(product) : "Frequently bought";
    const priceStory = window.ProductHooks ? window.ProductHooks.getPriceStory(product) : "High-demand product";

    return `
      <article class="group h-full overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 transition hover:scale-[1.02] hover:border-zinc-600">
        <a href="${productUrl(product)}" class="flex h-full flex-col">
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

            ${
              product.source_rank
                ? `
                  <div class="absolute right-3 top-3 rounded-full bg-black/80 px-2.5 py-1 text-[11px] font-semibold text-white">
                    #${safeNumber(product.source_rank, 0)}
                  </div>
                `
                : ""
            }
          </div>

          <div class="flex flex-1 flex-col p-4">
            <div class="mb-2 flex flex-wrap gap-2">
              ${getCategoryBadge(product)}
            </div>

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

    return (data || [])
      .filter((p) => {
        const key = p.asin || p.slug || p.name;
        if (!key) return false;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((p) => ({
        ...p,
        category: normalizeCategory(p.category),
        final_score: computeScore(p)
      }));
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
      arr.sort((a, b) => safeNumber(b.final_score) - safeNumber(a.final_score));
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
