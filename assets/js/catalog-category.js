// catalog-category.js

document.addEventListener("DOMContentLoaded", async () => {
  const grid = document.getElementById("catalog-category-grid");
  const countEl = document.getElementById("catalog-count");
  const searchInput = document.getElementById("catalog-search");
  const sortSelect = document.getElementById("catalog-sort");
  const emptyState = document.getElementById("catalog-empty-state");

  const titleEl = document.getElementById("catalog-category-title");
  const breadcrumbEl = document.getElementById("catalog-category-breadcrumb");

  const urlParams = new URLSearchParams(window.location.search);
  const category = urlParams.get("category") || "tech";

  if (titleEl) titleEl.textContent = capitalize(category) + " Catalog";
  if (breadcrumbEl) breadcrumbEl.textContent = capitalize(category);

  let products = [];

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

  function render(productsList) {
    if (!grid) return;

    if (!productsList.length) {
      grid.innerHTML = "";
      emptyState?.classList.remove("hidden");
      return;
    }

    emptyState?.classList.add("hidden");

    grid.innerHTML = productsList
      .map((p) => {
        return `
        <div class="rounded-2xl border border-zinc-800 bg-zinc-900/70 overflow-hidden group">
          <a href="/deal.html?asin=${p.asin}">
            <div class="aspect-square bg-white flex items-center justify-center overflow-hidden">
              <img
                src="${p.image_url || ""}"
                alt="${escapeHtml(p.name)}"
                class="w-full h-full object-contain"
                loading="lazy"
              />
            </div>

            <div class="p-4">
              <h3 class="text-sm font-semibold text-white line-clamp-2">
                ${escapeHtml(p.name)}
              </h3>

              <div class="mt-2 text-xs text-zinc-400">
                ⭐ ${p.amazon_rating || "—"} (${p.amazon_review_count || 0})
              </div>

              <div class="mt-3 flex items-center justify-between">
                <span class="text-green-400 font-bold">
                  $${Number(p.price || 0).toFixed(2)}
                </span>

                <span class="text-xs text-zinc-500">
                  View →
                </span>
              </div>
            </div>
          </a>
        </div>
      `;
      })
      .join("");

    if (countEl) {
      countEl.textContent = `${productsList.length} products`;
    }
  }

  function applyFilters() {
    let filtered = [...products];

    const search = searchInput?.value.toLowerCase() || "";

    if (search) {
      filtered = filtered.filter((p) =>
        (p.name || "").toLowerCase().includes(search)
      );
    }

    const sort = sortSelect?.value;

    if (sort === "reviews") {
      filtered.sort((a, b) => (b.amazon_review_count || 0) - (a.amazon_review_count || 0));
    } else if (sort === "rating") {
      filtered.sort((a, b) => (b.amazon_rating || 0) - (a.amazon_rating || 0));
    } else if (sort === "score") {
      filtered.sort((a, b) => (b.score || 0) - (a.score || 0));
    } else if (sort === "price-low") {
      filtered.sort((a, b) => (a.price || 0) - (b.price || 0));
    } else if (sort === "price-high") {
      filtered.sort((a, b) => (b.price || 0) - (a.price || 0));
    }

    render(filtered);
  }

  function escapeHtml(str = "") {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function capitalize(str = "") {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  products = await fetchProducts();

  applyFilters();

  searchInput?.addEventListener("input", applyFilters);
  sortSelect?.addEventListener("change", applyFilters);
});
