
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
