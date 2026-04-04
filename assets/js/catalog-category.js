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

  if (!grid) return;

  const params = new URLSearchParams(window.location.search);
  const category = (params.get("category") || "tech").trim().toLowerCase();

  const categoryMeta = {
    tech: {
      title: "Tech Catalog",
      description: "Popular tech products with strong buying frequency on Amazon."
    },
    home: {
      title: "Home Catalog",
      description: "Popular home products with strong buying frequency on Amazon."
    },
    kitchen: {
      title: "Kitchen Catalog",
      description: "Popular kitchen products with strong buying frequency on Amazon."
    },
    beauty: {
      title: "Beauty Catalog",
      description: "Popular beauty products with strong buying frequency on Amazon."
    },
    sports: {
      title: "Sports Catalog",
      description: "Popular sports products with strong buying frequency on Amazon."
    },
    health: {
      title: "Health Catalog",
      description: "Popular health products with strong buying frequency on Amazon."
    },
    travel: {
      title: "Travel Catalog",
      description: "Popular travel products with strong buying frequency on Amazon."
    },
    women: {
      title: "Women Catalog",
      description: "Popular products for women with strong buying frequency on Amazon."
    },
    men: {
      title: "Men Catalog",
      description: "Popular products for men with strong buying frequency on Amazon."
    },
    jewelry: {
      title: "Jewelry Catalog",
      description: "Popular jewelry products with strong buying frequency on Amazon."
    },
    baby: {
      title: "Baby Catalog",
      description: "Popular baby products with strong buying frequency on Amazon."
    },
    pets: {
      title: "Pets Catalog",
      description: "Popular pet products with strong buying frequency on Amazon."
    },
    general: {
      title: "General Catalog",
      description: "Popular Amazon products with strong buying frequency."
    }
  };

  function escapeHtml(value = "") {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function formatPrice(value) {
    return `$${safeNumber(value).toFixed(2)}`;
  }

  function capitalize(value = "") {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
  }

  function proxyImage(url) {
    const raw = String(url || "").trim();
    if (!raw || raw.includes("your-image-url.com")) {
      return "https://via.placeholder.com/600x600?text=No+Image";
    }
    return raw;
  }

  function productUrl(product) {
    if (product.slug) {
      return `/product.html?slug=${encodeURIComponent(product.slug)}`;
    }
    return `/product.html?asin=${encodeURIComponent(product.asin || "")}`;
  }

  function updatePageMeta() {
    const meta = categoryMeta[category] || {
      title: `${capitalize(category)} Catalog`,
      description: `Popular Amazon products in ${capitalize(category)}.`
    };

    if (titleEl) titleEl.textContent = meta.title;
    if (breadcrumbEl) breadcrumbEl.textContent = capitalize(category);
    if (descriptionEl) descriptionEl.textContent = meta.description;

    document.title = `${meta.title} | TrendPulse`;

    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) metaDescription.setAttribute("content", meta.description);

    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) {
      canonical.setAttribute(
        "href",
        `https://www.trend-pulse.shop/catalog-category.html?category=${encodeURIComponent(category)}`
      );
    }
  }

  function productCard(product) {
    const img = proxyImage(product.image_url || product.image || "");
    const rating = safeNumber(product.amazon_rating, 0);
    const reviews = safeNumber(product.amazon_review_count, 0);
    const price = formatPrice(product.price);

    return `
      <article class="group h-full overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/70 transition hover:border-zinc-500 hover:shadow-xl hover:shadow-black/30">
        <a href="${productUrl(product)}" class="flex h-full flex-col">
          <div class="relative aspect-square overflow-hidden bg-white">
            <img
              src="${img}"
              alt="${escapeHtml(product.name || "Product")}"
              class="h-full w-full object-contain transition duration-300 group-hover:scale-[1.02]"
              loading="lazy"
              onerror="this.src='https://via.placeholder.com/600x600?text=No+Image'"
            />
            ${
              product.source_rank
                ? `
              <div class="absolute right-3 top-3 rounded-full bg-black/80 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
                #${product.source_rank}
              </div>
            `
                : ""
            }
          </div>

          <div class="flex flex-1 flex-col p-4">
            <div class="mb-2 flex flex-wrap gap-2">
              <span class="rounded-full border border-zinc-700 px-2.5 py-1 text-[11px] font-medium text-zinc-300">
                ${escapeHtml(capitalize(product.category || category))}
              </span>
              ${
                product.is_best_seller
                  ? `
                <span class="rounded-full bg-green-500/15 px-2.5 py-1 text-[11px] font-medium text-green-300">
                  Best Seller
                </span>
              `
                  : ""
              }
            </div>

            <h3 class="min-h-[3rem] text-sm font-semibold leading-6 text-white">
              ${escapeHtml(product.name || "Product")}
            </h3>

            <div class="mt-2 text-xs text-zinc-400">
              ⭐ ${rating > 0 ? rating.toFixed(1) : "—"} (${reviews.toLocaleString()})
            </div>

            <div class="mt-auto flex items-end justify-between gap-3 pt-4">
              <div class="flex flex-col">
                <span class="text-lg font-bold text-green-400">${price}</span>
                <span class="text-[10px] text-zinc-500">Frequently bought</span>
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

  async function fetchCatalogProducts() {
    const { data, error } = await window.supabaseClient
      .from("catalog_products")
      .select("*")
      .eq("category", category)
      .limit(300);

    if (error) {
      console.error("Failed to load catalog products:", error);
      return [];
    }

    const seen = new Set();

    return (data || []).filter((item) => {
      const key = item.asin || item.slug || item.id || item.name;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function sortProducts(items, sortValue) {
    const sorted = [...items];

    if (sortValue === "reviews") {
      sorted.sort((a, b) => safeNumber(b.amazon_review_count) - safeNumber(a.amazon_review_count));
    } else if (sortValue === "rating") {
      sorted.sort((a, b) => safeNumber(b.amazon_rating) - safeNumber(a.amazon_rating));
    } else if (sortValue === "score") {
      sorted.sort((a, b) => {
        if (safeNumber(a.source_rank, 999999) !== safeNumber(b.source_rank, 999999)) {
          return safeNumber(a.source_rank, 999999) - safeNumber(b.source_rank, 999999);
        }
        return safeNumber(b.score) - safeNumber(a.score);
      });
    } else if (sortValue === "price-low") {
      sorted.sort((a, b) => safeNumber(a.price) - safeNumber(b.price));
    } else if (sortValue === "price-high") {
      sorted.sort((a, b) => safeNumber(b.price) - safeNumber(a.price));
    }

    return sorted;
  }

  function applyFilters(products) {
    const search = String(searchInput?.value || "").trim().toLowerCase();
    const sortValue = sortSelect?.value || "score";

    let filtered = [...products];

    if (search) {
      filtered = filtered.filter((product) => {
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

        return haystack.includes(search);
      });
    }

    filtered = sortProducts(filtered, sortValue);

    grid.innerHTML = filtered.map(productCard).join("");

    if (countEl) {
      countEl.textContent = `${filtered.length} ${filtered.length === 1 ? "product" : "products"}`;
    }

    if (emptyState) {
      if (filtered.length === 0) {
        emptyState.classList.remove("hidden");
      } else {
        emptyState.classList.add("hidden");
      }
    }
  }

  updatePageMeta();

  const products = await fetchCatalogProducts();
  applyFilters(products);

  searchInput?.addEventListener("input", () => applyFilters(products));
  sortSelect?.addEventListener("change", () => applyFilters(products));
});
