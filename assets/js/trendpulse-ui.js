(function () {
  let productsCache = null;
  let productsPromise = null;

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

  function normalize(value = "") {
    return String(value).trim().toLowerCase();
  }

  function capitalize(value = "") {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
  }

  function formatPrice(value) {
    return `$${safeNumber(value).toFixed(2)}`;
  }

  function proxyImage(url) {
    const raw = String(url || "").trim();

    if (!raw || raw.includes("your-image-url.com")) {
      return "https://via.placeholder.com/600x600?text=No+Image";
    }

    return raw;
  }

  async function fetchProducts() {
    if (productsCache) return productsCache;
    if (productsPromise) return productsPromise;

    if (!window.supabaseClient) {
      console.error("Supabase client is not available.");
      productsCache = [];
      return productsCache;
    }

    productsPromise = window.supabaseClient
      .from("products")
      .select("*")
      .eq("is_active", true)
      .limit(500)
      .then(({ data, error }) => {
        if (error) {
          console.error("Failed to load products:", error);
          productsCache = [];
          return productsCache;
        }

        const seen = new Set();

        productsCache = (data || [])
          .map((row) => ({
            ...row,
            name: row.name || row.title || "Amazon Product",
            category: normalize(row.category || "general"),
            price: safeNumber(row.price, 0),
            amazon_rating: safeNumber(row.amazon_rating, 0),
            amazon_review_count: safeNumber(row.amazon_review_count, 0),
            score: safeNumber(row.score, 0),
            priority: safeNumber(row.priority, 0),
            image_url: proxyImage(row.image_url || row.image || ""),
            affiliate_link: row.affiliate_link || row.amazon_url || "#"
          }))
          .filter((row) => {
            const key = row.asin || row.slug || row.id || row.name;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });

        console.log("Loaded products:", productsCache.length);
        return productsCache;
      })
      .catch((error) => {
        console.error("Failed to load products:", error);
        productsCache = [];
        return productsCache;
      });

    return productsPromise;
  }

  function productCard(product) {
    const img = product.image_url || "https://via.placeholder.com/600x600?text=No+Image";
    const rating = product.amazon_rating > 0 ? product.amazon_rating.toFixed(1) : "—";
    const reviews = product.amazon_review_count.toLocaleString();
    const price = formatPrice(product.price);

    return `
      <article class="group h-full overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/70 transition hover:border-zinc-600 hover:shadow-xl hover:shadow-black/30">
        <a href="${product.affiliate_link}" target="_blank" rel="nofollow sponsored noopener" class="flex h-full flex-col">
          <div class="relative aspect-square overflow-hidden bg-white">
            <img
              src="${img}"
              alt="${escapeHtml(product.name)}"
              class="h-full w-full object-contain transition duration-300 group-hover:scale-[1.02]"
              loading="lazy"
              onerror="this.src='https://via.placeholder.com/600x600?text=No+Image'"
            />
          </div>

          <div class="flex flex-1 flex-col p-4">
            <div class="mb-2 flex flex-wrap gap-2">
              <span class="rounded-full border border-zinc-700 px-2.5 py-1 text-[11px] font-medium text-zinc-300">
                ${escapeHtml(capitalize(product.category || "general"))}
              </span>
            </div>

            <h3 class="min-h-[3rem] text-sm font-semibold leading-6 text-white">
              ${escapeHtml(product.name)}
            </h3>

            <div class="mt-2 text-xs text-zinc-400">
              ⭐ ${rating} (${reviews})
            </div>

            <div class="mt-auto flex items-end justify-between gap-3 pt-4">
              <div class="flex flex-col">
                <span class="text-lg font-bold text-green-400">${price}</span>
                <span class="text-[10px] text-zinc-500">Amazon deal</span>
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

  async function renderDealsPage() {
    const grid = document.getElementById("deals-grid");
    if (!grid) return;

    const searchInput = document.getElementById("searchInput");
    const categoryFilter = document.getElementById("categoryFilter");
    const sortFilter = document.getElementById("sortFilter");
    const priceFilter = document.getElementById("priceFilter");
    const results = document.getElementById("resultCount");

    function parseMaxPrice() {
      if (!priceFilter) return null;
      if (priceFilter.value === "under-10") return 10;
      if (priceFilter.value === "under-25") return 25;
      if (priceFilter.value === "under-50") return 50;
      return null;
    }

    async function run() {
      const products = await fetchProducts();
      const query = normalize(searchInput ? searchInput.value : "");
      const category = normalize(categoryFilter ? categoryFilter.value : "all");
      const maxPrice = parseMaxPrice();
      const sortValue = sortFilter ? sortFilter.value : "score";

      let items = [...products];

      if (query) {
        items = items.filter((p) => {
          const haystack = [
            p.name,
            p.description,
            p.short_description,
            p.category,
            p.brand,
            p.subcategory
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return haystack.includes(query);
        });
      }

      if (category && category !== "all") {
        items = items.filter((p) => p.category === category);
      }

      if (maxPrice != null) {
        items = items.filter((p) => p.price <= maxPrice);
      }

      if (sortValue === "low") {
        items.sort((a, b) => a.price - b.price);
      } else if (sortValue === "high") {
        items.sort((a, b) => b.price - a.price);
      } else if (sortValue === "title") {
        items.sort((a, b) => a.name.localeCompare(b.name));
      } else {
        items.sort((a, b) => {
          if (b.priority !== a.priority) return b.priority - a.priority;
          if (b.score !== a.score) return b.score - a.score;
          return b.amazon_review_count - a.amazon_review_count;
        });
      }

      grid.innerHTML = items.map(productCard).join("");

      if (results) {
        results.textContent = `${items.length} ${items.length === 1 ? "deal" : "deals"}`;
      }
    }

    searchInput?.addEventListener("input", run);
    categoryFilter?.addEventListener("change", run);
    sortFilter?.addEventListener("change", run);
    priceFilter?.addEventListener("change", run);

    await run();
  }

  window.TrendPulseUI = {
    fetchProducts
  };

  document.addEventListener("DOMContentLoaded", async function () {
    await renderDealsPage();
  });
})();
