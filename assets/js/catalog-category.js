Attribute("content", meta.description);
    if (ogUrl) {
      ogUrl.setAttribute(
        "content",
        `https://www.trend-pulse.shop/catalog-category.html?category=${encodeURIComponent(category)}`
      );
    }
    if (twitterTitle) twitterTitle.setAttribute("content", `${meta.title} | TrendPulse`);
    if (twitterDescription) twitterDescription.setAttribute("content", meta.description);
  }

  function getProductUrl(product) {
    if (product.slug) {
      return `/product.html?slug=${encodeURIComponent(product.slug)}`;
    }
    return `/product.html?asin=${encodeURIComponent(product.asin || "")}`;
  }

  function productCard(product) {
    const proxiedImage = proxyImage(product.image_url || product.image || "");
    const placeholder = buildPlaceholder(product);
    const rating = safeNumber(product.amazon_rating, 0);
    const reviews = safeNumber(product.amazon_review_count, 0);
    const price = formatPrice(product.price);

    return `
      <article class="group overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/70 transition hover:border-zinc-500 hover:shadow-xl hover:shadow-black/30">
        <a href="${getProductUrl(product)}" class="flex h-full flex-col">
          <div class="relative aspect-square overflow-hidden bg-white">
            <img
              src="${placeholder}"
              alt="${escapeHtml(product.name || "Product")}"
              class="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
            />
            ${
              proxiedImage
                ? `
              <img
                src="${proxiedImage}"
                alt="${escapeHtml(product.name || "Product")}"
                class="relative z-10 h-full w-full object-contain transition duration-300 group-hover:scale-[1.02]"
                loading="lazy"
                referrerpolicy="no-referrer"
                onerror="this.remove()"
              />
            `
                : ""
            }
          </div>

          <div class="flex flex-1 flex-col p-4">
            <h3 class="min-h-[3rem] text-sm font-semibold leading-6 text-white">
              ${escapeHtml(product.name || "Product")}
            </h3>

            <div class="mt-2 text-xs text-zinc-400">
              ⭐ ${rating > 0 ? rating.toFixed(1) : "—"} (${reviews.toLocaleString()})
            </div>

            <div class="mt-3 flex items-end justify-between gap-3">
              <span class="text-lg font-bold text-green-400">${price}</span>
              <span class="text-xs font-bold text-zinc-300">View →</span>
            </div>
          </div>
        </a>
      </article>
    `;
  }

  async function fetchProducts() {
    const { data, error } = await window.supabaseClient
      .from("products")
      .select("*")
      .eq("type", "catalog")
      .eq("is_active", true)
      .eq("category", category)
      .limit(200);

    if (error) {
      console.error(error);
      return [];
    }

    return data || [];
  }

  let products = await fetchProducts();

  function sortProducts(items, sortValue) {
    const sorted = [...items];

    if (sortValue === "reviews") {
      sorted.sort((a, b) => safeNumber(b.amazon_review_count) - safeNumber(a.amazon_review_count));
    } else if (sortValue === "rating") {
      sorted.sort((a, b) => safeNumber(b.amazon_rating) - safeNumber(a.amazon_rating));
    } else if (sortValue === "score") {
      sorted.sort((a, b) => safeNumber(b.score) - safeNumber(a.score));
    } else if (sortValue === "price-low") {
      // assets/js/catalog-category.js

document.addEventListener("DOMContentLoaded", async () => {
  if (!window.supabaseClient) {
    console.error("Supabase client is not available.");
    return;
  }

  const grid = document.getElementById("catalog-category-grid");
  if (!grid) return;

  const countEl = document.getElementById("catalog-count");
  const searchInput = document.getElementById("catalog-search");
  const sortSelect = document.getElementById("catalog-sort");
  const emptyState = document.getElementById("catalog-empty-state");
  const titleEl = document.getElementById("catalog-category-title");
  const breadcrumbEl = document.getElementById("catalog-category-breadcrumb");
  const descriptionEl = document.getElementById("catalog-category-description");

  const params = new URLSearchParams(window.location.search);
  const category = (params.get("category") || "tech").toLowerCase();

  const categoryMeta = {
    women: {
      title: "Women Catalog",
      description: "Browse popular products for women, including fashion, beauty, gift ideas, and everyday favorites."
    },
    men: {
      title: "Men Catalog",
      description: "Browse popular products for men, including accessories, essentials, gifts, and practical daily picks."
    },
    jewelry: {
      title: "Jewelry Catalog",
      description: "Explore popular jewelry products, giftable accessories, and high-interest trending picks."
    },
    tech: {
      title: "Tech Catalog",
      description: "Browse top tech products, useful gadgets, accessories, and electronics with strong buying signals."
    },
    sports: {
      title: "Sports Catalog",
      description: "Explore sports and fitness products, hydration gear, accessories, and active lifestyle picks."
    },
    health: {
      title: "Health Catalog",
      description: "Browse wellness, comfort, sleep, and health-focused products with stable demand."
    },
    home: {
      title: "Home Catalog",
      description: "Discover practical home products, cozy upgrades, and useful daily household finds."
    },
    kitchen: {
      title: "Kitchen Catalog",
      description: "Browse practical kitchen tools, cooking accessories, and everyday kitchen essentials."
    },
    beauty: {
      title: "Beauty Catalog",
      description: "Explore beauty tools, skincare products, self-care items, and popular beauty favorites."
    },
    travel: {
      title: "Travel Catalog",
      description: "Browse travel accessories, organizers, useful on-the-go products, and trip essentials."
    },
    baby: {
      title: "Baby Catalog",
      description: "Discover baby products, nursery items, family essentials, and giftable baby picks."
    },
    pets: {
      title: "Pets Catalog",
      description: "Browse pet essentials, popular pet products, and high-demand items for dogs and cats."
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

  function capitalize(value = "") {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
  }

  function formatPrice(value) {
    return `$${safeNumber(value).toFixed(2)}`;
  }

  function proxyImage(url) {
    const raw = String(url || "").trim();
    if (!raw) return "";

    try {
      const parsed = new URL(raw);
      return `https://images.weserv.nl/?url=${encodeURIComponent(
        parsed.host + parsed.pathname + parsed.search
      )}&w=1000&h=1000&fit=contain&bg=ffffff&output=jpg`;
    } catch {
      return "";
    }
  }

  function initialsFromTitle(title = "") {
    const words = String(title).trim().split(/\s+/).filter(Boolean).slice(0, 2);
    if (!words.length) return "TP";
    return words.map((word) => word[0]).join("").toUpperCase();
  }

  function buildPlaceholder(product) {
    const title = String(product.name || "Product");
    const badge = product.is_best_seller
      ? "Best Seller"
      : product.is_giftable
      ? "Giftable"
      : "Product";

    const price = formatPrice(product.price || 0);
    const initials = initialsFromTitle(title);

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#18181b"/>
            <stop offset="100%" stop-color="#3f3f46"/>
          </linearGradient>
        </defs>
        <rect width="800" height="800" fill="url(#g)"/>
        <circle cx="660" cy="140" r="110" fill="#ffffff" opacity="0.07"/>
        <circle cx="130" cy="670" r="150" fill="#ffffff" opacity="0.05"/>
        <rect x="42" y="42" rx="24" ry="24" width="190" height="58" fill="#09090b" opacity="0.95"/>
        <text x="137" y="79" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700" fill="#ffffff">${escapeHtml(
          badge
        )}</text>
        <text x="400" y="355" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="170" font-weight="800" fill="#ffffff" opacity="0.12">${escapeHtml(
          initials
        )}</text>
        <text x="50" y="560" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="800" fill="#ffffff">${escapeHtml(
          title.slice(0, 24)
        )}</text>
        <text x="50" y="622" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="800" fill="#ffffff">${escapeHtml(
          title.slice(24, 48)
        )}</text>
        <rect x="42" y="690" rx="24" ry="24" width="190" height="70" fill="#09090b" opacity="0.95"/>
        <text x="137" y="736" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="800" fill="#22c55e">${escapeHtml(
          price
        )}</text>
      </svg>
    `;

    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function updatePageMeta() {
    const meta = categoryMeta[category] || {
      title: `${capitalize(category)} Catalog`,
      description: `Browse popular Amazon products in the ${capitalize(category)} category on TrendPulse.`
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

    const ogTitle = document.querySelector('meta[property="og:title"]');
    const ogDescription = document.querySelector('meta[property="og:description"]');
    const ogUrl = document.querySelector('meta[property="og:url"]');
    const twitterTitle = document.querySelector('meta[name="twitter:title"]');
    const twitterDescription = document.querySelector('meta[name="twitter:description"]');

    if (ogTitle) ogTitle.setAttribute("content", `${meta.title} | TrendPulse`);
    if (ogDescription) ogDescription.setAttribute("content", meta.description);
    if (ogUrl) {
      ogUrl.setAttribute(
        "content",
        `https://www.trend-pulse.shop/catalog-category.html?category=${encodeURIComponent(category)}`
      );
    }
    if (twitterTitle) twitterTitle.setAttribute("content", `${meta.title} | TrendPulse`);
    if (twitterDescription) twitterDescription.setAttribute("content", meta.description);
  }

  function getProductUrl(product) {
    if (product.slug) {
      return `/product.html?slug=${encodeURIComponent(product.slug)}`;
    }
    return `/product.html?asin=${encodeURIComponent(product.asin || "")}`;
  }

  function productCard(product) {
    const proxiedImage = proxyImage(product.image_url || product.image || "");
    const placeholder = buildPlaceholder(product);
    const rating = safeNumber(product.amazon_rating, 0);
    const reviews = safeNumber(product.amazon_review_count, 0);
    const price = formatPrice(product.price);

    return `
      <article class="group overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/70 transition hover:border-zinc-500 hover:shadow-xl hover:shadow-black/30">
        <a href="${getProductUrl(product)}" class="flex h-full flex-col">
          <div class="relative aspect-square overflow-hidden bg-white">
            <img
              src="${placeholder}"
              alt="${escapeHtml(product.name || "Product")}"
              class="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
            />
            ${
              proxiedImage
                ? `
              <img
                src="${proxiedImage}"
                alt="${escapeHtml(product.name || "Product")}"
                class="relative z-10 h-full w-full object-contain transition duration-300 group-hover:scale-[1.02]"
                loading="lazy"
                referrerpolicy="no-referrer"
                onerror="this.remove()"
              />
            `
                : ""
            }
          </div>

          <div class="flex flex-1 flex-col p-4">
            <h3 class="min-h-[3rem] text-sm font-semibold leading-6 text-white">
              ${escapeHtml(product.name || "Product")}
            </h3>

            <div class="mt-2 text-xs text-zinc-400">
              ⭐ ${rating > 0 ? rating.toFixed(1) : "—"} (${reviews.toLocaleString()})
            </div>

            <div class="mt-3 flex items-end justify-between gap-3">
              <span class="text-lg font-bold text-green-400">${price}</span>
              <span class="text-xs font-bold text-zinc-300">View →</span>
            </div>
          </div>
        </a>
      </article>
    `;
  }

  async function fetchProducts() {
    const { data, error } = await window.supabaseClient
      .from("products")
      .select("*")
      .eq("type", "catalog")
      .eq("is_active", true)
      .eq("category", category)
      .limit(200);

    if (error) {
      console.error(error);
      return [];
    }

    return data || [];
  }

  let products = await fetchProducts();

  function sortProducts(items, sortValue) {
    const sorted = [...items];

    if (sortValue === "reviews") {
      sorted.sort((a, b) => safeNumber(b.amazon_review_count) - safeNumber(a.amazon_review_count));
    } else if (sortValue === "rating") {
      sorted.sort((a, b) => safeNumber(b.amazon_rating) - safeNumber(a.amazon_rating));
    } else if (sortValue === "score") {
      sorted.sort((a, b) => safeNumber(b.score) - safeNumber(a.score));
    } else if (sortValue === "price-low") {
      sorted.sort((a, b) => safeNumber(a.price) - safeNumber(b.price));
    } else if (sortValue === "price-high") {
      sorted.sort((a, b) => safeNumber(b.price) - safeNumber(a.price));
    }

    return sorted;
  }

  function applyFilters() {
    const search = (searchInput?.value || "").trim().toLowerCase();
    const sortValue = sortSelect?.value || "reviews";

    let filtered = [...products];

    if (search) {
      filtered = filtered.filter((product) => {
        const haystack = [
          product.name,
          product.short_description,
          product.description,
          product.brand,
          product.category,
          product.subcategory
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(search);
      });
    }

    filtered = sortProducts(filtered, sortValue);

    if (countEl) {
      countEl.textContent = `${filtered.length} ${filtered.length === 1 ? "product" : "products"}`;
    }

    if (!filtered.length) {
      grid.innerHTML = "";
      emptyState?.classList.remove("hidden");
      return;
    }

    emptyState?.classList.add("hidden");
    grid.innerHTML = filtered.slice(0, 100).map(productCard).join("");
  }

  updatePageMeta();
  applyFilters();

  searchInput?.addEventListener("input", applyFilters);
  sortSelect?.addEventListener("change", applyFilters);
});
