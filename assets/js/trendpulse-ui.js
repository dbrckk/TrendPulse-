(function () {
  let cache = null;

  async function fetchProducts() {
    if (cache) return cache;

    if (!window.supabaseClient) {
      console.error("No supabase client");
      return [];
    }

    const { data, error } = await window.supabaseClient
      .from("products")
      .select("*")
      .eq("is_active", true)
      .limit(200);

    if (error) {
      console.error(error);
      return [];
    }

    cache = data || [];
    console.log("LOADED PRODUCTS:", cache.length);
    return cache;
  }

  function card(p) {
    const img = p.image_url || "https://via.placeholder.com/400";

    return `
      <div class="bg-zinc-900 rounded-xl p-3">
        <img src="${img}" class="w-full h-40 object-contain bg-white rounded" />
        <h3 class="text-sm mt-2">${p.name}</h3>
        <div class="text-green-400 font-bold">$${p.price}</div>
      </div>
    `;
  }

  async function renderDeals() {
    const grid = document.getElementById("deals-grid");
    const counter = document.getElementById("resultCount");

    if (!grid) return;

    const products = await fetchProducts();

    grid.innerHTML = products.map(card).join("");

    if (counter) {
      counter.textContent = products.length + " deals";
    }
  }

  window.TrendPulseUI = { fetchProducts };

  document.addEventListener("DOMContentLoaded", renderDeals);
})();
